"""How much a study counts, and the caveats a reader sees, follow from how it was done."""
import pytest

from app.services.research.weighting import (
    cap_certainty,
    evidence_level_from_claims,
    legacy_confidence,
    legacy_direction,
    weigh_study,
)
from tests.research_factories import make_appraisal


def _study(**overrides):
    return make_appraisal(**overrides)


def _codes(weighting) -> set[str]:
    return {flag.code for flag in weighting.flags}


def test_a_large_blinded_placebo_trial_on_symptoms_is_high_tier_without_caveats():
    weighting = weigh_study(_study())
    assert weighting.tier == "high"
    assert weighting.flags == []


def test_a_one_week_open_label_trial_in_34_people_is_low_and_says_why():
    weighting = weigh_study(_study(n_enrolled=34, n_analyzed=34, duration_weeks=1, blinding="open_label"))
    assert weighting.tier in {"low", "very_low"}
    labels = {flag.code: flag.label for flag in weighting.flags}
    assert labels["small"] == "Small study (34 people)"
    assert labels["short"] == "Lasted 1 week"
    assert labels["unblinded"] == "Not blinded"


def test_a_before_after_result_counts_far_less_than_a_comparison_with_control():
    compared = weigh_study(_study())
    before_after = weigh_study(_study(comparison_basis="within_group_only"))
    assert before_after.score <= compared.score / 2
    assert "before_after" in _codes(before_after)


def test_blood_markers_instead_of_symptoms_are_flagged_and_count_less():
    biomarker = weigh_study(_study(outcome_type="biomarker", primary_outcome="CRP"))
    assert biomarker.score < weigh_study(_study()).score
    assert {flag.label for flag in biomarker.flags} >= {"Measured blood markers, not symptoms"}


def test_a_combination_product_cannot_be_credited_to_the_ingredient_alone():
    combo = weigh_study(_study(is_combination=True, co_actives=["piperine", "boswellia"]))
    assert combo.score < weigh_study(_study()).score
    assert any(flag.code == "combination" and "piperine" in flag.label for flag in combo.flags)


def test_industry_funding_is_disclosed():
    assert "industry" in _codes(weigh_study(_study(funding="industry")))


def test_a_meta_analysis_of_many_trials_outranks_any_single_trial():
    meta = _study(design="meta_analysis", randomized=None, blinding="not_applicable", control="not_applicable",
                  n_enrolled=None, n_analyzed=None, studies_included=14, heterogeneity_i2=35,
                  duration_weeks=None, comparison_basis="vs_control")
    assert weigh_study(meta).score > weigh_study(_study()).score
    assert weigh_study(meta).tier == "high"


def test_a_meta_analysis_of_few_inconsistent_studies_is_flagged():
    meta = _study(design="meta_analysis", studies_included=3, heterogeneity_i2=85, n_enrolled=None,
                  n_analyzed=None, duration_weeks=None)
    codes = _codes(weigh_study(meta))
    assert {"few_studies", "inconsistent"} <= codes


def test_a_meta_analysis_whose_authors_rate_the_evidence_very_low_is_not_a_top_study():
    """e.g. PMID 29018060: collagen ranked among 'helpful' supplements on evidence its own authors called very low."""
    meta = dict(design="meta_analysis", studies_included=69, n_enrolled=None, n_analyzed=None, duration_weeks=None)
    rated_very_low = weigh_study(_study(**meta, review_certainty="very_low"))
    assert rated_very_low.tier != "high"
    assert rated_very_low.score < weigh_study(_study(**meta, review_certainty="high")).score
    assert "Authors rated the evidence very low quality" in {f.label for f in rated_very_low.flags}


@pytest.mark.parametrize("design", ["animal", "in_vitro"])
def test_lab_and_animal_studies_are_very_low(design):
    weighting = weigh_study(_study(design=design, n_enrolled=None, n_analyzed=None, health_status="not_applicable"))
    assert weighting.tier == "very_low"
    assert "not_human" in _codes(weighting)


def test_observational_associations_cannot_reach_high_tier():
    cohort = _study(design="cohort", randomized=None, blinding="not_applicable", control="not_applicable",
                    n_enrolled=100_000, n_analyzed=100_000, comparison_basis="association")
    weighting = weigh_study(cohort)
    assert weighting.tier != "high"
    assert "association" in _codes(weighting)


def test_certainty_cannot_exceed_what_the_best_study_supports():
    assert cap_certainty("high", ["low", "moderate"]) == "moderate"
    assert cap_certainty("moderate", ["high"]) == "moderate"
    assert cap_certainty("low", []) == "very_low"


def test_ingredient_evidence_level_follows_the_most_certain_claim():
    assert evidence_level_from_claims([("insufficient", "very_low"), ("moderate", "moderate")]) == "moderate"
    assert evidence_level_from_claims([("unlikely", "high")]) == "strong"
    assert evidence_level_from_claims([("insufficient", "low")]) == "insufficient"
    assert evidence_level_from_claims([]) == "insufficient"


def test_legacy_fields_stay_meaningful_for_older_app_builds():
    assert legacy_confidence("high") == "high"
    assert legacy_confidence("very_low") == "low"
    assert legacy_direction(_study()) == "benefit"
    assert legacy_direction(_study(result="no_difference")) == "neutral"
    assert legacy_direction(_study(outcome_type="safety", result="favours_control")) == "risk"
