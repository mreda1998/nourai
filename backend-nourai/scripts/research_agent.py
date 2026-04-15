"""
NourAI Research Agent
=====================
Automatically fetches PubMed studies for every ingredient in the database,
synthesizes each abstract with Claude, stores structured evidence records,
and computes per-biodomain impact scores.

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
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── Make sure the project root is on the path ─────────────────────────────────
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.biodomains import (
    BIODOMAIN_KEYS,
    STUDY_TIER_WEIGHTS,
    CONFIDENCE_WEIGHTS,
)
from app.models.ingredient import Ingredient, ResearchStatus
from app.models.ingredient_evidence import IngredientEvidence, EvidenceDirection
from app.models.ingredient_biodomain_score import IngredientBioDomainScore

# ─── PubMed constants ─────────────────────────────────────────────────────────

PUBMED_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_EFETCH  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# Without NCBI_API_KEY: 3 req/s. With: 10 req/s.
PUBMED_CONCURRENCY = 3
CLAUDE_CONCURRENCY = 5

# Tiered evidence caps — we prefer high-quality study types.
# The agent searches each tier separately so meta-analyses are never
# crowded out by a flood of observational studies.
TIER_CAPS = {
    "meta_analysis":  5,   # "meta-analysis[pt] OR systematic review[pt]"
    "rct":           15,   # "randomized controlled trial[pt]"
    "observational": 10,   # cohort / observational (everything else)
}

# ─── Claude tool schemas ──────────────────────────────────────────────────────

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
            # ── New: dose extraction ──────────────────────────────────────────
            "dose_low": {
                "type": "number",
                "description": (
                    "Lower bound of the effective dose range tested in this study "
                    "(e.g. 250 for '250–500 mg/day'). Omit if not reported."
                ),
            },
            "dose_high": {
                "type": "number",
                "description": (
                    "Upper bound of the effective dose range (e.g. 500). "
                    "If a single dose was tested, set both dose_low and dose_high to that value."
                ),
            },
            "dose_unit": {
                "type": "string",
                "description": (
                    "Unit for dose_low / dose_high (e.g. 'mg', 'g', 'IU', 'mg/kg', 'CFU'). "
                    "Omit if no dose is reported."
                ),
            },
        },
    },
}

SYNTHESIS_SYSTEM = (
    "You are a clinical research analyst. Your job is to read PubMed abstracts "
    "and extract structured information about a specific ingredient. "
    "Be precise and conservative — only tag concern_tags and goal_tags if the "
    "study directly addresses them. Write findings in plain English. "
    "When a dose is mentioned in the abstract, always extract it into dose_low, "
    "dose_high, and dose_unit."
)

# ─── Belief vs. reality summary tool ─────────────────────────────────────────

BELIEF_TOOL: dict[str, Any] = {
    "name": "record_belief_summary",
    "description": (
        "Write a two-part plain-English summary for an ingredient: "
        "(1) what people commonly believe it does, and "
        "(2) what the research evidence actually supports. "
        "Called once per ingredient after all individual studies are synthesized."
    ),
    "input_schema": {
        "type": "object",
        "required": ["common_belief", "evidence_reality"],
        "properties": {
            "common_belief": {
                "type": "string",
                "description": (
                    "2–3 sentences describing what most people believe this ingredient does "
                    "and why they reach for it. Capture the marketing narrative and folk "
                    "knowledge accurately — do not strawman it. "
                    "Write in second person: 'People take X because...'"
                ),
            },
            "evidence_reality": {
                "type": "string",
                "description": (
                    "2–4 sentences summarizing what the human clinical evidence actually shows. "
                    "Be honest about gaps: note when evidence is strong, limited, or only "
                    "from animal/in-vitro studies. Include important nuances like "
                    "population specificity (e.g. 'only in people with deficiency'), "
                    "dose-response effects, or form differences. "
                    "Start with what IS supported, then add caveats."
                ),
            },
        },
    },
}

BELIEF_SYSTEM = (
    "You are a science communicator specializing in health ingredient research. "
    "Your job is to bridge the gap between popular belief and clinical evidence — "
    "fairly representing both the common narrative AND what trials actually show. "
    "Be honest about weak evidence without being alarmist. Write for an intelligent "
    "non-expert audience. Avoid jargon. Never make absolute claims."
)

# ─── Biodomain scoring tool ───────────────────────────────────────────────────
# Called ONCE per ingredient after all individual study syntheses are done.
# Produces a structured per-biodomain impact score for each relevant domain.

_BIODOMAIN_ENUM = BIODOMAIN_KEYS  # drives the JSON schema below

BIODOMAIN_TOOL: dict[str, Any] = {
    "name": "record_biodomain_impacts",
    "description": (
        "Record the ingredient's impact on each relevant health domain, "
        "based on the synthesized research findings. "
        "Only include domains where the evidence shows a meaningful effect. "
        "Called once per ingredient after all studies are synthesized."
    ),
    "input_schema": {
        "type": "object",
        "required": ["impacts"],
        "properties": {
            "impacts": {
                "type": "array",
                "description": "One entry per biodomain that has meaningful evidence.",
                "items": {
                    "type": "object",
                    "required": ["biodomain", "direction", "magnitude", "confidence"],
                    "properties": {
                        "biodomain": {
                            "type": "string",
                            "enum": _BIODOMAIN_ENUM,
                            "description": "The health domain being scored.",
                        },
                        "direction": {
                            "type": "string",
                            "enum": ["benefit", "harm", "neutral", "mixed"],
                            "description": (
                                "'benefit' = net positive effect on this domain, "
                                "'harm' = net negative effect, "
                                "'neutral' = no significant effect, "
                                "'mixed' = evidence in both directions."
                            ),
                        },
                        "magnitude": {
                            "type": "number",
                            "description": (
                                "Strength of the effect from 0.0 (no effect) to 1.0 (very strong). "
                                "Base this on the effect sizes and study quality in the evidence. "
                                "A single weak observational study = 0.2. "
                                "Multiple high-quality RCTs showing large effects = 0.9+."
                            ),
                        },
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "moderate", "low"],
                            "description": (
                                "Overall confidence in this domain score. "
                                "'high' requires multiple RCTs or a meta-analysis. "
                                "'moderate' requires at least one RCT or multiple observational studies. "
                                "'low' for in-vitro, animal, or single case studies."
                            ),
                        },
                        "dose_dependent": {
                            "type": "boolean",
                            "description": (
                                "True if the evidence shows the effect only occurs above "
                                "a certain dose threshold. False if any amount has an effect."
                            ),
                        },
                        "effective_dose_low": {
                            "type": "number",
                            "description": "Lowest dose where meaningful effect was observed across studies.",
                        },
                        "effective_dose_high": {
                            "type": "number",
                            "description": "Highest dose in the effective range (or same as low for single dose).",
                        },
                        "dose_unit": {
                            "type": "string",
                            "description": "Unit for the effective dose (e.g. 'mg', 'g', 'IU', 'CFU').",
                        },
                        "notes": {
                            "type": "string",
                            "description": (
                                "1–2 sentences explaining the score. Include key caveats "
                                "(population specificity, form differences, etc.)."
                            ),
                        },
                    },
                },
            },
        },
    },
}

BIODOMAIN_SYSTEM = (
    "You are a clinical pharmacologist scoring an ingredient's impact on specific "
    "health domains based on human clinical evidence. "
    "Be conservative: only score domains where the evidence is meaningful. "
    "Do not score in vitro or animal data as high confidence. "
    "Magnitude should reflect effect size AND study quality — not just that any effect exists. "
    "If studies show dose-dependent effects, always set dose_dependent=true and provide the range."
)

# ─── PubMed helpers ───────────────────────────────────────────────────────────

async def pubmed_search_tier(
    client: httpx.AsyncClient,
    ingredient_name: str,
    sem: asyncio.Semaphore,
    tier: str,
    max_results: int,
) -> list[str]:
    """
    Search PubMed for one evidence tier and return PMIDs.

    tier: "meta_analysis" | "rct" | "observational"
    """
    base = f'"{ingredient_name}"[Title/Abstract] AND humans[MeSH Terms]'

    if tier == "meta_analysis":
        query = f'{base} AND (meta-analysis[pt] OR "systematic review"[pt])'
    elif tier == "rct":
        query = f'{base} AND "randomized controlled trial"[pt]'
    else:
        # Observational: clinical trials, cohort, case-control, cross-sectional
        query = (
            f'{base} AND '
            f'(clinical trial[pt] OR cohort[tiab] OR observational[tiab] '
            f'OR "case-control"[tiab] OR cross-sectional[tiab]) '
            f'NOT (meta-analysis[pt] OR "systematic review"[pt] OR "randomized controlled trial"[pt])'
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
            return data.get("esearchresult", {}).get("idlist", [])
        except Exception as exc:
            print(f"    [PubMed/{tier}] Error for '{ingredient_name}': {exc}")
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

        title_el = article.find("ArticleTitle")
        title = "".join(title_el.itertext()) if title_el is not None else None

        abstract_parts = article.findall(".//Abstract/AbstractText")
        if not abstract_parts:
            return None
        abstract = " ".join("".join(p.itertext()) for p in abstract_parts).strip()
        if len(abstract) < 100:
            return None

        journal_el = article.find(".//Journal/Title")
        journal = journal_el.text if journal_el is not None else None

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
    """Send one abstract to Claude Haiku and get back structured evidence + dose."""
    prompt = (
        f"Ingredient being studied: {ingredient_name}\n\n"
        f"Study title: {article.get('title', 'Unknown')}\n"
        f"Journal: {article.get('journal', 'Unknown')}\n"
        f"Year: {article.get('year', 'Unknown')}\n\n"
        f"Abstract:\n{article['abstract']}\n\n"
        f"Extract structured evidence using the record_evidence tool. "
        f"If a dose is mentioned, extract it into dose_low, dose_high, and dose_unit."
    )

    async with sem:
        try:
            message = await claude.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=SYNTHESIS_SYSTEM,
                tools=[SYNTHESIS_TOOL],
                tool_choice={"type": "any"},
                messages=[{"role": "user", "content": prompt}],
            )
            for block in message.content:
                if block.type == "tool_use" and block.name == "record_evidence":
                    return block.input
            return None
        except anthropic.APIError as exc:
            print(f"    [Claude/Haiku] API error: {exc}")
            return None


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def get_pending_ingredients(
    session: AsyncSession,
    statuses: list[str],
    limit: int | None = None,
) -> list[Ingredient]:
    stmt = (
        select(Ingredient)
        .where(Ingredient.research_status.in_(statuses))
        .order_by(Ingredient.canonical_name)
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def pmid_already_stored(
    session: AsyncSession,
    ingredient_id: uuid.UUID,
    pmid: str,
) -> bool:
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


# ─── Belief vs. reality summary ───────────────────────────────────────────────

async def generate_belief_summary(
    claude: anthropic.AsyncAnthropic,
    ingredient_name: str,
    findings: list[str],
    mechanism_summary: str | None,
) -> tuple[str, str] | None:
    if not findings:
        return None

    findings_block = "\n".join(f"• {f}" for f in findings)
    prompt = (
        f"Ingredient: {ingredient_name}\n\n"
        + (f"Known mechanism: {mechanism_summary}\n\n" if mechanism_summary else "")
        + f"Synthesized research findings ({len(findings)} studies):\n"
        + findings_block
        + "\n\nUsing these findings, write the belief vs. reality summary "
          "using the record_belief_summary tool."
    )

    try:
        message = await claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            system=BELIEF_SYSTEM,
            tools=[BELIEF_TOOL],
            tool_choice={"type": "any"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in message.content:
            if block.type == "tool_use" and block.name == "record_belief_summary":
                data = block.input
                return data.get("common_belief"), data.get("evidence_reality")
        return None
    except anthropic.APIError as exc:
        print(f"    [Claude/Sonnet] Belief summary error for '{ingredient_name}': {exc}")
        return None


# ─── Biodomain impact scoring ─────────────────────────────────────────────────

async def generate_biodomain_scores(
    claude: anthropic.AsyncAnthropic,
    ingredient_name: str,
    findings: list[str],
    synthesized_records: list[dict[str, Any]],
    mechanism_summary: str | None,
) -> list[dict[str, Any]]:
    """
    After all study syntheses are done, ask Sonnet to score the ingredient
    against each of the 10 biodomains.

    `synthesized_records` includes study_type, confidence, direction, dose
    fields from each abstract — Claude uses this structured data (not just
    the free-text findings) to produce calibrated scores.

    Returns a list of biodomain impact dicts (matching BIODOMAIN_TOOL schema).
    """
    if not findings:
        return []

    findings_block = "\n".join(f"• {f}" for f in findings)

    # Build a structured evidence summary with types and doses
    study_summary_lines: list[str] = []
    for rec in synthesized_records:
        dose_str = ""
        if rec.get("dose_low") and rec.get("dose_unit"):
            low = rec["dose_low"]
            high = rec.get("dose_high", low)
            unit = rec["dose_unit"]
            dose_str = f" @ {low}–{high} {unit}" if high != low else f" @ {low} {unit}"
        line = (
            f"  [{rec.get('study_type','?')} | {rec.get('confidence','?')} confidence | "
            f"{rec.get('direction','?')}{dose_str}] {rec.get('finding','')}"
        )
        study_summary_lines.append(line)

    study_block = "\n".join(study_summary_lines)

    prompt = (
        f"Ingredient: {ingredient_name}\n\n"
        + (f"Mechanism: {mechanism_summary}\n\n" if mechanism_summary else "")
        + f"Synthesized evidence ({len(findings)} studies):\n{study_block}\n\n"
        + "Available biodomains to score:\n"
        + "\n".join(f"  • {k}" for k in BIODOMAIN_KEYS)
        + "\n\nFor each biodomain where this ingredient has meaningful clinical evidence, "
          "record the impact using the record_biodomain_impacts tool. "
          "Only include domains with real effect. Skip domains with no evidence."
    )

    try:
        message = await claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=BIODOMAIN_SYSTEM,
            tools=[BIODOMAIN_TOOL],
            tool_choice={"type": "any"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in message.content:
            if block.type == "tool_use" and block.name == "record_biodomain_impacts":
                return block.input.get("impacts", [])
        return []
    except anthropic.APIError as exc:
        print(f"    [Claude/Sonnet] Biodomain scoring error for '{ingredient_name}': {exc}")
        return []


async def store_biodomain_scores(
    session: AsyncSession,
    ingredient_id: uuid.UUID,
    impacts: list[dict[str, Any]],
    evidence_count: int,
) -> None:
    """
    Upsert biodomain scores for this ingredient.
    Deletes existing rows first (clean replace — idempotent re-runs are safe).
    """
    # Delete existing scores for this ingredient
    await session.execute(
        delete(IngredientBioDomainScore).where(
            IngredientBioDomainScore.ingredient_id == ingredient_id
        )
    )

    for impact in impacts:
        biodomain = impact.get("biodomain")
        if not biodomain or biodomain not in BIODOMAIN_KEYS:
            continue  # Skip unknown domains

        score = IngredientBioDomainScore(
            ingredient_id=ingredient_id,
            biodomain=biodomain,
            direction=impact.get("direction", "neutral"),
            magnitude=float(impact.get("magnitude", 0.0)),
            confidence=impact.get("confidence", "low"),
            evidence_count=evidence_count,
            dose_dependent=bool(impact.get("dose_dependent", False)),
            effective_dose_low=impact.get("effective_dose_low"),
            effective_dose_high=impact.get("effective_dose_high"),
            dose_unit=impact.get("dose_unit"),
            notes=impact.get("notes"),
        )
        session.add(score)


# ─── Evidence level derivation ────────────────────────────────────────────────

def derive_evidence_level(evidence_records: list[dict]) -> str:
    if not evidence_records:
        return "insufficient"

    high     = sum(1 for e in evidence_records if e.get("confidence") == "high")
    moderate = sum(1 for e in evidence_records if e.get("confidence") == "moderate")
    total    = len(evidence_records)

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
        print(f"  [dry-run] Would search PubMed (3 tiers) for '{name}'")
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
        # ── 2. Tiered PubMed search ───────────────────────────────────────────
        print(f"  [1/5] Searching PubMed (3 tiers)...")
        tier_tasks = [
            pubmed_search_tier(http, name, pubmed_sem, tier, cap)
            for tier, cap in TIER_CAPS.items()
        ]
        tier_results = await asyncio.gather(*tier_tasks)

        # Deduplicate PMIDs (a study can appear in multiple tier searches)
        seen: set[str] = set()
        pmids: list[str] = []
        for tier_name, tier_pmids in zip(TIER_CAPS.keys(), tier_results):
            new = [p for p in tier_pmids if p not in seen]
            seen.update(new)
            pmids.extend(new)
            print(f"        {tier_name}: {len(tier_pmids)} PMIDs ({len(new)} new)")

        print(f"        Total unique PMIDs: {len(pmids)}")

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

        # ── 3. Fetch abstracts ────────────────────────────────────────────────
        print(f"  [2/5] Fetching abstracts...")
        fetch_tasks = [pubmed_fetch_abstract(http, pmid, pubmed_sem) for pmid in pmids]
        articles = await asyncio.gather(*fetch_tasks)
        valid_articles = [a for a in articles if a is not None]
        print(f"        {len(valid_articles)}/{len(pmids)} abstracts retrieved")

        if not valid_articles:
            raise RuntimeError("All abstract fetches failed")

        # ── 4. Claude synthesis (parallel, Haiku) ─────────────────────────────
        print(f"  [3/5] Synthesizing with Claude Haiku ({len(valid_articles)} abstracts)...")
        synthesized: list[dict[str, Any]] = []

        async def _synthesize_and_store(article: dict) -> None:
            pmid = str(article["pmid"])

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
                await store_evidence(session, iid, article, result)
                await session.commit()

            dose_str = ""
            if result.get("dose_low") and result.get("dose_unit"):
                dose_str = f" [{result['dose_low']}–{result.get('dose_high', result['dose_low'])} {result['dose_unit']}]"

            direction_icon = {"benefit": "✓", "risk": "⚠", "neutral": "–", "mixed": "±"}.get(
                result.get("direction", "neutral"), "?"
            )
            print(
                f"        PMID {pmid} [{result.get('study_type','?')}] "
                f"{direction_icon}{dose_str} {result['finding'][:70]}..."
            )

            synthesized.append({
                "study_type":  result.get("study_type", "other"),
                "confidence":  result.get("confidence", "low"),
                "direction":   result.get("direction", "neutral"),
                "finding":     result.get("finding", ""),
                "dose_low":    result.get("dose_low"),
                "dose_high":   result.get("dose_high"),
                "dose_unit":   result.get("dose_unit"),
            })

        await asyncio.gather(*[_synthesize_and_store(a) for a in valid_articles])

        # ── 5. Belief vs. reality summary (Sonnet) ────────────────────────────
        print(f"  [4/5] Generating belief vs. reality summary...")
        findings = [e["finding"] for e in synthesized if e.get("finding")]
        belief_result = await generate_belief_summary(
            claude, name, findings, ingredient.mechanism_summary
        )
        if belief_result:
            common_belief, evidence_reality = belief_result
            print(f"        Written ({len(common_belief or '')} chars)")
        else:
            common_belief, evidence_reality = None, None
            print(f"        Skipped (no findings or API error)")

        # ── 6. Biodomain scoring (Sonnet) ─────────────────────────────────────
        print(f"  [5/5] Scoring biodomains...")
        impacts = await generate_biodomain_scores(
            claude,
            name,
            findings,
            synthesized,
            ingredient.mechanism_summary,
        )
        print(f"        {len(impacts)} domains scored")
        for imp in impacts:
            sign = "↑" if imp.get("direction") == "benefit" else ("↓" if imp.get("direction") == "harm" else "→")
            print(f"        {sign} {imp.get('biodomain')} {imp.get('magnitude',0):.2f} ({imp.get('confidence','?')})")

        async with session_factory() as session:
            await store_biodomain_scores(session, iid, impacts, len(synthesized))
            await session.commit()

        # ── 7. Update ingredient aggregate fields ─────────────────────────────
        evidence_level = derive_evidence_level(synthesized)
        update_values: dict[str, Any] = {
            "research_status": ResearchStatus.COMPLETE,
            "researched_at": datetime.now(timezone.utc),
            "evidence_level": evidence_level,
        }
        if common_belief:
            update_values["common_belief"] = common_belief
        if evidence_reality:
            update_values["evidence_reality"] = evidence_reality

        async with session_factory() as session:
            await session.execute(
                update(Ingredient)
                .where(Ingredient.id == iid)
                .values(**update_values)
            )
            await session.commit()

        print(f"  Done — {len(synthesized)} studies | evidence: {evidence_level} | domains: {len(impacts)}")

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
    if not args.dry_run and not settings.anthropic_api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set in .env")
        sys.exit(1)

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        if args.ingredient:
            ingredients = []
            for name in args.ingredient:
                result = await session.execute(
                    select(Ingredient).where(Ingredient.canonical_name.ilike(name))
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

    total_pmids = sum(sum(TIER_CAPS.values()) for _ in ingredients)
    print(f"\nNourAI Research Agent")
    print(f"{'='*60}")
    print(f"  Mode:        {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Ingredients: {len(ingredients)}")
    print(f"  Max PMIDs:   ~{total_pmids} ({'+'.join(str(v) for v in TIER_CAPS.values())} per ingredient)")
    print(f"  Models:      Haiku (abstracts) + Sonnet (belief + biodomains)")
    print(f"  NCBI key:    {'yes' if settings.ncbi_api_key else 'no (3 req/s limit)'}")
    print(f"{'='*60}")

    claude = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    pubmed_sem = asyncio.Semaphore(PUBMED_CONCURRENCY)
    claude_sem = asyncio.Semaphore(CLAUDE_CONCURRENCY)

    async with httpx.AsyncClient(
        headers={"User-Agent": "NourAI-ResearchAgent/1.0 (research@nourai.app)"},
        follow_redirects=True,
    ) as http:
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
