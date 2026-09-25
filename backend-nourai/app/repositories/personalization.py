"""Personalization repository — evidence queries against GIN-indexed JSONB tags."""
import uuid

from sqlalchemy import String, case, cast, or_, select
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ingredient_evidence import IngredientEvidence
from app.models.ingredient import Ingredient


# Explicit strength ranks — the columns are strings, and sorting them
# alphabetically would put "moderate" above "high".
_CONFIDENCE_RANK = case(
    {"high": 0, "moderate": 1, "low": 2},
    value=IngredientEvidence.confidence,
    else_=3,
)
_EFFECT_RANK = case(
    {"strong": 0, "moderate": 1, "weak": 2},
    value=IngredientEvidence.effect_size,
    else_=3,
)


class PersonalizationRepository:
    """
    Reads IngredientEvidence rows filtered by the user's concern and goal tags.

    The query uses PostgreSQL's `?|` operator against the GIN-indexed
    `concern_tags` and `goal_tags` JSONB columns, so it only touches rows
    that are actually relevant to this user — no full-table scans.

    Example SQL generated:
        SELECT ie.*
        FROM ingredient_evidence ie
        WHERE ie.ingredient_id = ANY(:ids)
          AND (
            ie.concern_tags ?| ARRAY['fertility', 'thyroid']
            OR
            ie.goal_tags ?| ARRAY['clear_skin', 'more_energy']
          )
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_relevant_evidence(
        self,
        ingredient_ids: list[uuid.UUID],
        concern_tags: list[str],
        goal_tags: list[str],
    ) -> list[IngredientEvidence]:
        """
        Return evidence rows for the given ingredient IDs that overlap with
        at least one of the user's concern or goal tags.

        Returns an empty list when ingredient_ids is empty or when the user
        has no concerns or goals (nothing to match against).
        """
        if not ingredient_ids or (not concern_tags and not goal_tags):
            return []

        # Build the tag-overlap conditions using PostgreSQL's ?| operator.
        # ?| on a JSONB array returns true if any of the supplied strings
        # appear as elements in the array — and it hits the GIN index.
        tag_conditions = []

        if concern_tags:
            tag_conditions.append(
                IngredientEvidence.concern_tags.op("?|")(
                    cast(concern_tags, PG_ARRAY(String))
                )
            )

        if goal_tags:
            tag_conditions.append(
                IngredientEvidence.goal_tags.op("?|")(
                    cast(goal_tags, PG_ARRAY(String))
                )
            )

        stmt = (
            select(IngredientEvidence)
            .where(
                IngredientEvidence.ingredient_id.in_(ingredient_ids),
                or_(*tag_conditions),
            )
            # Eagerly load the parent ingredient so the service layer can
            # map ingredient.canonical_name → product ingredient display name.
            .options(selectinload(IngredientEvidence.ingredient))
            # Higher-confidence, stronger-effect studies first.
            .order_by(_CONFIDENCE_RANK, _EFFECT_RANK)
        )

        result = await self._db.execute(stmt)
        return list(result.scalars().all())

    async def get_ingredient_ids_for_product(
        self,
        product_id: uuid.UUID,
    ) -> list[tuple[uuid.UUID, str]]:
        """
        Return (ingredient_id, display_name) pairs for every product_ingredient
        row that has a linked Ingredient record.

        Ingredients without a canonical match (ingredient_id IS NULL) cannot
        be looked up in IngredientEvidence and are handled by the keyword
        fallback in PersonalizationService instead.
        """
        from app.models.product import ProductIngredient

        stmt = (
            select(ProductIngredient.ingredient_id, ProductIngredient.name)
            .where(
                ProductIngredient.product_id == product_id,
                ProductIngredient.ingredient_id.isnot(None),
            )
        )
        result = await self._db.execute(stmt)
        return [(row.ingredient_id, row.name) for row in result.all()]
