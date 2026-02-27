"""Product API endpoints."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import (
    CurrentUser,
    OptionalUser,
    PaginationParams,
    get_pagination,
    get_personalization_service,
    get_product_service,
)
from app.models.product import ProductCategory
from app.schemas.personalization import PersonalAnalysisResponse
from app.schemas.product import ProductResponse, ProductSearchResponse, ProductWithDetails
from app.services.personalization import PersonalizationService
from app.services.product import ProductService

router = APIRouter()


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
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    current_user: OptionalUser = None,
):
    """Get a product by ID with full details."""
    product = await service.get_product(product_id)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return ProductWithDetails.from_orm_with_details(product)


@router.get("/{product_id}/personalize", response_model=PersonalAnalysisResponse)
async def personalize_product(
    product_id: UUID,
    concerns: str = Query(default="", description="Comma-separated concern IDs, e.g. fertility,thyroid"),
    goals: str = Query(default="", description="Comma-separated goal IDs, e.g. clear_skin,more_energy"),
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    personalization_service: Annotated[PersonalizationService, Depends(get_personalization_service)] = None,
):
    """
    Return a personalization overlay for a product given the user's
    concern and goal tag IDs.

    The response mirrors the TypeScript PersonalAnalysis shape so the
    mobile client can drop it in without transformation.

    Query params:
      concerns — comma-separated list of concern IDs
                 (fertility | thyroid | hormonal_condition | medications | infant_proximity)
      goals    — comma-separated list of goal IDs
                 (clear_skin | anti_aging | brighter_skin | hair_growth |
                  prevent_hair_loss | build_muscle | fat_loss | more_energy |
                  gut_health | less_inflammation | mental_focus)

    The endpoint is unauthenticated so it works before full Supabase auth
    is wired up on the client. When real auth lands, swap to fetching
    concern/goal IDs from the user's server-side profile.
    """
    product = await service.get_product(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    concern_list = [c.strip() for c in concerns.split(",") if c.strip()]
    goal_list = [g.strip() for g in goals.split(",") if g.strip()]

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

    return ProductWithDetails.from_orm_with_details(product)
