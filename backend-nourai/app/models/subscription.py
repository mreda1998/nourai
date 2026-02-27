"""Subscription models using SQLAlchemy 2.0."""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import UserProfile


class SubscriptionTier(str, Enum):
    """Subscription tier levels."""

    FREE = "free"
    PREMIUM = "premium"


class SubscriptionStatus(str, Enum):
    """Subscription status values."""

    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELED = "canceled"
    GRACE_PERIOD = "grace_period"


class Subscription(Base, UUIDMixin, TimestampMixin):
    """User subscription managed via RevenueCat."""

    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Subscription details
    tier: Mapped[SubscriptionTier] = mapped_column(
        String(20), nullable=False, default=SubscriptionTier.FREE
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        String(20), nullable=False, default=SubscriptionStatus.ACTIVE
    )

    # Store information
    store: Mapped[str | None] = mapped_column(String(20), nullable=True)  # app_store, play_store
    store_transaction_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    revenuecat_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Dates
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="subscription")

    __table_args__ = (
        Index("ix_subscriptions_user_id", "user_id"),
        Index("ix_subscriptions_status", "status"),
        Index("ix_subscriptions_expires_at", "expires_at"),
    )

    @property
    def is_premium(self) -> bool:
        """Check if subscription grants premium access."""
        return (
            self.tier == SubscriptionTier.PREMIUM
            and self.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD)
        )

    def __repr__(self) -> str:
        return f"<Subscription {self.tier} ({self.status}) for user {self.user_id}>"
