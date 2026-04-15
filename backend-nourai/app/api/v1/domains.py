"""
Domain analysis endpoint.

GET /domains/{slug}/analyze

Given a set of product IDs (the user's stack), returns a full scientific
analysis of how the stack performs against a specific bio-domain:

  • ingredient_impacts   — real evidence direction per ingredient (from PubMed)
  • missing_ingredients  — canonical high-evidence ingredients not in stack
  • evidence_highlight   — the single strongest study from the stack
  • goal_coverage        — whether each user goal is actually supported by evidence
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.ingredient import Ingredient, ResearchStatus
from app.models.ingredient_evidence import IngredientEvidence
from app.models.product import Product, ProductIngredient

router = APIRouter()


# ─── Domain configuration ─────────────────────────────────────────────────────

# Ingredient categories most relevant to each bio-domain.
# Used to query "missing" canonical ingredients the user doesn't have.
_DOMAIN_INGREDIENT_CATEGORIES: dict[str, list[str]] = {
    "gut-health":     ["probiotic", "enzyme", "herb", "amino_acid", "fatty_acid"],
    "skin":           ["antioxidant", "vitamin", "mineral", "fatty_acid", "amino_acid"],
    "metabolism":     ["amino_acid", "vitamin", "mineral", "fatty_acid", "antioxidant", "herb"],
    "sleep-recovery": ["herb", "amino_acid", "mineral"],
    "cognition":      ["fatty_acid", "amino_acid", "herb", "antioxidant", "vitamin"],
    "exposure-load":  ["antioxidant", "herb", "enzyme", "amino_acid"],
}

# Goal IDs (from onboarding) that map to each domain.
# Used to filter evidence records to domain-relevant studies.
_DOMAIN_GOAL_TAGS: dict[str, list[str]] = {
    "gut-health":     ["gut_health", "less_inflammation"],
    "skin":           ["clear_skin", "anti_aging", "brighter_skin", "hair_growth", "prevent_hair_loss"],
    "metabolism":     ["build_muscle", "fat_loss", "more_energy"],
    "sleep-recovery": ["better_sleep", "recovery"],
    "cognition":      ["mental_focus", "reduce_stress"],
    "exposure-load":  [],
}

# How relevant each product category is to each domain (mirrors frontend).
_DOMAIN_CATEGORY_RELEVANCE: dict[str, dict[str, float]] = {
    "gut-health":     {"food": 1.0, "supplement": 0.6, "cosmetic": 0.0, "otc": 0.3},
    "skin":           {"food": 0.3, "supplement": 0.5, "cosmetic": 1.0, "otc": 0.2},
    "metabolism":     {"food": 0.9, "supplement": 0.6, "cosmetic": 0.0, "otc": 0.3},
    "sleep-recovery": {"food": 0.2, "supplement": 0.8, "cosmetic": 0.0, "otc": 0.7},
    "cognition":      {"food": 0.3, "supplement": 0.7, "cosmetic": 0.0, "otc": 0.2},
    "exposure-load":  {"food": 0.8, "supplement": 0.5, "cosmetic": 0.9, "otc": 0.7},
}

_CONFIDENCE_RANK = {"high": 3, "moderate": 2, "low": 1}
_EVIDENCE_LEVEL_RANK = {"strong": 4, "moderate": 3, "limited": 2, "insufficient": 1}

VALID_SLUGS = set(_DOMAIN_GOAL_TAGS.keys())


# ─── Response schemas ─────────────────────────────────────────────────────────

class IngredientImpact(BaseModel):
    """How a stack ingredient affects this specific domain, backed by evidence."""
    ingredient_id: str
    name: str
    category: str
    direction: str           # "benefit" | "risk" | "neutral" | "mixed"
    confidence: str          # "high" | "moderate" | "low"
    evidence_count: int      # number of relevant studies
    domain_relevance: float  # 0–1 (product category weight × domain)
    top_finding: str | None  # best single-sentence finding for this domain
    typical_dose_range: str | None


class MissingIngredient(BaseModel):
    """A high-evidence ingredient relevant to this domain not present in the stack."""
    ingredient_id: str
    canonical_name: str
    category: str
    evidence_level: str | None
    description: str | None
    mechanism_summary: str | None
    typical_dose_range: str | None
    top_finding: str | None  # best evidence record finding


class EvidenceHighlight(BaseModel):
    """The single strongest clinical finding from the user's stack for this domain."""
    ingredient_name: str
    finding: str
    journal: str | None
    year: int | None
    study_type: str | None
    sample_size: int | None
    direction: str
    confidence: str
    pmid: str | None


