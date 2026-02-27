"""Claim models using SQLAlchemy 2.0."""
import uuid
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.product import Product


class EvidenceStrength(str, Enum):
    """Evidence level for health claims."""

    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"
    INSUFFICIENT = "insufficient"


class Claim(Base, UUIDMixin, TimestampMixin):
    """Health claim associated with a product."""

    __tablename__ = "claims"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_claim: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_strength: Mapped[EvidenceStrength] = mapped_column(
        String(20), nullable=False, default=EvidenceStrength.INSUFFICIENT
    )
    mechanism_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # UI customization
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    accent: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Categorization
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Relationships
    product: Mapped["Product"] = relationship("Product", back_populates="claims")
    sources: Mapped[list["ClaimSource"]] = relationship(
        "ClaimSource",
        back_populates="claim",
        cascade="all, delete-orphan",
    )

    __table_args__ = (Index("ix_claims_product_id", "product_id"),)

    def __repr__(self) -> str:
        return f"<Claim {self.title} ({self.evidence_strength})>"


class ClaimSource(Base, UUIDMixin):
    """Scientific source backing a health claim."""

    __tablename__ = "claim_sources"

    claim_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("claims.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    study_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Scientific identifiers
    pmid: Mapped[str | None] = mapped_column(String(20), nullable=True)
    doi: Mapped[str | None] = mapped_column(String(100), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    claim: Mapped["Claim"] = relationship("Claim", back_populates="sources")

    __table_args__ = (Index("ix_claim_sources_claim_id", "claim_id"),)

    def __repr__(self) -> str:
        return f"<ClaimSource {self.label}>"
