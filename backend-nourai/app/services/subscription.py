"""Subscription service for managing user subscriptions via RevenueCat."""
from datetime import datetime
from uuid import UUID

from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from app.repositories.subscription import SubscriptionRepository
from app.repositories.user import UserRepository
from app.schemas.subscription import RevenueCatWebhookPayload


class SubscriptionService:
    """Service for subscription-related business logic."""

    def __init__(
        self,
        subscription_repository: SubscriptionRepository,
        user_repository: UserRepository,
    ):
        self._sub_repo = subscription_repository
        self._user_repo = user_repository

    async def get_subscription(self, user_id: UUID) -> Subscription | None:
        """Get user's subscription."""
        return await self._sub_repo.get_by_user_id(user_id)

    async def is_premium(self, user_id: UUID) -> bool:
        """Check if user has active premium subscription."""
        return await self._sub_repo.is_premium(user_id)

    async def activate_subscription(
        self,
        user_id: UUID,
        store: str,
        store_transaction_id: str | None = None,
        expires_at: datetime | None = None,
    ) -> Subscription:
        """Activate premium subscription for a user."""
        return await self._sub_repo.activate_premium(
            user_id=user_id,
            store=store,
            store_transaction_id=store_transaction_id,
            expires_at=expires_at,
        )

    async def expire_subscription(self, user_id: UUID) -> Subscription | None:
        """Mark subscription as expired."""
        return await self._sub_repo.expire(user_id)

    async def cancel_subscription(self, user_id: UUID) -> Subscription | None:
        """Mark subscription as canceled."""
        return await self._sub_repo.cancel(user_id)

    async def handle_webhook_event(self, payload: RevenueCatWebhookPayload) -> bool:
        """
        Handle RevenueCat webhook event.
        Returns True if event was processed successfully.
        """
        event_type = payload.event_type
        app_user_id = payload.app_user_id

        if not app_user_id:
            return False

        # Find user by Supabase ID (app_user_id from RevenueCat should match)
        user = await self._user_repo.get_by_supabase_id(app_user_id)
        if not user:
            # User doesn't exist in our system yet - they need to sign up first
            return False

        # Process event based on type
        if event_type == "INITIAL_PURCHASE":
            await self._handle_initial_purchase(user.id, payload)
        elif event_type == "RENEWAL":
            await self._handle_renewal(user.id, payload)
        elif event_type == "CANCELLATION":
            await self._handle_cancellation(user.id)
        elif event_type == "EXPIRATION":
            await self._handle_expiration(user.id)
        elif event_type == "BILLING_ISSUE":
            await self._handle_billing_issue(user.id)
        else:
            # Unknown event type - log but don't fail
            return True

        return True

    async def _handle_initial_purchase(
        self,
        user_id: UUID,
        payload: RevenueCatWebhookPayload,
    ) -> None:
        """Handle initial subscription purchase."""
        expires_at = None
        if payload.expiration_at_ms:
            expires_at = datetime.fromtimestamp(payload.expiration_at_ms / 1000)

        await self._sub_repo.upsert(
            user_id=user_id,
            tier=SubscriptionTier.PREMIUM,
            status=SubscriptionStatus.ACTIVE,
            store=payload.store,
            store_transaction_id=payload.store_transaction_id,
            expires_at=expires_at,
            started_at=datetime.utcnow(),
        )

    async def _handle_renewal(
        self,
        user_id: UUID,
        payload: RevenueCatWebhookPayload,
    ) -> None:
        """Handle subscription renewal."""
        expires_at = None
        if payload.expiration_at_ms:
            expires_at = datetime.fromtimestamp(payload.expiration_at_ms / 1000)

        subscription = await self._sub_repo.get_by_user_id(user_id)
        if subscription:
            await self._sub_repo.upsert(
                user_id=user_id,
                tier=SubscriptionTier.PREMIUM,
                status=SubscriptionStatus.ACTIVE,
                store=payload.store,
                store_transaction_id=payload.store_transaction_id,
                expires_at=expires_at,
            )

    async def _handle_cancellation(self, user_id: UUID) -> None:
        """Handle subscription cancellation."""
        await self._sub_repo.cancel(user_id)

    async def _handle_expiration(self, user_id: UUID) -> None:
        """Handle subscription expiration."""
        await self._sub_repo.expire(user_id)

    async def _handle_billing_issue(self, user_id: UUID) -> None:
        """Handle billing issue - put subscription in grace period."""
        subscription = await self._sub_repo.get_by_user_id(user_id)
        if subscription:
            await self._sub_repo.upsert(
                user_id=user_id,
                tier=subscription.tier,
                status=SubscriptionStatus.GRACE_PERIOD,
                store=subscription.store,
                store_transaction_id=subscription.store_transaction_id,
                expires_at=subscription.expires_at,
            )
