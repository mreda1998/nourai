"""Ingredient Pydantic schemas."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.ingredient import IngredientCategory


class IngredientResponse(BaseModel):
    """Full ingredient response from master database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    canonical_name: str
    category: IngredientCategory
    synonyms: list[str] = []
    description: str | None = None
    mechanism_summary: str | None = None
    typical_dose_range: str | None = None
    recommended_daily: str | None = None
    upper_limit: str | None = None
    side_effects: list[str] = []
    contraindications: list[str] = []
    drug_interactions: list[str] = []
    evidence_level: str | None = None
    # Peptide-specific fields (null for non-peptide ingredients)
    us_regulatory_status: str | None = None
    wada_status: str | None = None
    admin_routes: list[str] | None = None
    admin_route_notes: str | None = None
    cycle_length_weeks: int | None = None
    washout_weeks: int | None = None
    cycling_notes: str | None = None


class IngredientDetailResponse(BaseModel):
    """Ingredient as it appears in a product (simplified)."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    status: str | None = None
    note: str | None = None


class PeptideListItem(BaseModel):
    """Peptide row returned by GET /api/v1/peptides browse endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    canonical_name: str
    mechanism_summary: str | None = None
    evidence_level: str | None = None
    us_regulatory_status: str | None = None
    wada_status: str | None = None


class PeptidesResponse(BaseModel):
    """Paginated peptide browse response."""

    peptides: list[PeptideListItem]
    total: int
