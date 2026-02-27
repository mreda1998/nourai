"""Ingredient models using SQLAlchemy 2.0."""
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.product import ProductIngredient
    from app.models.ingredient_evidence import IngredientEvidence


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

    def __repr__(self) -> str:
        return f"<Ingredient {self.canonical_name} [{self.research_status}]>"
