"""
Lightweight frequency table for ingredient names that appeared in scanned
products but did not match any Tier-1 canonical ingredient or Tier-2 known nutrient.

Used by `make suggest-new-ingredients` to surface candidates for the next
golden set batch. name_raw is the primary key — no separate UUID needed.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UnmatchedIngredientLog(Base):
    """One row per unique unmatched ingredient name, with occurrence count."""

    __tablename__ = "unmatched_ingredient_log"

    name_raw: Mapped[str] = mapped_column(
        String(500), primary_key=True, nullable=False
    )
    count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        return f"<UnmatchedIngredientLog {self.name_raw!r} count={self.count}>"
