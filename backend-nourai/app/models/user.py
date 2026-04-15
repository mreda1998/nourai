"""User models using SQLAlchemy 2.0."""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.subscription import Subscription


class BiologicalSex(str, Enum):
    """Biological sex for health calculations."""

    MALE = "male"
    FEMALE = "female"
    OTHER = "other"


class TimeOfDay(str, Enum):
    """Time of day for logging supplements."""

    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"
    NIGHT = "night"


class UserProfile(Base, UUIDMixin, TimestampMixin):
    """User profile with health preferences and settings."""

    __tablename__ = "user_profiles"

    supabase_id: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Demographics for health calculations
    biological_sex: Mapped[BiologicalSex | None] = mapped_column(String(10), nullable=True)
    birth_year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Health profile - stored as JSON for flexibility
    allergies: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    conditions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    medications: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    dietary_preferences: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Goals and preferences
    health_goals: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    notification_preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Extended onboarding profile fields
    sleep_quality: Mapped[str | None] = mapped_column(String(20), nullable=True)
    activity_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dietary_pattern: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    environment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    product_categories: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Onboarding profile fields (collected during sign-up flow)
    age_range: Mapped[str | None] = mapped_column(String(20), nullable=True)
    focus_areas: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    health_concerns: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_pregnant: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_breastfeeding: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Onboarding state
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    onboarding_step: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Activity tracking
    last_active_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    stack_entries: Mapped[list["UserStackEntry"]] = relationship(
        "UserStackEntry",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="UserStackEntry.logged_at.desc()",
    )
    subscription: Mapped["Subscription | None"] = relationship(
        "Subscription",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<UserProfile {self.email or self.supabase_id}>"


class UserStackEntry(Base, UUIDMixin):
    """User's logged supplement/product entry."""

    __tablename__ = "user_stack_entries"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )

    # When and how
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    time_of_day: Mapped[TimeOfDay | None] = mapped_column(String(20), nullable=True)

    # Optional notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Dosage tracking
    quantity: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["UserProfile"] = relationship("UserProfile", back_populates="stack_entries")
    product: Mapped["Product"] = relationship("Product")

    __table_args__ = (
        Index("ix_user_stack_entries_user_id", "user_id"),
        Index("ix_user_stack_entries_logged_at", "logged_at"),
        Index("ix_user_stack_entries_user_logged", "user_id", "logged_at"),
    )

    def __repr__(self) -> str:
        return f"<UserStackEntry {self.id} for user {self.user_id}>"


class ScanHistoryEntry(Base, UUIDMixin):
    """A product scan/view logged for a user."""

    __tablename__ = "scan_history"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    scanned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    product: Mapped["Product"] = relationship("Product")

    __table_args__ = (
        Index("ix_scan_history_user_id", "user_id"),
        Index("ix_scan_history_scanned_at", "scanned_at"),
        Index("ix_scan_history_user_scanned", "user_id", "scanned_at"),
    )

    def __repr__(self) -> str:
        return f"<ScanHistoryEntry {self.id} for user {self.user_id}>"
