import pytest

from app.services.ingestion.normalization import (
    canonical_content_hash,
    normalize_gtin,
    normalize_ingredient_alias,
)


@pytest.mark.parametrize(
    ("value", "gtin14"),
    [
        ("12345670", "00000012345670"),
        ("036000291452", "00036000291452"),
        ("4006381333931", "04006381333931"),
    ],
)
def test_normalize_gtin_validates_and_pads(value: str, gtin14: str):
    assert normalize_gtin(value).gtin14 == gtin14


@pytest.mark.parametrize("value", ["4006381333932", "abc", "1234"])
def test_normalize_gtin_rejects_invalid_values(value: str):
    with pytest.raises(ValueError):
        normalize_gtin(value)


def test_alias_normalization_is_conservative_and_stable():
    assert normalize_ingredient_alias("  Vitamin   C† ") == "vitamin c"
    assert normalize_ingredient_alias("L_Ascorbic Acid") == "l ascorbic acid"


def test_content_hash_is_independent_of_mapping_order():
    assert canonical_content_hash({"a": 1, "b": 2}) == canonical_content_hash(
        {"b": 2, "a": 1}
    )

