"""Measures: label values placed against cited references (nutrients, doses, contaminants)."""
from types import SimpleNamespace

import pytest

from app.services.measures import (
    build_additives_summary,
    build_contaminant_measure,
    build_dose_measure,
    build_nutrition_panel,
    build_processing,
    convert_amount,
    parse_quantity,
    parse_range,
)


# ─── Parsing ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("text, expected", [
    ("330mg DHA", (330.0, "mg")),
    ("2000 IU", (2000.0, "iu")),
    ("8mcg methylcobalamin", (8.0, "mcg")),
    ("1,000 mg", (1000.0, "mg")),
    ("1.5 g", (1.5, "g")),
    ("500 µg", (500.0, "mcg")),
    ("10 billion CFU", (10e9, "cfu")),
    ("5%", (5.0, "%")),
])
def test_parse_quantity_reads_leading_amount_and_unit(text, expected):
    assert parse_quantity(text) == expected


@pytest.mark.parametrize("text", ["trace", "", None, "as needed"])
def test_parse_quantity_returns_none_without_an_amount(text):
    assert parse_quantity(text) is None


@pytest.mark.parametrize("text, expected", [
    ("300–600mg standardised extract daily", (300.0, 600.0, "mg")),
    ("1,000–5,000 IU daily", (1000.0, 5000.0, "iu")),
    ("3–5g daily (no loading required)", (3.0, 5.0, "g")),
    ("1–4g EPA+DHA daily", (1.0, 4.0, "g")),
    ("0.5–5mg taken 30–60min before target sleep time", (0.5, 5.0, "mg")),
    ("1–50 billion CFU daily", (1e9, 50e9, "cfu")),
    ("2–10% topical", (2.0, 10.0, "%")),
])
def test_parse_range_reads_low_high_and_unit(text, expected):
    assert parse_range(text) == expected


def test_parse_range_rejects_body_weight_doses():
    assert parse_range("ADI: 5mg/kg body weight") is None


def test_convert_amount_handles_mass_prefixes():
    assert convert_amount(1, "g", "mg") == 1000
    assert convert_amount(500, "mcg", "mg") == 0.5


def test_convert_amount_only_converts_iu_for_vitamin_d():
    assert convert_amount(2000, "iu", "mcg", nutrient="vitamin_d") == 50
    assert convert_amount(2000, "iu", "mcg") is None
    assert convert_amount(5, "mg", "cfu") is None


# ─── Nutrition panel ──────────────────────────────────────────────────────────

def _measure(panel, key):
    return next(m for m in panel.measures if m.key == key)


def test_nutrition_uses_per_serving_values_when_the_label_has_them():
    panel = build_nutrition_panel(
        {"sugars_serving": 19, "sugars_100g": 42, "sodium_serving": 0.24},
        serving_quantity=45, serving_size="1 bar (45 g)",
    )
    assert panel.basis == "serving"
    assert panel.serving_label == "1 bar (45 g)"
    assert _measure(panel, "sugars").value == 19


def test_nutrition_scales_100g_values_to_a_known_serving():
    panel = build_nutrition_panel({"sugars_100g": 40}, serving_quantity=50, serving_size=None)
    assert panel.basis == "serving"
    assert panel.serving_label == "50 g"
    assert _measure(panel, "sugars").value == 20


def test_nutrition_falls_back_to_per_100g_and_says_so():
    panel = build_nutrition_panel({"sugars_100g": 12}, serving_quantity=None, serving_size=None)
    assert panel.basis == "100g"
    assert panel.serving_label == "100 g"
    assert "per 100 g" in _measure(panel, "sugars").sentence


def test_sodium_is_converted_to_mg_and_banded_by_the_fda_5_20_rule():
    sodium = _measure(build_nutrition_panel({"sodium_serving": 0.24}, None, None), "sodium")
    assert (sodium.value, sodium.unit) == (240, "mg")
    assert sodium.kind == "limit"
    assert sodium.percent == 10
    assert sodium.band == "moderate"
    assert sodium.verdict == "Moderate sodium"
    assert "10% of the FDA Daily Value" in sodium.sentence


def test_total_sugar_uses_the_eu_reference_intake_not_the_added_sugar_dv():
    sugar = _measure(build_nutrition_panel({"sugars_serving": 19}, None, None), "sugars")
    assert sugar.scale.max == 90
    assert sugar.percent == 21
    assert sugar.band == "high"
    assert sugar.tone == "weak"
    assert any("EU" in s.name for s in sugar.sources)


def test_added_sugar_uses_the_fda_daily_value():
    added = _measure(build_nutrition_panel({"added-sugars_serving": 5}, None, None), "added-sugars")
    assert added.scale.max == 50
    assert added.percent == 10


def test_protein_is_a_goal_so_more_is_good():
    protein = _measure(build_nutrition_panel({"proteins_serving": 20}, None, None), "proteins")
    assert protein.kind == "goal"
    assert protein.band == "high_source"
    assert protein.tone == "good"
    assert protein.verdict == "High in protein"


