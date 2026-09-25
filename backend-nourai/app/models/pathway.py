"""
Pathway maps: mechanism facts imported from open databases (layer 3) and
human-reviewed evidence routes (layer 4).

Layer 3 never carries an outcome claim. Only a published route can say an
ingredient supports a measured human outcome. Published route versions are
immutable; a change is imported as the next version.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class BioEntityKind(str, Enum):
    SMALL_MOLECULE = "small_molecule"
    PROTEIN = "protein"
    COMPLEX = "complex"
    PROCESS = "process"
    CELL_LOCATION = "cell_location"
    OUTCOME = "outcome"


class RouteStatus(str, Enum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    PUBLISHED = "published"
    RETIRED = "retired"


def _fk(target: str, *, nullable: bool = False, ondelete: str = "CASCADE"):
    return mapped_column(UUID(as_uuid=True), ForeignKey(target, ondelete=ondelete), nullable=nullable)


# ── Layer 3 ──────────────────────────────────────────────────────────────────

class BioEntity(Base, UUIDMixin, TimestampMixin):
    """A molecule, protein, process, cell location or outcome."""

    __tablename__ = "bio_entities"

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    plain_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    chebi_id: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    pubchem_cid: Mapped[str | None] = mapped_column(String(20), nullable=True)
    uniprot_id: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    reactome_id: Mapped[str | None] = mapped_column(String(30), nullable=True, index=True)
    go_id: Mapped[str | None] = mapped_column(String(20), nullable=True)
    uniprot_sl_id: Mapped[str | None] = mapped_column(String(10), nullable=True)
    source_id: Mapped[uuid.UUID | None] = _fk("data_sources.id", nullable=True, ondelete="SET NULL")

    __table_args__ = (
        UniqueConstraint("kind", "name", name="uq_bio_entities_kind_name"),
    )


class MechanismFact(Base, UUIDMixin):
    """subject —relation→ object, straight from one open database record."""

    __tablename__ = "mechanism_facts"

    subject_id: Mapped[uuid.UUID] = _fk("bio_entities.id")
    relation: Mapped[str] = mapped_column(String(30), nullable=False)
    object_id: Mapped[uuid.UUID] = _fk("bio_entities.id")
    source_id: Mapped[uuid.UUID] = _fk("data_sources.id")
    source_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("subject_id", "relation", "object_id", "source_id", name="uq_mechanism_facts"),
        Index("ix_mechanism_facts_subject", "subject_id"),
    )


class IngredientMechanismAsset(Base, UUIDMixin, TimestampMixin):
    """Cached inputs for one viewer panel of one ingredient."""

    __tablename__ = "ingredient_mechanism_assets"

    ingredient_id: Mapped[uuid.UUID] = _fk("ingredients.id")
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    cached_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    attribution: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("ingredient_id", "kind", name="uq_ingredient_mechanism_assets"),
    )


# ── Layer 4 ──────────────────────────────────────────────────────────────────

class PathwayRoute(Base, UUIDMixin, TimestampMixin):
    """One reviewed ingredient → mechanism → outcome route, at one version."""

    __tablename__ = "pathway_routes"

    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    ingredient_id: Mapped[uuid.UUID] = _fk("ingredients.id")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    takeaway: Mapped[str] = mapped_column(Text, nullable=False)
    domain: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False, default="supports")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=RouteStatus.DRAFT)
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    supersedes_id: Mapped[uuid.UUID | None] = _fk("pathway_routes.id", nullable=True, ondelete="SET NULL")
    source_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_commit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    nodes: Mapped[list[RouteNode]] = relationship(
        back_populates="route", cascade="all, delete-orphan", order_by="RouteNode.position"
    )
    links: Mapped[list[RouteLink]] = relationship(
        back_populates="route", cascade="all, delete-orphan", order_by="RouteLink.position"
    )

    __table_args__ = (
        UniqueConstraint("slug", "version", name="uq_pathway_routes_slug_version"),
        Index("ix_pathway_routes_ingredient_status", "ingredient_id", "status"),
    )


class RouteNode(Base, UUIDMixin):
    __tablename__ = "route_nodes"

    route_id: Mapped[uuid.UUID] = _fk("pathway_routes.id")
    key: Mapped[str] = mapped_column(String(60), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    bio_entity_id: Mapped[uuid.UUID | None] = _fk("bio_entities.id", nullable=True, ondelete="SET NULL")
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    plain_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    node_role: Mapped[str] = mapped_column(String(20), nullable=False)

    route: Mapped[PathwayRoute] = relationship(back_populates="nodes")


class RouteLink(Base, UUIDMixin):
    __tablename__ = "route_links"

    route_id: Mapped[uuid.UUID] = _fk("pathway_routes.id")
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    from_key: Mapped[str] = mapped_column(String(60), nullable=False)
    to_key: Mapped[str] = mapped_column(String(60), nullable=False)
    relation_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    strength: Mapped[str | None] = mapped_column(String(20), nullable=True)
    evidence_stops_here: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stop_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    route: Mapped[PathwayRoute] = relationship(back_populates="links")
    claims: Mapped[list[RouteClaim]] = relationship(
        back_populates="link", cascade="all, delete-orphan", order_by="RouteClaim.position"
    )


class RouteClaim(Base, UUIDMixin):
    __tablename__ = "route_claims"

    link_id: Mapped[uuid.UUID] = _fk("route_links.id")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    population: Mapped[str | None] = mapped_column(Text, nullable=True)
    comparator: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration: Mapped[str | None] = mapped_column(Text, nullable=True)
    form: Mapped[str | None] = mapped_column(Text, nullable=True)
    dose_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    dose_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    dose_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dose_basis: Mapped[str | None] = mapped_column(String(20), nullable=True)
    outcome_measure: Mapped[str | None] = mapped_column(Text, nullable=True)
    effect_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)
    ci_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    ci_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    effect_unit: Mapped[str | None] = mapped_column(String(40), nullable=True)
    certainty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    limitations: Mapped[str | None] = mapped_column(Text, nullable=True)
    citations: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    checks: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    drafted_by: Mapped[str] = mapped_column(String(10), nullable=False, default="human")

    link: Mapped[RouteLink] = relationship(back_populates="claims")
