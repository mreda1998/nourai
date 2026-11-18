"""
Dose-aware biodomain scoring for products.

Given a product with its ingredient list (each with an optional amount),
this service aggregates the per-ingredient biodomain scores into a
product-level biodomain profile.

Scientific rationale
--------------------
An ingredient that has strong evidence for a domain at 500 mg/day but is
only present in a product at 50 mg/day delivers ~10% of the expected effect.
We capture this by computing a dose_ratio:

    dose_ratio = clamp(product_amount / effective_dose_low, 0, 1)

If the research records no dose threshold, dose_ratio = 1.0. If the effect is
dose-dependent and the label gives no comparable amount, the ingredient makes
no contribution: an unknown dose is not evidence of an effect.

Confidence multipliers (from biodomains.py) downweight low-quality evidence.

Aggregation strategy
--------------------
For each biodomain, we SUM the signed weighted contributions from all
ingredients. The sum is then scaled to a 0–100 integer health score.
Benefits add, harms subtract. The result is clamped to [0, 100].

This is intentionally simple — one linear equation, fully auditable.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.core.biodomains import (
    BIODOMAIN_BY_KEY,
    BIODOMAIN_KEYS,
    CONFIDENCE_WEIGHTS,
)
from app.core.nutrient_biodomains import get_nutrient_impacts

if TYPE_CHECKING:
    from app.models.ingredient_biodomain_score import IngredientBioDomainScore
    from app.models.product import ProductIngredient
    from app.schemas.mobile import MobileIngredient


# ─── Domain contribution type ─────────────────────────────────────────────────

@dataclass
class DomainContribution:
    """One ingredient's weighted, dose-adjusted contribution to a domain."""
    ingredient_name: str
    raw_magnitude: float      # as reported by the LLM
    dose_ratio: float         # 0–1; how much of the effective dose is present
    confidence_weight: float  # from CONFIDENCE_WEIGHTS
    direction_sign: int       # +1 / -1 / 0
    weighted_score: float     # final contribution = magnitude × dose_ratio × confidence × sign


@dataclass
class ProductDomainScore:
    """Aggregated biodomain score for a product."""
    biodomain: str
    name: str
    raw_score: float              # sum of weighted contributions (can be negative)
    display_value: float          # 0–100 clamped, scaled
    is_negative: bool             # True when the domain net effect is harmful
    contributions: list[DomainContribution] = field(default_factory=list)


# ─── Dose conversion helpers ──────────────────────────────────────────────────

# Simple unit normalization to mg.
# We only normalize when both the product amount and the effective dose
# use compatible units — otherwise we fall back to ratio=1.0.
_TO_MG: dict[str, float] = {
    "mg":     1.0,
    "g":      1000.0,
    "mcg":    0.001,
    "µg":     0.001,
    "ug":     0.001,
    "kg":     1_000_000.0,
}


def _normalize_to_mg(value: float, unit: str | None) -> float | None:
    """Convert value to mg if unit is compatible. Returns None if incompatible."""
    if unit is None:
        return None
    factor = _TO_MG.get(unit.lower().strip())
    if factor is None:
        return None
    return value * factor


def compute_dose_ratio(
    product_amount: str | None,
    product_unit: str | None,
    effective_dose_low: float | None,
    dose_unit: str | None,
    dose_dependent: bool,
) -> float | None:
    """
    How much of the effective dose the product delivers, as a scalar [0, 1],
    or None when that cannot be known.

    • Not dose-dependent            → 1.0 (the amount doesn't change the effect)
    • No dose threshold in research → 1.0 (nothing to compare against)
    • Amount missing or unreadable  → None
    • Units that can't be compared  → None
    • Comparable amount             → min(amount / effective_dose_low, 1)

    Unknown stays unknown: a label with no amount is not assumed to deliver
    half the studied dose, and "500 IU" is not assumed to equal "500 mg".
    """
    if not dose_dependent:
        return 1.0

    if effective_dose_low is None or effective_dose_low <= 0:
        return 1.0

    if product_amount is None:
        return None

    text = str(product_amount).strip().replace(",", "")
    match = re.match(r"(\d+(?:\.\d+)?)\s*([a-zA-Zµ]+)?", text)
    if not match:
        return None
    parsed_amount = float(match.group(1))
    # "500 mg" is often stored whole in `amount` with no separate unit.
    unit = product_unit or match.group(2)

    prod_mg = _normalize_to_mg(parsed_amount, unit)
    dose_mg = _normalize_to_mg(effective_dose_low, dose_unit)
    if prod_mg is not None and dose_mg is not None and dose_mg > 0:
        return min(prod_mg / dose_mg, 1.0)

    # Not mass units (IU, CFU): comparable only when both sides use the same unit.
    if unit and dose_unit and unit.lower().strip() == dose_unit.lower().strip():
        return min(parsed_amount / effective_dose_low, 1.0)

    return None


# ─── Main scoring function ────────────────────────────────────────────────────

