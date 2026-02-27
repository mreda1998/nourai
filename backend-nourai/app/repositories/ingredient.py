"""Ingredient repository using SQLAlchemy 2.0."""
from sqlalchemy import func, or_, select

from app.models.ingredient import Ingredient, IngredientCategory
from app.repositories.base import BaseRepository


class IngredientRepository(BaseRepository[Ingredient]):
    """Repository for Ingredient entity."""

    model = Ingredient

    async def get_by_canonical_name(self, name: str) -> Ingredient | None:
        """Find ingredient by canonical name (case-insensitive)."""
        result = await self.db.execute(
            select(Ingredient).where(func.lower(Ingredient.canonical_name) == name.lower())
        )
        return result.scalar_one_or_none()

    async def get_by_category(
        self,
        category: IngredientCategory,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Ingredient]:
        """Get ingredients by category."""
        result = await self.db.execute(
            select(Ingredient)
            .where(Ingredient.category == category)
            .order_by(Ingredient.canonical_name)
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def search(self, query: str, limit: int = 20) -> list[Ingredient]:
        """Search ingredients by name or synonyms."""
        search_pattern = f"%{query}%"
        result = await self.db.execute(
            select(Ingredient)
            .where(
                or_(
                    Ingredient.canonical_name.ilike(search_pattern),
                    # Search in synonyms JSONB array
                    Ingredient.synonyms.cast(str).ilike(search_pattern),
                )
            )
            .order_by(Ingredient.canonical_name)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def match_ingredient(self, name: str) -> Ingredient | None:
        """
        Attempt to match a raw ingredient name to canonical ingredient.
        Tries exact match first, then synonym lookup.
        """
        # Try exact match on canonical name
        ingredient = await self.get_by_canonical_name(name)
        if ingredient:
            return ingredient

        # Try searching synonyms (PostgreSQL JSONB contains)
        result = await self.db.execute(
            select(Ingredient).where(
                Ingredient.synonyms.contains([name.lower()])
            )
        )
        return result.scalar_one_or_none()
