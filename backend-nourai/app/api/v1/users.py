"""User API endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DBSession, get_subscription_service
from app.schemas.user import UserProfileResponse, UserProfileUpdate
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