def test_fibre_between_10_and_20_percent_is_a_good_source():
    fibre = _measure(build_nutrition_panel({"fiber_serving": 3}, None, None), "fiber")
    assert fibre.band == "good_source"
    assert fibre.verdict == "Good source of fibre"


def test_calories_are_a_neutral_reference():
    kcal = _measure(build_nutrition_panel({"energy-kcal_serving": 180}, None, None), "energy-kcal")
    assert kcal.kind == "reference"
    assert kcal.tone == "neutral"
    assert kcal.percent == 9


def test_values_over_the_reference_clamp_the_position_but_keep_the_percent():
    sodium = _measure(build_nutrition_panel({"sodium_serving": 3}, None, None), "sodium")
    assert sodium.percent == 130
    assert sodium.position == 1.0


def test_limits_come_before_goals_before_references():
    panel = build_nutrition_panel(
        {"energy-kcal_serving": 180, "proteins_serving": 4, "sugars_serving": 19}, None, None,
    )
    assert [m.key for m in panel.measures] == ["sugars", "proteins", "energy-kcal"]


def test_nutrition_without_values_returns_none():
    assert build_nutrition_panel({}, None, None) is None
    assert build_nutrition_panel({"unknown_100g": 3}, None, None) is None


# ─── Doses ────────────────────────────────────────────────────────────────────

def test_vitamin_d_in_iu_is_compared_to_dv_and_ul_in_the_label_unit():
    d = build_dose_measure("Vitamin D3", "2000 IU", canonical_name="Vitamin D3")
    assert (d.value, d.unit) == (2000, "IU")
    assert d.kind == "dose"
    assert d.band == "in_range"
    assert d.verdict == "Meets the daily value"
    assert [t.value for t in d.scale.ticks] == [0, 800, 4000]
    assert [z.tone for z in d.scale.zones] == ["neutral", "good", "weak"]


def test_dose_below_the_daily_value_reports_its_percent():
    mg = build_dose_measure("Magnesium Glycinate", "30mg")
    assert mg.band == "under"
    assert mg.percent == 7
    assert mg.verdict == "7% of the daily value"


def test_supplemental_magnesium_above_350mg_is_over_the_upper_limit():
    mg = build_dose_measure("Magnesium Glycinate", "500mg")
    assert mg.band == "over_ul"
    assert mg.tone == "weak"
    assert mg.verdict == "Above the upper limit"
    assert [z.tone for z in mg.scale.zones] == ["neutral", "weak"]


def test_nutrient_without_an_upper_limit_has_no_ceiling_zone():
    b12 = build_dose_measure("Vitamin B12", "8mcg methylcobalamin")
    assert b12.band == "in_range"
    assert b12.percent == 333
    assert [z.tone for z in b12.scale.zones] == ["neutral", "good"]


def test_actives_use_the_studied_range_from_the_research_library():
    omega = build_dose_measure("Omega-3 Fatty Acids", "330mg DHA", typical_dose_range="1–4g EPA+DHA daily")
    assert omega.band == "under"
    assert omega.verdict == "Below the studied range"
    assert [t.value for t in omega.scale.ticks] == [0, 1000, 4000]


def test_dose_inside_the_studied_range():
    mel = build_dose_measure("Melatonin", "5mg", typical_dose_range="0.5–5mg taken 30–60min before target sleep time")
    assert mel.band == "in_range"
    assert mel.verdict == "Within the studied range"


def test_dose_above_the_studied_range():
    creatine = build_dose_measure("Creatine Monohydrate", "10 g", typical_dose_range="3–5g daily")
    assert creatine.band == "over"
    assert creatine.tone == "moderate"


def test_topical_percent_falls_through_to_the_studied_range():
    vit_c = build_dose_measure("Vitamin C", "15%", typical_dose_range="5–20% topical")
    assert vit_c.band == "in_range"
    assert vit_c.unit == "%"


def test_vitamin_a_in_iu_has_no_bar_because_the_conversion_depends_on_form():
    assert build_dose_measure("Vitamin A", "5000 IU") is None


def test_unparseable_or_unreferenced_doses_have_no_bar():
    assert build_dose_measure("Sucralose", "trace") is None
    assert build_dose_measure("Mystery Blend", "500mg") is None


# ─── Contaminants ─────────────────────────────────────────────────────────────

def _lab(**overrides):
    base = dict(
        analyte="Lead", value=0.5, unit="µg/kg", detection_status="quantified",
        threshold_value=10, threshold_unit="µg/kg", threshold_name="EU maximum",
        threshold_source_url="https://example.org/eu",
    )
    return build_contaminant_measure(**{**base, **overrides})


def test_contaminant_below_its_regulatory_limit():
    m = _lab()
    assert m.kind == "contaminant"
    assert m.band == "below_limit"
    assert m.percent == 5
    assert m.panel_label == "Measured vs EU maximum"


def test_contaminant_above_its_regulatory_limit():
    assert _lab(value=12).band == "above_limit"


def test_contaminant_units_are_converted_to_the_threshold_unit():
    m = _lab(value=0.005, unit="mg/kg")
    assert (m.value, m.unit) == (5, "µg/kg")


