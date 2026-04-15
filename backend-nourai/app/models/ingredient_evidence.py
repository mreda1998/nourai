"""IngredientEvidence model — one record per PubMed study per ingredient."""
import uuid
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ingredient import Ingredient


class StudyType(str, Enum):
    RCT = "rct"
    SYSTEMATIC_REVIEW = "systematic_review"
    META_ANALYSIS = "meta_analysis"
    COHORT = "cohort"
    CASE_CONTROL = "case_control"
    CROSS_SECTIONAL = "cross_sectional"
    IN_VITRO = "in_vitro"
    ANIMAL = "animal"
    REVIEW = "review"
    CASE_REPORT = "case_report"
    OTHER = "other"


class EvidenceDirection(str, Enum):
    BENEFIT = "benefit"   # Study shows ingredient is beneficial
    RISK = "risk"         # Study shows ingredient poses a risk
    NEUTRAL = "neutral"   # No significant effect
    MIXED = "mixed"       # Study shows both benefits and risks


class IngredientEvidence(Base, UUIDMixin, TimestampMixin):
    """
    One row = one PubMed study synthesized by Claude for a given ingredient.

    The research agent populates this table. The product API layer reads it
    and filters/ranks evidence by the user's onboarding profile (concern_tags,
    goal_tags) to deliver Option A personalized analysis.
    """

    __tablename__ = "ingredient_evidence"

    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── PubMed source ─────────────────────────────────────────────────────────
    pmid: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    doi: Mapped[str | None] = mapped_column(String(200), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    journal: Mapped[str | None] = mapped_column(String(255), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_abstract: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Claude synthesis ──────────────────────────────────────────────────────
    # Study characteristics
    study_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    population: Mapped[str | None] = mapped_column(String(150), nullable=True)
    sample_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Core finding — one plain-English sentence written for general audience
    finding: Mapped[str] = mapped_column(Text, nullable=False)

    # Direction and strength
    direction: Mapped[str] = mapped_column(String(20), nullable=False, default=EvidenceDirection.NEUTRAL)
    effect_size: Mapped[str | None] = mapped_column(String(20), nullable=True)   # strong / moderate / weak
    confidence: Mapped[str] = mapped_column(String(20), nullable=False, default="low")  # high / moderate / low

    # ── Personalization tags ──────────────────────────────────────────────────
    # Populated by Claude during synthesis, used by the API to filter evidence
    # by user's onboarding profile without re-running Claude at query time.
    concern_tags: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list,
        comment="Onboarding concern IDs this study is relevant to"
    )
    goal_tags: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list,
        comment="Onboarding goal IDs this study supports or contradicts"
    )
    domain_tags: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list,
        comment="Bio-domain slugs this study is relevant to: gut-health, skin, metabolism, sleep-recovery, cognition, exposure-load"
    )

    # ── Relationship ──────────────────────────────────────────────────────────
    ingredient: Mapped["Ingredient"] = relationship(
        "Ingredient",
        back_populates="evidence",
    )

    __table_args__ = (
        Index("ix_ingredient_evidence_ingredient_id", "ingredient_id"),
        Index("ix_ingredient_evidence_pmid", "pmid"),
        Index("ix_ingredient_evidence_direction", "direction"),
        Index("ix_ingredient_evidence_concern_tags", "concern_tags", postgresql_using="gin"),
        Index("ix_ingredient_evidence_goal_tags", "goal_tags", postgresql_using="gin"),
        Index("ix_ingredient_evidence_domain_tags", "domain_tags", postgresql_using="gin"),
    )

    def __repr__(self) -> str:
        return f"<IngredientEvidence pmid={self.pmid} direction={self.direction}>"
