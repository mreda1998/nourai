import pytest
from app.core.nutrient_biodomains import get_nutrient_impacts, NUTRIENT_BIODOMAIN_WEIGHTS


def test_protein_has_body_composition_benefit():
    impacts = get_nutrient_impacts("Protein")
    keys = {i.biodomain for i in impacts}
    directions = {i.biodomain: i.direction for i in impacts}
    assert "body_composition" in keys
    assert directions["body_composition"] == "benefit"


def test_sodium_has_cardiovascular_harm():
    impacts = get_nutrient_impacts("Sodium")
    assert len(impacts) >= 1
    assert impacts[0].biodomain == "cardiovascular"
    assert impacts[0].direction == "harm"


def test_unknown_nutrient_returns_empty():
    assert get_nutrient_impacts("NonExistentNutrient123") == []


def test_all_biodomains_are_valid():
    """Every biodomain key in the matrix must be one of the 10 canonical keys."""
    from app.core.biodomains import BIODOMAIN_KEYS
    for nutrient, impacts in NUTRIENT_BIODOMAIN_WEIGHTS.items():
        for impact in impacts:
            assert impact.biodomain in BIODOMAIN_KEYS, (
                f"{nutrient} references unknown biodomain '{impact.biodomain}'"
            )


def test_magnitudes_in_range():
    for nutrient, impacts in NUTRIENT_BIODOMAIN_WEIGHTS.items():
        for impact in impacts:
            assert 0.0 <= impact.magnitude <= 1.0, (
                f"{nutrient}.{impact.biodomain} magnitude {impact.magnitude} out of range"
            )