class GoalCoverage(BaseModel):
    """Whether a user goal is supported by actual evidence in the stack."""
    goal: str
    status: str         # "covered" | "partial" | "gap"
    covered_by: list[str]  # canonical ingredient names with evidence for this goal


class DomainAnalysisResponse(BaseModel):
    slug: str
    ingredient_impacts: list[IngredientImpact]
    missing_ingredients: list[MissingIngredient]
    evidence_highlight: EvidenceHighlight | None
    goal_coverage: list[GoalCoverage]


# ─── Evidence aggregation helpers ─────────────────────────────────────────────

def _aggregate_direction(
    evidence_records: list[IngredientEvidence],
    domain_goal_tags: list[str],
) -> tuple[str, str, int, str | None]:
    """
    Returns (direction, confidence, relevant_count, top_finding).

    First filters to evidence records whose goal_tags overlap with the domain's
    goal tags — so we only judge the ingredient on its domain-specific evidence,
    not unrelated studies.  Falls back to all evidence when no tagged records exist.
    """
    if domain_goal_tags:
        relevant = [
            ev for ev in evidence_records
            if any(tag in (ev.goal_tags or []) for tag in domain_goal_tags)
        ]
        if not relevant:
            relevant = evidence_records
    else:
        relevant = evidence_records

    if not relevant:
        return "neutral", "low", 0, None

    # Count directions across relevant studies
    counts: dict[str, int] = {"benefit": 0, "risk": 0, "neutral": 0, "mixed": 0}
    best_conf_rank = 0
    best_conf = "low"
    best_finding: str | None = None

    for ev in relevant:
        counts[ev.direction] = counts.get(ev.direction, 0) + 1
        rank = _CONFIDENCE_RANK.get(ev.confidence, 0)
        if rank > best_conf_rank:
            best_conf_rank = rank
            best_conf = ev.confidence
            best_finding = ev.finding

    total = sum(counts.values())
    benefit_ratio = counts["benefit"] / total
    risk_ratio = counts["risk"] / total

    if benefit_ratio >= 0.6:
        direction = "benefit"
    elif risk_ratio >= 0.5:
        direction = "risk"
    elif counts["mixed"] > 0 or (benefit_ratio > 0 and risk_ratio > 0.2):
        direction = "mixed"
    else:
        direction = "neutral"

    return direction, best_conf, len(relevant), best_finding


def _pick_highlight(
    ingredient_evidence_pairs: list[tuple[str, IngredientEvidence]],
    domain_goal_tags: list[str],
) -> tuple[str, IngredientEvidence] | None:
    """
    Pick the single best evidence record across all stack ingredients for this domain.

    Priority: domain-relevant > high confidence > large sample > recent year.
    """
    candidates: list[tuple[int, int, int, int, str, IngredientEvidence]] = []

    for ing_name, ev in ingredient_evidence_pairs:
        domain_relevant = int(
            bool(domain_goal_tags) and any(
                tag in (ev.goal_tags or []) for tag in domain_goal_tags
            )
        )
        conf_rank = _CONFIDENCE_RANK.get(ev.confidence, 0)
        sample = ev.sample_size or 0
        year = ev.year or 0
        candidates.append((domain_relevant, conf_rank, sample, year, ing_name, ev))

    if not candidates:
        return None

    # Sort descending by (domain_relevant, conf_rank, sample, year)
    candidates.sort(key=lambda c: (c[0], c[1], c[2], c[3]), reverse=True)
    best = candidates[0]
    return best[4], best[5]


# ─── Main endpoint ─────────────────────────────────────────────────────────────

