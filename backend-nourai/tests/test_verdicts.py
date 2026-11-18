"""Ingredient standing comes from researched claims; the product verdict from cited checks."""
from types import SimpleNamespace
from uuid import uuid4

from app.models.ingredient import IngredientCategory
from app.models.product import IngredientStatus, ProductCategory
from app.schemas.product import ProductWithDetails
from app.schemas.regulation import RulesGlanceOut
from app.services.biodomain_scorer import compute_dose_ratio
from app.services.product import _infer_status, _match_ingredient
from app.services.verdicts import build_product_verdict, ingredient_standing


def _claim(kind, verdict, certainty, text="A claim"):
    return SimpleNamespace(kind=kind, verdict=verdict, certainty=certainty, claim=text)


def _ingredient(name, claims=(), typical=None, category=IngredientCategory.OTHER):
    return SimpleNamespace(
        id=uuid4(), canonical_name=name, category=category, typical_dose_range=typical,
        contraindications=[], biodomain_scores=[], claims=list(claims),
    )


def _pi(name, amount=None, status=None, ingredient=None, note=None):
    return SimpleNamespace(
        name=name, amount=amount, unit=None, status=status, note=note,
        ingredient_id=ingredient.id if ingredient else None, ingredient=ingredient,
    )


def _product(category, rows, extra_data=None, serving_size=None):
    return SimpleNamespace(
        id=uuid4(), barcode="123", name="Test", brand="Brand", category=category, summary=None,
        image_url=None, health_score=None, product_ingredients=rows, claims=[],
        extra_data=extra_data or {}, serving_size=serving_size,
    )


def _verdict(product, glance=None):
    out = ProductWithDetails.from_orm_with_details(product)
    out.rules_glance = glance
    return out, build_product_verdict(out)


# ─── Ingredient standing ──────────────────────────────────────────────────────

def test_unresearched_ingredient_is_unreviewed_not_flagged():
    assert ingredient_standing(None).level == "unreviewed"
    additive = _ingredient("Citric acid", category=IngredientCategory.ADDITIVE)
    assert ingredient_standing(additive).level == "unreviewed"


def test_insufficient_claims_do_not_count_as_reviewed():
    ing = _ingredient("X", [_claim("safety", "insufficient", "very_low"), _claim("benefit", None, None)])
    assert ingredient_standing(ing).level == "unreviewed"


def test_supported_risk_flags_by_certainty():
    sure = _ingredient("A", [_claim("safety", "moderate", "moderate", "Raises blood pressure")])
    maybe = _ingredient("B", [_claim("safety", "limited", "low", "May upset the gut")])
    thin = _ingredient("C", [_claim("safety", "limited", "very_low", "Something")])
    assert (ingredient_standing(sure).level, ingredient_standing(sure).label) == ("risk", "Likely risk")
    assert ingredient_standing(sure).note == "Raises blood pressure"
    assert (ingredient_standing(maybe).level, ingredient_standing(maybe).label) == ("caution", "Possible risk")
    assert ingredient_standing(thin).level == "clear"


def test_refuted_risk_is_clear():
    ing = _ingredient("Aspartame", [_claim("safety", "unlikely", "moderate", "Causes cancer")])
    standing = ingredient_standing(ing)
    assert (standing.level, standing.label) == ("clear", "No known concerns")


def test_most_certain_risk_wins_and_benefit_is_reported():
    ing = _ingredient("Caffeine", [
        _claim("safety", "limited", "low", "Possible"),
        _claim("safety", "strong", "high", "Disrupts sleep"),
        _claim("benefit", "moderate", "low", "Burns fat"),
        _claim("benefit", "strong", "moderate", "Improves alertness"),
    ])
    standing = ingredient_standing(ing)
    assert (standing.level, standing.label, standing.note) == ("risk", "Known risk", "Disrupts sleep")
    assert (standing.benefit_label, standing.benefit_note, standing.benefit_tone) == ("Probably works", "Improves alertness", "good")


