"""What the law, and expert bodies, say about a substance in each place — with source and dates.

A substance is the thing a rule is about. It is kept apart from the curated research library
(`ingredients`): rules exist for thousands of substances we will never research, and one canonical
ingredient can cover several legal substances (titanium dioxide is both E171 and CI 77891).
"""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class RegulatedSubstance(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "regulated_substances"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    e_number: Mapped[str | None] = mapped_column(String(12), nullable=True)
    cas: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ec: Mapped[str | None] = mapped_column(String(20), nullable=True)
    inci: Mapped[str | None] = mapped_column(Text, nullable=True)
    unii: Mapped[str | None] = mapped_column(String(12), nullable=True)
    identifiers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    aliases: Mapped[list["SubstanceAlias"]] = relationship(
        back_populates="substance", cascade="all, delete-orphan"
    )
    rules: Mapped[list["RegulatoryRule"]] = relationship(
        back_populates="substance", cascade="all, delete-orphan", foreign_keys="RegulatoryRule.substance_id"
    )
    checks: Mapped[list["RuleCheck"]] = relationship(
        back_populates="substance", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index(
            "uq_regulated_substances_e_number", "e_number", unique=True,
            postgresql_where="e_number IS NOT NULL",
        ),
        Index("ix_regulated_substances_cas", "cas"),
    )


class SubstanceAlias(Base, UUIDMixin):
    """A name, INCI name, E-number or CAS number a label may use for the substance."""

    __tablename__ = "regulated_substance_aliases"

    substance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("regulated_substances.id", ondelete="CASCADE"), nullable=False
    )
    alias: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(500), nullable=False)
    alias_type: Mapped[str] = mapped_column(String(20), nullable=False, default="name")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    substance: Mapped[RegulatedSubstance] = relationship(back_populates="aliases")

    __table_args__ = (
        UniqueConstraint("substance_id", "normalized_alias", name="uq_substance_alias"),
        Index("ix_regulated_substance_aliases_normalized", "normalized_alias"),
    )


class IngredientSubstance(Base):
    """Which legal substances a curated ingredient covers, and how to label each on its page."""

    __tablename__ = "ingredient_substances"

    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="CASCADE"), primary_key=True
    )
    substance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("regulated_substances.id", ondelete="CASCADE"), primary_key=True
    )
    scope_label: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_ingredient_substances_substance_id", "substance_id"),)


class RegulatoryRule(Base, UUIDMixin, TimestampMixin):
    """One rule: a substance × place × product scope × legal instrument. Only published rows are served."""

    __tablename__ = "regulatory_rules"

    substance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("regulated_substances.id", ondelete="CASCADE"), nullable=False
    )
    place: Mapped[str] = mapped_column(String(8), nullable=False)
    authority: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)  # law / expert_view
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    classification: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Expert classifications are about an agent, not a product scope.
    applies_to: Mapped[str | None] = mapped_column(String(16), nullable=True)
    sub_scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    limit_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    limit_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    limit_basis: Mapped[str | None] = mapped_column(String(60), nullable=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    legal_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    source_quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    why: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    origin: Mapped[str] = mapped_column(String(10), nullable=False)  # bulk / curated / derived
    review_status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft")
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    supersedes_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("regulatory_rules.id", ondelete="SET NULL"), nullable=True
    )

    substance: Mapped[RegulatedSubstance] = relationship(back_populates="rules", foreign_keys=[substance_id])

    __table_args__ = (
        CheckConstraint("kind = 'expert_view' OR applies_to IS NOT NULL", name="ck_regulatory_rules_scope"),
        Index("ix_regulatory_rules_substance_status", "substance_id", "review_status"),
        Index("ix_regulatory_rules_place", "place"),
    )


class RuleCheck(Base, UUIDMixin):
    """We checked this place and scope and found no specific rule. Only confirmed checks are served.

    Bulk lists confirm their own checks; a curated document only proposes one (`pending`) until the
    reviewer confirms it.
    """

    __tablename__ = "rule_checks"

    substance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("regulated_substances.id", ondelete="CASCADE"), nullable=False
    )
    place: Mapped[str] = mapped_column(String(8), nullable=False)
    applies_to: Mapped[str] = mapped_column(String(16), nullable=False)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    origin: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="confirmed")
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    documents: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    reviewed_by: Mapped[str | None] = mapped_column(String(120), nullable=True)

    substance: Mapped[RegulatedSubstance] = relationship(back_populates="checks")

    __table_args__ = (
        UniqueConstraint("substance_id", "place", "applies_to", name="uq_rule_checks_place_scope"),
    )
