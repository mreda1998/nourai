"""Contracts for importing and reading public laboratory evidence."""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.measure import Measure


class LabInterpretationImport(BaseModel):
    classification: str
    summary: str | None = None
    jurisdiction: str | None = None
    population_context: str | None = None
    threshold_name: str | None = None
    threshold_source_url: str | None = None
    threshold_version: str | None = None
    threshold_value: float | None = None
    threshold_unit: str | None = None
    interpretation_version: str = "1"


class LabObservationImport(BaseModel):
    analyte_name: str
    value: float | None = None
    unit: str
    basis: str | None = None
    qualifier: str | None = None
    detection_status: str = "quantified"
    lod: float | None = None
    loq: float | None = None
    uncertainty: float | None = None
    uncertainty_unit: str | None = None
    raw_value: str | None = None
    identifier_scheme: str | None = None
    identifier_value: str | None = None
    metadata: dict = Field(default_factory=dict)
    interpretations: list[LabInterpretationImport] = Field(default_factory=list)


class LabAnalysisImport(BaseModel):
    method_name: str
    laboratory_name: str | None = None
    accreditation: str | None = None
    accreditation_scope: str | None = None
    method_identifier: str | None = None
    instrument: str | None = None
    analyzed_at: datetime | None = None
    batch_identifier: str | None = None
    replicate_count: int | None = None
    quality_control: dict = Field(default_factory=dict)
    observations: list[LabObservationImport]


class LabSampleImport(BaseModel):
    external_id: str
    sample_name: str
    gtin: str | None = None
    lot_number: str | None = None
    matrix: str | None = None
    market_country: str = ""
    purchase_location: str | None = None
    purchased_at: datetime | None = None
    expiration_date: datetime | None = None
    preparation: str | None = None
    is_composite: bool = False
    metadata: dict = Field(default_factory=dict)
    analyses: list[LabAnalysisImport]


class LabDatasetImport(BaseModel):
    slug: str
    title: str
    publisher: str
    source_url: str
    version: str | None = None
    published_at: datetime | None = None
    license_name: str
    license_url: str
    applicability: str = "product_specific"
    trust_grade: str = "C"
    metadata: dict = Field(default_factory=dict)
    samples: list[LabSampleImport]


class LabInterpretationResponse(BaseModel):
    classification: str
    summary: str | None = None
    jurisdiction: str | None = None
    population_context: str | None = None
    threshold_name: str | None = None
    threshold_source_url: str | None = None
    threshold_version: str | None = None
    threshold_value: float | None = None
    threshold_unit: str | None = None


class LabObservationResponse(BaseModel):
    observation_id: UUID
    analyte_name: str
    value: float | None = None
    unit: str
    basis: str | None = None
    qualifier: str | None = None
    raw_value: str | None = None
    detection_status: str
    lod: float | None = None
    loq: float | None = None
    uncertainty: float | None = None
    uncertainty_unit: str | None = None
    method_name: str
    laboratory_name: str | None = None
    analyzed_at: datetime | None = None
    sample_external_id: str
    sample_name: str
    lot_number: str | None = None
    dataset_title: str
    publisher: str
    source_url: str
    dataset_version: str | None = None
    license_name: str | None = None
    applicability: str
    trust_grade: str
    interpretations: list[LabInterpretationResponse] = Field(default_factory=list)
    measure: Measure | None = None


class ProductLabResultsResponse(BaseModel):
    product_id: UUID
    observations: list[LabObservationResponse]
