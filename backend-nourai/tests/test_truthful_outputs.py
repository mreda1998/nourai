"""
Missing information must surface as "unknown", never as an invented effect
or an invented concern. See reports/competitive-strategy-2026-09-25.md §3.
"""
from types import SimpleNamespace

from app.models.product import IngredientStatus
from app.services.biodomain_scorer import compute_dose_ratio, score_product_biodomains
from app.services.personalization import CONCERN_FLAGS, concern_applies
from app.services.product import _infer_status


# ── Dose applicability ──────────────────────────────────────────────────────

def _ratio(amount=None, unit=None, dose=None, dose_unit=None, dependent=True):
    return compute_dose_ratio(amount, unit, dose, dose_unit, dependent)


def test_dose_independent_counts_fully():
    assert _ratio(dependent=False) == 1.0


def test_missing_research_dose_is_unknown():
    assert _ratio(amount="500", unit="mg", dose=None) is None


def test_missing_product_amount_is_unknown():
    assert _ratio(amount=None, dose=300, dose_unit="mg") is None


def test_unparseable_amount_is_unknown():
    assert _ratio(amount="trace", unit="mg", dose=300, dose_unit="mg") is None


def test_incompatible_units_are_unknown():
    assert _ratio(amount="1000", unit="IU", dose=25, dose_unit="mg") is None


def test_comparable_units_give_a_ratio():
    assert _ratio(amount="150", unit="mg", dose=300, dose_unit="mg") == 0.5
    assert _ratio(amount="1", unit="g", dose=300, dose_unit="mg") == 1.0


def _pi(amount, unit, *scores):
    ing = SimpleNamespace(canonical_name="X", biodomain_scores=list(scores))
    return SimpleNamespace(name="X", amount=amount, unit=unit, ingredient=ing)


def _bs(domain="cognitive_mental", direction="benefit", dose=300.0):
    return SimpleNamespace(
        biodomain=domain, direction=direction, magnitude=1.0, confidence="high",
        effective_dose_low=dose, dose_unit="mg", dose_dependent=True,
    )


def test_unknown_dose_does_not_produce_a_domain_score():
    domains, _ = score_product_biodomains([_pi(None, None, _bs())])
    assert domains == []


def test_known_dose_still_scores():
    domains, _ = score_product_biodomains([_pi("300", "mg", _bs())])
    assert len(domains) == 1 and domains[0].display_value > 0


# ── Ingredient status ───────────────────────────────────────────────────────

def test_unrecognised_ingredient_is_not_flagged():
    assert _infer_status(None) is None


def test_recognised_ingredient_with_contraindications_is_watch():
    ing = SimpleNamespace(category="vitamin", contraindications=["warfarin"])
    assert _infer_status(ing) == IngredientStatus.WATCH


# ── Personal concerns ───────────────────────────────────────────────────────

def test_reassuring_evidence_never_becomes_a_concern():
    assert not concern_applies("benefit")
    assert not concern_applies("neutral")
    assert concern_applies("risk")
    assert concern_applies("mixed")


def test_no_substring_rules_for_fertility_hormones_or_infants():
    for concern in ("fertility", "hormonal_condition", "infant_proximity"):
        assert concern not in CONCERN_FLAGS


def test_harm_with_unknown_dose_is_not_hidden():
    domains, _ = score_product_biodomains([_pi(None, None, _bs(direction="harm"))])
    assert len(domains) == 1 and domains[0].is_negative
    assert domains[0].contributions[0].dose_ratio is None


def test_legacy_unlinked_watch_reads_as_unknown():
    from app.models.product import ProductIngredient
    import uuid
    legacy = ProductIngredient(name="Dicaprylyl Ether", status="watch", ingredient_id=None)
    reviewed = ProductIngredient(name="Retinol", status="watch", ingredient_id=uuid.uuid4())
    avoided = ProductIngredient(name="Lilial", status="avoid", ingredient_id=None)
    assert legacy.effective_status is None
    assert reviewed.effective_status == "watch"
    assert avoided.effective_status == "avoid"


def test_evidence_order_ranks_strength_not_alphabet():
    from sqlalchemy.dialects import postgresql
    from app.repositories.personalization import _CONFIDENCE_RANK
    sql = str(_CONFIDENCE_RANK.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
    assert sql.index("'high'") < sql.index("'moderate'") < sql.index("'low'")
    assert "THEN 0" in sql.split("'moderate'")[0]


# ── Grades ──────────────────────────────────────────────────────────────────

def test_no_score_means_no_grade():
    from app.schemas.product import grade_from_score
    assert grade_from_score(None) is None
    assert grade_from_score(85) == "A"
    assert grade_from_score(39) == "D"


def test_nothing_scored_gives_no_health_score():
    _, health = score_product_biodomains([_pi(None, None, _bs())])
    assert health is None