def score_product_biodomains(
    product_ingredients: list["ProductIngredient"],
) -> tuple[list[ProductDomainScore], int]:
    """
    Compute per-biodomain scores for a product and derive a health_score.

    Each ProductIngredient is expected to have its .ingredient relationship
    loaded, and that ingredient's .biodomain_scores loaded.

    Returns:
        (domain_scores, health_score)
        domain_scores: one entry per domain that has at least one scored ingredient
        health_score:  0–100 integer for the product overall
    """
    # Accumulate contributions per domain
    domain_buckets: dict[str, list[DomainContribution]] = {k: [] for k in BIODOMAIN_KEYS}

    for pi in product_ingredients:
        ingredient = getattr(pi, "ingredient", None)
        if ingredient is None:
            continue

        scores: list["IngredientBioDomainScore"] = getattr(
            ingredient, "biodomain_scores", []
        )

        for bs in scores:
            if bs.biodomain not in domain_buckets:
                continue  # Unknown domain — skip

            direction_sign: int
            if bs.direction == "benefit":
                direction_sign = 1
            elif bs.direction == "harm":
                direction_sign = -1
            else:
                direction_sign = 0  # neutral / mixed → no contribution

            dose_ratio = compute_dose_ratio(
                product_amount=pi.amount,
                product_unit=pi.unit,
                effective_dose_low=bs.effective_dose_low,
                dose_unit=bs.dose_unit,
                dose_dependent=bs.dose_dependent,
            )

            if dose_ratio is None:
                continue  # can't tell how much is in the product: no claim either way

            confidence_weight = CONFIDENCE_WEIGHTS.get(bs.confidence, 0.2)
            weighted = bs.magnitude * dose_ratio * confidence_weight * direction_sign

            domain_buckets[bs.biodomain].append(
                DomainContribution(
                    ingredient_name=(
                        ingredient.canonical_name
                        if hasattr(ingredient, "canonical_name")
                        else pi.name
                    ),
                    raw_magnitude=bs.magnitude,
                    dose_ratio=dose_ratio,
                    confidence_weight=confidence_weight,
                    direction_sign=direction_sign,
                    weighted_score=weighted,
                )
            )

    # Build per-domain scores
    domain_scores: list[ProductDomainScore] = []
    for key, contributions in domain_buckets.items():
        if not contributions:
            continue  # No ingredients affect this domain

        raw = sum(c.weighted_score for c in contributions)

        # Scale to 0–100. A single high-confidence, full-dose benefit ingredient
        # (magnitude 1.0, dose_ratio 1.0, confidence_weight 1.0) = raw score 1.0.
        # We map 1.0 → 80 (leaves headroom for multi-ingredient products).
        # Negative raw scores reflect harm domains.
        display = max(0.0, min(100.0, raw * 80))

        domain_def = BIODOMAIN_BY_KEY.get(key)
        domain_scores.append(
            ProductDomainScore(
                biodomain=key,
                name=domain_def.name if domain_def else key,
                raw_score=raw,
                display_value=round(display, 1),
                is_negative=(raw < 0),
                contributions=contributions,
            )
        )

    # Overall health_score: average of positive domain display values,
    # then penalize by the sum of negative domain contributions.
    positive_scores = [d.display_value for d in domain_scores if not d.is_negative]
    negative_scores = [abs(d.raw_score) * 80 for d in domain_scores if d.is_negative]

    if positive_scores:
        base = sum(positive_scores) / len(positive_scores)
    else:
        base = 0.0  # nothing positive is known: never a neutral-looking 50

    penalty = min(sum(negative_scores), base)  # Can't go below 0
    health_score = max(0, min(100, round(base - penalty)))

    return domain_scores, health_score


# ─── Tier-2 scoring: nutrient weight matrix ───────────────────────────────────

def score_nutrient_rows(
    nutrient_rows: list["MobileIngredient"],
) -> list[ProductDomainScore]:
    """
    Compute biodomain scores from a USDA nutrition panel using the static
    weight matrix in app/core/nutrient_biodomains.py.

    Input: list of MobileIngredient objects with .name and .is_nutrient attributes.
    Output: one ProductDomainScore per domain that has ≥1 nutrient mapping.

    When multiple nutrients affect the same domain, the highest-magnitude
    nutrient wins (no double-counting across nutrients sharing a domain).

    Note: confidence weights are intentionally not applied here. The weight matrix
    magnitudes already embed consensus-level certainty (they are not raw study
    outputs). Applying CONFIDENCE_WEIGHTS would double-penalise "low" confidence
    entries that were already assigned conservative magnitudes.
    """
    # domain_key → {benefit: max_magnitude, harm: max_magnitude}
    domain_best: dict[str, dict[str, float]] = {}

    for row in nutrient_rows:
        if not row.is_nutrient:
            continue
        if not row.name:
            continue
        for impact in get_nutrient_impacts(row.name):
            bucket = domain_best.setdefault(impact.biodomain, {"benefit": 0.0, "harm": 0.0})
            bucket[impact.direction] = max(bucket[impact.direction], impact.magnitude)

    if not domain_best:
        return []

    results: list[ProductDomainScore] = []
    for domain_key, magnitudes in domain_best.items():
        domain_def = BIODOMAIN_BY_KEY.get(domain_key)
        if domain_def is None:
            continue

        benefit = magnitudes["benefit"]
        harm = magnitudes["harm"]

        if benefit >= harm:
            raw = benefit - harm * 0.3
            is_negative = False
        else:
            raw = -(harm - benefit * 0.3)  # negative → matches Tier-1 harm convention
            is_negative = True

        display = max(0.0, min(100.0, raw * 80))  # harm shows as 0 bar, same as Tier-1

        results.append(ProductDomainScore(
            biodomain=domain_key,
            name=domain_def.name,
            raw_score=raw,
            display_value=round(display, 1),
            is_negative=is_negative,
        ))

    return results


def merge_domain_scores(
    tier1: list[ProductDomainScore],
    tier2: list[ProductDomainScore],
) -> list[ProductDomainScore]:
    """
    Merge Tier-1 (PubMed-backed) and Tier-2 (weight matrix) domain scores.

    Tier-1 takes precedence for any domain it already covers.
    Tier-2 supplements only the domains Tier-1 does not cover.
    """
    tier1_keys = {s.biodomain for s in tier1}
    tier2_supplement = [s for s in tier2 if s.biodomain not in tier1_keys]
    return tier1 + tier2_supplement
