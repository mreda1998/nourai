"""Fixed vocabularies for rules, and which places count as where a person lives."""
from app.core.regulation import (
    CATEGORY_SCOPES,
    FLAG_STATUSES,
    LAW_STATUSES,
    PLACE_PHRASES,
    STATUS_LABELS,
    normalize_country,
    own_places,
)


def test_category_scopes_exact():
    assert CATEGORY_SCOPES == {
        "food": ("food", "food_additive"),
        "supplement": ("supplement", "food_additive", "sport"),
        "cosmetic": ("cosmetic",),
        "otc": ("medicine", "cosmetic"),
    }


def test_flag_statuses_are_law_statuses_in_severity_order():
    assert FLAG_STATUSES == ("banned", "not_authorised", "prescription_only", "warning_label")
    assert set(FLAG_STATUSES) <= set(LAW_STATUSES)
    assert set(STATUS_LABELS) == set(LAW_STATUSES)
    assert STATUS_LABELS["warning_label"] == "Warning label required"


def test_place_phrases():
    assert PLACE_PHRASES["EU"] == "the EU"
    assert PLACE_PHRASES["GB"] == "the UK"
    assert PLACE_PHRASES["CA"] == "Canada"
    assert PLACE_PHRASES["WADA"] == "sport (WADA)"


def test_country_resolution_edge_cases():
    assert normalize_country("fr") == "FR"
    assert normalize_country(" us ") == "US"
    assert normalize_country("") == "CA"
    assert normalize_country("zzz") == "CA"
    assert normalize_country(None) == "CA"
    assert own_places("ES") == ("ES", "EU")
    assert own_places("FR") == ("FR", "EU")
    assert own_places("JP") == ()
    assert own_places("US") == ("US", "US-CA")
    assert own_places("GB") == ("GB",)
    assert own_places("CA") == ("CA",)
