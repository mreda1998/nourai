"""The product detail response carries structured measures next to the legacy fields."""
from types import SimpleNamespace
from uuid import uuid4

from app.models.ingredient import IngredientCategory
from app.models.product import IngredientStatus, ProductCategory
from app.schemas.product import ProductWithDetails


def _ingredient(name, typical=None, category=IngredientCategory.OTHER):
    return SimpleNamespace(
        id=uuid4(), canonical_name=name, category=category, typical_dose_range=typical,
        contraindications=[], biodomain_scores=[],
    )


def _pi(name, amount=None, status=IngredientStatus.CLEAN, ingredient=None):
    return SimpleNamespace(
        name=name, amount=amount, unit=None, status=status, note=None,
        ingredient_id=ingredient.id if ingredient else None, ingredient=ingredient,
    )


def _product(category, rows, extra_data=None, serving_size=None):
    return SimpleNamespace(
        id=uuid4(), barcode="123", name="Test", brand="Brand", category=category, summary=None,
        image_url=None, health_score=70, product_ingredients=rows, claims=[],
        extra_data=extra_data or {}, serving_size=serving_size,
    )


def test_food_gets_nutrition_processing_and_additives():
    sweetener = _ingredient("Sucralose", category=IngredientCategory.SWEETENER)
    product = _product(
        ProductCategory.FOOD,
        [_pi("sucralose", status=IngredientStatus.WATCH, ingredient=sweetener), _pi("Unknown", status=IngredientStatus.WATCH)],
        extra_data={"nutriments": {"sugars_100g": 40, "sodium_100g": 0.5}, "nova_group": 4, "serving_quantity": 50},
        serving_size="1 bar (50 g)",
    )
    out = ProductWithDetails.from_orm_with_details(product)
    assert out.nutrition.basis == "serving"
    assert out.nutrition.serving_label == "1 bar (50 g)"
    assert [m.key for m in out.nutrition.measures] == ["sugars", "sodium"]
    assert out.processing.nova_group == 4
    assert [w.name for w in out.additives.watch] == ["Sucralose"]
    assert out.additives.unreviewed_count == 1
    assert out.doses == []
    # legacy nutrient rows are still present for older app builds
    assert any(i.is_nutrient for i in out.ingredients)


def test_supplement_gets_dose_measures_for_ingredients_with_amounts():
    d3 = _ingredient("Vitamin D3", typical="1,000–5,000 IU daily", category=IngredientCategory.VITAMIN)
    melatonin = _ingredient("Melatonin", typical="0.5–5mg taken 30–60min before sleep")
    product = _product(
        ProductCategory.SUPPLEMENT,
        [_pi("Vitamin D3", "2000 IU", ingredient=d3), _pi("Melatonin", "5mg", ingredient=melatonin), _pi("Gelatin")],
    )
    out = ProductWithDetails.from_orm_with_details(product)
    assert [(d.key, d.band) for d in out.doses] == [("vitamin_d", "in_range"), ("melatonin", "in_range")]
    assert out.doses[0].ingredient_id == str(d3.id)
    assert out.nutrition is None
    assert out.processing is None
