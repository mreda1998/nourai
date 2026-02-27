"""Meal analysis request / response schemas."""
from typing import Literal

from pydantic import BaseModel, Field


class MealAnalyzeRequest(BaseModel):
    """Either image_base64 or description must be provided."""

    image_base64: str | None = None
    description: str | None = None


class RecognizedFood(BaseModel):
    name: str
    estimated_amount: str | None = None
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    category: str = "food"


class MealAnalysisResponse(BaseModel):
    foods: list[RecognizedFood] = Field(default_factory=list)
    meal_summary: str
    analysis_type: Literal["image", "text"]