@router.get("/{slug}/analyze", response_model=DomainAnalysisResponse)
async def analyze_domain(
    slug: str,
    product_ids: str = Query("", description="Comma-separated product UUIDs from user stack"),
    goals: str = Query("", description="Comma-separated onboarding goal IDs"),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Full scientific domain analysis for a user's stack.

    For each product ID supplied, fetches the matched canonical ingredients
    (via product_ingredients.ingredient_id FK) and their PubMed evidence records,
    then computes:

      1. ingredient_impacts   — aggregated evidence direction per ingredient
      2. evidence_highlight   — the single strongest clinical study in the stack
      3. missing_ingredients  — high-evidence ingredients not yet in the stack
      4. goal_coverage        — per-goal status backed by real evidence tags
    """
    if slug not in VALID_SLUGS:
        raise HTTPException(status_code=404, detail=f"Unknown domain slug: {slug!r}")

    domain_goal_tags = _DOMAIN_GOAL_TAGS[slug]
    domain_categories = _DOMAIN_INGREDIENT_CATEGORIES[slug]
    category_relevance = _DOMAIN_CATEGORY_RELEVANCE[slug]
    user_goals = [g.strip() for g in goals.split(",") if g.strip()]

    # Parse product IDs
    raw_ids = [p.strip() for p in product_ids.split(",") if p.strip()]
    try:
        parsed_product_ids = [uuid.UUID(pid) for pid in raw_ids]
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid product_id UUID in request")

    # ── 1. Fetch product → ingredient links ───────────────────────────────────
    # One query to get all product_ingredients for the given product_ids,
    # joining both the ingredient and the parent product (for its category).
    stack_ingredient_ids: set[uuid.UUID] = set()
    product_category_by_ingredient: dict[uuid.UUID, str] = {}

    if parsed_product_ids:
        pi_stmt = (
            select(ProductIngredient, Product)
            .join(Product, ProductIngredient.product_id == Product.id)
            .where(
                ProductIngredient.product_id.in_(parsed_product_ids),
                ProductIngredient.ingredient_id.isnot(None),
            )
        )
        pi_result = await db.execute(pi_stmt)
        pi_rows = pi_result.all()

        for pi, product in pi_rows:
            iid = pi.ingredient_id
            stack_ingredient_ids.add(iid)
            # Use the highest-relevance product category seen for this ingredient
            existing_rel = category_relevance.get(
                product_category_by_ingredient.get(str(iid), ""), 0
            )
            new_rel = category_relevance.get(product.category, 0)
            if new_rel >= existing_rel:
                product_category_by_ingredient[str(iid)] = product.category

    # ── 2. Load stack ingredients with their evidence ─────────────────────────
    stack_ingredients: list[Ingredient] = []
    if stack_ingredient_ids:
        ing_stmt = (
            select(Ingredient)
            .where(Ingredient.id.in_(stack_ingredient_ids))
            .options(selectinload(Ingredient.evidence))
        )
        ing_result = await db.execute(ing_stmt)
        stack_ingredients = list(ing_result.scalars().all())

    # ── 3. Build ingredient_impacts (Section B) ───────────────────────────────
    ingredient_impacts: list[IngredientImpact] = []
    all_evidence_pairs: list[tuple[str, IngredientEvidence]] = []

    for ing in stack_ingredients:
        iid_str = str(ing.id)
        prod_category = product_category_by_ingredient.get(iid_str, "supplement")
        domain_rel = category_relevance.get(prod_category, 0)

        if domain_rel == 0:
            continue

        direction, confidence, ev_count, top_finding = _aggregate_direction(
            ing.evidence, domain_goal_tags
        )

        # If no synthesised evidence yet, fall back to ingredient.evidence_level
        if ev_count == 0:
            ev_level = ing.evidence_level or "insufficient"
            if ev_level == "strong":
                direction, confidence = "benefit", "moderate"
            elif ev_level == "moderate":
                direction, confidence = "benefit", "low"

        ingredient_impacts.append(IngredientImpact(
            ingredient_id=iid_str,
            name=ing.canonical_name,
            category=ing.category,
            direction=direction,
            confidence=confidence,
            evidence_count=ev_count,
            domain_relevance=domain_rel,
            top_finding=top_finding,
            typical_dose_range=ing.typical_dose_range,
        ))

        # Collect all evidence for highlight selection
        for ev in ing.evidence:
            all_evidence_pairs.append((ing.canonical_name, ev))

    # Sort impacts: risks first (so user sees flags), then by domain relevance desc
    _DIRECTION_RISK_ORDER = {"risk": 0, "mixed": 1, "neutral": 2, "benefit": 3}
    ingredient_impacts.sort(
        key=lambda i: (_DIRECTION_RISK_ORDER.get(i.direction, 4), -i.domain_relevance)
    )

    # ── 4. Evidence highlight (Section E) ────────────────────────────────────
    highlight_pair = _pick_highlight(all_evidence_pairs, domain_goal_tags)
    evidence_highlight: EvidenceHighlight | None = None
    if highlight_pair:
        hl_name, hl_ev = highlight_pair
        evidence_highlight = EvidenceHighlight(
            ingredient_name=hl_name,
            finding=hl_ev.finding,
            journal=hl_ev.journal,
            year=hl_ev.year,
            study_type=hl_ev.study_type,
            sample_size=hl_ev.sample_size,
            direction=hl_ev.direction,
            confidence=hl_ev.confidence,
            pmid=hl_ev.pmid,
        )

    # ── 5. Missing ingredients (Section A) ───────────────────────────────────
    # Query for ingredients in domain-relevant categories that are:
    # - researched (complete)
    # - not already in the user's stack
    # Sorted by evidence level (strong first), limit 6
    missing_ings: list[Ingredient] = []
    if domain_categories:
        missing_stmt = (
            select(Ingredient)
            .where(
                Ingredient.category.in_(domain_categories),
                Ingredient.research_status == ResearchStatus.COMPLETE,
                Ingredient.id.notin_(stack_ingredient_ids) if stack_ingredient_ids
                else True,
            )
            .options(selectinload(Ingredient.evidence))
            .limit(20)  # over-fetch; we'll sort + slice in Python
        )
        missing_result = await db.execute(missing_stmt)
        raw_missing = list(missing_result.scalars().all())

        # Sort by evidence_level descending, then by evidence record count
        raw_missing.sort(
            key=lambda i: (
                -_EVIDENCE_LEVEL_RANK.get(i.evidence_level or "insufficient", 0),
                -len(i.evidence),
            )
        )
        missing_ings = raw_missing[:6]

    missing_ingredients: list[MissingIngredient] = []
    for ing in missing_ings:
        # Pick best evidence finding for this ingredient
        best_ev = max(
            ing.evidence,
            key=lambda e: _CONFIDENCE_RANK.get(e.confidence, 0),
            default=None,
        )
        missing_ingredients.append(MissingIngredient(
            ingredient_id=str(ing.id),
            canonical_name=ing.canonical_name,
            category=ing.category,
            evidence_level=ing.evidence_level,
            description=ing.description,
            mechanism_summary=ing.mechanism_summary,
            typical_dose_range=ing.typical_dose_range,
            top_finding=best_ev.finding if best_ev else None,
        ))

    # ── 6. Goal coverage (Goals section) ─────────────────────────────────────
    # For each user goal relevant to this domain, check which stack ingredients
    # have evidence records with that goal_tag and direction="benefit".
    domain_relevant_user_goals = [g for g in user_goals if g in domain_goal_tags]
    goal_coverage: list[GoalCoverage] = []

    for goal in domain_relevant_user_goals:
        covered_by: list[str] = []
        partial_by: list[str] = []

        for ing in stack_ingredients:
            for ev in ing.evidence:
                if goal in (ev.goal_tags or []):
                    if ev.direction == "benefit" and ev.confidence in ("high", "moderate"):
                        if ing.canonical_name not in covered_by:
                            covered_by.append(ing.canonical_name)
                    elif ev.direction in ("benefit", "mixed"):
                        if ing.canonical_name not in partial_by:
                            partial_by.append(ing.canonical_name)

        if covered_by:
            status = "covered"
        elif partial_by:
            status = "partial"
            covered_by = partial_by
        else:
            status = "gap"

        goal_coverage.append(GoalCoverage(goal=goal, status=status, covered_by=covered_by))

    return DomainAnalysisResponse(
        slug=slug,
        ingredient_impacts=ingredient_impacts,
        missing_ingredients=missing_ingredients,
        evidence_highlight=evidence_highlight,
        goal_coverage=goal_coverage,
    )
