"""Published rules become place rows, a summary line and at most one product note per row."""
from datetime import date, datetime, timezone

from app.core.regulation import CATEGORY_SCOPES
from app.services.regulation.rules import (
    CheckFact,
    RuleFact,
    expert_views,
    glance,
    note_for,
    place_rows,
    summary_line,
)

TODAY = date(2026, 11, 4)
CHECKED = datetime(2026, 11, 1, tzinfo=timezone.utc)
FOOD = CATEGORY_SCOPES["food"]
SUPPLEMENT = CATEGORY_SCOPES["supplement"]
COSMETIC = CATEGORY_SCOPES["cosmetic"]

_counter = iter(range(10_000))


def law(place, status, scope, **kw) -> RuleFact:
    fields = dict(
        id=f"r{next(_counter)}", substance_id="s1", place=place, authority="Authority", kind="law",
        status=status, classification=None, applies_to=scope, sub_scope=None, condition=None,
        effective_from=None, effective_until=None, legal_reference=None,
        source_url="https://example.gov/rule", last_checked_at=CHECKED, why=None,
    )
    fields.update(kw)
    return RuleFact(**fields)


def expert(body, classification) -> RuleFact:
    return law(body, "classification", None, kind="expert_view", classification=classification)


E171 = [
    law("EU", "not_authorised", "food_additive"),
    law("US", "allowed_with_limits", "food_additive"),
    law("CA", "allowed_with_limits", "food_additive"),
]


def test_summary_e171():
    assert summary_line(E171, TODAY) == (
        "Not authorised as a food additive in the EU. Allowed with limits in Canada and the US."
    )


def test_note_e171_candy():
    note = note_for(E171, FOOD, "CA", TODAY)
    assert note.text == "Not authorised as a food additive in the EU"
    assert note.more == 0


def test_note_tartrazine():
    note = note_for([law("EU", "warning_label", "food_additive")], FOOD, "CA", TODAY)
    assert note.text == "Warning label required in the EU"


def test_future_ban_flags_with_date():
    rules = [
        law("US", "banned", "food_additive", effective_from=date(2027, 1, 15)),
        law("US-CA", "banned", "food_additive", effective_from=date(2027, 1, 1)),
    ]
    note = note_for(rules, FOOD, "US", TODAY)
    assert note.text == "Banned in the US from 15 Jan 2027"
    assert note.more == 1


def test_note_melatonin_uk():
    note = note_for([law("GB", "prescription_only", "supplement")], SUPPLEMENT, "CA", TODAY)
    assert note.text == "Prescription only in the UK"


def test_routine_limits_never_flag():
    assert note_for([law("EU", "allowed_with_limits", "cosmetic")], COSMETIC, "FR", TODAY) is None


def test_wada_flags_supplements_only():
    rules = [law("WADA", "banned", "sport")]
    assert note_for(rules, SUPPLEMENT, "CA", TODAY).text == "Banned in sport (WADA)"
    assert note_for(rules, FOOD, "CA", TODAY) is None


def test_own_place_first():
    rules = [law("EU", "warning_label", "food_additive"), law("US", "banned", "food_additive")]
    in_france = note_for(rules, FOOD, "FR", TODAY)
    assert in_france.text == "Warning label required in the EU"
    assert in_france.more == 1
    assert note_for(rules, FOOD, "CA", TODAY).text == "Banned in the US"


def test_expired_rule_not_served():
    rules = [law("EU", "banned", "food_additive", effective_until=date(2025, 1, 1))]
    assert place_rows(rules, [], "FR", TODAY) == []
    assert summary_line(rules, TODAY) is None
    assert note_for(rules, FOOD, "FR", TODAY) is None


def test_eu_member_row_via_eu():
    rows = place_rows([law("EU", "not_authorised", "food_additive")], [], "ES", TODAY)
    assert rows[0].place_name == "Spain"
    assert rows[0].via_place == "EU"
    assert rows[0].is_yours


def test_checked_no_rule_vs_hidden():
    rows = place_rows([law("EU", "banned", "cosmetic")], [CheckFact("CA", "cosmetic", CHECKED)], "CA", TODAY)
    by_place = {row.place: row for row in rows}
    assert by_place["CA"].checked_no_rule
    assert by_place["CA"].is_yours
    assert "US" not in by_place
    assert [row.place for row in rows] == ["CA", "EU"]


def test_expert_views_never_in_summary():
    rules = [expert("IARC", "Group 2B")]
    assert summary_line(rules, TODAY) is None
    assert len(expert_views(rules, TODAY)) == 1
    assert place_rows(rules, [], "CA", TODAY) == []


def test_glance_counts_by_own_places():
    eu_note = note_for(E171, FOOD, "FR", TODAY)
    assert glance([eu_note, eu_note], "FR") == (2, 0)
    assert glance([eu_note], "CA") == (0, 1)
