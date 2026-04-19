"""IngredientInteraction model — pairwise synergy/competition/caution relationships."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDMixin

if TYPE_CHECKING:
    from app.models.ingredient import Ingredient


class IngredientInteraction(Base, UUIDMixin):
    """One row = one canonical interaction pair (lower UUID always in id_a)."""

    __tablename__ = "ingredient_interactions"

    ingredient_id_a: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        nullable=False,
    )
    ingredient_id_b: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ingredients.id", ondelete="CASCADE"),
        nullable=False,
    )
    interaction_type: Mapped[str] = mapped_column(String(20), nullable=False)  # synergy|compete|caution
    mechanism: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[str] = mapped_column(String(10), nullable=False)  # high|moderate|low

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    ingredient_a: Mapped["Ingredient"] = relationship(
        "Ingredient",
        foreign_keys=[ingredient_id_a],
        back_populates="interactions_as_a",
    )
    ingredient_b: Mapped["Ingredient"] = relationship(
        "Ingredient",
        foreign_keys=[ingredient_id_b],
        back_populates="interactions_as_b",
    )

    __table_args__ = (
        UniqueConstraint("ingredient_id_a", "ingredient_id_b", name="uq_interaction_pair"),
        Index("ix_interactions_a", "ingredient_id_a"),
        Index("ix_interactions_b", "ingredient_id_b"),
    )

    def __repr__(self) -> str:
        return f"<IngredientInteraction {self.ingredient_id_a} {self.interaction_type} {self.ingredient_id_b}>"
