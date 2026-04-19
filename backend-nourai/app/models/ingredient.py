"""Ingredient models using SQLAlchemy 2.0."""
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.product import ProductIngredient
    from app.models.ingredient_evidence import IngredientEvidence
    from app.models.ingredient_biodomain_score import IngredientBioDomainScore
    from app.models.ingredient_interaction import IngredientInteraction


class IngredientCategory(str, Enum):
    """Ingredient category for classification."""

    VITAMIN = "vitamin"
    MINERAL = "mineral"
    AMINO_ACID = "amino_acid"
    HERB = "herb"
    PROBIOTIC = "probiotic"
    ENZYME = "enzyme"
    FATTY_ACID = "fatty_acid"
    ANTIOXIDANT = "antioxidant"
    PRESERVATIVE = "preservative"
    SWEETENER = "sweetener"
    ADDITIVE = "additive"
    OTHER = "other"


class ResearchStatus(str, Enum):
    """Tracks the research pipeline state for each ingredient."""

    PENDING = "pending"       # Not yet processed
    IN_PROGRESS = "in_progress"  # Currently being researched
    COMPLETE = "complete"     # Research done, evidence stored
    FAILED = "failed"         # Pipeline errored — will be retried


class Ingredient(Base, UUIDMixin, TimestampMixin):
    """Master ingredient database for nutritional/health knowledge."""

    __tablename__ = "ingredients"

    canonical_name: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    category: Mapped[IngredientCategory] = mapped_column(
        String(20), nullable=False, default=IngredientCategory.OTHER
    )

    # Synonyms for flexible matching
    synonyms: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Scientific/health information
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mechanism_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Dosage information
    typical_dose_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    recommended_daily: Mapped[str | None] = mapped_column(String(100), nullable=True)
    upper_limit: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Safety information
    side_effects: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    contraindications: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    drug_interactions: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Evidence level — updated by research agent after synthesis
    evidence_level: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Belief vs. reality — the core Elory differentiator.
    # Both fields are written by the research agent in a single Claude call
    # after all PubMed studies for this ingredient have been synthesized.
    # common_belief  = what people generally think this ingredient does
    #                  (sourced from marketing language + folk knowledge)
    # evidence_reality = what the human-trial evidence actually supports
    #                  (honest, plain-English, with caveats)
    common_belief: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_reality: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Per-bio-domain effect summary (pre-computed by research agent).
    # Keys: gut-health, skin, metabolism, sleep-recovery, cognition, exposure-load.
    # Each value: {direction, confidence, evidence_count, top_finding}
    domain_effects: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # URL to the generated mechanism-of-action research board illustration.
    # Set by the research agent after image generation (future step).
    mechanism_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Circadian timing fields — written by research agent (--atelier flag)
    optimal_times: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    avoid_near_sleep: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    circadian_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Research pipeline tracking
    research_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ResearchStatus.PENDING
    )
    researched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    product_ingredients: Mapped[list["ProductIngredient"]] = relationship(
        "ProductIngredient",
        back_populates="ingredient",
    )
    evidence: Mapped[list["IngredientEvidence"]] = relationship(
        "IngredientEvidence",
        back_populates="ingredient",
        cascade="all, delete-orphan",
        order_by="IngredientEvidence.year.desc()",
    )
    biodomain_scores: Mapped[list["IngredientBioDomainScore"]] = relationship(
        "IngredientBioDomainScore",
        back_populates="ingredient",
        cascade="all, delete-orphan",
        order_by="IngredientBioDomainScore.biodomain",
    )
    interactions_as_a: Mapped[list["IngredientInteraction"]] = relationship(
        "IngredientInteraction",
        foreign_keys="IngredientInteraction.ingredient_id_a",
        back_populates="ingredient_a",
        cascade="all, delete-orphan",
    )
    interactions_as_b: Mapped[list["IngredientInteraction"]] = relationship(
        "IngredientInteraction",
        foreign_keys="IngredientInteraction.ingredient_id_b",
        back_populates="ingredient_b",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Ingredient {self.canonical_name} [{self.research_status}]>"
