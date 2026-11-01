"""User API endpoints."""
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DBSession, get_subscription_service
from app.models.user import ScanHistoryEntry, SearchHistoryEntry, UserStackEntry
from app.models.product import Product
from app.schemas.product import grade_from_score
from app.schemas.user import (
    UserProfileResponse,
    UserProfileUpdate,
    ScanHistoryItemResponse,
    ScanHistoryResponse,
    SearchHistoryItemResponse,
    SearchHistoryResponse,
    SearchHistoryCreate,
    DailyScoreResponse,
    HealthDomainResponse,
)
from app.services.stack_score import daily_score, health_domain, load_product_ingredients
from app.schemas.subscription import SubscriptionResponse
from app.services.subscription import SubscriptionService, SubscriptionUnavailable

router = APIRouter()

def _today_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    current_user: CurrentUser,
):
    """Get the current user's profile."""
    return UserProfileResponse.model_validate(current_user)


@router.put("/me", response_model=UserProfileResponse)
async def update_user_profile(
    profile_update: UserProfileUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    """Update the current user's profile."""
    update_data = profile_update.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)

    return UserProfileResponse.model_validate(current_user)


@router.post("/me/onboarding")
async def complete_onboarding(
    db: DBSession,
    current_user: CurrentUser,
):
    """Mark onboarding as complete."""
    current_user.onboarding_completed = True
    await db.commit()

    return {"completed": True}


@router.get("/me/history", response_model=ScanHistoryResponse)
async def get_scan_history(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get the current user's scan history, newest first."""
    count_result = await db.execute(
        select(func.count()).where(ScanHistoryEntry.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(ScanHistoryEntry)
        .where(ScanHistoryEntry.user_id == current_user.id)
        .options(selectinload(ScanHistoryEntry.product))
        .order_by(ScanHistoryEntry.scanned_at.desc())
        .limit(limit)
        .offset(offset)
    )
    entries = list(result.scalars().all())

    items = [
        ScanHistoryItemResponse(
            id=e.id,
            product_id=e.product_id,
            product_name=e.product.name,
            product_brand=e.product.brand,
            product_grade=grade_from_score(e.product.health_score),
            product_category=e.product.category or "supplement",
            product_image_url=e.product.image_url,
            scanned_at=e.scanned_at,
        )
        for e in entries
    ]

    return ScanHistoryResponse(items=items, total=total)


@router.post("/me/history", response_model=ScanHistoryItemResponse, status_code=201)
async def add_to_scan_history(
    body: dict,
    db: DBSession,
    current_user: CurrentUser,
):
    """Record a product scan/view in history."""
    product_id_raw = body.get("product_id")
    if not product_id_raw:
        raise HTTPException(status_code=422, detail="product_id is required")

    try:
        product_id = UUID(str(product_id_raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid product_id")

    # Verify product exists
    product_result = await db.execute(select(Product).where(Product.id == product_id))
    product = product_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    entry = ScanHistoryEntry(user_id=current_user.id, product_id=product_id)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    return ScanHistoryItemResponse(
        id=entry.id,
        product_id=entry.product_id,
        product_name=product.name,
        product_brand=product.brand,
        product_grade=grade_from_score(product.health_score),
        product_category=product.category or "supplement",
        product_image_url=product.image_url,
        scanned_at=entry.scanned_at,
    )


@router.get("/me/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: CurrentUser,
    service: Annotated[SubscriptionService, Depends(get_subscription_service)],
):
    """Get the current user's subscription status."""
    subscription = await service.get_subscription(current_user.id)

    if not subscription:
        # Return free tier status if no subscription exists
        from app.models.subscription import SubscriptionStatus, SubscriptionTier

        return SubscriptionResponse(
            tier=SubscriptionTier.FREE,
            status=SubscriptionStatus.ACTIVE,
            is_premium=False,
            expires_at=None,
        )

    return SubscriptionResponse(
        tier=subscription.tier,
        status=subscription.status,
        is_premium=subscription.is_premium,
        expires_at=subscription.expires_at,
    )


@router.post("/me/subscription/verify", response_model=SubscriptionResponse)
async def verify_subscription(
    current_user: CurrentUser,
    service: Annotated[SubscriptionService, Depends(get_subscription_service)],
):
    """Verify only the authenticated user's entitlement; never accept client grants."""
    try:
        subscription = await service.reconcile(current_user.id, current_user.supabase_id)
    except SubscriptionUnavailable:
        raise HTTPException(status_code=503, detail="Subscription verification unavailable")
    return SubscriptionResponse(
        tier=subscription.tier, status=subscription.status,
        is_premium=subscription.is_premium, expires_at=subscription.expires_at,
    )


async def _todays_product_ids(db, user_id) -> list[UUID]:
    result = await db.execute(
        select(UserStackEntry.product_id).where(
            UserStackEntry.user_id == user_id,
            UserStackEntry.logged_at >= _today_start(),
        )
    )
    return list(result.scalars().all())


@router.get("/me/daily-score", response_model=DailyScoreResponse)
async def get_daily_score(
    db: DBSession,
    current_user: CurrentUser,
):
    """Aggregate today's stack into the Daily Longevity Score and its 5 sub-scores."""
    product_ids = await _todays_product_ids(db, current_user.id)
    return daily_score(await load_product_ingredients(db, product_ids))


@router.get("/me/health-domain/{biodomain}", response_model=HealthDomainResponse)
async def get_health_domain(
    biodomain: str,
    db: DBSession,
    current_user: CurrentUser,
):
    """Score + top contributing ingredients for a single biodomain, from today's stack."""
    product_ids = await _todays_product_ids(db, current_user.id)
    result = health_domain(biodomain, await load_product_ingredients(db, product_ids))
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown biodomain")
    return result


@router.get("/me/search-history", response_model=SearchHistoryResponse)
async def get_search_history(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get the current user's search history, newest first."""
    count_result = await db.execute(
        select(func.count()).where(SearchHistoryEntry.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(SearchHistoryEntry)
        .where(SearchHistoryEntry.user_id == current_user.id)
        .order_by(SearchHistoryEntry.searched_at.desc())
        .limit(limit)
        .offset(offset)
    )
    entries = list(result.scalars().all())

    return SearchHistoryResponse(
        items=[SearchHistoryItemResponse.model_validate(e) for e in entries],
        total=total,
    )


@router.post("/me/search-history", response_model=SearchHistoryItemResponse, status_code=201)
async def add_to_search_history(
    body: SearchHistoryCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    """Record a search in history."""
    entry = SearchHistoryEntry(
        user_id=current_user.id,
        query=body.query,
        result_type=body.result_type,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    return SearchHistoryItemResponse.model_validate(entry)
