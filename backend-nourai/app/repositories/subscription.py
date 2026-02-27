"""Subscription repository using SQLAlchemy 2.0."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import select

from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier
from app.repositories.base import BaseRepository


class SubscriptionRepository(BaseRepository[Subscription]):
    """Repository for Subscription entity."""

    model = Subscription

    async def get_by_user_id(self, user_id: UUID) -> Subscription | None:
        """Get subscription by user ID."""
        result = await self.db.execute(
            select(Subscription).where(Subscription.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        user_id: UUID,
        tier: SubscriptionTier,
        status: SubscriptionStatus,
        store: str | None = None,
        store_transaction_id: str | None = None,
        revenuecat_id: str | None = None,
        expires_at: datetime | None = None,
        started_at: datetime | None = None,
    ) -> Subscription:
        """Create or update a subscription."""
        subscription = await self.get_by_user_id(user_id)

        if subscription:
            subscription.tier = tier
            subscription.status = status
            subscription.store = store
            subscription.store_transaction_id = store_transaction_id
            subscription.revenuecat_id = revenuecat_id
            subscription.expires_at = expires_at
            if started_at:
                subscription.started_at = started_at
        else:
            subscription = Subscription(
                user_id=user_id,
                tier=tier,
                status=status,
                store=store,
                store_transaction_id=store_transaction_id,
                revenuecat_id=revenuecat_id,
                expires_at=expires_at,
                started_at=started_at or datetime.utcnow(),
            )
            self.db.add(subscription)

        await self.db.commit()
        await self.db.refresh(subscription)
        return subscription

    async def activate_premium(
        self,
        user_id: UUID,
        store: str,
        store_transaction_id: str | None,
        expires_at: datetime | None,
    ) -> Subscription:
        """Activate premium subscription for a user."""
        return await self.upsert(
            user_id=user_id,
            tier=SubscriptionTier.PREMIUM,
            status=SubscriptionStatus.ACTIVE,
            store=store,
            store_transaction_id=store_transaction_id,
            expires_at=expires_at,
            started_at=datetime.utcnow(),
        )

    async def cancel(self, user_id: UUID) -> Subscription | None:
        """Mark subscription as canceled."""
        subscription = await self.get_by_user_id(user_id)
        if not subscription:
            return None

        subscription.status = SubscriptionStatus.CANCELED
        subscription.canceled_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(subscription)
        return subscription

    async def expire(self, user_id: UUID) -> Subscription | None:
        """Mark subscription as expired."""
        subscription = await self.get_by_user_id(user_id)
        if not subscription:
            return None

        subscription.status = SubscriptionStatus.EXPIRED
        await self.db.commit()
        await self.db.refresh(subscription)
        return subscription

    async def is_premium(self, user_id: UUID) -> bool:
        """Check if user has active premium subscription."""
        subscription = await self.get_by_user_id(user_id)
        return subscription.is_premium if subscription else False
