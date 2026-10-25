"""
How much one study counts, in code a scientist can audit: a base weight for the
design, multiplied down for each weakness, with a reader-facing flag naming it.
The flags are the caveat tags the app shows under each study.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

from app.services.research.schemas import StudyAppraisal

# Starting weight by design: pooled trials > single trials > observational > lab.
_BASE = {
    "meta_analysis": 0.95,
    "systematic_review": 0.8,
    "rct": 0.75,
    "crossover_rct": 0.7,
    "non_randomized_trial": 0.45,
    "cohort": 0.4,
    "case_control": 0.3,
    "cross_sectional": 0.2,
    "case_series": 0.1,
    "narrative_review": 0.08,
    "case_report": 0.05,
    "animal": 0.05,
    "in_vitro": 0.03,
    "other": 0.1,
}
_TRIALS = {"rct", "crossover_rct", "non_randomized_trial"}
_POOLED = {"meta_analysis", "systematic_review"}
_OBSERVATIONAL = {"cohort", "case_control", "cross_sectional"}
_PEOPLE = _TRIALS | _OBSERVATIONAL | {"case_series", "case_report"}

_TIERS = (("high", 0.6), ("moderate", 0.35), ("low", 0.15))
_CERTAINTY_ORDER = ["very_low", "low", "moderate", "high"]


@dataclass(frozen=True, slots=True)
class Flag:
    code: str
    label: str


@dataclass(slots=True)
class Weighting:
    score: float
    tier: str
    flags: list[Flag] = field(default_factory=list)


def weigh_study(study: StudyAppraisal) -> Weighting:
    score = _BASE[study.design]
    flags: list[Flag] = []

    def penalise(multiplier: float, code: str, label: str) -> None:
        nonlocal score
        score *= multiplier
        flags.append(Flag(code, label))

    if not study.tests_ingredient:
        penalise(0.2, "off_target", "Didn't test this ingredient on its own terms")

    if study.design == "animal":
        flags.append(Flag("not_human", "Animal study"))
    elif study.design == "in_vitro":
        flags.append(Flag("not_human", "Lab study on cells"))

    n = study.n_analyzed or study.n_enrolled
    if study.design in _PEOPLE and n:
        label = f"Small study ({n:,} {'person' if n == 1 else 'people'})"
        if n < 20:
            penalise(0.5, "small", label)
        elif n < 50:
            penalise(0.7, "small", label)
        elif n < 100:
            penalise(0.85, "small", label)

    if study.design in _TRIALS:
        weeks = study.duration_weeks
        if weeks is not None and weeks < 4:
            penalise(0.75 if weeks < 2 else 0.85, "short", f"Lasted {_duration(weeks)}")
        if study.blinding == "open_label":
            penalise(0.8, "unblinded", "Not blinded")
        if study.control in {"none", "no_treatment"}:
            penalise(0.6, "no_control", "No comparison group")

    if study.design in _POOLED:
        if study.studies_included is not None and study.studies_included < 5:
            penalise(0.7, "few_studies", f"Pooled only {study.studies_included} studies")
        if study.heterogeneity_i2 is not None and study.heterogeneity_i2 > 75:
            penalise(0.8, "inconsistent", "Studies disagreed with each other")
        # The reviewers' own GRADE rating beats anything a design label can tell us.
        if study.review_certainty == "low":
            penalise(0.7, "rated_low", "Authors rated the evidence low quality")
        elif study.review_certainty == "very_low":
            penalise(0.5, "rated_very_low", "Authors rated the evidence very low quality")

    if study.design in _OBSERVATIONAL or study.comparison_basis == "association":
        flags.append(Flag("association", "Shows a link, not cause and effect"))
    if study.comparison_basis == "within_group_only":
        penalise(0.4, "before_after", "Only compared before and after")

    if study.outcome_type == "biomarker":
        penalise(0.8, "biomarker", "Measured blood markers, not symptoms")
    elif study.outcome_type == "mechanistic":
        penalise(0.6, "mechanistic", "Measured biology, not health effects")

    if study.is_combination:
        others = ", ".join(study.co_actives) if study.co_actives else "other ingredients"
        penalise(0.6, "combination", f"Combined with {others}")
    if study.funding == "industry":
        penalise(0.9, "industry", "Industry-funded")
    if study.clinically_meaningful == "no":
        flags.append(Flag("small_effect", "Effect too small to notice"))

    score = round(min(score, 1.0), 3)
    return Weighting(score=score, tier=_tier(score), flags=flags)


def cap_certainty(certainty: str, supporting_tiers: Iterable[str]) -> str:
    """A verdict can't be more certain than the best study it rests on."""
    tiers = list(supporting_tiers)
    if not tiers:
        return "very_low"
    best = max(tiers, key=_CERTAINTY_ORDER.index)
    return min(certainty, best, key=_CERTAINTY_ORDER.index)


def evidence_level_from_claims(claims: Iterable[tuple[str, str]]) -> str:
    """The ingredient's evidence level is the certainty of its best-studied claim.

    A claim that is well studied counts whatever the verdict: strong evidence that
    something does not work is still strong evidence.
    """
    certainties = [certainty for verdict, certainty in claims if verdict != "insufficient"]
    if not certainties:
        return "insufficient"
    best = max(certainties, key=_CERTAINTY_ORDER.index)
    return {"high": "strong", "moderate": "moderate", "low": "limited"}.get(best, "insufficient")


def legacy_confidence(tier: str) -> str:
    """`ingredient_evidence.confidence` for app builds that predate study tiers."""
    return tier if tier in {"high", "moderate"} else "low"


def legacy_direction(study: StudyAppraisal) -> str:
    """`ingredient_evidence.direction` for app builds that predate claims."""
    if study.outcome_type == "safety" and study.result == "favours_control":
        return "risk"
    return {"favours_ingredient": "benefit", "mixed": "mixed"}.get(study.result, "neutral")


def _tier(score: float) -> str:
    for name, floor in _TIERS:
        if score >= floor:
            return name
    return "very_low"


def _duration(weeks: float) -> str:
    if weeks < 1:
        days = max(1, round(weeks * 7))
        return f"{days} day{'s' if days != 1 else ''}"
    whole = round(weeks)
    return f"{whole} week{'s' if whole != 1 else ''}"
