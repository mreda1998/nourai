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
import base64
import json
import re
import sys
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any

import anthropic
import httpx
from openai import AsyncOpenAI
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
from app.models.ingredient_interaction import IngredientInteraction

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


_PLACEHOLDERS = {"<unknown>", "unknown", "n/a", "na", "none", "null", "not reported", "-", ""}


def _as_text(value: Any) -> str | None:
    """The model sometimes fills a field with a placeholder; store nothing instead."""
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in _PLACEHOLDERS else text


def _as_int(value: Any) -> int | None:
    """A whole number from 38, "1,924" or "721 participants"; never a guess."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    match = re.match(r"^\s*(\d[\d,]*)\b", str(value))
    return int(match.group(1).replace(",", "")) if match else None


def _fit(column: str, value: Any) -> str | None:
    """Clean text clipped to its column's length, so one long field can't fail a whole ingredient."""
    text = _as_text(value)
    limit = getattr(IngredientEvidence.__table__.c[column].type, "length", None)
    if text is not None and limit and len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


async def all_study_records(
    session: AsyncSession,
    ingredient_id: uuid.UUID,
    new_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Every stored study for the ingredient; dose details from this run where known."""
    new_by_pmid = {r["pmid"]: r for r in new_records if r.get("pmid")}
    rows = (await session.execute(
        select(IngredientEvidence).where(IngredientEvidence.ingredient_id == ingredient_id)
    )).scalars().all()
    records = []
    for row in rows:
        new = new_by_pmid.get(row.pmid or "", {})
        records.append({
            "pmid": row.pmid,
            "study_type": row.study_type or "other",
            "confidence": row.confidence or "low",
            "direction": row.direction or "neutral",
            "finding": row.finding,
            "dose_low": new.get("dose_low"),
            "dose_high": new.get("dose_high"),
            "dose_unit": new.get("dose_unit"),
        })
    return records


