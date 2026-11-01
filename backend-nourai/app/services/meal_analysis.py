"""Meal analysis service — Claude vision + text, returned as a structured output."""
import anthropic
from pydantic import BaseModel, Field

from app.schemas.meal import MealAnalysisResponse, RecognizedFood

MEAL_MODEL = "claude-sonnet-5-5"
# Declines in the cyber and frontier_llm categories are retried on another model inside the call.
_FALLBACK = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}

_IMAGE_PROMPT = """Analyze this meal photo and identify all distinct food items visible.

Rules:
- List individual components when distinguishable (e.g. not "salad" but "lettuce", "tomato", "croutons")
- estimated_amount: realistic portion based on what is visible
- confidence: 0.9+ for clearly visible items, 0.6–0.89 for inferred, below 0.6 for uncertain
- category: "food" unless it is clearly a supplement or vitamin
- Return 1 to 10 items maximum"""

_TEXT_PROMPT = """The user describes their meal: "{description}"

Identify all distinct food items from this description.

Rules:
- Break composite dishes into main components when meaningful
  (e.g. "caesar salad" → "romaine lettuce", "parmesan", "caesar dressing", "croutons")
- Use short standard names ("chicken breast" not "grilled chicken breast fillet")
- estimated_amount: the amount if mentioned, otherwise a typical serving size
- confidence: 0.95 for explicitly stated items, 0.75 for inferred components
- category: "food" for food items, "supplement" for vitamins or supplements
- Return 1 to 10 items maximum"""


class _MealFood(BaseModel):
    name: str = Field(description="Food item name")
    estimated_amount: str = Field(description="e.g. 1 cup / 150g / 1 piece")
    confidence: float = Field(description="0.0 to 1.0")
    category: str = Field(description='"food" or "supplement"')


class _Meal(BaseModel):
    meal_summary: str = Field(description="One sentence describing the overall meal")
    foods: list[_MealFood]


class MealAnalysisService:
    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic()

    async def analyze_image(self, image_base64: str) -> MealAnalysisResponse:
        content = [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_base64}},
            {"type": "text", "text": _IMAGE_PROMPT},
        ]
        return await self._analyze(content, "medium", "image")

    async def analyze_text(self, description: str) -> MealAnalysisResponse:
        return await self._analyze(_TEXT_PROMPT.format(description=description), "low", "text")

    async def _analyze(self, content, effort: str, analysis_type: str) -> MealAnalysisResponse:
        message = await self._client.beta.messages.parse(
            model=MEAL_MODEL,
            max_tokens=8000,  # room for thinking plus up to ten foods
            **_FALLBACK,
            output_config={"effort": effort},
            messages=[{"role": "user", "content": content}],
            output_format=_Meal,
        )
        if message.stop_reason == "refusal":
            raise ValueError("the model declined to analyze this meal")
        meal = message.parsed_output
        if meal is None:
            raise ValueError(f"no analysis came back (stop reason: {message.stop_reason})")
        return MealAnalysisResponse(
            foods=[
                RecognizedFood(**{**food.model_dump(), "confidence": min(max(food.confidence, 0.0), 1.0)})
                for food in meal.foods
            ],
            meal_summary=meal.meal_summary,
            analysis_type=analysis_type,
        )
