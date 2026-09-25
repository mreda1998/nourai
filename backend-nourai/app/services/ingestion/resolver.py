"""Conservative ingredient resolution against explicitly approved aliases."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient
from app.models.ingestion import IngredientAlias
from app.services.ingestion.normalization import normalize_ingredient_alias


@dataclass(frozen=True, slots=True)
class IngredientResolution:
    ingredient: Ingredient | None
    method: str | None
    confidence: float | None


async def resolve_ingredients(
    session: AsyncSession, names: list[str]
) -> dict[str, IngredientResolution]:
    """Resolve exact approved aliases; ambiguous aliases remain unresolved."""
    normalized_names = {normalize_ingredient_alias(name) for name in names}
    normalized_names.discard("")
    if not normalized_names:
        return {}

    rows = await session.execute(
        select(IngredientAlias.normalized_alias, IngredientAlias.confidence, Ingredient)
        .join(Ingredient, Ingredient.id == IngredientAlias.ingredient_id)
        .where(
            IngredientAlias.approved.is_(True),
            IngredientAlias.normalized_alias.in_(normalized_names),
        )
    )
    grouped: dict[str, dict[uuid.UUID, tuple[float, Ingredient]]] = {}
    for alias, confidence, ingredient in rows.all():
        grouped.setdefault(alias, {})[ingredient.id] = (confidence, ingredient)

    resolved: dict[str, IngredientResolution] = {}
    for name in normalized_names:
        candidates = grouped.get(name, {})
        if len(candidates) == 1:
            confidence, ingredient = next(iter(candidates.values()))
            resolved[name] = IngredientResolution(
                ingredient=ingredient,
                method="approved_alias",
                confidence=confidence,
            )
        else:
            resolved[name] = IngredientResolution(None, None, None)
    return resolved