async def store_evidence(
    session: AsyncSession,
    ingredient_id: uuid.UUID,
    article: dict[str, Any],
    synthesis: dict[str, Any],
) -> IngredientEvidence:
    evidence = IngredientEvidence(
        ingredient_id=ingredient_id,
        pmid=str(article["pmid"]),
        doi=_fit("doi", article.get("doi")),
        title=article.get("title"),
        journal=_fit("journal", article.get("journal")),
        year=_as_int(article.get("year")) or _as_int(synthesis.get("year")),
        raw_abstract=article["abstract"],
        study_type=_fit("study_type", synthesis.get("study_type")),
        population=_fit("population", synthesis.get("population")),
        sample_size=_as_int(synthesis.get("sample_size")),
        finding=synthesis["finding"],
        direction=synthesis.get("direction", EvidenceDirection.NEUTRAL),
        effect_size=_fit("effect_size", synthesis.get("effect_size")),
        confidence=_fit("confidence", synthesis.get("confidence")) or "low",
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


# ─── Mechanism image generation ──────────────────────────────────────────────

# Category → visual style hint used by the DALL-E prompt.
_CATEGORY_STYLE: dict[str, str] = {
    "vitamin":      "soft golden bioluminescent light, cellular organelles",
    "mineral":      "crystalline ionic lattice structures, electrostatic fields",
    "amino_acid":   "protein folding ribbon diagrams, peptide chains",
    "herb":         "botanical cross-section with vivid natural pigments",
    "probiotic":    "gut microbiome colony, intestinal epithelium surface",
    "enzyme":       "enzyme active site lock-and-key with substrate",
    "fatty_acid":   "phospholipid bilayer membrane, lipid droplets",
    "antioxidant":  "free-radical neutralization, electron cloud transfer",
    "preservative": "molecular barrier, antimicrobial membrane interaction",
    "sweetener":    "receptor binding on taste cell microvilli",
    "additive":     "molecular dispersion in food matrix",
    "other":        "abstract molecular biology, space-filling model",
}

_CATEGORY_COLOR: dict[str, str] = {
    "vitamin":      "warm amber, gold, and soft white",
    "mineral":      "cool cobalt blue, silver, and electric cyan",
    "amino_acid":   "deep violet, lavender, and pearl white",
    "herb":         "rich forest green, earth sienna, and cream",
    "probiotic":    "teal, warm rose, and translucent pearl",
    "enzyme":       "cobalt blue, bright white, and molecular grey",
    "fatty_acid":   "ocean blue, translucent gold, and soft green",
    "antioxidant":  "vivid orange, deep crimson, and white",
    "preservative": "steel blue, dark charcoal, and sharp white",
    "sweetener":    "warm pink, bright white, and soft gold",
    "additive":     "muted teal, off-white, and slate grey",
    "other":        "midnight blue, bioluminescent green, and white",
}


def _build_image_prompt(
    canonical_name: str,
    category: str,
    mechanism_summary: str | None,
    findings: list[str],
) -> str:
    """
    Build a gpt-image-1 prompt for a mechanism-of-action illustration.

    The image is abstract and scientific — no text, no labels, no diagrams
    with annotations. It should evoke the biological process, not explain it.
    """
    style = _CATEGORY_STYLE.get(category, _CATEGORY_STYLE["other"])
    color = _CATEGORY_COLOR.get(category, _CATEGORY_COLOR["other"])

    # Ground the visual in the actual mechanism and top finding
    mechanism_clause = (
        f"The compound's mechanism: {mechanism_summary[:180]}. "
        if mechanism_summary else ""
    )
    finding_clause = (
        f"Key effect to visualize: {findings[0][:120]}. "
        if findings else ""
    )

    prompt = (
        f"Abstract scientific visualization of {canonical_name}, "
        f"a {category.replace('_', ' ')} compound interacting with human biology. "
        f"Visual style: {style}. "
        f"Color palette: {color}. "
        f"{mechanism_clause}"
        f"{finding_clause}"
        "The image should feel like high-end scientific illustration — "
        "ethereal, precise, and beautiful. Shot as if through an electron microscope "
        "or rendered as a detailed 3-D molecular visualization. "
        "No text, no labels, no numbers, no annotations anywhere in the image."
    )
    return prompt


async def generate_and_upload_mechanism_image(
    openai_client: AsyncOpenAI,
    http: httpx.AsyncClient,
    canonical_name: str,
    prompt: str,
) -> str | None:
    """
    Generate a mechanism illustration via gpt-image-1 and upload it to
    Supabase Storage.

    Returns the public URL on success, None on any failure.
    Images are stored at: ingredient-mechanisms/{slug}.png
    """
    slug = re.sub(r"[^a-z0-9]+", "-", canonical_name.lower()).strip("-")
    storage_path = f"ingredient-mechanisms/{slug}.png"
    public_url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/"
        f"{settings.supabase_storage_bucket}/{storage_path}"
    )

    # ── Generate via OpenAI ───────────────────────────────────────────────────
    try:
        response = await openai_client.images.generate(
            model="gpt-image-1",
            prompt=prompt,
            n=1,
            size="1024x1024",
            quality="auto",
        )
        # gpt-image-1 returns b64_json by default
        image_b64 = response.data[0].b64_json
        if not image_b64:
            print(f"    [OpenAI] Empty image response for '{canonical_name}'")
            return None
        image_bytes = base64.b64decode(image_b64)
        print(f"    [OpenAI] Image generated ({len(image_bytes) // 1024} KB)")
    except Exception as exc:
        print(f"    [OpenAI] Image generation failed for '{canonical_name}': {exc}")
        return None

    # ── Upload to Supabase Storage ────────────────────────────────────────────
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print(f"    [Supabase] Skipping upload — SUPABASE_URL or SERVICE_ROLE_KEY not set")
        return None

    upload_url = (
        f"{settings.supabase_url.rstrip('/')}/storage/v1/object/"
        f"{settings.supabase_storage_bucket}/{storage_path}"
    )
    try:
        resp = await http.post(
            upload_url,
            content=image_bytes,
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "image/png",
                "x-upsert": "true",
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        print(f"    [Supabase] Uploaded → {storage_path}")
        return public_url
    except Exception as exc:
        print(f"    [Supabase] Upload failed for '{canonical_name}': {exc}")
        return None


# ─── Core research loop ───────────────────────────────────────────────────────

async def research_one_ingredient(
    ingredient: Ingredient,
    claude: anthropic.AsyncAnthropic,
    openai_client: AsyncOpenAI,
    http: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    pubmed_sem: asyncio.Semaphore,
    claude_sem: asyncio.Semaphore,
    dry_run: bool = False,
    skip_images: bool = False,
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
                "pmid":        pmid,
                "study_type":  result.get("study_type", "other"),
                "confidence":  result.get("confidence", "low"),
                "direction":   result.get("direction", "neutral"),
                "finding":     result.get("finding", ""),
                "dose_low":    result.get("dose_low"),
                "dose_high":   result.get("dose_high"),
                "dose_unit":   result.get("dose_unit"),
            })

        await asyncio.gather(*[_synthesize_and_store(a) for a in valid_articles])

        # Summaries, evidence level and domain scores use every stored study for
        # this ingredient — not just the ones added in this run, which on a
        # re-run can be a handful and would overwrite a well-supported summary.
        async with session_factory() as session:
            synthesized = await all_study_records(session, iid, synthesized)

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

        # ── 7. Mechanism image generation (gpt-image-1) ───────────────────────
        # Skipped when: --skip-images flag, no OPENAI_API_KEY, or image already exists.
        mechanism_image_url: str | None = None
        if (
            not skip_images
            and settings.openai_api_key
            and not ingredient.mechanism_image_url
        ):
            print(f"  [6/6] Generating mechanism illustration...")
            image_prompt = _build_image_prompt(
                canonical_name=name,
                category=str(ingredient.category),
                mechanism_summary=ingredient.mechanism_summary,
                findings=findings,
            )
            mechanism_image_url = await generate_and_upload_mechanism_image(
                openai_client, http, name, image_prompt
            )
            if mechanism_image_url:
                print(f"        Illustration uploaded")
            else:
                print(f"        Illustration skipped or failed")
        elif skip_images:
            print(f"  [6/6] Image generation skipped (--skip-images)")
        elif not settings.openai_api_key:
            print(f"  [6/6] Image generation skipped (no OPENAI_API_KEY)")
        else:
            print(f"  [6/6] Image already exists, skipping generation")

        # ── 8. Update ingredient aggregate fields ─────────────────────────────
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
        if mechanism_image_url:
            update_values["mechanism_image_url"] = mechanism_image_url

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


