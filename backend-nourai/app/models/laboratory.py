"""Provenance-first models for publicly published analytical laboratory results."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class LabDataset(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lab_datasets"

    source_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
    )
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    publisher: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    license_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    license_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    raw_asset_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    applicability: Mapped[str] = mapped_column(
        String(30), nullable=False, default="product_specific"
    )
    trust_grade: Mapped[str] = mapped_column(String(2), nullable=False, default="C")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class LabSample(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lab_samples"

    dataset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_datasets.id", ondelete="CASCADE"), nullable=False
    )
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )
    product_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("product_revisions.id", ondelete="SET NULL"), nullable=True
    )
    ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True
    )
    product_match_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    product_match_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_name: Mapped[str] = mapped_column(Text, nullable=False)
    matrix: Mapped[str | None] = mapped_column(String(120), nullable=True)
    gtin: Mapped[str | None] = mapped_column(String(14), nullable=True)
    lot_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    market_country: Mapped[str] = mapped_column(String(2), nullable=False, default="")
    purchase_location: Mapped[str | None] = mapped_column(Text, nullable=True)
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expiration_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    preparation: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_composite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sample_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        UniqueConstraint("dataset_id", "external_id", name="uq_lab_sample_external"),
        Index("ix_lab_samples_product", "product_id"),
        Index("ix_lab_samples_gtin", "gtin"),
    )


class LabAnalysis(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lab_analyses"

    sample_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_samples.id", ondelete="CASCADE"), nullable=False
    )
    laboratory_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    accreditation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    accreditation_scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    method_name: Mapped[str] = mapped_column(Text, nullable=False)
    method_identifier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    instrument: Mapped[str | None] = mapped_column(String(120), nullable=True)
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    batch_identifier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    replicate_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_control: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (Index("ix_lab_analyses_sample", "sample_id"),)


class LabObservation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lab_observations"

    analysis_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_analyses.id", ondelete="CASCADE"), nullable=False
    )
    analyte_ingredient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="SET NULL"), nullable=True
    )
    analyte_name: Mapped[str] = mapped_column(String(255), nullable=False)
    analyte_identifier_scheme: Mapped[str | None] = mapped_column(String(40), nullable=True)
    analyte_identifier_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    basis: Mapped[str | None] = mapped_column(String(80), nullable=True)
    qualifier: Mapped[str | None] = mapped_column(String(30), nullable=True)
    detection_status: Mapped[str] = mapped_column(String(30), nullable=False, default="quantified")
    lod: Mapped[float | None] = mapped_column(Float, nullable=True)
    loq: Mapped[float | None] = mapped_column(Float, nullable=True)
    uncertainty: Mapped[float | None] = mapped_column(Float, nullable=True)
    uncertainty_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    replicate_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_value: Mapped[str | None] = mapped_column(String(120), nullable=True)
    observation_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        Index("ix_lab_observations_analysis", "analysis_id"),
        Index("ix_lab_observations_analyte", "analyte_ingredient_id", "analyte_name"),
    )


class LabInterpretation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lab_interpretations"

    observation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lab_observations.id", ondelete="CASCADE"), nullable=False
    )
    jurisdiction: Mapped[str | None] = mapped_column(String(20), nullable=True)
    population_context: Mapped[str | None] = mapped_column(String(120), nullable=True)
    threshold_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    threshold_source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    threshold_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    threshold_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    classification: Mapped[str] = mapped_column(String(40), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    interpretation_version: Mapped[str] = mapped_column(String(40), nullable=False, default="1")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (Index("ix_lab_interpretations_observation", "observation_id", "active"),)
