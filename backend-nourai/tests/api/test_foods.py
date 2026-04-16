import pytest
from unittest.mock import AsyncMock, patch, MagicMock

MOCK_USDA_FOOD = {
    "id": "usda-748967",
    "barcode": None,
    "name": "Eggs, Grade A, Large, Egg Whole",
    "brand": None,
    "category": "food",
    "description": "Source: USDA FoodData Central · Foundation.",
    "image_url": None,
    "grade": "A",
    "tags": ["Foundation"],
    "has_allergen_warning": False,
    "allergen_warning": None,
    "is_ai_generated": False,
    "ingredients": [
        {"name": "Calories",  "concentration": "143 kcal", "is_nutrient": True, "ingredient_id": None},
        {"name": "Protein",   "concentration": "13 g (26% DV)", "is_nutrient": True, "ingredient_id": None},
        {"name": "Total Fat", "concentration": "10 g (13% DV)", "is_nutrient": True, "ingredient_id": None},
        {"name": "Sodium",    "concentration": "142 mg (6% DV)", "is_nutrient": True, "ingredient_id": None},
        {"name": "Vitamin D", "concentration": "2.0 µg (10% DV)", "is_nutrient": True, "ingredient_id": None},
    ],
    "bio_domains": [],
    "recommendations": [],
    "citations": [],
}


def _food_patches(mock_food):
    """Return context managers that patch both the USDA service and DB lookup."""
    return [
        patch(
            "app.api.v1.foods._usda.get_food",
            new_callable=AsyncMock,
            return_value=mock_food,
        ),
        patch(
            "app.api.v1.foods._ingredient_lookup",
            new_callable=AsyncMock,
            return_value={},
        ),
    ]


@pytest.mark.anyio
async def test_get_food_returns_bio_domains(client):
    # Use a fresh copy so mutations across tests don't interfere
    food = {**MOCK_USDA_FOOD, "ingredients": list(MOCK_USDA_FOOD["ingredients"]), "bio_domains": []}
    with patch("app.api.v1.foods._usda.get_food", new_callable=AsyncMock, return_value=food), \
         patch("app.api.v1.foods._ingredient_lookup", new_callable=AsyncMock, return_value={}):
        response = await client.get("/api/v1/foods/748967")

    assert response.status_code == 200
    data = response.json()
    assert "bio_domains" in data
    assert len(data["bio_domains"]) > 0


@pytest.mark.anyio
async def test_get_food_bio_domains_have_required_fields(client):
    food = {**MOCK_USDA_FOOD, "ingredients": list(MOCK_USDA_FOOD["ingredients"]), "bio_domains": []}
    with patch("app.api.v1.foods._usda.get_food", new_callable=AsyncMock, return_value=food), \
         patch("app.api.v1.foods._ingredient_lookup", new_callable=AsyncMock, return_value={}):
        response = await client.get("/api/v1/foods/748967")

    data = response.json()
    for domain in data["bio_domains"]:
        assert "name" in domain
        assert "value" in domain
        assert "is_negative" in domain


@pytest.mark.anyio
async def test_get_food_404_when_not_found(client):
    with patch("app.api.v1.foods._usda.get_food", new_callable=AsyncMock, return_value=None), \
         patch("app.api.v1.foods._ingredient_lookup", new_callable=AsyncMock, return_value={}):
        response = await client.get("/api/v1/foods/999999999")

    assert response.status_code == 404
