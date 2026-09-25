"""Daily routine aggregation: local day, actual servings, overlapping products."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.daily_routine import combine_daily_ingredients, local_day_bounds

VIT_C = SimpleNamespace(id=uuid.uuid4(), canonical_name="Vitamin C", biodomain_scores=[])
MAG = SimpleNamespace(id=uuid.uuid4(), canonical_name="Magnesium", biodomain_scores=[])


def _pi(product_id, ingredient, amount=None, unit=None, name=None):
    return SimpleNamespace(
        product_id=product_id, ingredient_id=ingredient.id if ingredient else None,
        ingredient=ingredient, amount=amount, unit=unit, name=name or (ingredient.canonical_name if ingredient else "?"),
    )


# ── Local day ───────────────────────────────────────────────────────────────

def test_day_starts_at_local_midnight():
    now = datetime(2026, 9, 25, 2, 30, tzinfo=timezone.utc)  # 22:30 on the 24th in Toronto
    start, end = local_day_bounds("America/Toronto", now)
    assert start == datetime(2026, 9, 24, 4, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 9, 25, 4, 0, tzinfo=timezone.utc)


def test_unknown_timezone_falls_back_to_utc():
    now = datetime(2026, 9, 25, 2, 30, tzinfo=timezone.utc)
    start, end = local_day_bounds("Not/AZone", now)
    assert start == datetime(2026, 9, 25, tzinfo=timezone.utc)
    assert (end - start).days == 1


# ── Combining use ───────────────────────────────────────────────────────────

def test_servings_multiply_the_amount():
    a = uuid.uuid4()
    rows = combine_daily_ingredients({a: 2.0}, [_pi(a, VIT_C, "250", "mg")])
    assert len(rows) == 1 and float(rows[0].amount) == 500 and rows[0].unit == "mg"


def test_same_ingredient_across_products_becomes_one_daily_total():
    a, b = uuid.uuid4(), uuid.uuid4()
    rows = combine_daily_ingredients(
        {a: 1.0, b: 1.0},
        [_pi(a, VIT_C, "250", "mg"), _pi(b, VIT_C, "0.5", "g")],
    )
    assert len(rows) == 1 and float(rows[0].amount) == 750


def test_any_missing_amount_makes_the_daily_total_unknown():
    a, b = uuid.uuid4(), uuid.uuid4()
    rows = combine_daily_ingredients({a: 1.0, b: 1.0}, [_pi(a, MAG, "200", "mg"), _pi(b, MAG)])
    assert len(rows) == 1 and rows[0].amount is None


def test_unlinked_ingredients_are_left_out():
    a = uuid.uuid4()
    assert combine_daily_ingredients({a: 1.0}, [_pi(a, None, "5", "mg", name="Mystery")]) == []


def test_matching_non_mass_units_still_add_up():
    a, b = uuid.uuid4(), uuid.uuid4()
    rows = combine_daily_ingredients({a: 1.0, b: 2.0}, [_pi(a, VIT_C, "1000", "IU"), _pi(b, VIT_C, "500", "iu")])
    assert float(rows[0].amount) == 2000 and rows[0].unit.lower() == "iu"
