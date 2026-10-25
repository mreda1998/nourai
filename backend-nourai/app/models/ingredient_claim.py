"""What people believe an ingredient does, and what the studies that test it conclude."""
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ingredient import Ingredient
    from app.models.ingredient_evidence import IngredientEvidence


class IngredientClaim(Base, UUIDMixin, TimestampMixin):
    """One consumer claim (benefit or safety) about an ingredient, with its verdict."""

    __tablename__ = "ingredient_claims"

    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # benefit / safety
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    why_people_believe: Mapped[str | None] = mapped_column(Text, nullable=True)
    search_terms: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Verdict — null until the studies have been judged
    verdict: Mapped[str | None] = mapped_column(String(20), nullable=True)
    certainty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    certainty_reasons: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    reality: Mapped[str | None] = mapped_column(Text, nullable=True)
    effect_size: Mapped[str | None] = mapped_column(Text, nullable=True)
    applies_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    avoid_if: Mapped[str | None] = mapped_column(Text, nullable=True)
    dose_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_pmids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    study_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    ingredient: Mapped["Ingredient"] = relationship("Ingredient", back_populates="claims")
    evidence_links: Mapped[list["IngredientClaimEvidence"]] = relationship(
        "IngredientClaimEvidence", back_populates="claim", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("ix_ingredient_claims_ingredient_id", "ingredient_id"),)


class IngredientClaimEvidence(Base):
    """A study that informs a claim, and which way it points."""

    __tablename__ = "ingredient_claim_evidence"

    claim_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredient_claims.id", ondelete="CASCADE"), primary_key=True
    )
    evidence_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredient_evidence.id", ondelete="CASCADE"), primary_key=True
    )
    stance: Mapped[str] = mapped_column(String(20), nullable=False)  # supports / refutes / inconclusive
    relevance: Mapped[str] = mapped_column(String(20), nullable=False)  # direct / indirect

    claim: Mapped["IngredientClaim"] = relationship("IngredientClaim", back_populates="evidence_links")
    evidence: Mapped["IngredientEvidence"] = relationship("IngredientEvidence")

    __table_args__ = (Index("ix_ingredient_claim_evidence_evidence_id", "evidence_id"),)
