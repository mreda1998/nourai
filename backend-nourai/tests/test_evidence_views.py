from app.services.evidence_views import dose_bar, evidence_grid, ladder_level


def test_ladder_order():
    assert ladder_level(has_published_route=True, has_mechanism=True, role="active", function_summary=None) == "reviewed"
    assert ladder_level(has_published_route=False, has_mechanism=True, role="unknown", function_summary=None) == "mechanism"
    assert ladder_level(has_published_route=False, has_mechanism=False, role="functional", function_summary=None) == "function"
    assert ladder_level(has_published_route=False, has_mechanism=False, role="unknown", function_summary="Keeps it mixed") == "function"
    assert ladder_level(has_published_route=False, has_mechanism=False, role="unknown", function_summary=None) == "unidentified"
    assert ladder_level(has_published_route=False, has_mechanism=False, role=None, function_summary=None) == "unidentified"


def test_dose_bar_converts_amount_to_studied_units():
    b = dose_bar(studied_low=3, studied_high=5, studied_unit="g", upper_limit=None, amount="5000", amount_unit="mg")
    assert b.amount_value == 5 and b.unit_label == "g" and b.amount_note is None


def test_dose_bar_unknown_amount():
    b = dose_bar(studied_low=3, studied_high=5, studied_unit="g", upper_limit=None, amount=None, amount_unit=None)
    assert b.amount_value is None and b.amount_note == "Amount on this product unknown"


def test_dose_bar_incomparable_units():
    b = dose_bar(studied_low=100, studied_high=400, studied_unit="mg", upper_limit=None, amount="2", amount_unit="capsules")
    assert b.amount_value is None and b.amount_note == "Units not comparable"


def test_dose_bar_same_non_mass_unit():
    b = dose_bar(studied_low=1000, studied_high=4000, studied_unit="IU", upper_limit=None, amount="2000", amount_unit="iu")
    assert b.amount_value == 2000


def test_dose_bar_reads_upper_limit_with_units():
    b = dose_bar(studied_low=100, studied_high=400, studied_unit="mg", upper_limit="≤400 mg/day for adults", amount="200", amount_unit="mg")
    assert b.upper_limit_value == 400


def test_dose_bar_ignores_unparseable_upper_limit():
    b = dose_bar(studied_low=3, studied_high=5, studied_unit="g", upper_limit="not established", amount=None, amount_unit=None)
    assert b.upper_limit_value is None


def test_grid_has_no_totals_and_marks_unreviewed():
    g = evidence_grid([
        ("Creatine", "reviewed", [("body_composition", "supports", "moderate")]),
        ("Glycerin", "function", []),
        ("Caffeine", "mechanism", []),
    ])
    assert g.columns == ["body_composition"]
    assert [r.compound for r in g.rows] == ["Caffeine", "Creatine", "Glycerin"]
    assert g.rows[0].cells["body_composition"] == {"state": "mechanism", "strength": None}
    assert g.rows[1].cells["body_composition"] == {"state": "supports", "strength": "moderate"}
    assert g.rows[2].cells["body_composition"]["state"] == "not_reviewed"
    assert not hasattr(g, "total")


def test_grid_reviewed_compound_without_route_in_a_column_is_not_reviewed_there():
    g = evidence_grid([
        ("Creatine", "reviewed", [("body_composition", "supports", "moderate")]),
        ("Caffeine", "reviewed", [("sleep_recovery", "risk", "limited")]),
    ])
    assert g.columns == ["body_composition", "sleep_recovery"]
    creatine = next(r for r in g.rows if r.compound == "Creatine")
    assert creatine.cells["sleep_recovery"]["state"] == "not_reviewed"


def test_dose_bar_reads_a_unit_written_into_the_amount():
    b = dose_bar(studied_low=3, studied_high=5, studied_unit="g", upper_limit=None, amount="5g", amount_unit=None)
    assert b.amount_value == 5 and b.amount_note is None
    b = dose_bar(studied_low=100, studied_high=400, studied_unit="mg", upper_limit=None, amount="0.2 g", amount_unit=None)
    assert b.amount_value == 200
