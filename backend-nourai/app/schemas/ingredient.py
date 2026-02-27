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


class IngredientDetailResponse(BaseModel):
    """Ingredient as it appears in a product (simplified)."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    status: str | None = None
    note: str | None = None