def test_benefit_only_research_says_nothing_about_safety():
    ing = _ingredient("X", [_claim("benefit", "unlikely", "moderate", "Boosts immunity")])
    standing = ingredient_standing(ing)
    assert (standing.level, standing.label) == ("clear", None)
    assert (standing.benefit_label, standing.benefit_tone) == ("Unlikely to work", "weak")


# ─── Product response ─────────────────────────────────────────────────────────

def test_stale_watch_status_no_longer_flags_rows():
    """Ingestion used to mark every unmatched or additive row 'watch'."""
    additive = _ingredient("Citric acid", category=IngredientCategory.ADDITIVE)
    product = _product(ProductCategory.FOOD, [
        _pi("citric acid", status=IngredientStatus.WATCH, ingredient=additive),
        _pi("mystery", status=IngredientStatus.WATCH),
    ])
    out = ProductWithDetails.from_orm_with_details(product)
    assert [(i.tag, i.tag_type, i.standing) for i in out.ingredients] == [(None, None, "unreviewed")] * 2
    assert out.additives.watch == [] and out.additives.avoid == []
    assert out.additives.unreviewed_count == 2


def test_curated_avoid_with_a_note_is_kept():
    product = _product(ProductCategory.FOOD, [
        _pi("Red 3", status=IngredientStatus.AVOID, note="Withdrawn by the FDA", ingredient=_ingredient("Red 3")),
    ])
    out = ProductWithDetails.from_orm_with_details(product)
    assert (out.ingredients[0].tag, out.ingredients[0].standing) == ("avoid", "risk")
    assert [a.name for a in out.additives.avoid] == ["Red 3"]


def test_grade_only_from_a_stored_score():
    product = _product(ProductCategory.SUPPLEMENT, [_pi("X", ingredient=_ingredient("X"))])
    assert ProductWithDetails.from_orm_with_details(product).grade is None


# ─── Product verdict ──────────────────────────────────────────────────────────

def test_ultra_processed_sugary_food_is_think_twice():
    product = _product(
        ProductCategory.FOOD, [_pi("sugar"), _pi("glucose syrup")],
        extra_data={"nutriments": {"sugars_100g": 40, "sodium_100g": 0.5, "saturated-fat_100g": 1}, "nova_group": 4, "serving_quantity": 50},
    )
    _, verdict = _verdict(product)
    assert (verdict.level, verdict.headline, verdict.tone) == ("poor", "Think twice", "weak")
    assert [p.key for p in verdict.pillars] == ["nutrition", "processing", "ingredients"]
    assert verdict.pillars[0].verdict == "High in sugar"
    assert verdict.summary == "It is high in sugar and ultra-processed."
    assert verdict.reviewed_count == 0 and verdict.ingredient_count == 2


def test_plain_food_with_a_clean_panel_looks_good():
    product = _product(
        ProductCategory.FOOD, [_pi("oats")],
        extra_data={"nutriments": {"sugars_100g": 1, "sodium_100g": 0.005, "saturated-fat_100g": 1, "fiber_100g": 10}, "nova_group": 1, "serving_quantity": 40},
    )
    _, verdict = _verdict(product)
    assert (verdict.level, verdict.headline) == ("good", "Looks good")
    assert "fibre" in verdict.pillars[0].detail


def test_nothing_known_is_unknown_not_good():
    _, verdict = _verdict(_product(ProductCategory.COSMETIC, [_pi("zorbium complex"), _pi("veltrane")]))
    assert (verdict.level, verdict.tone) == ("unknown", "neutral")
    # An unfamiliar label is never called clean, and "not reviewed" isn't repeated beside the skin checks.
    assert [p.verdict for p in verdict.pillars] == ["None we recognise"]


