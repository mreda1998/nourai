"""
Ingredient identity: canonical substances from open taxonomies, every label
spelling as an alias, and a cached resolution per distinct label name.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class Substance(Base, UUIDMixin, TimestampMixin):
    """One real-world ingredient (or a class of them, like "emulsifier")."""

    __tablename__ = "substances"

    key: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String(500), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="substance")  # substance | class | mixture
    e_number: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    inci_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    cas: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wikidata: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    license: Mapped[str | None] = mapped_column(String(60), nullable=True)
    ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True, index=True
    )


class SubstanceAlias(Base, UUIDMixin):
    __tablename__ = "substance_aliases"

    substance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("substances.id", ondelete="CASCADE"), nullable=False
    )
    alias: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_alias: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False, default="taxonomy")  # taxonomy | ai | review
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    __table_args__ = (
        UniqueConstraint("normalized_alias", name="uq_substance_aliases_normalized"),
        Index("ix_substance_aliases_trgm", "normalized_alias",
              postgresql_using="gin", postgresql_ops={"normalized_alias": "gin_trgm_ops"}),
    )


class NameResolution(Base, UUIDMixin):
    """What one distinct (normalised) label name means."""

    __tablename__ = "name_resolutions"

    normalized_name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # resolved | class | mixture | junk | review | unresolved
    substance_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("substances.id", ondelete="SET NULL"), nullable=True
    )
    english_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)  # exact | plural | e_number | ai | review
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    model: Mapped[str | None] = mapped_column(String(60), nullable=True)
    candidates: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    occurrences: Mapped[int] = mapped_column(nullable=False, default=0)
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
