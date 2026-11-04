"""The golden-set check reports every expected rule or product note that the data does not produce."""
from datetime import date, datetime, timezone

from app.services.regulation.golden import check_entry
from app.services.regulation.rules import RuleFact

TODAY = date(2026, 11, 4)


def _fact(place, status, scope, effective_from=None):
    return RuleFact(id="r", substance_id="s", place=place, authority="A", kind="law", status=status,
                    classification=None, applies_to=scope, sub_scope=None, condition=None,
                    effective_from=effective_from, effective_until=None, legal_reference=None,
                    source_url="https://example.gov", last_checked_at=datetime(2026, 11, 1, tzinfo=timezone.utc), why=None)


ENTRY = {
    "substance": "Erythrosine", "e_number": "E127",
    "expect": [{"place": "US", "applies_to": "food_additive", "status": "banned", "effective_from": "2027-01-15",
                "source_url": "https://x", "quote": ""}],
    "product_note": {"category": "food", "country": "US", "text": "Banned in the US from 15 Jan 2027"},
}


def test_matching_data_passes():
    assert check_entry([_fact("US", "banned", "food_additive", date(2027, 1, 15))], ENTRY, TODAY) == []


def test_missing_rule_and_wrong_note_reported():
    problems = check_entry([_fact("US", "allowed_with_limits", "food_additive")], ENTRY, TODAY)
    assert any("US food_additive banned" in p for p in problems)
    assert any("product note" in p for p in problems)


def test_expected_absence_of_a_note():
    entry = {**ENTRY, "expect": [], "product_note": {"category": "cosmetic", "country": "FR", "text": None}}
    assert check_entry([_fact("EU", "allowed_with_limits", "cosmetic")], entry, TODAY) == []
    assert check_entry([_fact("EU", "banned", "cosmetic")], entry, TODAY)
