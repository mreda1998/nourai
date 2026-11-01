"""
NourAI Research Agent
=====================
Claim-based research for every ingredient in the database (app/services/research):
Claude drafts the claims people believe, PubMed is searched per claim, each paper
is appraised for how it was done and weighed, each claim gets a verdict, and the
ingredient gets belief vs. reality, biodomain scores and an illustration.
Design: docs/superpowers/specs/2026-10-24-claim-based-research-design.md

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
from app.models.ingredient_evidence import IngredientEvidence
from app.models.ingredient_biodomain_score import IngredientBioDomainScore
from app.models.ingredient_interaction import IngredientInteraction
from app.services.research.llm import ResearchLLM
from app.services.research.pipeline import MAX_STUDIES, research_ingredient, store_research
from app.services.research.weighting import legacy_confidence, legacy_direction

# ─── Concurrency ──────────────────────────────────────────────────────────────

# Without NCBI_API_KEY: 3 req/s. With: 10 req/s.
PUBMED_CONCURRENCY = 3
CLAUDE_CONCURRENCY = 5

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
    llm: ResearchLLM,
    claude: anthropic.AsyncAnthropic,
    openai_client: AsyncOpenAI,
    http: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    pubmed_sem: asyncio.Semaphore,
    dry_run: bool = False,
    skip_images: bool = False,
) -> None:
    """Claim-based research for one ingredient (app/services/research), then biodomains and image."""
    name = ingredient.canonical_name
    iid = ingredient.id

    print(f"\n{'─'*60}")
    print(f"  Researching: {name}")
    print(f"{'─'*60}")

    if dry_run:
        print(f"  [dry-run] Would draft claims, search PubMed per claim and appraise up to {MAX_STUDIES} papers")
        return

    async with session_factory() as session:
        await session.execute(
            update(Ingredient).where(Ingredient.id == iid).values(research_status=ResearchStatus.IN_PROGRESS)
        )
        await session.commit()

    try:
        result = await research_ingredient(ingredient, llm, http, pubmed_sem)
        if result is None:
            raise RuntimeError("no claims could be drafted")

        for judged in result.claims:
            verdict = judged.verdict
            print(
                f"  [{judged.draft.kind}] {judged.draft.claim} → {verdict.verdict} "
                f"({verdict.certainty}, {len(judged.studies)} studies)"
            )

        # Biodomain scores read the appraised studies, strongest first.
        ranked = sorted(result.studies, key=lambda s: s.weighting.score, reverse=True)
        findings = [s.appraisal.finding for s in ranked]
        records = [
            {
                "study_type": s.appraisal.design,
                "confidence": legacy_confidence(s.weighting.tier),
                "direction": legacy_direction(s.appraisal),
                "finding": s.appraisal.finding,
                "dose_low": s.appraisal.dose_amount,
                "dose_high": s.appraisal.dose_amount,
                "dose_unit": s.appraisal.dose_unit,
            }
            for s in ranked
        ]
        impacts = await generate_biodomain_scores(claude, name, findings, records, ingredient.mechanism_summary)
        print(f"  {len(impacts)} biodomains scored")

        async with session_factory() as session:
            await store_research(session, iid, result)
            await store_biodomain_scores(session, iid, impacts, len(result.studies))
            await session.commit()

        if not skip_images and settings.openai_api_key and not ingredient.mechanism_image_url and findings:
            prompt = _build_image_prompt(
                canonical_name=name, category=str(ingredient.category),
                mechanism_summary=ingredient.mechanism_summary, findings=findings,
            )
            image_url = await generate_and_upload_mechanism_image(openai_client, http, name, prompt)
            if image_url:
                async with session_factory() as session:
                    await session.execute(
                        update(Ingredient).where(Ingredient.id == iid).values(mechanism_image_url=image_url)
                    )
                    await session.commit()
                print("  Illustration uploaded")

        print(
            f"  Done — {len(result.claims)} claims | {len(result.studies)} studies "
            f"({result.skipped_off_target} off-target) | evidence: {result.evidence_level}"
        )

    except Exception as exc:
        print(f"  ERROR researching '{name}': {exc}")
        async with session_factory() as session:
            await session.execute(
                update(Ingredient).where(Ingredient.id == iid).values(research_status=ResearchStatus.FAILED)
            )
            await session.commit()


# Per-MTok prices (input, output, cache read) for the run-cost line; tokens only for others.
_PRICES = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}


def print_usage(llm: ResearchLLM) -> None:
    total = 0.0
    priced = True
    for stage, usage in llm.usage.items():
        model = llm.model_for(stage)
        line = (
            f"  {stage:<10} {usage['calls']:>4} calls  in {usage['input_tokens']:>9,}  "
            f"cached {usage['cache_read_input_tokens']:>9,}  out {usage['output_tokens']:>9,}  ({model})"
        )
        price = _PRICES.get(model)
        if price:
            cost = (
                usage["input_tokens"] * price[0] + usage["output_tokens"] * price[1]
                + usage["cache_read_input_tokens"] * price[2] + usage["cache_creation_input_tokens"] * price[0] * 1.25
            ) / 1_000_000
            total += cost
            line += f"  ≈ ${cost:,.2f}"
        else:
            priced = False
        print(line)
    if llm.usage:
        print(f"  Claude total ≈ ${total:,.2f}" + ("" if priced else " (plus unpriced models)"))

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

    has_images = bool(settings.openai_api_key) and not args.skip_images
    print(f"\nNourAI Research Agent")
    print(f"{'='*60}")
    print(f"  Mode:        {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Ingredients: {len(ingredients)}")
    print(f"  Papers:      up to {MAX_STUDIES} per ingredient, chosen per claim")
    print(f"  Models:      {settings.research_model} (claims, verdicts) + "
          f"{settings.research_appraisal_model} (appraisals) + Sonnet 4.6 (biodomains)")
    print(f"  NCBI key:    {'yes' if settings.ncbi_api_key else 'no (3 req/s limit)'}")
    print(f"  Images:      {'yes (gpt-image-1)' if has_images else 'skipped'}")
    print(f"{'='*60}")

    claude = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    llm = ResearchLLM(claude, concurrency=CLAUDE_CONCURRENCY)
    openai_client = AsyncOpenAI(api_key=settings.openai_api_key or "no-key")
    pubmed_sem = asyncio.Semaphore(PUBMED_CONCURRENCY)

    async with httpx.AsyncClient(
        headers={"User-Agent": "Elory-ResearchAgent/2.0 (hello@elory.app)"},
        follow_redirects=True,
    ) as http:
        # Ingredients overlap; Claude and PubMed calls stay capped by their own semaphores.
        slots = asyncio.Semaphore(max(1, args.parallel))

        async def research(ingredient: Ingredient) -> None:
            async with slots:
                await research_one_ingredient(
                    ingredient=ingredient,
                    llm=llm,
                    claude=claude,
                    openai_client=openai_client,
                    http=http,
                    session_factory=session_factory,
                    pubmed_sem=pubmed_sem,
                    dry_run=args.dry_run,
                    skip_images=args.skip_images,
                )

        await asyncio.gather(*(research(ingredient) for ingredient in ingredients))

    await engine.dispose()
    print(f"\n{'='*60}")
    print(f"  Research agent complete.")
    print_usage(llm)
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
        "--parallel",
        type=int,
        default=1,
        metavar="N",
        help="Research up to N ingredients at once (default 1)",
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
