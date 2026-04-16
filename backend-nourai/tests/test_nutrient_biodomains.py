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


def test_direction_values_are_valid():
    valid_directions = {"benefit", "harm"}
    for nutrient, impacts in NUTRIENT_BIODOMAIN_WEIGHTS.items():
        for impact in impacts:
            assert impact.direction in valid_directions, (
                f"{nutrient}.{impact.biodomain} has invalid direction '{impact.direction}'"
            )


def test_confidence_values_are_valid():
    valid_confidence = {"high", "moderate", "low"}
    for nutrient, impacts in NUTRIENT_BIODOMAIN_WEIGHTS.items():
        for impact in impacts:
            assert impact.confidence in valid_confidence, (
                f"{nutrient}.{impact.biodomain} has invalid confidence '{impact.confidence}'"
            )


def test_no_duplicate_biodomain_per_nutrient():
    for nutrient, impacts in NUTRIENT_BIODOMAIN_WEIGHTS.items():
        seen = set()
        for impact in impacts:
            key = impact.biodomain
            assert key not in seen, (
                f"{nutrient} has duplicate biodomain entry '{key}'"
            )
            seen.add(key)


from app.services.biodomain_scorer import score_nutrient_rows, merge_domain_scores, ProductDomainScore
from app.schemas.product import MobileIngredient


def _make_nutrient(name: str, concentration: str = "10 g") -> MobileIngredient:
    return MobileIngredient(name=name, concentration=concentration, is_nutrient=True)


def test_score_nutrient_rows_protein_gives_body_composition():
    rows = [_make_nutrient("Protein", "25 g (50% DV)")]
    scores = score_nutrient_rows(rows)
    keys = {s.biodomain for s in scores}
    assert "body_composition" in keys
    body = next(s for s in scores if s.biodomain == "body_composition")
    assert body.display_value > 0
    assert not body.is_negative


def test_score_nutrient_rows_sodium_gives_cardiovascular_harm():
    rows = [_make_nutrient("Sodium", "800 mg (35% DV)")]
    scores = score_nutrient_rows(rows)
    cardio = next((s for s in scores if s.biodomain == "cardiovascular"), None)
    assert cardio is not None
    assert cardio.is_negative


def test_score_nutrient_rows_skips_non_nutrient_rows():
    rows = [MobileIngredient(name="Water", concentration=None, is_nutrient=False)]
    scores = score_nutrient_rows(rows)
    assert scores == []


def test_score_nutrient_rows_empty_list():
    assert score_nutrient_rows([]) == []


def test_merge_domain_scores_tier1_wins():
    tier1 = [ProductDomainScore(
        biodomain="cardiovascular", name="Cardiovascular",
        raw_score=0.8, display_value=64.0, is_negative=False,
    )]
    tier2 = [ProductDomainScore(
        biodomain="cardiovascular", name="Cardiovascular",
        raw_score=0.3, display_value=24.0, is_negative=False,
    )]
    merged = merge_domain_scores(tier1, tier2)
    assert len(merged) == 1
    assert merged[0].display_value == 64.0  # Tier-1 value preserved


def test_merge_domain_scores_tier2_fills_gaps():
    tier1 = [ProductDomainScore(
        biodomain="cardiovascular", name="Cardiovascular",
        raw_score=0.8, display_value=64.0, is_negative=False,
    )]
    tier2 = [
        ProductDomainScore(
            biodomain="cardiovascular", name="Cardiovascular",
            raw_score=0.3, display_value=24.0, is_negative=False,
        ),
        ProductDomainScore(
            biodomain="bone_joint", name="Bone & Joint",
            raw_score=0.7, display_value=56.0, is_negative=False,
        ),
    ]
    merged = merge_domain_scores(tier1, tier2)
    assert len(merged) == 2
    domains = {s.biodomain for s in merged}
    assert "cardiovascular" in domains
    assert "bone_joint" in domains
