"""Product API endpoints."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    CurrentUser,
    DBSession,
    OptionalUser,
    PaginationParams,
    get_pagination,
    get_personalization_service,
    get_product_service,
)
from app.models.ingredient import Ingredient
from app.models.product import ProductCategory
from app.schemas.personalization import PersonalAnalysisResponse
from app.schemas.product import ProductResponse, ProductSearchResponse, ProductWithDetails
from app.services.personalization import PersonalizationService
from app.services.product import ProductService

router = APIRouter()


async def _build_ingredient_lookup(db: AsyncSession) -> dict[str, str]:
    """Return {lowercased name/synonym: str(uuid)} for all canonical ingredients."""
    result = await db.execute(select(Ingredient))
    lookup: dict[str, str] = {}
    for ing in result.scalars().all():
        lookup[ing.canonical_name.lower().strip()] = str(ing.id)
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = str(ing.id)
    return lookup


@router.get("", response_model=ProductSearchResponse)
async def list_products(
    category: str | None = None,
    pagination: Annotated[PaginationParams, Depends(get_pagination)] = None,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
):
    """List all products with optional category filter."""
    category_enum = None
    if category:
        try:
            category_enum = ProductCategory(category.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    products, total = await service.list_products(
        category=category_enum,
        limit=pagination.limit,
        offset=pagination.offset,
    )

    return ProductSearchResponse(
        products=[ProductResponse.model_validate(p) for p in products],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/search", response_model=ProductSearchResponse)
async def search_products(
    q: str = Query(..., min_length=2),
    category: str | None = None,
    pagination: Annotated[PaginationParams, Depends(get_pagination)] = None,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
):
    """Search products by name or brand."""
    category_enum = None
    if category:
        try:
            category_enum = ProductCategory(category.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    products, total = await service.search_products(
        query=q,
        category=category_enum,
        limit=pagination.limit,
        offset=pagination.offset,
    )

    return ProductSearchResponse(
        products=[ProductResponse.model_validate(p) for p in products],
        total=total,
        limit=pagination.limit,
        offset=pagination.offset,
    )


@router.get("/{product_id}", response_model=ProductWithDetails)
async def get_product(
    product_id: UUID,
    db: DBSession,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    current_user: OptionalUser = None,
):
    """Get a product by ID with full details."""
    product = await service.get_product(product_id)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    lookup = await _build_ingredient_lookup(db)
    return ProductWithDetails.from_orm_with_details(product, ingredient_lookup=lookup)


@router.get("/{product_id}/personalize", response_model=PersonalAnalysisResponse)
async def personalize_product(
    product_id: UUID,
    concerns: str = Query(default="", description="Comma-separated concern IDs, e.g. fertility,thyroid"),
    goals: str = Query(default="", description="Comma-separated goal IDs, e.g. clear_skin,more_energy"),
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    personalization_service: Annotated[PersonalizationService, Depends(get_personalization_service)] = None,
    current_user: OptionalUser = None,
):
    """
    Return a personalization overlay for a product given the user's
    concern and goal tag IDs.

    Priority:
      1. Explicit query params (?concerns=…&goals=…) — always honoured if provided.
      2. Authenticated user's saved profile (health_concerns + health_goals from DB).
      3. Empty lists → service returns source="none".

    The endpoint supports both authenticated and unauthenticated access so the
    mobile client can call it at product-open time without any extra handshake.
    """
    product = await service.get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # 1. Parse explicit query params
    concern_list = [c.strip() for c in concerns.split(",") if c.strip()]
    goal_list = [g.strip() for g in goals.split(",") if g.strip()]

    # 2. If no explicit params but user is authenticated, fall back to their saved profile
    if not concern_list and not goal_list and current_user is not None:
        concern_list = list(current_user.health_concerns or [])
        goal_list = list(current_user.health_goals or [])

    ingredient_names = [pi.name for pi in (product.product_ingredients or [])]

    return await personalization_service.analyze(
        product_id=product_id,
        ingredient_names=ingredient_names,
        concern_tags=concern_list,
        goal_tags=goal_list,
    )


@router.get("/barcode/{barcode}", response_model=ProductWithDetails)
async def get_product_by_barcode(
    barcode: str,
    db: DBSession,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    current_user: CurrentUser = None,
):
    """
    Look up a product by barcode.
    Fetches from external API if not in database.
    """
    product = await service.get_product_by_barcode(barcode)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    lookup = await _build_ingredient_lookup(db)
    return ProductWithDetails.from_orm_with_details(product, ingredient_lookup=lookup)
