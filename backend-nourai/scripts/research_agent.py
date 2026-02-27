"""
NourAI Research Agent
=====================
Automatically fetches PubMed studies for every ingredient in the database,
synthesizes each abstract with Claude, and stores structured evidence records.

Usage
-----
# Research all pending ingredients
python -m scripts.research_agent

# Research specific ingredients
python -m scripts.research_agent --ingredient "Niacinamide" --ingredient "Retinol"

# Retry previously failed ingredients
python -m scripts.research_agent --retry-failed

# Dry run — show what would be researched without making API calls
python -m scripts.research_agent --dry-run

# Limit how many ingredients to process (useful for testing)
python -m scripts.research_agent --limit 5
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

import anthropic
import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── Make sure the project root is on the path ─────────────────────────────────
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient, ResearchStatus
from app.models.ingredient_evidence import IngredientEvidence, EvidenceDirection

# ─── PubMed constants ─────────────────────────────────────────────────────────

PUBMED_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_EFETCH  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# Without NCBI_API_KEY: 3 req/s. With: 10 req/s.
# We use a semaphore to stay comfortably under the limit.
PUBMED_CONCURRENCY = 3   # parallel PubMed requests
CLAUDE_CONCURRENCY = 5   # parallel Claude synthesis calls
MAX_STUDIES_PER_INGREDIENT = 10

# ─── Claude tool schema ───────────────────────────────────────────────────────

SYNTHESIS_TOOL: dict[str, Any] = {
    "name": "record_evidence",
    "description": (
        "Record structured evidence extracted from a scientific abstract. "
        "Called once per abstract to produce a consistent, machine-readable record."
    ),
    "input_schema": {
        "type": "object",
        "required": ["study_type", "finding", "direction", "confidence"],
        "properties": {
            "study_type": {
                "type": "string",
                "enum": [
                    "rct", "systematic_review", "meta_analysis", "cohort",
                    "case_control", "cross_sectional", "in_vitro", "animal",
                    "review", "case_report", "other",
                ],
                "description": "Methodological design of the study.",
            },
            "population": {
                "type": "string",
                "description": (
                    "Who was studied. Be specific: e.g. 'postmenopausal women', "
                    "'healthy adults 18-45', 'infants 0-12 months'. "
                    "Null if in_vitro or animal."
                ),
            },
            "sample_size": {
                "type": "integer",
                "description": "Number of human participants. Omit for in_vitro/animal studies.",
            },
            "year": {
                "type": "integer",
                "description": "Publication year. Omit if not found in the abstract.",
            },
            "finding": {
                "type": "string",
                "description": (
                    "ONE clear sentence summarizing what this study found about the ingredient. "
                    "Write for a general audience — no jargon, no abbreviations. "
                    "Include the magnitude if available (e.g. 'reduced inflammation markers by 40%'). "
                    "Start with the ingredient name."
                ),
            },
            "direction": {
                "type": "string",
                "enum": ["benefit", "risk", "neutral", "mixed"],
                "description": (
                    "'benefit' = study supports use, 'risk' = study flags harm, "
                    "'neutral' = no significant effect, 'mixed' = both."
                ),
            },
            "effect_size": {
                "type": "string",
                "enum": ["strong", "moderate", "weak"],
                "description": "Magnitude of the observed effect. Omit if unclear.",
            },
            "confidence": {
                "type": "string",
                "enum": ["high", "moderate", "low"],
                "description": (
                    "'high' for RCTs and meta-analyses, "
                    "'moderate' for observational studies, "
                    "'low' for in_vitro, animal, and case reports."
                ),
            },
            "concern_tags": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "fertility", "thyroid", "hormonal_condition",
                        "medications", "infant_proximity",
                    ],
                },
                "description": (
                    "Onboarding concern IDs this study is directly relevant to. "
                    "Only include if the study specifically addresses the concern."
                ),
            },
            "goal_tags": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "clear_skin", "anti_aging", "brighter_skin",
                        "hair_growth", "prevent_hair_loss", "build_muscle",
                        "fat_loss", "more_energy", "gut_health",
                        "less_inflammation", "mental_focus",
                    ],
                },
                "description": (
                    "Onboarding goal IDs this study supports or informs. "
                    "Only include if the study is directly relevant to the goal."
                ),
            },
        },
    },
}

SYNTHESIS_SYSTEM = (
    "You are a clinical research analyst. Your job is to read PubMed abstracts "
    "and extract structured information about a specific ingredient. "
    "Be precise and conservative — only tag concern_tags and goal_tags if the "
    "study directly addresses them. Write findings in plain English."
)

# ─── PubMed helpers ───────────────────────────────────────────────────────────

async def pubmed_search(
    client: httpx.AsyncClient,
    ingredient_name: str,
    sem: asyncio.Semaphore,
    max_results: int = MAX_STUDIES_PER_INGREDIENT,
) -> list[str]:
    """Search PubMed and return a list of PMIDs."""
    # Two search strategies: clinical + safety focus
    query = (
        f'"{ingredient_name}"[Title/Abstract] AND '
        f'(safety OR efficacy OR clinical OR randomized OR "clinical trial") AND '
        f'(humans[MeSH Terms] OR "in vitro" OR review[Publication Type])'
    )
    params: dict[str, Any] = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
        "sort": "relevance",
    }
    if settings.ncbi_api_key:
        params["api_key"] = settings.ncbi_api_key

    async with sem:
        try:
            response = await client.get(PUBMED_ESEARCH, params=params, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            pmids = data.get("esearchresult", {}).get("idlist", [])
            return pmids
        except Exception as exc:
            print(f"    [PubMed search] Error for '{ingredient_name}': {exc}")
            return []


async def pubmed_fetch_abstract(
    client: httpx.AsyncClient,
    pmid: str,
    sem: asyncio.Semaphore,
) -> dict[str, str | int | None] | None:
    """Fetch one PubMed abstract and return structured dict."""
    params: dict[str, Any] = {
        "db": "pubmed",
        "id": pmid,
        "rettype": "xml",
        "retmode": "xml",
    }
    if settings.ncbi_api_key:
        params["api_key"] = settings.ncbi_api_key

    async with sem:
        try:
            await asyncio.sleep(0.35)  # stay well under 3 req/s
            response = await client.get(PUBMED_EFETCH, params=params, timeout=15.0)
            response.raise_for_status()
            return _parse_pubmed_xml(pmid, response.text)
        except Exception as exc:
            print(f"    [PubMed fetch] Error for PMID {pmid}: {exc}")
            return None


def _parse_pubmed_xml(pmid: str, xml_text: str) -> dict[str, str | int | None] | None:
    """Parse PubMed XML response into a flat dict."""
    try:
        root = ET.fromstring(xml_text)
        article = root.find(".//PubmedArticle/MedlineCitation/Article")
        if article is None:
            return None

        # Title
        title_el = article.find("ArticleTitle")
        title = "".join(title_el.itertext()) if title_el is not None else None

        # Abstract — may have multiple AbstractText sections
        abstract_parts = article.findall(".//Abstract/AbstractText")
        if not abstract_parts:
            return None  # Skip articles with no abstract
        abstract = " ".join("".join(p.itertext()) for p in abstract_parts).strip()
        if len(abstract) < 100:
            return None  # Too short to be useful

        # Journal
        journal_el = article.find(".//Journal/Title")
        journal = journal_el.text if journal_el is not None else None

        # Year — try multiple paths
        year: int | None = None
        for path in [
            ".//Journal/JournalIssue/PubDate/Year",
            ".//PubDate/Year",
            ".//ArticleDate/Year",
        ]:
            year_el = root.find(path)
            if year_el is not None and year_el.text:
                try:
                    year = int(year_el.text)
                    break
                except ValueError:
                    pass

        # DOI
        doi: str | None = None
        for id_el in root.findall(".//ArticleIdList/ArticleId"):
            if id_el.get("IdType") == "doi":
                doi = id_el.text
                break

        return {
            "pmid": pmid,
            "title": title,
            "abstract": abstract,
            "journal": journal,
            "year": year,
            "doi": doi,
        }
    except ET.ParseError:
        return None


# ─── Claude synthesis ─────────────────────────────────────────────────────────

async def synthesize_abstract(
    claude: anthropic.AsyncAnthropic,
    ingredient_name: str,
    article: dict[str, str | int | None],
    sem: asyncio.Semaphore,
) -> dict[str, Any] | None:
    """Send one abstract to Claude and get back structured evidence."""
    prompt = (
        f"Ingredient being studied: {ingredient_name}\n\n"
        f"Study title: {article.get('title', 'Unknown')}\n"
        f"Journal: {article.get('journal', 'Unknown')}\n"
        f"Year: {article.get('year', 'Unknown')}\n\n"
        f"Abstract:\n{article['abstract']}\n\n"
        f"Extract structured evidence using the record_evidence tool."
    )

    async with sem:
        try:
            message = await claude.messages.create(
                model="claude-haiku-4-5-20251001",  # Fast + cheap for synthesis
                max_tokens=1024,
                system=SYNTHESIS_SYSTEM,
                tools=[SYNTHESIS_TOOL],
                tool_choice={"type": "any"},
                messages=[{"role": "user", "content": prompt}],
            )

            # Extract the tool call result
            for block in message.content:
                if block.type == "tool_use" and block.name == "record_evidence":
                    return block.input

            return None
        except anthropic.APIError as exc:
            print(f"    [Claude] API error: {exc}")
            return None


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def get_pending_ingredients(
    session: AsyncSession,
    statuses: list[str],
    limit: int | None = None,
) -> list[Ingredient]:
    """Fetch ingredients that need to be researched."""
    stmt = (
        select(Ingredient)
        .where(Ingredient.research_status.in_(statuses))
        .order_by(Ingredient.canonical_name)
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_ingredients_by_name(
    session: AsyncSession,
    names: list[str],
) -> list[Ingredient]:
    """Fetch specific ingredients by canonical name (case-insensitive)."""
    result = await session.execute(
        select(Ingredient).where(
            Ingredient.canonical_name.ilike(f"%{'%'.join(names)}%")
            if len(names) == 1
            else Ingredient.canonical_name.in_(names)
        )
    )
    return list(result.scalars().all())


async def pmid_already_stored(
    session: AsyncSession,
    ingredient_id: uuid.UUID,
    pmid: str,
) -> bool:
    """Check if we already have this study stored (idempotency)."""
    result = await session.execute(
        select(IngredientEvidence.id).where(
            IngredientEvidence.ingredient_id == ingredient_id,
            IngredientEvidence.pmid == pmid,
        )
    )
    return result.scalar_one_or_none() is not None


async def store_evidence(
    session: AsyncSession,
    ingredient_id: uuid.UUID,
    article: dict[str, Any],
    synthesis: dict[str, Any],
) -> IngredientEvidence:
    """Persist one synthesized evidence record."""
    evidence = IngredientEvidence(
        ingredient_id=ingredient_id,
        pmid=str(article["pmid"]),
        doi=article.get("doi"),
        title=article.get("title"),
        journal=article.get("journal"),
        year=article.get("year") or synthesis.get("year"),
        raw_abstract=article["abstract"],
        study_type=synthesis.get("study_type"),
        population=synthesis.get("population"),
        sample_size=synthesis.get("sample_size"),
        finding=synthesis["finding"],
        direction=synthesis.get("direction", EvidenceDirection.NEUTRAL),
        effect_size=synthesis.get("effect_size"),
        confidence=synthesis.get("confidence", "low"),
        concern_tags=synthesis.get("concern_tags", []),
        goal_tags=synthesis.get("goal_tags", []),
    )
    session.add(evidence)
    return evidence


def derive_evidence_level(evidence_records: list[dict]) -> str:
    """
    Compute an overall evidence level for the ingredient based on all
    synthesized studies — shown on the product detail screen.
    """
    if not evidence_records:
        return "insufficient"

    high   = sum(1 for e in evidence_records if e.get("confidence") == "high")
    moderate = sum(1 for e in evidence_records if e.get("confidence") == "moderate")
    total  = len(evidence_records)

    if high >= 2:
        return "strong"
    if high >= 1 or moderate >= 3:
        return "moderate"
    if total >= 3:
        return "limited"
    return "insufficient"


# ─── Core research loop ───────────────────────────────────────────────────────

async def research_one_ingredient(
    ingredient: Ingredient,
    claude: anthropic.AsyncAnthropic,
    http: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    pubmed_sem: asyncio.Semaphore,
    claude_sem: asyncio.Semaphore,
    dry_run: bool = False,
) -> None:
    """Full research pipeline for a single ingredient."""
    name = ingredient.canonical_name
    iid  = ingredient.id

    print(f"\n{'─'*60}")
    print(f"  Researching: {name}")
    print(f"{'─'*60}")

    if dry_run:
        print(f"  [dry-run] Would search PubMed for '{name}'")
        return

    # ── 1. Mark as in_progress ────────────────────────────────────────────────
    async with session_factory() as session:
        await session.execute(
            update(Ingredient)
            .where(Ingredient.id == iid)
            .values(research_status=ResearchStatus.IN_PROGRESS)
        )
        await session.commit()

    try:
        # ── 2. Search PubMed ──────────────────────────────────────────────────
        print(f"  [1/3] Searching PubMed...")
        pmids = await pubmed_search(http, name, pubmed_sem)
        print(f"        Found {len(pmids)} PMIDs: {', '.join(pmids[:5])}{'...' if len(pmids) > 5 else ''}")

        if not pmids:
            print(f"  No results — marking as complete with zero evidence.")
            async with session_factory() as session:
                await session.execute(
                    update(Ingredient)
                    .where(Ingredient.id == iid)
                    .values(
                        research_status=ResearchStatus.COMPLETE,
                        researched_at=datetime.now(timezone.utc),
                        evidence_level="insufficient",
                    )
                )
                await session.commit()
            return

        # ── 3. Fetch abstracts (parallel, rate-limited) ───────────────────────
        print(f"  [2/3] Fetching abstracts...")
        fetch_tasks = [pubmed_fetch_abstract(http, pmid, pubmed_sem) for pmid in pmids]
        articles = await asyncio.gather(*fetch_tasks)
        valid_articles = [a for a in articles if a is not None]
        print(f"        {len(valid_articles)}/{len(pmids)} abstracts retrieved")

        if not valid_articles:
            raise RuntimeError("All abstract fetches failed")

        # ── 4. Claude synthesis (parallel) ────────────────────────────────────
        print(f"  [3/3] Synthesizing with Claude ({len(valid_articles)} abstracts)...")
        synthesized: list[dict[str, Any]] = []

        async def _synthesize_and_store(article: dict) -> None:
            pmid = str(article["pmid"])

            # Check idempotency inside fresh session
            async with session_factory() as session:
                already_stored = await pmid_already_stored(session, iid, pmid)
                if already_stored:
                    print(f"        PMID {pmid} — already stored, skipping")
                    return

            result = await synthesize_abstract(claude, name, article, claude_sem)
            if result is None:
                print(f"        PMID {pmid} — synthesis returned nothing, skipping")
                return

            async with session_factory() as session:
                ev = await store_evidence(session, iid, article, result)
                await session.commit()
                synthesized.append({"confidence": result.get("confidence", "low")})

            direction_icon = {
                "benefit": "✓",
                "risk": "⚠",
                "neutral": "–",
                "mixed": "±",
            }.get(result.get("direction", "neutral"), "?")
            print(
                f"        PMID {pmid} [{result.get('study_type','?')}] "
                f"{direction_icon} {result['finding'][:80]}..."
            )

        await asyncio.gather(*[_synthesize_and_store(a) for a in valid_articles])

        # ── 5. Update ingredient with aggregate evidence level ─────────────────
        evidence_level = derive_evidence_level(synthesized)
        async with session_factory() as session:
            await session.execute(
                update(Ingredient)
                .where(Ingredient.id == iid)
                .values(
                    research_status=ResearchStatus.COMPLETE,
                    researched_at=datetime.now(timezone.utc),
                    evidence_level=evidence_level,
                )
            )
            await session.commit()

        print(f"  Done — {len(synthesized)} studies stored | evidence: {evidence_level}")

    except Exception as exc:
        print(f"  ERROR researching '{name}': {exc}")
        async with session_factory() as session:
            await session.execute(
                update(Ingredient)
                .where(Ingredient.id == iid)
                .values(research_status=ResearchStatus.FAILED)
            )
            await session.commit()


# ─── Entry point ──────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    # ── Validate API keys ──────────────────────────────────────────────────────
    if not args.dry_run and not settings.anthropic_api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set in .env")
        sys.exit(1)

    # ── Database setup ─────────────────────────────────────────────────────────
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # ── Determine which ingredients to process ─────────────────────────────────
    async with session_factory() as session:
        if args.ingredient:
            # Specific names passed via CLI
            ingredients = []
            for name in args.ingredient:
                result = await session.execute(
                    select(Ingredient).where(
                        Ingredient.canonical_name.ilike(name)
                    )
                )
                found = result.scalar_one_or_none()
                if found:
                    ingredients.append(found)
                else:
                    print(f"WARNING: Ingredient '{name}' not found in database")
        elif args.retry_failed:
            ingredients = await get_pending_ingredients(
                session,
                statuses=[ResearchStatus.FAILED, ResearchStatus.PENDING],
                limit=args.limit,
            )
        else:
            ingredients = await get_pending_ingredients(
                session,
                statuses=[ResearchStatus.PENDING],
                limit=args.limit,
            )

    if not ingredients:
        print("No ingredients to process. All up to date.")
        await engine.dispose()
        return

    print(f"\nNourAI Research Agent")
    print(f"{'='*60}")
    print(f"  Mode:        {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Ingredients: {len(ingredients)}")
    print(f"  Model:       claude-haiku-4-5-20251001")
    print(f"  NCBI key:    {'yes' if settings.ncbi_api_key else 'no (3 req/s limit)'}")
    print(f"{'='*60}")

    # ── Client setup ───────────────────────────────────────────────────────────
    claude = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    pubmed_sem = asyncio.Semaphore(PUBMED_CONCURRENCY)
    claude_sem = asyncio.Semaphore(CLAUDE_CONCURRENCY)

    async with httpx.AsyncClient(
        headers={"User-Agent": "NourAI-ResearchAgent/1.0 (research@nourai.app)"},
        follow_redirects=True,
    ) as http:
        # Process ingredients one at a time (each ingredient itself parallelizes
        # its abstract fetches + syntheses). Sequential at the ingredient level
        # keeps progress readable and avoids DB contention.
        for ingredient in ingredients:
            await research_one_ingredient(
                ingredient=ingredient,
                claude=claude,
                http=http,
                session_factory=session_factory,
                pubmed_sem=pubmed_sem,
                claude_sem=claude_sem,
                dry_run=args.dry_run,
            )

    await engine.dispose()
    print(f"\n{'='*60}")
    print(f"  Research agent complete.")
    print(f"{'='*60}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="NourAI Research Agent — fetch PubMed studies for ingredients",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--ingredient",
        action="append",
        metavar="NAME",
        help="Canonical ingredient name to research (can be repeated)",
    )
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="Also retry ingredients that previously failed",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Process at most N ingredients (useful for testing)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be researched without making API calls",
    )
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
