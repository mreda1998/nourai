"""
Structured outputs Claude fills at each research stage. Field descriptions are
part of the instructions the model sees, so they say exactly what to extract
and what not to infer.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Design = Literal[
    "meta_analysis", "systematic_review", "rct", "crossover_rct", "non_randomized_trial",
    "cohort", "case_control", "cross_sectional", "case_series", "case_report",
    "animal", "in_vitro", "narrative_review", "other",
]
Verdict = Literal["strong", "moderate", "limited", "mixed", "unlikely", "insufficient"]
# Onboarding IDs used to personalise evidence (repositories/personalization.py).
Concern = Literal["fertility", "thyroid", "hormonal_condition", "medications", "infant_proximity"]
Goal = Literal[
    "clear_skin", "anti_aging", "brighter_skin", "hair_growth", "prevent_hair_loss", "build_muscle",
    "fat_loss", "more_energy", "gut_health", "less_inflammation", "mental_focus",
]
Certainty = Literal["high", "moderate", "low", "very_low"]


# ── Stage 1: claims ──────────────────────────────────────────────────────────

class ClaimDraft(BaseModel):
    claim: str = Field(description=(
        "The belief as a short statement in everyday words, at most 70 characters, e.g. "
        "'Eases joint pain from osteoarthritis'. Safety claims state the risk: "
        "'Can harm the liver at high doses'. One belief per claim: never join two with 'and' "
        "(thyroid effects and pregnancy safety are two claims)."
    ))
    kind: Literal["benefit", "safety"]
    why_people_believe: str = Field(description=(
        "One or two sentences on where the belief comes from (traditional use, marketing, "
        "lab or animal studies, a well-known trial, social media) and the kernel of truth in it."
    ))
    outcome_terms: list[str] = Field(description=(
        "2-6 English terms a PubMed title/abstract search would use for this claim's outcome "
        "(e.g. 'osteoarthritis', 'knee pain', 'WOMAC'). Specific to this claim: no generic words "
        "such as 'toxicity', 'safety', 'health' or 'effects', which match every claim. No ingredient names."
    ))
    priority: int = Field(description="1 = what most people buy it for; higher = less common.")


class ClaimSet(BaseModel):
    search_names: list[str] = Field(description=(
        "Names to search PubMed with: the ingredient's common name, scientific name, main "
        "chemical name and widely used synonyms (2-6 items). Only names that refer to this exact "
        "ingredient: never category words such as 'artificial sweetener' or 'protein supplement', "
        "which pull in studies of other ingredients."
    ))
    claims: list[ClaimDraft] = Field(description="3-8 claims, at least one of kind 'safety'.")


# ── Stage 2: one paper ───────────────────────────────────────────────────────

class ClaimLink(BaseModel):
    claim_number: int = Field(description="Number of the claim in the list given (1-based).")
    stance: Literal["supports", "refutes", "inconclusive"] = Field(description=(
        "Whether this study's result supports the claim statement as written, contradicts it, "
        "or can't tell. For a safety claim, 'supports' means the study found that harm."
    ))
    relevance: Literal["direct", "indirect"] = Field(description=(
        "'direct' if the study measured the claim's outcome in people; 'indirect' for related "
        "outcomes, biomarkers, or non-human evidence."
    ))


class StudyAppraisal(BaseModel):
    tests_ingredient: bool = Field(description=(
        "False if the ingredient is not what was tested: only one unidentifiable part of a mixture, "
        "a different compound, or merely mentioned."
    ))
    design: Design
    randomized: bool | None = Field(description="Null if not a trial.")
    blinding: Literal["double", "single", "open_label", "not_reported", "not_applicable"]
    control: Literal["placebo", "active", "usual_care", "no_treatment", "none", "not_applicable"]
    comparator: str | None = Field(description="What the ingredient was compared with, e.g. 'omeprazole 20 mg/day'.")
    population: str | None = Field(description="Who took part, specifically: age, sex, condition, country if given.")
    health_status: Literal["healthy", "at_risk", "patients", "mixed", "not_applicable"]
    n_enrolled: int | None = Field(description="Human participants enrolled or randomised; null if not reported.")
    n_analyzed: int | None = Field(description="Participants in the main analysis; null if not reported.")
    studies_included: int | None = Field(description="For reviews and meta-analyses: number of studies pooled.")
    heterogeneity_i2: float | None = Field(description="For meta-analyses: I² percentage for the main outcome, if reported.")
    review_certainty: Literal["high", "moderate", "low", "very_low", "not_reported", "not_applicable"] = Field(description=(
        "For reviews and meta-analyses: the certainty or quality the authors themselves gave the pooled evidence "
        "(GRADE or similar); 'not_applicable' for single studies."
    ))
    intervention_form: str | None = Field(description=(
        "The exact form given: 'standardised turmeric extract (95% curcuminoids)', 'nanomicelle curcumin', "
        "'turmeric in food', 'topical 5% cream'."
    ))
    is_combination: bool = Field(description="True if other active ingredients were given in the same arm.")
    co_actives: list[str] = Field(description="Other actives given with it (e.g. 'piperine'); empty if none.")
    route: Literal["oral_supplement", "diet", "topical", "injection", "inhaled", "other", "not_applicable"]
    dose_amount: float | None = Field(description="Amount per dose of the ingredient itself, as reported.")
    dose_unit: str | None = Field(description="Unit for dose_amount: 'mg', 'g', 'IU', 'µg', 'CFU', '%'.")
    dose_frequency: str | None = Field(description="'once daily', 'twice daily', 'single dose', ...")
    duration_weeks: float | None = Field(description="How long people took it, in weeks (1 day = 0.14).")
    primary_outcome: str | None = Field(description="The main outcome measured, in plain words.")
    outcome_type: Literal["clinical", "patient_reported", "biomarker", "mechanistic", "safety"] = Field(description=(
        "'clinical' = diagnosed events or measured function; 'patient_reported' = symptoms, pain, mood scores; "
        "'biomarker' = blood or tissue markers; 'mechanistic' = cell or pathway effects; 'safety' = adverse effects."
    ))
    comparison_basis: Literal["vs_control", "within_group_only", "association", "not_applicable"] = Field(description=(
        "'vs_control' only if the reported result compares the ingredient group with the control group; "
        "'within_group_only' if it reports change from baseline without a between-group difference; "
        "'association' for observational studies."
    ))
    result: Literal["favours_ingredient", "favours_control", "no_difference", "mixed", "unclear"] = Field(description=(
        "For the primary outcome versus the comparison. A within-group improvement with no "
        "between-group difference is 'no_difference'."
    ))
    effect_summary: str | None = Field(description=(
        "The size of the effect with numbers as reported: 'pain −1.2 points on 0-10 vs placebo (p=0.01)'."
    ))
    clinically_meaningful: Literal["yes", "no", "unclear"] = Field(description=(
        "Whether the effect is large enough to matter to a person, judged against usual thresholds "
        "for that outcome; 'unclear' when you can't tell."
    ))
    registration_id: str | None = Field(description="Trial registry number if given (NCT…, IRCT…, ISRCTN…).")
    funding: Literal["industry", "public", "mixed", "none_declared", "not_reported"]
    limitations: list[str] = Field(description="Up to 4 short limitations stated or evident in the abstract.")
    claim_links: list[ClaimLink] = Field(description="The claims this study informs; empty if none.")
    concern_tags: list[Concern] = Field(description="User concerns the study directly addresses; empty if none.")
    goal_tags: list[Goal] = Field(description="User goals the study directly informs; empty if none.")
    method_summary: str = Field(description=(
        "One sentence a non-scientist understands, at most 160 characters, saying what was done: "
        "'84 adults with knee pain took 1 g a day or a placebo for 8 weeks.'"
    ))
    finding: str = Field(description=(
        "One sentence, at most 200 characters, saying what happened compared with the control, "
        "with the size of the effect when reported. No jargon or abbreviations."
    ))
    caveat: str | None = Field(description="The single most important caution for a reader, at most 120 characters.")


# ── Stage 3: one claim ───────────────────────────────────────────────────────

class ClaimVerdict(BaseModel):
    verdict: Verdict = Field(description=(
        "How well the claim statement holds: 'strong' = well established; 'moderate' = probably true; "
        "'limited' = early or weak evidence suggests it; 'mixed' = good studies disagree; "
        "'unlikely' = good evidence it does not hold; 'insufficient' = too little to say."
    ))
    certainty: Certainty = Field(description=(
        "GRADE-style certainty in the verdict: start from the best designs available and lower it for "
        "risk of bias, inconsistency, indirectness (population, form, outcome), imprecision, small studies."
    ))
    certainty_reasons: list[str] = Field(description="Short reasons the certainty was lowered; empty if high.")
    reality: str = Field(description=(
        "Two or three plain sentences: what the evidence shows, for whom, how much and how fast. "
        "Start with what is supported, then the caveats. Never absolute."
    ))
    effect_size: str | None = Field(description=(
        "The typical effect in everyday terms, e.g. 'about 1 point less pain on a 0-10 scale'. No statistical "
        "terms: when only a standardised effect is reported, describe about 0.2 as small, 0.5 as moderate "
        "and 0.8 or more as large."
    ))
    applies_to: str | None = Field(description="Who the evidence is about, if narrower than everyone.")
    avoid_if: str | None = Field(description="Who should avoid it or check with a doctor, if the evidence says so.")
    dose_note: str | None = Field(description="Doses and forms used in studies versus typical products, if relevant.")
    key_pmids: list[str] = Field(description="Up to 5 PMIDs from the studies given that the verdict rests on most.")


# ── Stage 4: ingredient ──────────────────────────────────────────────────────

class IngredientSummary(BaseModel):
    # Shown large on the ingredient page: kept short, the claims carry the detail.
    common_belief: str = Field(description=(
        "At most 45 words, starting 'People take …' or 'People use …': what most people believe it does "
        "and why. Fair to the belief; do not strawman it."
    ))
    evidence_reality: str = Field(description=(
        "At most 60 words: what the evidence best supports, what does not hold up, and the main "
        "safety point. The claims below it carry the detail."
    ))
