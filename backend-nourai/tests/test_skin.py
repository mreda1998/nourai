"""Skin check: cosmetic labels read against cited references, and the verdict built on it."""
from types import SimpleNamespace
from uuid import uuid4

from app.core.cosmetics import ACTIVES, ALLERGENS, SOURCES, UV_FILTERS
from app.models.product import ProductCategory
from app.schemas.product import ProductWithDetails
from app.services.skin import build_skin_check
from app.services.verdicts import build_product_verdict

SUNSCREEN = [
    "Avobenzone 3%", "Homosalate 10%", "Octisalate 5%", "Octocrylene 10%", "Water", "Styrene/Acrylates Copolymer",
    "Silica", "Dimethicone", "Potassium Cetyl Phosphate", "Benzyl Alcohol", "Beeswax", "Glyceryl Stearate",
    "Caprylyl Glycol", "Ethylhexylglycerin", "Behenyl Alcohol", "Xanthan Gum", "Chlorphenesin",
    "Hydrolyzed Jojoba Esters", "Fragrance", "Disodium EDTA", "Tocopheryl Acetate", "BHT", "Jojoba Esters",
]


def _product(name, labels, category=ProductCategory.COSMETIC):
    rows = [SimpleNamespace(name=n, amount=None, unit=None, status=None, note=None, ingredient_id=None, ingredient=None)
            for n in labels]
    return SimpleNamespace(
        id=uuid4(), barcode="1", name=name, brand="B", category=category, summary=None, image_url=None,
        health_score=None, product_ingredients=rows, claims=[], extra_data={}, serving_size=None,
    )


def _verdict(name, labels, category=ProductCategory.COSMETIC):
    out = ProductWithDetails.from_orm_with_details(_product(name, labels, category))
    return out, build_product_verdict(out)


def test_every_reference_entry_cites_a_known_source():
    for entry in (*ACTIVES, *ALLERGENS, *UV_FILTERS):
        assert entry.source in SOURCES, entry.name


def test_sunscreen_is_broad_spectrum_and_avobenzone_is_stabilised():
    check = build_skin_check("Sport Lotion SPF 50", [], SUNSCREEN)
    assert check.sun is not None
    assert check.sun.broad and check.sun.stabilised is True
    assert check.sun.tone == "good"
    assert [f.amount for f in check.sun.filters][:2] == ["3\u00a0%", "10\u00a0%"]
    assert check.roles[0].startswith("UV filter")


def test_avobenzone_alone_may_fade():
    check = build_skin_check("SPF 30", [], ["Avobenzone 3%", "Homosalate 8%", "Water"])
    assert check.sun.verdict == "UVA cover may fade" and check.sun.tone == "moderate"


def test_uvb_only_filters_say_so():
    check = build_skin_check("SPF 15", [], ["Octinoxate 7.5%", "Water"])
    assert not check.sun.broad and check.sun.verdict == "Mostly UVB"


def test_one_percent_line_marks_low_actives():
    labels = ["Aqua", "Glycerin", "Phenoxyethanol", "Niacinamide", "Retinol"]
    check = build_skin_check("Serum", [], labels)
    assert check.one_percent_index == 2
    by_name = {a.name: a for a in check.actives}
    assert by_name["Niacinamide"].likely_low          # trials used 2–5 %
    assert not by_name["Retinol"].likely_low          # retinol works below 1 %


def test_a_stated_percent_overrides_the_line():
    check = build_skin_check("Serum", [], ["Aqua", "Phenoxyethanol", "Niacinamide 5%"])
    assert not check.actives[0].likely_low and check.actives[0].amount == "5\u00a0%"


def test_urea_is_not_found_inside_a_formaldehyde_releaser():
    check = build_skin_check("Cream", [], ["Aqua", "Imidazolidinyl Urea"])
    assert not check.actives
    assert check.flags[0].name == "Formaldehyde releaser"


def test_fatty_alcohols_are_not_drying_alcohol():
    check = build_skin_check("Cream", [], ["Aqua", "Cetearyl Alcohol", "Glycerin"])
    assert "Alcohol-free" in check.free_of
    check = build_skin_check("Toner", [], ["Alcohol Denat.", "Aqua"])
    assert "Alcohol-free" not in check.free_of
    assert any(n.key == "alcohol" for n in check.notes)


def test_parenthesised_and_slashed_names_match():
    check = build_skin_check("Lotion", [], ["Aqua (Water)", "Parfum/Fragrance", "Lavandula Angustifolia (Lavender) Oil"])
    names = {f.name for f in check.flags}
    assert {"Fragrance", "Essential oil"} <= names
    assert "Fragrance-free" not in check.free_of


def test_rinse_off_is_read_from_the_name():
    assert build_skin_check("Gentle Foaming Face Wash", [], ["Aqua"]).use == "rinse-off"
    assert build_skin_check("Leave-In Conditioner", [], ["Aqua"]).use == "leave-on"


def test_retinoid_brings_pregnancy_and_sun_notes():
    keys = {n.key for n in build_skin_check("Night cream", [], ["Aqua", "Retinol"]).notes}
    assert {"pregnancy", "sun_sensitive"} <= keys


def test_collagen_is_little_evidence():
    active = build_skin_check("Cream", [], ["Aqua", "Hydrolyzed Collagen"]).actives[0]
    assert active.name == "Collagen" and active.tone == "weak"


# ─── Verdict ──────────────────────────────────────────────────────────────────

def test_sunscreen_verdict_has_sun_and_reaction_pillars():
    out, verdict = _verdict("Sport Lotion SPF 50", SUNSCREEN)
    keys = [p.key for p in verdict.pillars]
    assert keys[0] == "sun" and "reactions" in keys
    reactions = next(p for p in verdict.pillars if p.key == "reactions")
    assert reactions.verdict == "Fragranced" and reactions.tone == "neutral"
    assert out.ingredients[0].role.startswith("UV filter")


def test_mi_in_a_leave_on_product_is_think_twice_material():
    _, verdict = _verdict("Body Lotion", ["Aqua", "Glycerin", "Methylisothiazolinone"])
    reactions = next(p for p in verdict.pillars if p.key == "reactions")
    assert reactions.tone == "weak"
    assert verdict.level in ("mixed", "poor")


def test_mi_in_a_rinse_off_is_only_noted():
    _, verdict = _verdict("Shampoo", ["Aqua", "Sodium Laureth Sulfate", "Methylisothiazolinone"])
    reactions = next(p for p in verdict.pillars if p.key == "reactions")
    assert reactions.tone == "neutral"


def test_fragrance_free_serum_with_dosed_actives_looks_good():
    _, verdict = _verdict("Serum", ["Aqua", "Niacinamide", "Glycerin", "Panthenol", "Phenoxyethanol"])
    assert verdict.level == "good"
    assert {p.key for p in verdict.pillars} >= {"actives", "reactions"}
    assert "backed by trials" in verdict.summary


def test_fairy_dust_actives_are_called_out():
    _, verdict = _verdict("Glow Serum", ["Aqua", "Glycerin", "Phenoxyethanol", "Niacinamide", "Ascorbic Acid"])
    actives = next(p for p in verdict.pillars if p.key == "actives")
    assert actives.verdict == "Actives likely too low" and actives.tone == "moderate"


def test_food_gets_no_skin_check():
    out = ProductWithDetails.from_orm_with_details(_product("Bar", ["Sugar", "Glycerin"], ProductCategory.FOOD))
    assert out.skin is None