# ─── Atelier pipeline (--atelier flag) ───────────────────────────────────────

ATELIER_TOOL: dict[str, Any] = {
    "name": "record_atelier_data",
    "description": (
        "Record circadian timing and ingredient interaction data for an ingredient. "
        "Called once per ingredient using existing synthesized evidence findings."
    ),
    "input_schema": {
        "type": "object",
        "required": ["optimal_times", "avoid_near_sleep"],
        "properties": {
            "optimal_times": {
                "type": "array",
                "description": "Best windows to take this ingredient. Include only windows with meaningful rationale.",
                "items": {
                    "type": "object",
                    "required": ["window", "reason"],
                    "properties": {
                        "window": {
                            "type": "string",
                            "enum": ["morning", "afternoon", "evening", "night"],
                        },
                        "reason": {
                            "type": "string",
                            "description": "One sentence: why this window is optimal (absorption, circadian alignment, etc.)",
                        },
                        "with_food": {
                            "type": "boolean",
                            "description": "True if absorption or tolerability requires food co-ingestion.",
                        },
                    },
                },
            },
            "avoid_near_sleep": {
                "type": "boolean",
                "description": "True if taking within 3–4 hours of sleep would disrupt sleep quality.",
            },
            "circadian_notes": {
                "type": "string",
                "description": "Optional: 1–2 sentences on nuanced timing considerations not captured by optimal_times.",
            },
            "interactions": {
                "type": "array",
                "description": (
                    "Pairwise interactions with OTHER well-known ingredients. "
                    "Only include interactions with meaningful clinical or mechanistic evidence."
                ),
                "items": {
                    "type": "object",
                    "required": ["partner_name", "type", "mechanism", "confidence"],
                    "properties": {
                        "partner_name": {
                            "type": "string",
                            "description": "Canonical name of the interacting ingredient (e.g. 'Magnesium glycinate', 'Caffeine').",
                        },
                        "type": {
                            "type": "string",
                            "enum": ["synergy", "compete", "caution"],
                            "description": "'synergy' = enhance each other, 'compete' = interfere with absorption/effect, 'caution' = combined use needs monitoring.",
                        },
                        "mechanism": {
                            "type": "string",
                            "description": "1–2 sentences on the biochemical mechanism.",
                        },
                        "confidence": {
                            "type": "string",
                            "enum": ["high", "moderate", "low"],
                        },
                    },
                },
            },
        },
    },
}

