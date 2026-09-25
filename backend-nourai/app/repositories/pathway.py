"""Reads for pathway maps: published routes, mechanism assets, product evidence."""
from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.ingestion import IngredientExternalIdentifier
from app.models.ingredient import Ingredient
from app.models.pathway import (
    BioEntity,
    IngredientMechanismAsset,
    MechanismFact,
    PathwayRoute,
    RouteLink,
    RouteStatus,
)
from app.models.product import ProductIngredient

_ROUTE_LOAD = (
    selectinload(PathwayRoute.nodes),
    selectinload(PathwayRoute.links).selectinload(RouteLink.claims),
)


class PathwayRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def ingredient(self, ingredient_id: uuid.UUID) -> Ingredient | None:
        return await self.db.get(Ingredient, ingredient_id)

    async def compound_for(self, ingredient: Ingredient) -> Ingredient:
        """The active compound whose routes and mechanism this ingredient uses."""
        if ingredient.active_moiety_id:
            moiety = await self.db.get(Ingredient, ingredient.active_moiety_id)
            if moiety is not None:
                return moiety
        return ingredient

    async def published_routes(self, ingredient_ids: list[uuid.UUID]) -> list[PathwayRoute]:
        if not ingredient_ids:
            return []
        result = await self.db.execute(
            select(PathwayRoute)
            .where(PathwayRoute.ingredient_id.in_(ingredient_ids), PathwayRoute.status == RouteStatus.PUBLISHED.value)
            .options(*_ROUTE_LOAD)
            .order_by(PathwayRoute.slug)
        )
        return list(result.scalars().all())

    async def route_by_slug(self, slug: str) -> PathwayRoute | None:
        result = await self.db.execute(
            select(PathwayRoute)
            .where(PathwayRoute.slug == slug, PathwayRoute.status == RouteStatus.PUBLISHED.value)
            .options(*_ROUTE_LOAD)
        )
        return result.scalar_one_or_none()

    async def assets(self, ingredient_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[IngredientMechanismAsset]]:
        out: dict[uuid.UUID, list[IngredientMechanismAsset]] = {i: [] for i in ingredient_ids}
        if not ingredient_ids:
            return out
        result = await self.db.execute(
            select(IngredientMechanismAsset).where(IngredientMechanismAsset.ingredient_id.in_(ingredient_ids))
        )
        for asset in result.scalars().all():
            out[asset.ingredient_id].append(asset)
        return out

    async def facts_count(self, ingredient_id: uuid.UUID) -> int:
        chebi_ids = select(IngredientExternalIdentifier.value).where(
            IngredientExternalIdentifier.ingredient_id == ingredient_id,
            IngredientExternalIdentifier.scheme == "chebi",
        )
        subjects = select(BioEntity.id).where(BioEntity.chebi_id.in_(chebi_ids))
        return (await self.db.execute(
            select(func.count()).select_from(MechanismFact).where(MechanismFact.subject_id.in_(subjects))
        )).scalar_one()

    async def product_ingredients(self, product_id: uuid.UUID) -> list[ProductIngredient]:
        result = await self.db.execute(
            select(ProductIngredient)
            .where(ProductIngredient.product_id == product_id, ProductIngredient.ingredient_id.is_not(None))
            .options(selectinload(ProductIngredient.ingredient))
            .order_by(ProductIngredient.order_position)
        )
        return list(result.scalars().all())
