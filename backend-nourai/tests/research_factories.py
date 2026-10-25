"""Builders for research-pipeline tests."""
from app.services.research.pubmed import Article
from app.services.research.schemas import ClaimDraft, ClaimLink, StudyAppraisal


def make_appraisal(**overrides) -> StudyAppraisal:
    """A well-run trial: 400 adults, double-blind, placebo, 12 weeks, symptoms measured."""
    fields = dict(
        tests_ingredient=True, design="rct", randomized=True, blinding="double", control="placebo",
        comparator="placebo", population="adults with knee osteoarthritis", health_status="patients",
        n_enrolled=420, n_analyzed=400, studies_included=None, heterogeneity_i2=None, review_certainty="not_applicable",
        intervention_form="turmeric extract", is_combination=False, co_actives=[], route="oral_supplement",
        dose_amount=1000, dose_unit="mg", dose_frequency="once daily", duration_weeks=12,
        primary_outcome="knee pain", outcome_type="patient_reported", comparison_basis="vs_control",
        result="favours_ingredient", effect_summary="pain −1.2 points vs placebo", clinically_meaningful="yes",
        registration_id="NCT01234567", funding="public", limitations=[], claim_links=[],
        concern_tags=[], goal_tags=[],
        method_summary="400 adults took it or a placebo for 12 weeks.", finding="Less pain.", caveat=None,
    )
    fields.update(overrides)
    return StudyAppraisal(**fields)


def link(claim_number: int, stance: str = "supports", relevance: str = "direct") -> ClaimLink:
    return ClaimLink(claim_number=claim_number, stance=stance, relevance=relevance)


def make_claim(claim: str, kind: str = "benefit", priority: int = 1, terms: list[str] | None = None) -> ClaimDraft:
    return ClaimDraft(
        claim=claim, kind=kind, why_people_believe="Marketing and early lab work.",
        outcome_terms=terms or [claim.lower()], priority=priority,
    )


def make_article(pmid: str, **overrides) -> Article:
    fields = dict(
        pmid=pmid, title=f"Study {pmid}", abstract="A" * 200, journal="Nutrients", year=2022, doi=None,
        publication_types=["Journal Article"],
    )
    fields.update(overrides)
    return Article(**fields)