ATELIER_SYSTEM = (
    "You are a clinical pharmacologist specializing in chronobiology and ingredient interactions. "
    "Your job is to determine the optimal circadian timing for supplement/ingredient use "
    "and identify meaningful pairwise interactions with other common ingredients. "
    "Base timing on absorption pharmacokinetics, food-dependency, and circadian biology. "
    "For interactions, only include those with genuine mechanistic or clinical evidence — "
    "not speculative associations. Be conservative and accurate."
)


async def generate_atelier_data(
    claude: anthropic.AsyncAnthropic,
    ingredient_name: str,
    category: str,
    findings: list[str],
    mechanism_summary: str | None,
) -> dict[str, Any] | None:
    if not findings:
        return None

    findings_block = "\n".join(f"• {f}" for f in findings[:20])
    prompt = (
        f"Ingredient: {ingredient_name} (category: {category})\n\n"
        + (f"Mechanism of action: {mechanism_summary}\n\n" if mechanism_summary else "")
        + f"Synthesized clinical findings:\n{findings_block}\n\n"
        "Using the record_atelier_data tool, provide:\n"
        "1. Optimal timing windows (morning/afternoon/evening/night) with reasoning\n"
        "2. Whether it should be avoided near sleep\n"
        "3. Any important interactions with other common supplements/ingredients\n"
        "Only include interactions that have real mechanistic or clinical backing."
    )

    try:
        message = await claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=ATELIER_SYSTEM,
            tools=[ATELIER_TOOL],
            tool_choice={"type": "any"},
            messages=[{"role": "user", "content": prompt}],
        )
        for block in message.content:
            if block.type == "tool_use" and block.name == "record_atelier_data":
                return block.input
        return None
    except anthropic.APIError as exc:
        print(f"    [Claude/Sonnet/Atelier] Error for '{ingredient_name}': {exc}")
        return None