def test_not_detected_sits_at_zero():
    m = _lab(value=None, detection_status="not_detected")
    assert m.value == 0
    assert m.verdict == "Not detected"


def test_contaminant_without_a_threshold_has_no_bar():
    assert _lab(threshold_value=None) is None
    assert _lab(threshold_unit="ppm", unit="cfu/g") is None


# ─── Processing & additives ───────────────────────────────────────────────────

def test_processing_maps_nova_groups():
    assert build_processing({"nova_group": 4}).label == "Ultra-processed"
    assert build_processing({"nova_group": 4}).position == 1.0
    assert build_processing({"nova_group": "1"}).position == 0.0
    assert build_processing({"nova_group": 1}).tone == "good"


@pytest.mark.parametrize("extra", [None, {}, {"nova_group": 7}, {"nova_group": "x"}])
def test_processing_without_a_valid_nova_group_is_none(extra):
    assert build_processing(extra) is None


def _row(name, status, matched=True, category="additive", note=None, ing_id=None):
    ingredient = SimpleNamespace(category=SimpleNamespace(value=category), canonical_name=name) if matched else None
    return SimpleNamespace(
        name=name, status=SimpleNamespace(value=status), note=note,
        ingredient_id=(ing_id or f"id-{name}") if matched else None, ingredient=ingredient,
    )


def test_additives_tier_only_ingredients_matched_to_the_library():
    summary = build_additives_summary([
        _row("Sucralose", "avoid", category="sweetener"),
        _row("Carrageenan", "watch"),
        _row("Oats", "clean", category="other"),
        _row("Unparsed Thing", "watch", matched=False),
    ])
    assert [a.name for a in summary.avoid] == ["Sucralose"]
    assert summary.avoid[0].reason == "Sweetener"
    assert [w.name for w in summary.watch] == ["Carrageenan"]
    assert summary.clean_count == 1
    assert summary.unreviewed_count == 1


def test_additives_dedupe_repeated_matches():
    summary = build_additives_summary([
        _row("Sucralose", "watch", ing_id="x"), _row("Sucralose", "watch", ing_id="x"),
    ])
    assert len(summary.watch) == 1


def test_lab_observation_uses_the_first_interpretation_with_a_threshold():
    from app.services.measures import measure_for_lab_observation

    observation = SimpleNamespace(analyte_name="Lead", value=2.0, unit="µg/kg", detection_status="quantified")
    interpretations = [
        SimpleNamespace(threshold_value=None, threshold_unit=None, threshold_name=None, threshold_source_url=None),
        SimpleNamespace(threshold_value=10, threshold_unit="µg/kg", threshold_name="EU maximum", threshold_source_url=None),
    ]
    measure = measure_for_lab_observation(observation, interpretations)
    assert measure.percent == 20
    assert measure_for_lab_observation(observation, interpretations[:1]) is None


# ─── Servings to the reference & ruler labels ─────────────────────────────────

@pytest.mark.parametrize("sodium_g, note", [
    (1.56, "1½ servings reach the daily sodium limit"),
    (2.3, "1 serving reaches the daily sodium limit"),
    (3.0, "One serving is over the daily sodium limit"),
    (0.46, "5 servings reach the daily sodium limit"),
])
def test_limits_say_how_many_servings_reach_the_reference(sodium_g, note):
    sodium = _measure(build_nutrition_panel({"sodium_serving": sodium_g}, None, None), "sodium")
    assert sodium.servings_note == note


def test_goals_say_how_many_servings_meet_the_goal():
    protein = _measure(build_nutrition_panel({"proteins_serving": 10}, None, None), "proteins")
    assert protein.servings_note == "5 servings meet the daily protein goal"


def test_servings_note_is_skipped_per_100g_for_references_and_when_far_off():
    per_100g = _measure(build_nutrition_panel({"sodium_100g": 1.0}, None, None), "sodium")
    kcal = _measure(build_nutrition_panel({"energy-kcal_serving": 180}, None, None), "energy-kcal")
    tiny = _measure(build_nutrition_panel({"sodium_serving": 0.01}, None, None), "sodium")
    assert per_100g.servings_note is None
    assert kcal.servings_note is None
    assert tiny.servings_note == "Over 20 servings to reach the daily sodium limit"


def test_dose_ruler_labels_the_band_and_the_upper_limit():
    d = build_dose_measure("Vitamin D3", "2000 IU")
    assert d.scale.band_label == "Daily value to upper limit"
    assert d.scale.limit_label == "Upper limit"
    studied = build_dose_measure("Melatonin", "5mg", typical_dose_range="0.5–5mg")
    assert studied.scale.band_label == "Studied range"
    assert studied.scale.limit_label is None
    b12 = build_dose_measure("Vitamin B12", "8mcg")
    assert b12.scale.band_label == "At or above daily value"
    assert b12.scale.limit_label is None


def test_contaminant_ruler_labels_the_threshold():
    assert _lab().scale.limit_label == "EU maximum"
    assert _lab().scale.band_label is None
