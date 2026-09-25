"""Ingestion control-plane, provenance, revision, and product asset models."""
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
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class IngestionJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    RETRY = "retry"
    COMPLETE = "complete"
    NEEDS_REVIEW = "needs_review"
    DEAD = "dead"


class PublicationStatus(str, Enum):
    PENDING = "pending"
    PUBLISHED = "published"
    NEEDS_REVIEW = "needs_review"
    OBSOLETE = "obsolete"


class DataSource(Base, UUIDMixin, TimestampMixin):
    """An upstream product, laboratory, regulatory, or user-contribution source."""

    __tablename__ = "data_sources"

    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    license_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    license_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    attribution_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    share_alike: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class SourceRecord(Base, UUIDMixin):
    """Immutable snapshot of an upstream record used to build canonical data."""

    __tablename__ = "source_records"

    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    record_type: Mapped[str] = mapped_column(String(50), nullable=False)
    schema_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    request_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    http_etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    payload_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    license_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        UniqueConstraint(
            "source_id", "record_type", "external_id", "content_hash",
            name="uq_source_record_snapshot",
        ),
        Index("ix_source_records_source_external", "source_id", "external_id"),
        Index("ix_source_records_fetched_at", "fetched_at"),
    )


class IngestionJob(Base, UUIDMixin, TimestampMixin):
    """Durable PostgreSQL-backed ingestion job with leasing and retry state."""

    __tablename__ = "ingestion_jobs"

    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=IngestionJobStatus.QUEUED
    )
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        Index(
            "ix_ingestion_jobs_claim",
            "status",
            "priority",
            "available_at",
            postgresql_where=text("status IN ('queued', 'retry', 'running')"),
        ),
        Index("ix_ingestion_jobs_product_id", "product_id"),
    )


class ProductIdentifier(Base, UUIDMixin):
    """Normalized identifiers kept separately from the mutable product projection."""

    __tablename__ = "product_identifiers"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    scheme: Mapped[str] = mapped_column(String(30), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    market_country: Mapped[str] = mapped_column(String(2), nullable=False, default="")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("scheme", "value", "market_country", name="uq_product_identifier"),
        Index("ix_product_identifiers_product_id", "product_id"),
    )


class ProductRevision(Base, UUIDMixin, TimestampMixin):
    """Immutable formulation snapshot; Product is the current read projection."""

    __tablename__ = "product_revisions"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    publication_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=PublicationStatus.PENDING
    )
    market_country: Mapped[str] = mapped_column(String(2), nullable=False, default="")
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    serving_size: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ingredient_statement: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    field_provenance: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("product_id", "revision_number", name="uq_product_revision_number"),
        Index("ix_product_revisions_product_hash", "product_id", "content_hash"),
        Index("ix_product_revisions_product_current", "product_id", "is_current"),
        Index(
            "uq_product_revisions_one_current",
            "product_id",
            unique=True,
            postgresql_where=text("is_current"),
        ),
        Index("ix_product_revisions_source_record", "source_record_id"),
    )


class ProductIngredientOccurrence(Base, UUIDMixin):
    """One raw, potentially nested ingredient occurrence in a product revision."""

    __tablename__ = "product_ingredient_occurrences"

    product_revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_revisions.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_ingredient_occurrences.id", ondelete="CASCADE"), nullable=True
    )
    ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True
    )
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_text: Mapped[str] = mapped_column(Text, nullable=False)
    order_path: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    percentage: Mapped[float | None] = mapped_column(Float, nullable=True)
    qualifiers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    resolution_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resolution_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_product_ingredient_occurrences_revision", "product_revision_id"),
        Index("ix_product_ingredient_occurrences_ingredient", "ingredient_id"),
    )


class ProductAsset(Base, UUIDMixin, TimestampMixin):
    """Authentic product image or document plus deterministic derivatives."""

    __tablename__ = "product_assets"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    product_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_revisions.id", ondelete="CASCADE"), nullable=True
    )
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True
    )
    asset_type: Mapped[str] = mapped_column(String(30), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="evidence")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    derivative_storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    perceptual_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    license_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    license_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    attribution_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_original: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    processing_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_product_assets_product_type", "product_id", "asset_type"),
        Index("ix_product_assets_revision", "product_revision_id"),
    )


class IngredientAlias(Base, UUIDMixin):
    """Approved normalized alias used by deterministic ingredient resolution."""

    __tablename__ = "ingredient_aliases"

    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False
    )
    alias: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_alias: Mapped[str] = mapped_column(String(500), nullable=False)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="")
    market_country: Mapped[str] = mapped_column(String(2), nullable=False, default="")
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    alias_type: Mapped[str] = mapped_column(String(30), nullable=False, default="synonym")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "ingredient_id", "normalized_alias", "language", "market_country",
            name="uq_ingredient_alias",
        ),
        Index("ix_ingredient_aliases_normalized", "normalized_alias"),
    )


class IngredientExternalIdentifier(Base, UUIDMixin):
    """CAS, PubChem, INCI, E-number, and other authoritative identifiers."""

    __tablename__ = "ingredient_external_identifiers"

    ingredient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="CASCADE"), nullable=False
    )
    scheme: Mapped[str] = mapped_column(String(40), nullable=False)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("scheme", "value", name="uq_ingredient_external_identifier"),
        Index("ix_ingredient_external_identifiers_ingredient", "ingredient_id"),
    )


class QualityIssue(Base, UUIDMixin, TimestampMixin):
    """Machine-readable quality failure or warning produced by ingestion rules."""

    __tablename__ = "quality_issues"

    product_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_revisions.id", ondelete="CASCADE"), nullable=True
    )
    source_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("source_records.id", ondelete="CASCADE"), nullable=True
    )
    ingestion_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingestion_jobs.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    field: Mapped[str | None] = mapped_column(String(120), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_quality_issues_revision_status", "product_revision_id", "status"),
        Index("ix_quality_issues_job", "ingestion_job_id"),
    )


class ReviewTask(Base, UUIDMixin, TimestampMixin):
    """Human-in-the-loop review item for ambiguous or incomplete records."""

    __tablename__ = "review_tasks"

    task_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    resolution: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_review_tasks_queue", "status", "priority", "created_at"),
        Index("ix_review_tasks_entity", "entity_type", "entity_id"),
    )
