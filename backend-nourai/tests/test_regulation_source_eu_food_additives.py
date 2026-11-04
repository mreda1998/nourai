"""The EU Union list of food additives becomes food-additive rules, plus the Annex V colour warnings."""
from pathlib import Path

from app.services.regulation.sources.eu_food_additives import SOURCE

RAW = (Path(__file__).parent / "fixtures" / "regulation" / "eu-food-additives.json").read_bytes()


def _rules(parsed, e_number):
    return {r.status: r for r in parsed.rules if r.substance_key == e_number}


def test_list_semantics():
    parsed = SOURCE.parse(RAW)
    assert (parsed.place, parsed.applies_to, parsed.semantics) == ("EU", "food_additive", "positive")
    assert parsed.legal_reference == "Regulation (EC) No 1333/2008, Article 4(1)"
    assert parsed.legal_basis_quote.startswith("Only food additives included in the Union list")
    assert {s.key for s in parsed.substances} == {"E102", "E127", "E171", "E1520"}  # groups are not substances


def test_tartrazine_permitted_and_needs_warning_label():
    rules = _rules(SOURCE.parse(RAW), "E102")
    assert set(rules) == {"allowed_with_limits", "warning_label"}
    assert "Group III" in rules["allowed_with_limits"].condition
    warning = rules["warning_label"]
    assert "may have an adverse effect on activity and attention in children" in warning.condition
    assert warning.legal_reference == "Regulation (EC) No 1333/2008, Article 24 and Annex V"


def test_erythrosine_only_cocktail_cherries():
    rule = _rules(SOURCE.parse(RAW), "E127")["allowed_with_limits"]
    assert rule.condition == (
        "Canned or bottled fruit and vegetables (4.2.3): up to 200 mg/kg, only cocktail cherries and "
        "candied cherries; up to 150 mg/kg, only bigareaux cherries in syrup and in cocktails"
    )
    assert rule.source_url.startswith("https://ec.europa.eu/food/food-feed-portal/screen/food-additives/search/details/")


def test_titanium_dioxide_not_authorised():
    rules = _rules(SOURCE.parse(RAW), "E171")
    assert set(rules) == {"not_authorised"}
    rule = rules["not_authorised"]
    assert "Titanium dioxide is not authorised" in rule.condition
    assert rule.legal_reference == "Regulation (EC) No 1333/2008, Annex II (as amended by Regulation (EU) 2022/63)"


def test_entry_without_own_food_categories_is_not_called_unauthorised():
    # Propylene glycol is authorised (as a carrier, Annex III) though it lists no food categories of its own.
    rules = _rules(SOURCE.parse(RAW), "E1520")
    assert set(rules) == {"allowed_with_limits"}
    assert "Annex III" in rules["allowed_with_limits"].condition
