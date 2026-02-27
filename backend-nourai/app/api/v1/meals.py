"""Meal analysis endpoints."""
from fastapi import APIRouter, HTTPException

from app.schemas.meal import MealAnalyzeRequest, MealAnalysisResponse
from app.services.meal_analysis import MealAnalysisService

router = APIRouter()

# One shared instance per worker — Anthropic client is stateless
_service = MealAnalysisService()


@router.post("/analyze", response_model=MealAnalysisResponse)
async def analyze_meal(request: MealAnalyzeRequest):
    """
    Analyze a meal photo or free-text description with Claude AI.

    Provide either:
    - **image_base64**: base64-encoded JPEG image of the meal
    - **description**: free-text meal description (e.g. "grilled salmon with quinoa")

    Returns a structured list of recognized food items with estimated amounts
    and confidence scores.
    """
    if not request.image_base64 and not request.description:
        raise HTTPException(
            status_code=400,
            detail="Either image_base64 or description is required",
        )

    try:
        if request.image_base64:
            return await _service.analyze_image(request.image_base64)
        else:
            return await _service.analyze_text(request.description)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc
