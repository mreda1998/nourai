"""
USDA FoodData Central router.

Exposes whole/unpackaged foods (salmon, broccoli, eggs, etc.) that have no
barcode and won't appear in Open Food Facts.

Routes:
  GET /foods/search?q=salmon        → list of matching foods
  GET /foods/{fdc_id}               → full nutritional detail
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.ingredient import Ingredient
from app.services.usda import USDAService

router = APIRouter()
_usda = USDAService()


async def _ingredient_lookup(db: AsyncSession) -> dict[str, str]:
    """
    Return a flat dict: lowercased canonical_name/synonym → str(ingredient_id).
    Used to annotate nutrient rows with ingredient_id FKs so the mobile client
    can navigate from a nutrient row to the ingredient deep-dive screen.
    """
    result = await db.execute(select(Ingredient))
    lookup: dict[str, str] = {}
    for ing in result.scalars().all():
        lookup[ing.canonical_name.lower().strip()] = str(ing.id)
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = str(ing.id)
    return lookup


@router.get("/search")
async def search_foods(
    q: str = Query(..., min_length=2, description="Food name to search"),
    limit: int = Query(10, ge=1, le=25),
):
    """Search USDA Foundation + SR Legacy foods."""
    results = await _usda.search(q, limit=limit)
    return {"products": results, "total": len(results)}


@router.get("/{fdc_id}")
async def get_food(fdc_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetch full nutritional detail for a USDA food by fdcId.

    Nutrient rows are annotated with ingredient_id FKs where a canonical
    ingredient match exists, enabling mobile deep-dive navigation.

    bio_domains is populated via the Tier-2 weight matrix so the Clinical
    Intelligence Report shows health domain bars for whole foods.
    """
    food = await _usda.get_food(fdc_id)
    if not food:
        raise HTTPException(status_code=404, detail="Food not found in USDA database")

    # Annotate nutrient rows with ingredient_id where a canonical match exists
    lookup = await _ingredient_lookup(db)
    for nutrient in food.get("ingredients", []):
        if not nutrient.get("ingredient_id"):
            matched = lookup.get(nutrient["name"].lower().strip())
            if matched:
                nutrient["ingredient_id"] = matched

    # Tier-2 biodomain scoring from the nutrition panel
    from app.services.biodomain_scorer import score_nutrient_rows
    from app.schemas.product import MobileIngredient

    nutrient_items = [
        MobileIngredient(**n) for n in food.get("ingredients", [])
        if n.get("is_nutrient")
    ]
    tier2_scores = score_nutrient_rows(nutrient_items)
    food["bio_domains"] = [
        {
            "name": s.name,
            "value": s.display_value,
            "is_negative": s.is_negative,
        }
        for s in sorted(tier2_scores, key=lambda d: d.display_value, reverse=True)
    ]

    return food
