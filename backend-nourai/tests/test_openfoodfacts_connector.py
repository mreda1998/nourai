from app.models.product import ProductCategory
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsRecord


def test_openfoodfacts_record_maps_product_and_authentic_images():
    record = OpenFoodFactsRecord(
        barcode="4006381333931",
        request_url="https://example.test/product",
        schema_version="3.6",
        product={
            "product_name_en": "Example supplement",
            "brands": "Example Labs",
            "categories_tags": ["en:dietary-supplements"],
            "ingredients_text_en": "Vitamin C, Zinc",
            "selected_images": {
                "front": {"display": {"en": "https://images.example/front.jpg"}},
                "ingredients": {
                    "display": {"en": "https://images.example/ingredients.jpg"}
                },
            },
        },
    )

    assert record.name == "Example supplement"
    assert record.category == ProductCategory.SUPPLEMENT
    assert record.ingredient_statement == "Vitamin C, Zinc"
    assert [(image.asset_type, image.language) for image in record.images] == [
        ("front", "en"),
        ("ingredients", "en"),
    ]


def test_openfoodfacts_normalized_payload_includes_structured_ingredients():
    ingredients = [{"text": "Water"}]
    record = OpenFoodFactsRecord(
        barcode="12345670",
        request_url="https://example.test/product",
        schema_version="3.6",
        product={"product_name": "Example", "ingredients": ingredients},
    )
    assert record.normalized_payload()["ingredients"] == ingredients



# ─── API v3.6 nutrition (nutriments moved into nutrition.aggregated_set) ─────

def _v36_record(**product):
    nutrition = {
        "aggregated_set": {
            "per": "100g",
            "preparation": "as_sold",
            "nutrients": {
                "energy-kcal": {"value": 539, "unit": "kcal", "source": "manufacturer"},
                "sugars": {"value": 56.3, "unit": "g", "source": "manufacturer"},
                "sodium": {"value": 42.8, "unit": "mg", "source": "packaging"},
                "vitamin-d": {"value": 5, "unit": "µg", "source": "packaging"},
                "alcohol": {"value": 0, "unit": "% vol", "source": "estimate"},
                "fiber": {"value": 3.1, "unit": "g", "source": "estimate", "modifier": "~"},
            },
        },
        "input_sets": [
            {"per": "100g", "per_quantity": 100, "per_unit": "g", "source": "manufacturer", "preparation": "as_sold",
             "nutrients": {"sugars": {"value": 56.3, "unit": "g"}}},
            {"per": "serving", "per_quantity": 15, "per_unit": "g", "source": "manufacturer", "preparation": "as_sold",
             "nutrients": {"sugars": {"value": 8.4, "unit": "g"}, "sodium": {"value": 6.4, "unit": "mg"},
                           "energy-kcal": {"value": 81, "unit": "kcal"}}},
        ],
    }
    return OpenFoodFactsRecord(
        barcode="3017620422003", request_url="https://example.test/product", schema_version="3.6",
        product={"product_name": "Nutella", "nutriments": {}, "nutrition": nutrition, **product},
    )


def test_v36_nutrition_becomes_classic_nutriments_in_grams():
    nutriments = _v36_record().normalized_payload()["nutriments"]
    assert nutriments["energy-kcal_100g"] == 539
    assert nutriments["sugars_100g"] == 56.3
    assert nutriments["sodium_100g"] == 0.0428
    assert nutriments["vitamin-d_100g"] == 0.000005


def test_v36_estimates_are_not_treated_as_label_values():
    nutriments = _v36_record().normalized_payload()["nutriments"]
    assert "fiber_100g" not in nutriments
    assert "alcohol_100g" not in nutriments


def test_v36_per_serving_set_adds_serving_values_and_quantity():
    payload = _v36_record().normalized_payload()
    assert payload["nutriments"]["sugars_serving"] == 8.4
    assert payload["nutriments"]["sodium_serving"] == 0.0064
    assert payload["serving_quantity"] == 15


def test_classic_nutriments_are_kept_when_present():
    record = _v36_record(nutriments={"sugars_100g": 50.0}, serving_quantity="30")
    payload = record.normalized_payload()
    assert payload["nutriments"] == {"sugars_100g": 50.0}
    assert payload["serving_quantity"] == 30


def test_a_serving_set_that_copies_the_per_100_values_is_ignored():
    record = _v36_record()
    serving = record.product["nutrition"]["input_sets"][1]
    serving["per_quantity"] = 330
    serving["nutrients"] = {"sugars": {"value": 56.3, "unit": "g"}, "energy-kcal": {"value": 539, "unit": "kcal"}}
    payload = record.normalized_payload()
    assert not any(key.endswith("_serving") for key in payload["nutriments"])
    assert payload["serving_quantity"] == 330  # the panel scales per-100 g values instead


def test_normalized_payload_keeps_additives_tags():
    record = OpenFoodFactsRecord(
        barcode="3017620422003",
        request_url="https://example.test/product",
        schema_version="3.6",
        product={"product_name": "Candy", "additives_tags": ["en:e171", "en:e102"]},
    )
    assert record.normalized_payload()["additives_tags"] == ["en:e171", "en:e102"]
