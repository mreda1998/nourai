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

