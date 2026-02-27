"""Meal analysis service — Claude vision + text."""
import json

import anthropic

from app.schemas.meal import MealAnalysisResponse, RecognizedFood

_IMAGE_PROMPT = """Analyze this meal photo and identify all distinct food items visible.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{
  "meal_summary": "One sentence describing the overall meal",
  "foods": [
    {
      "name": "food item name",
      "estimated_amount": "1 cup / 150g / 1 piece",
      "confidence": 0.95,
      "category": "food"
    }
  ]
}

Rules:
- List individual components when distinguishable (e.g. not "salad" but "lettuce", "tomato", "croutons")
- estimated_amount: realistic portion based on what is visible
- confidence: 0.9+ for clearly visible items, 0.6–0.89 for inferred, below 0.6 for uncertain
- category: "food" unless it is clearly a supplement or vitamin
- Return 1 to 10 items maximum"""

_TEXT_PROMPT = """The user describes their meal: "{description}"

Identify all distinct food items from this description.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{{
  "meal_summary": "One sentence normalized description of the meal",
  "foods": [
    {{
      "name": "food item name",
      "estimated_amount": "amount if mentioned or typical serving size",
      "confidence": 0.95,
      "category": "food"
    }}
  ]
}}

Rules:
- Break composite dishes into main components when meaningful
  (e.g. "caesar salad" → "romaine lettuce", "parmesan", "caesar dressing", "croutons")
- Use short standard names ("chicken breast" not "grilled chicken breast fillet")
- confidence: 0.95 for explicitly stated items, 0.75 for inferred components
- category: "food" for food items, "supplement" for vitamins or supplements
- Return 1 to 10 items maximum"""


class MealAnalysisService:
    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic()

    async def analyze_image(self, image_base64: str) -> MealAnalysisResponse:
        message = await self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_base64,
                            },
                        },
                        {"type": "text", "text": _IMAGE_PROMPT},
                    ],
                }
            ],
        )
        return self._parse(message.content[0].text, "image")

    async def analyze_text(self, description: str) -> MealAnalysisResponse:
        message = await self._client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": _TEXT_PROMPT.format(description=description),
                }
            ],
        )
        return self._parse(message.content[0].text, "text")

    def _parse(self, raw: str, analysis_type: str) -> MealAnalysisResponse:
        # Strip markdown fences if Claude included them anyway
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1] if len(parts) > 1 else cleaned
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()

        data = json.loads(cleaned)
        foods = [RecognizedFood(**f) for f in data.get("foods", [])]
        return MealAnalysisResponse(
            foods=foods,
            meal_summary=data.get("meal_summary", ""),
            analysis_type=analysis_type,
        )
