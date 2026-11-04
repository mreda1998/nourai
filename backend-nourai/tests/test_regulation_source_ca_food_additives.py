"""Health Canada's Lists of Permitted Food Additives become Canadian food-additive rules."""
from pathlib import Path

from app.services.regulation.sources.ca_permitted_food_additives import SOURCE

RAW = (Path(__file__).parent / "fixtures" / "regulation" / "ca-permitted-food-additives.json").read_bytes()


def _rules(parsed):
    names = {s.key: s.name for s in parsed.substances}
    return {names[r.substance_key]: r for r in parsed.rules}


def test_list_semantics():
    parsed = SOURCE.parse(RAW)
    assert (parsed.place, parsed.applies_to, parsed.semantics) == ("CA", "food_additive", "positive")


def test_erythrosine_permitted_with_limits():
    rule = _rules(SOURCE.parse(RAW))["Erythrosine"]
    assert rule.status == "allowed_with_limits" and rule.place == "CA"
    assert rule.legal_reference == "List of Permitted Food Colours (Health Canada), item E.1"
    assert rule.source_url.endswith("/lists-permitted/3-colouring-agents.html")
    assert rule.condition.startswith("Permitted in")


def test_aspartame_from_the_sweeteners_list():
    rule = _rules(SOURCE.parse(RAW))["Aspartame"]
    assert rule.legal_reference == "List of Permitted Sweeteners (Health Canada), item A.3"


def test_footnote_markers_and_rows_are_dropped():
    names = {s.name for s in SOURCE.parse(RAW).substances}
    assert "Erythrosine" in names
    assert not any("Footnote" in n or n.startswith("*") for n in names)


def test_entries_with_many_uses_point_to_the_list():
    rule = _rules(SOURCE.parse(RAW))["Potassium Aluminum Silicate-Based Titanium Dioxide"]
    assert rule.condition == "Permitted in 4 listed foods or uses, with maximum levels in the official list"