async def store_atelier_data(
    session: AsyncSession,
    ingredient: Ingredient,
    data: dict[str, Any],
    name_to_id: dict[str, uuid.UUID],
) -> None:
    """Write timing fields to ingredients; upsert interaction pairs."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    # Write timing fields
    await session.execute(
        update(Ingredient)
        .where(Ingredient.id == ingredient.id)
        .values(
            optimal_times=data.get("optimal_times") or [],
            avoid_near_sleep=bool(data.get("avoid_near_sleep", False)),
            circadian_notes=data.get("circadian_notes"),
        )
    )

    # Upsert interactions
    for ix in data.get("interactions") or []:
        partner_name = ix.get("partner_name", "").strip()
        if not partner_name:
            continue

        # Fuzzy-match: try exact, then case-insensitive prefix
        partner_id = name_to_id.get(partner_name)
        if partner_id is None:
            lower = partner_name.lower()
            for k, v in name_to_id.items():
                if k.lower() == lower:
                    partner_id = v
                    break

        if partner_id is None:
            print(f"        [atelier] Partner '{partner_name}' not found in DB — skipping")
            continue

        if partner_id == ingredient.id:
            continue

        # Canonical ordering: lower UUID in id_a
        id_a, id_b = (
            (ingredient.id, partner_id)
            if str(ingredient.id) < str(partner_id)
            else (partner_id, ingredient.id)
        )

        stmt = (
            pg_insert(IngredientInteraction)
            .values(
                ingredient_id_a=id_a,
                ingredient_id_b=id_b,
                interaction_type=ix.get("type", "caution"),
                mechanism=ix.get("mechanism", ""),
                confidence=ix.get("confidence", "low"),
            )
            .on_conflict_do_update(
                constraint="uq_interaction_pair",
                set_={
                    "interaction_type": ix.get("type", "caution"),
                    "mechanism": ix.get("mechanism", ""),
                    "confidence": ix.get("confidence", "low"),
                },
            )
        )
        await session.execute(stmt)
        print(f"        [atelier] ↔ {partner_name} [{ix.get('type')}]")

    await session.commit()


async def research_atelier_one_ingredient(
    ingredient: Ingredient,
    claude: anthropic.AsyncAnthropic,
    session_factory: async_sessionmaker[AsyncSession],
    name_to_id: dict[str, uuid.UUID],
    dry_run: bool = False,
) -> None:
    name = ingredient.canonical_name

    print(f"\n  Atelier: {name}")

    if dry_run:
        print(f"  [dry-run] Would generate atelier data for '{name}'")
        return

    # Load existing evidence findings
    async with session_factory() as session:
        result = await session.execute(
            select(IngredientEvidence.finding)
            .where(IngredientEvidence.ingredient_id == ingredient.id)
        )
        findings = [r[0] for r in result.all() if r[0]]

    if not findings:
        print(f"  No evidence findings — skipping (run research pipeline first)")
        return

    data = await generate_atelier_data(
        claude,
        name,
        str(ingredient.category),
        findings,
        ingredient.mechanism_summary,
    )

    if data is None:
        print(f"  Sonnet returned nothing — skipping")
        return

    windows = [t.get("window") for t in (data.get("optimal_times") or [])]
    print(f"  → timing: {windows} | avoid_near_sleep: {data.get('avoid_near_sleep')} | interactions: {len(data.get('interactions') or [])}")

    async with session_factory() as session:
        await store_atelier_data(session, ingredient, data, name_to_id)


# ─── Entry point ──────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    if not args.dry_run and not settings.anthropic_api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set in .env")
        sys.exit(1)

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # ── Atelier mode: process complete ingredients ─────────────────────────────
    if args.atelier:
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
            else:
                stmt = (
                    select(Ingredient)
                    .where(Ingredient.research_status == ResearchStatus.COMPLETE)
                    .order_by(Ingredient.canonical_name)
                )
                if args.limit:
                    stmt = stmt.limit(args.limit)
                result = await session.execute(stmt)
                ingredients = list(result.scalars().all())

            # Build name→id map for interaction partner lookup
            all_result = await session.execute(select(Ingredient.canonical_name, Ingredient.id))
            name_to_id: dict[str, uuid.UUID] = {row[0]: row[1] for row in all_result.all()}

        if not ingredients:
            print("No complete ingredients to process. Run 'make research-all' first.")
            await engine.dispose()
            return

        print(f"\nNourAI Research Agent — Atelier Mode")
        print(f"{'='*60}")
        print(f"  Mode:        {'DRY RUN' if args.dry_run else 'LIVE'}")
        print(f"  Ingredients: {len(ingredients)} (research_status=complete)")
        print(f"  Model:       Sonnet (timing + interactions)")
        print(f"{'='*60}")

        claude = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        for ingredient in ingredients:
            await research_atelier_one_ingredient(
                ingredient=ingredient,
                claude=claude,
                session_factory=session_factory,
                name_to_id=name_to_id,
                dry_run=args.dry_run,
            )

        await engine.dispose()
        print(f"\n{'='*60}")
        print(f"  Atelier enrichment complete.")
        print(f"{'='*60}\n")
        return

    # ── Standard research mode ─────────────────────────────────────────────────
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
    has_images = bool(settings.openai_api_key) and not args.skip_images
    print(f"\nNourAI Research Agent")
    print(f"{'='*60}")
    print(f"  Mode:        {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Ingredients: {len(ingredients)}")
    print(f"  Max PMIDs:   ~{total_pmids} ({'+'.join(str(v) for v in TIER_CAPS.values())} per ingredient)")
    print(f"  Models:      Haiku (abstracts) + Sonnet (belief + biodomains) + gpt-image-1 (illustrations)")
    print(f"  NCBI key:    {'yes' if settings.ncbi_api_key else 'no (3 req/s limit)'}")
    print(f"  Images:      {'yes (gpt-image-1)' if has_images else 'skipped'}")
    print(f"{'='*60}")

    claude = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    openai_client = AsyncOpenAI(api_key=settings.openai_api_key or "no-key")
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
                openai_client=openai_client,
                http=http,
                session_factory=session_factory,
                pubmed_sem=pubmed_sem,
                claude_sem=claude_sem,
                dry_run=args.dry_run,
                skip_images=args.skip_images,
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
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Skip mechanism illustration generation (saves OpenAI cost)",
    )
    parser.add_argument(
        "--atelier",
        action="store_true",
        help=(
            "Atelier mode: generate circadian timing and interaction data for all "
            "research_status=complete ingredients. No PubMed fetch — uses existing evidence."
        ),
    )
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
