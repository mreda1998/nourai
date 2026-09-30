"""
Daily score and per-domain scores for a set of products.

Pure scoring over ProductIngredient rows, so the same logic serves a signed-in
user's server stack and a guest's on-device stack (sent as product IDs).
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.biodomains import BIODOMAIN_BY_KEY
from app.models.ingredient import Ingredient
from app.models.product import ProductIngredient
from app.schemas.user import (
    DailyScoreCategory,
    DailyScoreResponse,
    HealthDomainFactor,
    HealthDomainResponse,
)
from app.services.biodomain_scorer import score_product_biodomains

# Daily Longevity Score: maps the 10 canonical biodomains down to the 5
# categories shown on the Home screen.
DAILY_SCORE_CATEGORIES: list[tuple[str, str, list[str]]] = [
    ("nutrition_quality", "Nutrition Quality", ["energy_metabolism", "body_composition"]),
    ("inflammation_balance", "Inflammation Balance", ["inflammation_immune"]),
    ("metabolic_support", "Metabolic Support", ["energy_metabolism"]),
    ("hormonal_stress", "Hormonal & Stress", ["hormonal_endocrine", "sleep_recovery"]),
    ("gut_microbiome", "Gut & Microbiome", ["gut_digestive"]),
]


def score_qualifier(value: int) -> str:
    if value >= 80:
        return "High"
    if value >= 65:
        return "Good"
    if value >= 50:
        return "Moderate"
    return "Low"


def _factor_strength(confidence_weight: float) -> str:
    if confidence_weight >= 1.0:
        return "Strong"
    if confidence_weight >= 0.6:
        return "Moderate"
    return "Limited"


def _factor_direction(direction_sign: int) -> str:
    if direction_sign > 0:
        return "benefit"
    if direction_sign < 0:
        return "harm"
    return "neutral"


async def load_product_ingredients(
    db: AsyncSession, product_ids: list[UUID]
) -> list[ProductIngredient]:
    """Ingredient rows (with biodomain scores) for the given products."""
    unique_ids = list(dict.fromkeys(product_ids))
    if not unique_ids:
        return []
    result = await db.execute(
        select(ProductIngredient)
        .where(ProductIngredient.product_id.in_(unique_ids))
        .options(
            selectinload(ProductIngredient.ingredient).selectinload(Ingredient.biodomain_scores)
        )
    )
    return list(result.scalars().all())


def _empty_daily_score() -> DailyScoreResponse:
    return DailyScoreResponse(
        overall=0,
        qualifier=score_qualifier(0),
        categories=[
            DailyScoreCategory(key=key, label=label, value=0)
            for key, label, _ in DAILY_SCORE_CATEGORIES
        ],
    )


def daily_score(product_ingredients: list[ProductIngredient]) -> DailyScoreResponse:
    """
    Aggregate a stack's ingredients into the daily score and its 5 categories.

    Returns an all-zero response when nothing in the stack has researched
    biodomain data — the scorer's neutral fallback (50) would otherwise read as
    a real "Moderate" verdict for products we know nothing about.
    """
    if not product_ingredients:
        return _empty_daily_score()

    domain_scores, overall = score_product_biodomains(product_ingredients)
    if not domain_scores:
        return _empty_daily_score()
    domain_values = {d.biodomain: d.display_value for d in domain_scores}

    categories = []
    for key, label, domains in DAILY_SCORE_CATEGORIES:
        values = [domain_values[d] for d in domains if d in domain_values]
        value = round(sum(values) / len(values)) if values else 0
        categories.append(DailyScoreCategory(key=key, label=label, value=value))

    return DailyScoreResponse(
        overall=overall,
        qualifier=score_qualifier(overall),
        categories=categories,
    )


def health_domain(
    biodomain: str, product_ingredients: list[ProductIngredient]
) -> HealthDomainResponse | None:
    """Score + top contributing ingredients for one biodomain; None if the key is unknown."""
    domain_def = BIODOMAIN_BY_KEY.get(biodomain)
    if not domain_def:
        return None

    empty = HealthDomainResponse(
        biodomain=biodomain, label=domain_def.name, score=0,
        qualifier=score_qualifier(0), factors=[],
    )
    if not product_ingredients:
        return empty

    domain_scores, _ = score_product_biodomains(product_ingredients)
    match = next((d for d in domain_scores if d.biodomain == biodomain), None)
    if not match:
        return empty

    factors = [
        HealthDomainFactor(
            ingredient_name=c.ingredient_name,
            strength=_factor_strength(c.confidence_weight),
            direction=_factor_direction(c.direction_sign),
        )
        for c in sorted(match.contributions, key=lambda c: abs(c.weighted_score), reverse=True)[:6]
    ]

    score = round(match.display_value)
    return HealthDomainResponse(
        biodomain=biodomain, label=domain_def.name, score=score,
        qualifier=score_qualifier(score), factors=factors,
    )
