"""User API endpoints."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DBSession, get_subscription_service
from app.models.user import ScanHistoryEntry
from app.models.product import Product
from app.schemas.user import (
    UserProfileResponse,
    UserProfileUpdate,
    ScanHistoryItemResponse,
    ScanHistoryResponse,
)
from app.schemas.subscription import SubscriptionResponse
from app.services.subscription import SubscriptionService

router = APIRouter()


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

    def _grade(health_score: int | None) -> str:
        if health_score is None:
            return "C"
        if health_score >= 80:
            return "A"
        if health_score >= 60:
            return "B"
        if health_score >= 40:
            return "C"
        return "D"

    items = [
        ScanHistoryItemResponse(
            id=e.id,
            product_id=e.product_id,
            product_name=e.product.name,
            product_brand=e.product.brand,
            product_grade=_grade(e.product.health_score),
            product_category=e.product.category.value if e.product.category else "supplement",
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

    def _grade(health_score: int | None) -> str:
        if health_score is None:
            return "C"
        if health_score >= 80:
            return "A"
        if health_score >= 60:
            return "B"
        if health_score >= 40:
            return "C"
        return "D"

    return ScanHistoryItemResponse(
        id=entry.id,
        product_id=entry.product_id,
        product_name=product.name,
        product_brand=product.brand,
        product_grade=_grade(product.health_score),
        product_category=product.category.value if product.category else "supplement",
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
