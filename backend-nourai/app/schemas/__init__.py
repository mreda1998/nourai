"""Pydantic schemas for request/response validation."""

from app.schemas.product import (
    ProductResponse,
    ProductWithDetails,
    ProductSearchResponse,
    ProductIngredientResponse,
)
from app.schemas.ingredient import IngredientResponse, IngredientDetailResponse
from app.schemas.claim import ClaimResponse, ClaimSourceResponse
from app.schemas.user import (
    UserProfileResponse,
    UserProfileUpdate,
    StackEntryCreate,
    StackEntryResponse,
)
from app.schemas.subscription import (
    SubscriptionResponse,
    RevenueCatWebhookPayload,
)

__all__ = [
    # Product
    "ProductResponse",
    "ProductWithDetails",
    "ProductSearchResponse",
    "ProductIngredientResponse",
    # Ingredient
    "IngredientResponse",
    "IngredientDetailResponse",
    # Claim
    "ClaimResponse",
    "ClaimSourceResponse",
    # User
    "UserProfileResponse",
    "UserProfileUpdate",
    "StackEntryCreate",
    "StackEntryResponse",
    # Subscription
    "SubscriptionResponse",
    "RevenueCatWebhookPayload",
]
