"""Subscription Pydantic schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.subscription import SubscriptionStatus, SubscriptionTier


class SubscriptionResponse(BaseModel):
    """Subscription status response."""

    model_config = ConfigDict(from_attributes=True)

    tier: SubscriptionTier
    status: SubscriptionStatus
    is_premium: bool
    expires_at: datetime | None = None


class RevenueCatSubscriberInfo(BaseModel):
    """RevenueCat subscriber info from webhook."""

    original_app_user_id: str
    aliases: list[str] = []


class RevenueCatEventData(BaseModel):
    """RevenueCat webhook event data."""

    app_user_id: str
    product_id: str | None = None
    entitlement_id: str | None = None
    entitlement_ids: list[str] | None = None
    store: str | None = None
    store_transaction_id: str | None = None
    expiration_at_ms: int | None = None
    purchased_at_ms: int | None = None
    is_family_share: bool = False
    environment: str | None = None


class RevenueCatWebhookPayload(BaseModel):
    """RevenueCat webhook payload."""

    api_version: str
    event: dict  # Contains type, id, app_id, etc.

    @property
    def event_type(self) -> str:
        """Get the event type."""
        return self.event.get("type", "")

    @property
    def app_user_id(self) -> str | None:
        """Get the app user ID from the event."""
        return self.event.get("app_user_id")

    @property
    def subscriber_info(self) -> dict | None:
        """Get subscriber info from the event."""
        return self.event.get("subscriber_info")

    @property
    def product_id(self) -> str | None:
        """Get the product ID."""
        return self.event.get("product_id")

    @property
    def store(self) -> str | None:
        """Get the store (app_store, play_store, etc.)."""
        return self.event.get("store")

    @property
    def expiration_at_ms(self) -> int | None:
        """Get expiration timestamp in milliseconds."""
        return self.event.get("expiration_at_ms")

    @property
    def store_transaction_id(self) -> str | None:
        """Get the store transaction ID."""
        return self.event.get("store_transaction_id")
