"""Claim Pydantic schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.claim import EvidenceStrength


class ClaimSourceResponse(BaseModel):
    """Scientific source backing a claim."""

    model_config = ConfigDict(from_attributes=True)

    label: str
    summary: str | None = None
    study_type: str | None = None
    pmid: str | None = None
    doi: str | None = None
    url: str | None = None


class ClaimResponse(BaseModel):
    """Health claim response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    evidence_strength: EvidenceStrength
    normalized_claim: str | None = None
    mechanism_summary: str | None = None
    description: str | None = None
    icon: str | None = None
    accent: str | None = None
    tags: list[str] = []
    sources: list[ClaimSourceResponse] = []