def test_few_reviewed_ingredients_do_not_earn_nothing_flagged():
    safe = _ingredient("Glycerin", [_claim("safety", "unlikely", "moderate", "Irritates skin")])
    rows = [_pi("glycerin", ingredient=safe)] + [_pi(f"unknown {i}") for i in range(5)]
    _, verdict = _verdict(_product(ProductCategory.COSMETIC, rows))
    assert verdict.level == "unknown"
    assert "None we recognise" in [p.verdict for p in verdict.pillars]
    assert all(p.tone == "neutral" for p in verdict.pillars)


def test_supplement_dose_and_evidence_pillars():
    creatine = _ingredient("Creatine", [
        _claim("benefit", "strong", "high", "Builds strength"),
        _claim("safety", "unlikely", "moderate", "Harms kidneys"),
    ], typical="3–5 g daily")
    _, verdict = _verdict(_product(ProductCategory.SUPPLEMENT, [_pi("Creatine monohydrate", "5 g", ingredient=creatine)]))
    assert verdict.level == "good"
    assert {p.key: p.tone for p in verdict.pillars} == {"dose": "good", "evidence": "good", "ingredients": "good"}
    assert verdict.pillars[1].detail == "Creatine monohydrate. “Builds strength”: works."
    assert verdict.summary == "The dose is in range, creatine monohydrate is backed by trials, and nothing is flagged in the ingredients."
    assert "clause" not in verdict.model_dump()["pillars"][0]


def test_dose_above_upper_limit_and_restricted_ingredient():
    zinc = _ingredient("Zinc", [_claim("safety", "strong", "moderate", "High doses cause copper deficiency")], category=IngredientCategory.MINERAL)
    out, verdict = _verdict(
        _product(ProductCategory.SUPPLEMENT, [_pi("Zinc", "100 mg", ingredient=zinc)]),
        glance=RulesGlanceOut(where_you_live=1, elsewhere=0),
    )
    assert out.doses[0].band == "over_ul"
    assert verdict.level == "poor"
    assert verdict.pillars[0].verdict == "Zinc above the upper limit"
    assert verdict.pillars[-1].verdict == "1 restricted where you live"


def test_documented_risk_is_worth_a_look_not_a_fail():
    risky = _ingredient("Caffeine", [_claim("safety", "strong", "high", "Disrupts sleep")])
    out, verdict = _verdict(_product(ProductCategory.SUPPLEMENT, [_pi("Caffeine", ingredient=risky)]))
    assert out.ingredients[0].tag_type == "warning"
    assert [a.reason for a in out.additives.avoid] == ["Known risk"]
    assert verdict.level == "mixed"
    assert verdict.pillars[-1].verdict == "1 documented risk"


# ─── Dose and matching ────────────────────────────────────────────────────────

def test_unknown_dose_stays_unknown():
    assert compute_dose_ratio(None, None, 500, "mg", True) is None          # no amount on the label
    assert compute_dose_ratio("500", "IU", 500, "mg", True) is None         # units can't be compared
    assert compute_dose_ratio("a pinch", None, 500, "mg", True) is None
    assert compute_dose_ratio(None, None, 500, "mg", False) == 1.0          # dose doesn't matter
    assert compute_dose_ratio("250 mg", None, 500, "mg", True) == 0.5       # unit inside the amount
    assert compute_dose_ratio("1", "g", 500, "mg", True) == 1.0
    assert compute_dose_ratio("400", "IU", 800, "iu", True) == 0.5


def test_label_text_never_matches_inside_a_longer_library_name():
    fish_oil, acid, sugar = object(), object(), object()
    lookup = {"fish oil": fish_oil, "hyaluronic acid": acid, "cane sugar": sugar}
    assert _match_ingredient("oil", lookup) is None
    assert _match_ingredient("acid", lookup) is None
    assert _match_ingredient("sugar", lookup) is None
    assert _match_ingredient("organic cane sugar", lookup) is sugar
    assert _match_ingredient("Fish Oil", lookup) is fish_oil
    assert _match_ingredient("sugarcane", lookup) is None


