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

If the ingredient has no dose information, dose_ratio = 1.0 (assume full effect).
If the product does not list an amount, dose_ratio = 0.5 (conservative default).

Confidence multipliers (from biodomains.py) downweight low-quality evidence.

Aggregation strategy
--------------------
For each biodomain, we SUM the signed weighted contributions from all
ingredients. The sum is then scaled to a 0–100 integer health score.
Benefits add, harms subtract. The result is clamped to [0, 100].

This is intentionally simple — one linear equation, fully auditable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.core.biodomains import (
    BIODOMAIN_BY_KEY,
    BIODOMAIN_KEYS,
    CONFIDENCE_WEIGHTS,
)

if TYPE_CHECKING:
    from app.models.ingredient_biodomain_score import IngredientBioDomainScore
    from app.models.product import ProductIngredient


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
) -> float:
    """
    Return a scalar [0, 1] representing how much of the effective dose the
    product delivers.

    • Not dose-dependent            → 1.0 (full effect regardless of amount)
    • No dose info from research    → 1.0 (can't penalize what we don't know)
    • Amount present but no units   → 0.5 (conservative default)
    • Parseable amount ≥ effective  → 1.0
    • Parseable amount < effective  → amount / effective_dose_low
    """
    if not dose_dependent:
        return 1.0

    if effective_dose_low is None or effective_dose_low <= 0:
        return 1.0  # No dose threshold known — assume full effect

    if product_amount is None:
        return 0.5  # Amount unlisted — conservative halfway assumption

    # Try to parse the product amount as a float
    try:
        parsed_amount = float(str(product_amount).strip().split()[0])
    except (ValueError, IndexError):
        return 0.5

    # Try to normalize both to mg for comparison
    prod_mg = _normalize_to_mg(parsed_amount, product_unit)
    dose_mg = _normalize_to_mg(effective_dose_low, dose_unit)

    if prod_mg is not None and dose_mg is not None and dose_mg > 0:
        return min(prod_mg / dose_mg, 1.0)

    # Units are incompatible (e.g., IU vs mg) — fall back to dimensionless ratio
    # if units match exactly
    if product_unit and dose_unit and product_unit.lower() == dose_unit.lower():
        return min(parsed_amount / effective_dose_low, 1.0)

    # Can't compare — assume full effect
    return 1.0


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
        base = 50.0  # No data — neutral default

    penalty = min(sum(negative_scores), base)  # Can't go below 0
    health_score = max(0, min(100, round(base - penalty)))

    return domain_scores, health_score
