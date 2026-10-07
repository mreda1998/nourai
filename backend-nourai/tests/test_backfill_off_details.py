from scripts.backfill_off_details import merge_off_details


def test_merge_adds_nova_serving_and_label_nutrients():
    extra = {"source": "usda", "nutriments": {"sugars_100g": 30, "iron_100g": 0.002}}
    off = {
        "nova_group": 4,
        "serving_quantity": "45",
        "serving_size": "1 bar (45 g)",
        "nutriments": {"sugars_100g": 42, "sugars_serving": 19, "added-sugars_serving": 12, "salt_100g": 1},
    }
    merged = merge_off_details(extra, off)
    assert merged["nova_group"] == 4
    assert merged["serving_quantity"] == 45.0
    assert merged["serving_size"] == "1 bar (45 g)"
    # label values for the measured nutrients replace name-matched USDA guesses
    assert merged["nutriments"]["sugars_100g"] == 42
    assert merged["nutriments"]["sugars_serving"] == 19
    assert merged["nutriments"]["added-sugars_serving"] == 12
    # nutrients we don't measure are left alone and unrelated keys aren't copied
    assert merged["nutriments"]["iron_100g"] == 0.002
    assert "salt_100g" not in merged["nutriments"]
    assert merged["source"] == "usda"
    assert extra["nutriments"]["sugars_100g"] == 30  # input not mutated


def test_merge_ignores_missing_or_invalid_fields():
    merged = merge_off_details({}, {"nova_group": "unknown", "serving_quantity": "", "nutriments": None})
    assert "nova_group" not in merged
    assert "serving_quantity" not in merged
    assert merged.get("nutriments", {}) == {}
