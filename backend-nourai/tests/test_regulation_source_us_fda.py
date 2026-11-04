"""FDA colour additive status, Substances Added to Food and 21 CFR 700 become US rules."""
from datetime import date
from pathlib import Path

from app.services.regulation.sources.us_fda_colour_additives import SOURCE as COLOURS
from app.services.regulation.sources.us_fda_cosmetics import SOURCE as COSMETICS
from app.services.regulation.sources.us_fda_food_substances import SOURCE as FOOD

FIXTURES = Path(__file__).parent / "fixtures" / "regulation"


def _raw(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _rules(parsed, key, scope=None):
    return [r for r in parsed.rules if r.substance_key == key and (scope is None or r.applies_to == scope)]


def test_titanium_dioxide_colour_limits():
    parsed = COLOURS.parse(_raw("us-fda-colour-additives.csv"))
    tio2 = next(s for s in parsed.substances if s.name == "Titanium Dioxide")
    assert tio2.e_number == "E171" and tio2.cas == "13463-67-7"
    # Matched by E-number only: the FDA's colour names ("Turmeric") must not capture the spice on a label.
    assert tio2.name_is_alias is False
    assert tio2.aliases == [] and ("C.I. 77891", "name", "") in tio2.group_aliases
    [food] = _rules(parsed, tio2.key, "food_additive")
    assert food.status == "allowed_with_limits"
    assert "Foods generally, NTE 1 percent (by wt.)" in food.condition
    assert food.legal_reference == "21 CFR 73.575"
    [cosmetic] = _rules(parsed, tio2.key, "cosmetic")
    assert cosmetic.status == "allowed_with_limits" and cosmetic.legal_reference == "21 CFR 73.2575"


def test_red_3_food_ban_from_2027():
    parsed = COLOURS.parse(_raw("us-fda-colour-additives.csv"))
    red3 = next(s for s in parsed.substances if s.name == "FD&C Red No. 3")
    food = {r.status: r for r in _rules(parsed, red3.key, "food_additive")}
    assert food["banned"].effective_from == date(2027, 1, 15)
    assert food["allowed_with_limits"].effective_until == date(2027, 1, 14)
    [cosmetic] = _rules(parsed, red3.key, "cosmetic")
    assert cosmetic.status == "not_authorised"  # formerly cosmetics


def test_orange_b_revocation_in_the_past():
    parsed = COLOURS.parse(_raw("us-fda-colour-additives.csv"))
    orange = next(s for s in parsed.substances if s.name == "Orange B")
    food = {r.status: r for r in _rules(parsed, orange.key, "food_additive")}
    assert food["banned"].effective_from == date(2026, 9, 8)


def test_delisted_colour_not_authorised():
    parsed = COLOURS.parse(_raw("us-fda-colour-additives.csv"))
    alkanet = next(s for s in parsed.substances if s.name == "Alkanet (Alkanna)")
    [food] = _rules(parsed, alkanet.key, "food_additive")
    assert food.status == "not_authorised"
    assert food.condition.startswith("Delisted")


def test_food_substances_prohibited_and_permitted():
    parsed = FOOD.parse(_raw("us-fda-food-substances.csv"))
    names = {s.key: s.name for s in parsed.substances}
    by_name = {names[r.substance_key]: r for r in parsed.rules}
    assert by_name["Cyclamate"].status == "banned"
    assert by_name["Cyclamate"].legal_reference == "21 CFR 189.135"
    assert by_name["Cyclamate"].applies_to == "food"
    bromate = by_name["Potassium bromate"]
    assert bromate.status == "allowed_with_limits" and bromate.applies_to == "food_additive"
    assert bromate.legal_reference == "21 CFR 172.730"
    paraben = by_name["Propyl p-hydroxybenzoate"]
    assert paraben.legal_reference == "21 CFR 172.515, 184.1670"
    assert "Titanium dioxide" not in by_name  # colour and food-contact only: the colour list covers it


def test_cfr_700_mercury_banned():
    parsed = COSMETICS.parse(_raw("us-fda-cosmetics.xml"))
    mercury = next(r for r in parsed.rules if r.row_ref == "21 CFR 700.13")
    assert mercury.status == "banned" and mercury.applies_to == "cosmetic" and mercury.place == "US"
    assert "65 parts per million" in mercury.condition
    assert mercury.source_url == "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-G/part-700/section-700.13"
    assert {r.row_ref for r in parsed.rules} >= {"21 CFR 700.11", "21 CFR 700.18", "21 CFR 700.19"}


def test_colour_names_are_unescaped():
    raw = _raw("us-fda-colour-additives.csv").replace(b"Orange B", b"&beta;-Carotene")
    names = {s.name for s in COLOURS.parse(raw).substances}
    assert "β-Carotene" in names