def test_nothing_is_flagged_at_ingestion():
    assert _infer_status(None) is None
    assert _infer_status(_ingredient("Sucralose", category=IngredientCategory.SWEETENER)) is None


# ─── Stack review ─────────────────────────────────────────────────────────────

def test_stack_review_finds_support_risks_and_overlaps():
    from app.services.stack_review import stack_review

    magnesium = _ingredient("Magnesium", [
        _claim("benefit", "moderate", "moderate", "Improves sleep"),
        _claim("safety", "strong", "moderate", "High doses cause diarrhoea"),
    ])
    filler = _ingredient("Rice flour")
    a, b = uuid4(), uuid4()

    def row(product_id, product_name, name, ingredient=None):
        return SimpleNamespace(product_id=product_id, name=name, ingredient=ingredient,
                               product=SimpleNamespace(name=product_name))

    review = stack_review([
        row(a, "Sleep Blend", "magnesium glycinate", magnesium),
        row(a, "Sleep Blend", "rice flour", filler),
        row(b, "Multivitamin", "magnesium oxide", magnesium),
        row(b, "Multivitamin", "mystery"),
    ])
    assert (review.product_count, review.ingredient_count, review.reviewed_count) == (2, 4, 1)
    assert [(f.ingredient, f.label, f.claim) for f in review.supported] == [("Magnesium", "Probably works", "Improves sleep")]
    assert [(f.ingredient, f.label, f.tone) for f in review.risks] == [("Magnesium", "Likely risk", "weak")]
    assert [(f.ingredient, f.products) for f in review.overlaps] == [("Magnesium", ["Multivitamin", "Sleep Blend"])]


def test_stack_review_of_nothing_is_empty():
    from app.services.stack_review import stack_review

    review = stack_review([])
    assert (review.supported, review.risks, review.overlaps, review.product_count) == ([], [], [], 0)


import pytest  # noqa: E402


@pytest.mark.anyio
async def test_review_endpoint(client):
    from unittest.mock import AsyncMock, patch

    with patch("app.api.v1.scores.load_product_ingredients", new=AsyncMock(return_value=[])):
        response = await client.post("/api/v1/scores/review", json={"product_ids": []})
    assert response.status_code == 200
    assert response.json()["supported"] == []


def test_a_small_serving_cannot_hide_a_sugary_food():
    """Nutella lists a 15 g serving: 9% of the sugar reference per serving, 56 g per 100 g."""
    sugar = _ingredient("Sugar", [_claim("safety", "strong", "moderate", "Raises the risk of tooth decay")])
    product = _product(
        ProductCategory.FOOD, [_pi("sugar", ingredient=sugar), _pi("palm oil")],
        extra_data={"nutriments": {"sugars_100g": 56.3, "saturated-fat_100g": 10.6, "sodium_100g": 0.043}, "nova_group": 3, "serving_quantity": 15},
    )
    out, verdict = _verdict(product)
    sugar_row = next(m for m in out.nutrition.measures if m.key == "sugars")
    assert sugar_row.band == "moderate"                       # per serving, by the FDA rule
    assert out.high_per_100g == ["Sugar", "Saturated fat"]   # per 100 g, by the UK FSA
    assert "high_per_100g" not in out.model_dump()           # never sent to the app
    nutrition = verdict.pillars[0]
    assert (nutrition.tone, nutrition.verdict) == ("weak", "High in sugar & sat fat")
    assert "UK Food Standards Agency" in nutrition.detail
    assert verdict.summary == "It is high in sugar and saturated fat, and processed. Sugar has a documented risk."


def test_salt_or_sodium_per_100g():
    from app.services.measures import high_per_100g

    assert high_per_100g({"salt_100g": 2.0}) == ["Sodium"]
    assert high_per_100g({"sodium_100g": 0.7}) == ["Sodium"]        # 1.75 g salt
    assert high_per_100g({"sodium_100g": 0.5, "sugars_100g": 22.5}) == []  # at the limit is not over it
    assert high_per_100g(None) == []
