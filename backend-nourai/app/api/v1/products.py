"""Product API endpoints."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    AppVersion,
    CurrentUser,
    DeviceId,
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
from app.models.catalog import CatalogEntry
from app.repositories.catalog import CatalogRepository, CatalogSearchTimeout, catalog_query_ok
from app.schemas.ingestion import BarcodeIngestionResponse, CatalogPreview, IngestionJobResponse
from app.schemas.personalization import PersonalAnalysisResponse
from app.schemas.product import (
    NUTRIENT_DISPLAY_NAMES,
    ProductResponse,
    ProductSearchResponse,
    ProductSearchResultsResponse,
    ProductWithDetails,
    SearchResultItem,
)
from app.services.catalog.hydration import CatalogHydrator, HydrationResult
from app.services.catalog.ranking import Candidate, rank
from app.services.ingestion.product_pipeline import ProductIngestionPipeline
from app.services.personalization import PersonalizationService
from app.services.product import ProductService
from app.services.ingestion.normalization import normalize_gtin
from app.services.ingestion.queue import IngestionQueue
from app.services.insights import record_event
from app.services.regulation.product_rules import attach_rules

router = APIRouter()

# Search fetches this many candidates from each side before ranking and paging.
_SEARCH_WINDOW = 60


def get_catalog_repository() -> CatalogRepository:
    return CatalogRepository(async_session_factory)


def get_catalog_hydrator() -> CatalogHydrator:
    queue = IngestionQueue(
        async_session_factory,
        lease_seconds=settings.ingestion_job_lease_seconds,
        default_max_attempts=settings.ingestion_job_max_attempts,
    )
    return CatalogHydrator(queue, ProductIngestionPipeline(), async_session_factory)


def _preview(entry: CatalogEntry | None) -> CatalogPreview | None:
    if entry is None:
        return None
    return CatalogPreview(name=entry.name, brand=entry.brand, image_url=entry.image_url, category=entry.category)


def _pending_response(
    result: HydrationResult, gtin14: str, entry: CatalogEntry | None
) -> JSONResponse:
    """202 while a product loads (or once it's known to be missing), with what the index knows."""
    job = result.job
    status = "needs_review" if result.status == "not_found" else job.status
    existing_message = (
        job.result.get("message")
        if isinstance(getattr(job, "result", None), dict) and isinstance(job.result.get("message"), str)
        else None
    )
    response = BarcodeIngestionResponse(
        job_id=job.id,
        status=status,
        gtin14=gtin14,
        product_id=job.product_id,
        message=existing_message or (
            "Product verification could not be completed"
            if status in ("dead", "needs_review")
            else "We are verifying this product from trusted source data"
        ),
        preview=_preview(entry),
    )
    return JSONResponse(status_code=202, content=response.model_dump(mode="json"))


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


async def _details(db: AsyncSession, product, country: str | None) -> ProductWithDetails:
    """The full product response, with rule notes for the person's country."""
    lookup = await _build_ingredient_lookup(db)
    response = ProductWithDetails.from_orm_with_details(product, ingredient_lookup=lookup)
    return await attach_rules(db, product, response, country)


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


@router.get("/search", response_model=ProductSearchResultsResponse)
async def search_products(
    q: str = Query(..., min_length=2),
    category: str | None = None,
    country: str | None = Query(None, min_length=2, max_length=2),
    # Builds that predate catalog:<n> ids can't open them, so index hits are opt-in.
    include_catalog: bool = False,
    pagination: Annotated[PaginationParams, Depends(get_pagination)] = None,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    catalog: Annotated[CatalogRepository, Depends(get_catalog_repository)] = None,
):
    """Search curated products and the catalog index together, ranked as one list."""
    category_enum = None
    if category:
        try:
            category_enum = ProductCategory(category.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    products, _ = await service.search_products(query=q, category=category_enum, limit=_SEARCH_WINDOW, offset=0)
    entries: list[CatalogEntry] = []
    if include_catalog and catalog_query_ok(q):
        try:
            entries = await catalog.search(
                q, category=category_enum.value if category_enum else None, limit=_SEARCH_WINDOW
            )
        except CatalogSearchTimeout:
            entries = []

    linked = {entry.product_id: entry for entry in entries if entry.product_id}
    candidates = []
    for product in products:
        entry = linked.get(product.id)
        candidates.append(Candidate(
            key=f"p:{product.id}", name=product.name, brand=product.brand,
            popularity=entry.popularity if entry else 0,
            countries=tuple(entry.countries) if entry else (),
            hydrated=True, payload=product,
        ))
    for entry in entries:
        key = f"p:{entry.product_id}" if entry.product_id else f"c:{entry.id}"
        candidates.append(Candidate(
            key=key, name=entry.name, brand=entry.brand, popularity=entry.popularity,
            countries=tuple(entry.countries), hydrated=entry.product_id is not None, payload=entry,
        ))

    ranked = rank(q, candidates, country=country)
    page = ranked[pagination.offset: pagination.offset + pagination.limit]
    return ProductSearchResultsResponse(
        products=[_search_item(c.payload) for c in page],
        total=len(ranked),
        limit=pagination.limit,
        offset=pagination.offset,
    )


def _search_item(payload) -> SearchResultItem:
    if isinstance(payload, CatalogEntry):
        return SearchResultItem(
            id=str(payload.product_id) if payload.product_id else f"catalog:{payload.id}",
            name=payload.name,
            brand=payload.brand,
            category=payload.category,
            image_url=payload.image_url,
            grade=None,
            in_catalog_only=payload.product_id is None,
        )
    product = ProductResponse.model_validate(payload)
    return SearchResultItem(
        id=str(product.id),
        name=product.name,
        brand=product.brand,
        category=product.category.value,
        image_url=product.image_url,
        grade=product.grade,
    )


@router.get("/{product_id}", response_model=ProductWithDetails | BarcodeIngestionResponse)
async def get_product(
    product_id: str,
    db: DBSession,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    catalog: Annotated[CatalogRepository, Depends(get_catalog_repository)] = None,
    hydrator: Annotated[CatalogHydrator, Depends(get_catalog_hydrator)] = None,
    current_user: OptionalUser = None,
    country: str | None = Query(None, description="ISO country code; decides whose rules come first"),
):
    """A product by UUID, or `catalog:<n>` for an index entry — hydrated on first open."""
    if product_id.startswith("catalog:"):
        return await _open_catalog_entry(product_id, db, service, catalog, hydrator, country)
    try:
        uuid = UUID(product_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Product not found")
    product = await service.get_product(uuid)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return await _details(db, product, country)


async def _open_catalog_entry(product_id, db, service, catalog, hydrator, country=None):
    try:
        entry = await catalog.get(int(product_id.split(":", 1)[1]))
    except ValueError:
        entry = None
    if entry is None or not entry.gtin14:
        raise HTTPException(status_code=404, detail="Product not found")

    target = entry.product_id
    if target is None:
        digits = normalize_gtin(entry.external_id).digits if entry.external_id.isdigit() else entry.gtin14
        result = await hydrator.hydrate(db, digits=digits, gtin14=entry.gtin14)
        if result.status != "hydrated":
            return _pending_response(result, entry.gtin14, entry)
        target = result.product_id
        await catalog.link_product(entry.gtin14, target)

    product = await service.get_product(target)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return await _details(db, product, country)


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
    device_id: DeviceId,
    app_version: AppVersion,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    catalog: Annotated[CatalogRepository, Depends(get_catalog_repository)] = None,
    hydrator: Annotated[CatalogHydrator, Depends(get_catalog_hydrator)] = None,
    current_user: OptionalUser = None,
    country: str | None = Query(None, description="ISO country code; decides whose rules come first"),
):
    """A known product, or hydrate it inline; while it loads, 202 with a preview from the index."""
    async def record_scan(result: str, **fields) -> None:
        meta = {"result": result, **fields.pop("meta", {})}
        await record_event(
            device_id=device_id,
            event_type="scan",
            user_id=current_user.id if current_user else None,
            meta=meta,
            app_version=app_version,
            **fields,
        )

    try:
        normalized = normalize_gtin(barcode)
    except ValueError as exc:
        await record_scan("invalid", meta={"raw": barcode[:32]})
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    product = await service.get_local_product_by_barcode(
        normalized.digits, normalized.gtin14
    )
    if product:
        await record_scan("cached", barcode=normalized.gtin14, product_id=product.id)
        return await _details(db, product, country)

    result = await hydrator.hydrate(db, digits=normalized.digits, gtin14=normalized.gtin14)
    if result.status == "hydrated":
        product = await service.get_product(result.product_id)
        if product:
            await catalog.link_product(normalized.gtin14, product.id)
            await record_scan("hydrated", barcode=normalized.gtin14, product_id=product.id)
            return await _details(db, product, country)

    entry = await catalog.best_for_gtin(normalized.gtin14)
    await record_scan(
        "queued" if result.status == "queued" else "not_found",
        barcode=normalized.gtin14,
        meta={"job_id": str(result.job.id), "in_index": entry is not None},
    )
    return _pending_response(result, normalized.gtin14, entry)
