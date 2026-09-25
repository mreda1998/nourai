"""Product API endpoints."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
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
from app.models.ingestion import IngredientAlias, IngestionJob
from app.models.product import ProductCategory
from app.core.config import settings
from app.db.session import async_session_factory
from app.schemas.ingestion import BarcodeIngestionResponse, IngestionJobResponse
from app.schemas.personalization import PersonalAnalysisResponse
from app.schemas.product import (
    NUTRIENT_DISPLAY_NAMES,
    ProductResponse,
    ProductSearchResponse,
    ProductWithDetails,
)
from app.services.personalization import PersonalizationService
from app.services.product import ProductService
from app.services.ingestion.normalization import normalize_gtin
from app.services.ingestion.queue import IngestionQueue

router = APIRouter()


async def _build_ingredient_lookup(db: AsyncSession) -> dict[str, str]:
    """Resolve only the fixed nutrient panel names, not the full ontology."""
    rows = await db.execute(
        select(IngredientAlias.normalized_alias, IngredientAlias.ingredient_id).where(
            IngredientAlias.approved.is_(True),
            IngredientAlias.normalized_alias.in_(NUTRIENT_DISPLAY_NAMES),
        )
    )
    candidates: dict[str, set[str]] = {}
    for alias, ingredient_id in rows:
        candidates.setdefault(alias, set()).add(str(ingredient_id))
    return {
        alias: next(iter(ingredient_ids))
        for alias, ingredient_ids in candidates.items()
        if len(ingredient_ids) == 1
    }


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


@router.get("/ingestion/{job_id}", response_model=IngestionJobResponse)
async def get_ingestion_status(job_id: UUID, db: DBSession):
    """Return a stable, mobile-safe view of a background ingestion job."""
    job = await db.get(IngestionJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Ingestion job not found")
    messages = {
        "queued": "Product is waiting to be verified",
        "running": "Product details are being verified",
        "retry": "The product source is temporarily unavailable; retrying",
        "complete": "Product is ready",
        "needs_review": "We could not verify this product automatically",
        "dead": "Product verification could not be completed",
    }
    result_message = (
        job.result.get("message")
        if isinstance(job.result, dict) and isinstance(job.result.get("message"), str)
        else None
    )
    response = IngestionJobResponse(
        job_id=job.id,
        status=job.status,
        product_id=job.product_id,
        poll_after_ms=1200 if job.status in {"queued", "running"} else 2500,
        message=result_message or messages.get(
            job.status, "Product verification is in progress"
        ),
    )
    return response


@router.get(
    "/barcode/{barcode}",
    response_model=ProductWithDetails | BarcodeIngestionResponse,
)
async def get_product_by_barcode(
    barcode: str,
    db: DBSession,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    current_user: OptionalUser = None,
):
    """Return a cached product or queue idempotent background verification."""
    try:
        normalized = normalize_gtin(barcode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    product = await service.get_local_product_by_barcode(
        normalized.digits, normalized.gtin14
    )
    if product:
        lookup = await _build_ingredient_lookup(db)
        return ProductWithDetails.from_orm_with_details(product, ingredient_lookup=lookup)

    queue = IngestionQueue(
        async_session_factory,
        lease_seconds=settings.ingestion_job_lease_seconds,
        default_max_attempts=settings.ingestion_job_max_attempts,
    )
    job = await queue.enqueue(
        db,
        job_type="product_barcode",
        idempotency_key=f"barcode:off-v3.6:{normalized.gtin14}",
        payload={"barcode": normalized.digits, "gtin14": normalized.gtin14},
        priority=50,
    )
    await db.commit()

    # A prior idempotent job may have completed between the initial read and
    # enqueue. Return its product immediately when possible.
    if job.status == "complete" and job.product_id:
        product = await service.get_product(job.product_id)
        if product:
            lookup = await _build_ingredient_lookup(db)
            return ProductWithDetails.from_orm_with_details(product, ingredient_lookup=lookup)

    existing_message = (
        job.result.get("message")
        if isinstance(job.result, dict) and isinstance(job.result.get("message"), str)
        else None
    )
    response = BarcodeIngestionResponse(
        job_id=job.id,
        status=job.status,
        gtin14=normalized.gtin14,
        product_id=job.product_id,
        message=existing_message or (
            "Product verification could not be completed"
            if job.status == "dead"
            else "We are verifying this product from trusted source data"
        ),
    )
    return JSONResponse(status_code=202, content=response.model_dump(mode="json"))
