"""IngredientBioDomainScore model.

One row per (ingredient, biodomain) pair — written by the research agent
after the biodomain synthesis Sonnet call, read by the product scoring
service and the ingredient detail API.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.ingredient import Ingredient


class IngredientBioDomainScore(Base, UUIDMixin, TimestampMixin):
    """
    Per-ingredient, per-biodomain impact score produced by the research agent.

    magnitude    : 0.0 – 1.0 (how strong the effect is)
    direction    : benefit | harm | neutral | mixed
    confidence   : high | moderate | low  (aggregated from underlying studies)

    Dose fields capture the effective clinical dose range extracted from
    PubMed abstracts — used by the product scorer to scale the ingredient's
    actual contribution based on the amount in a given product.
    """

    __tablename__ = "ingredient_biodomain_scores"
    __table_args__ = (
        UniqueConstraint("ingredient_id", "biodomain", name="uq_ingredient_biodomain"),
    )

    ingredient_id: Mapped[UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    # One of the 10 canonical biodomain keys defined in app/core/biodomains.py
    biodomain: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Effect direction and magnitude
    direction: Mapped[str] = mapped_column(
        String(10), nullable=False, default="neutral"
    )  # benefit | harm | neutral | mixed
    magnitude: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Evidence quality
    confidence: Mapped[str] = mapped_column(
        String(10), nullable=False, default="low"
    )  # high | moderate | low
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Dose-response
    dose_dependent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    effective_dose_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    effective_dose_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    dose_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Free-text reasoning from Claude (for auditability)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationship back to ingredient
    ingredient: Mapped["Ingredient"] = relationship(
        "Ingredient",
        back_populates="biodomain_scores",
    )

    def __repr__(self) -> str:
        return (
            f"<IngredientBioDomainScore "
            f"{self.biodomain} {self.direction} {self.magnitude:.2f}>"
        )
