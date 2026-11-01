"""
Claim-based research for one ingredient: draft the claims people believe,
search PubMed for each, appraise every paper once, weigh it, judge each claim
from its studies, then store the result in place of the previous research.
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingredient import Ingredient, ResearchStatus
from app.models.ingredient_claim import IngredientClaim, IngredientClaimEvidence
from app.models.ingredient_evidence import IngredientEvidence
from app.services.research import pubmed
from app.services.research.llm import ResearchLLM, StudyForVerdict
from app.services.research.pubmed import Article
from app.services.research.schemas import ClaimDraft, ClaimVerdict, IngredientSummary, StudyAppraisal
from app.services.research.weighting import (
    Weighting,
    cap_certainty,
    evidence_level_from_claims,
    legacy_confidence,
    legacy_direction,
    weigh_study,
)

TIER_ORDER = ("reviews", "trials", "observational", "preclinical")
# PMIDs requested per claim and tier; relevance-sorted by PubMed.
SEARCH_CAPS = {"reviews": 3, "trials": 6, "observational": 3, "preclinical": 3}
MAX_STUDIES = 36
PER_CLAIM_FLOOR = 4
MAX_STUDIES_PER_VERDICT = 15
NO_STUDIES_REALITY = "We found no studies that test this directly, so there is nothing to go on yet."
# More lost paper reads than this and the evidence is too thin to judge: retry later instead.
MAX_FAILED_APPRAISAL_SHARE = 0.25


class ResearchIncomplete(RuntimeError):
    """A stage failed transiently; storing what we have would misstate the evidence."""


@dataclass(slots=True)
class ClaimHits:
    claim_index: int
    priority: int
    by_tier: dict[str, list[str]]


@dataclass(slots=True)
class AppraisedStudy:
    article: Article
    appraisal: StudyAppraisal
    weighting: Weighting


@dataclass(slots=True)
class JudgedClaim:
    draft: ClaimDraft
    verdict: ClaimVerdict
    studies: list[StudyForVerdict]


@dataclass(slots=True)
class ResearchResult:
    claims: list[JudgedClaim]
    studies: list[AppraisedStudy]
    summary: IngredientSummary | None
    evidence_level: str
    skipped_off_target: int = 0
    search_names: list[str] = field(default_factory=list)


def plan_studies(hits: list[ClaimHits], *, max_studies: int, per_claim_floor: int) -> list[str]:
    """Pick the papers to read: a few of the best for every claim, then the best overall."""
    planned: list[str] = []
    seen: set[str] = set()
    claims = sorted(hits, key=lambda h: h.priority)

    def add(pmid: str) -> None:
        if pmid not in seen and len(planned) < max_studies:
            seen.add(pmid)
            planned.append(pmid)

    for claim in claims:
        taken = 0
        for tier in TIER_ORDER:
            for pmid in claim.by_tier.get(tier, []):
                if taken >= per_claim_floor:
                    break
                add(pmid)
                taken += 1

    for tier in TIER_ORDER:
        queues = [list(claim.by_tier.get(tier, [])) for claim in claims]
        while any(queues) and len(planned) < max_studies:
            for queue in queues:
                while queue:
                    pmid = queue.pop(0)
                    if pmid not in seen:
                        add(pmid)
                        break
    return planned


def reconcile_design(appraisal: StudyAppraisal, article: Article) -> StudyAppraisal:
    """PubMed's indexers tag publication types by hand; trust them over a reading of the abstract."""
    types = set(article.publication_types)
    design = appraisal.design
    if "Meta-Analysis" in types:
        design = "meta_analysis"
    elif "Systematic Review" in types and design != "meta_analysis":
        design = "systematic_review"
    elif "Randomized Controlled Trial" in types and design not in {"rct", "crossover_rct"}:
        design = "rct"
    registration = appraisal.registration_id or (article.registry_ids[0] if article.registry_ids else None)
    return appraisal.model_copy(update={"design": design, "registration_id": registration})


def tiers_behind_verdict(verdict: str, links: list[tuple[str, str]]) -> list[str]:
    """The study tiers a verdict rests on: supporters for a positive verdict, refuters for 'unlikely'."""
    if verdict in {"strong", "moderate", "limited"}:
        return [tier for stance, tier in links if stance == "supports"]
    if verdict == "unlikely":
        return [tier for stance, tier in links if stance == "refutes"]
    return [tier for _, tier in links]


async def research_ingredient(
    ingredient: Ingredient,
    llm: ResearchLLM,
    http: httpx.AsyncClient,
    pubmed_sem: asyncio.Semaphore,
    *,
    max_studies: int = MAX_STUDIES,
) -> ResearchResult | None:
    name = ingredient.canonical_name
    claim_set = await llm.draft_claims(
        name, str(getattr(ingredient.category, "value", ingredient.category)),
        list(ingredient.synonyms or []), ingredient.mechanism_summary,
    )
    if claim_set is None or not claim_set.claims:
        print(f"    [{name}] no claims drafted")
        return None
    claims = sorted(claim_set.claims, key=lambda c: c.priority)
    names = _unique_names([*claim_set.search_names, name])
    print(f"    [{name}] {len(claims)} claims; searching as {', '.join(names)}")

    hits = await asyncio.gather(*(
        search_claim(http, pubmed_sem, names, claim, index) for index, claim in enumerate(claims)
    ))
    pmids = plan_studies(list(hits), max_studies=max_studies, per_claim_floor=PER_CLAIM_FLOOR)
    articles = [a for a in await pubmed.fetch_articles(http, pmids, pubmed_sem) if not a.retracted]
    print(f"    [{name}] {len(pmids)} papers planned, {len(articles)} with abstracts")

    appraisals = await asyncio.gather(*(llm.appraise(name, claims, article) for article in articles))
    failed = sum(1 for appraisal in appraisals if appraisal is None)
    if articles and failed / len(articles) > MAX_FAILED_APPRAISAL_SHARE:
        raise ResearchIncomplete(f"{failed} of {len(articles)} appraisals failed")
    studies: list[AppraisedStudy] = []
    off_target = 0
    for article, appraisal in zip(articles, appraisals):
        if appraisal is None:
            continue
        if not appraisal.tests_ingredient:
            off_target += 1
            continue
        appraisal = reconcile_design(appraisal, article)
        studies.append(AppraisedStudy(article, appraisal, weigh_study(appraisal)))
    print(f"    [{name}] {len(studies)} studies appraised ({off_target} did not test it)")

    judged = await asyncio.gather(*(
        _judge(llm, name, claim, index, studies, len(claims)) for index, claim in enumerate(claims)
    ))
    summary = await llm.summarize(name, [(j.draft, j.verdict) for j in judged])
    level = evidence_level_from_claims((j.verdict.verdict, j.verdict.certainty) for j in judged)
    return ResearchResult(
        claims=list(judged), studies=studies, summary=summary, evidence_level=level,
        skipped_off_target=off_target, search_names=names,
    )


async def store_research(session: AsyncSession, ingredient_id: uuid.UUID, result: ResearchResult) -> None:
    """Replace the ingredient's claims and evidence with this result. Caller commits."""
    await session.execute(delete(IngredientClaim).where(IngredientClaim.ingredient_id == ingredient_id))
    await session.execute(delete(IngredientEvidence).where(IngredientEvidence.ingredient_id == ingredient_id))

    evidence_by_pmid: dict[str, IngredientEvidence] = {}
    for study in result.studies:
        row = _evidence_row(ingredient_id, study)
        session.add(row)
        evidence_by_pmid[study.article.pmid] = row
    await session.flush()

    for position, judged in enumerate(result.claims):
        verdict = judged.verdict
        claim = IngredientClaim(
            ingredient_id=ingredient_id, position=position, kind=judged.draft.kind, claim=judged.draft.claim,
            why_people_believe=judged.draft.why_people_believe, search_terms=judged.draft.outcome_terms,
            verdict=verdict.verdict, certainty=verdict.certainty, certainty_reasons=verdict.certainty_reasons,
            reality=verdict.reality, effect_size=verdict.effect_size, applies_to=verdict.applies_to,
            avoid_if=verdict.avoid_if, dose_note=verdict.dose_note, key_pmids=verdict.key_pmids,
            study_count=len(judged.studies),
        )
        session.add(claim)
        await session.flush()
        for study in judged.studies:
            session.add(IngredientClaimEvidence(
                claim_id=claim.id, evidence_id=evidence_by_pmid[study.pmid].id,
                stance=study.stance, relevance=study.relevance,
            ))

    values: dict = {
        "research_status": ResearchStatus.COMPLETE,
        "researched_at": datetime.now(timezone.utc),
        "evidence_level": result.evidence_level,
    }
    if result.summary is not None:
        values["common_belief"] = result.summary.common_belief
        values["evidence_reality"] = result.summary.evidence_reality
    await session.execute(update(Ingredient).where(Ingredient.id == ingredient_id).values(**values))


async def search_claim(
    http: httpx.AsyncClient, sem: asyncio.Semaphore, names: list[str], claim: ClaimDraft, index: int
) -> ClaimHits:
    human_tiers = ("reviews", "trials", "observational")
    results = await asyncio.gather(*(
        pubmed.search(http, pubmed.build_query(names, claim.outcome_terms, tier), SEARCH_CAPS[tier], sem)
        for tier in human_tiers
    ))
    by_tier = dict(zip(human_tiers, results))
    # Harm is often shown first in animals, cells or food chemistry, so safety claims
    # always see that work; benefit claims only fall back to it without human studies.
    if claim.kind == "safety" or sum(len(ids) for ids in results) < 2:
        query = pubmed.build_query(names, claim.outcome_terms, "preclinical")
        by_tier["preclinical"] = await pubmed.search(http, query, SEARCH_CAPS["preclinical"], sem)
    return ClaimHits(claim_index=index, priority=claim.priority, by_tier=by_tier)


async def _judge(
    llm: ResearchLLM, name: str, claim: ClaimDraft, index: int, studies: list[AppraisedStudy], claim_count: int
) -> JudgedClaim:
    linked: list[StudyForVerdict] = []
    for study in studies:
        for link in study.appraisal.claim_links:
            if link.claim_number == index + 1 and 1 <= link.claim_number <= claim_count:
                linked.append(StudyForVerdict(
                    pmid=study.article.pmid, appraisal=study.appraisal, weighting=study.weighting,
                    stance=link.stance, relevance=link.relevance,
                ))
                break
    linked.sort(key=lambda s: s.weighting.score, reverse=True)

    verdict = await llm.judge_claim(name, claim, linked[:MAX_STUDIES_PER_VERDICT]) if linked else None
    if verdict is None and linked:
        raise ResearchIncomplete(f"verdict for {claim.claim!r} failed")
    if verdict is None:
        verdict = ClaimVerdict(
            verdict="insufficient", certainty="very_low", certainty_reasons=["No usable studies"],
            reality=NO_STUDIES_REALITY, effect_size=None, applies_to=None, avoid_if=None, dose_note=None,
            key_pmids=[],
        )
    tiers = tiers_behind_verdict(verdict.verdict, [(s.stance, s.weighting.tier) for s in linked])
    known = {s.pmid for s in linked}
    verdict = verdict.model_copy(update={
        "certainty": cap_certainty(verdict.certainty, tiers),
        "key_pmids": [pmid for pmid in verdict.key_pmids if pmid in known][:5],
    })
    return JudgedClaim(draft=claim, verdict=verdict, studies=linked)


def _evidence_row(ingredient_id: uuid.UUID, study: AppraisedStudy) -> IngredientEvidence:
    article, a, w = study.article, study.appraisal, study.weighting
    return IngredientEvidence(
        ingredient_id=ingredient_id,
        pmid=article.pmid,
        doi=article.doi,
        title=article.title,
        journal=_clip(article.journal, 255),
        year=article.year,
        raw_abstract=article.abstract,
        study_type=a.design,
        population=_clip(a.population, 150),
        sample_size=a.n_analyzed or a.n_enrolled,
        finding=a.finding,
        direction=legacy_direction(a),
        confidence=legacy_confidence(w.tier),
        concern_tags=list(a.concern_tags),
        goal_tags=list(a.goal_tags),
        appraisal={
            **a.model_dump(),
            "quality_score": w.score,
            "pubmed": {
                "publication_types": article.publication_types,
                "mesh_terms": article.mesh_terms,
                "registry_ids": article.registry_ids,
                "grant_agencies": article.grant_agencies,
                "coi_statement": article.coi_statement,
            },
        },
        method_summary=a.method_summary,
        caveat=a.caveat,
        quality_score=w.score,
        quality_tier=w.tier,
        quality_flags=[{"code": f.code, "label": f.label} for f in w.flags],
        intervention_form=_clip(a.intervention_form, 200),
        dose_amount=a.dose_amount,
        dose_unit=_clip(a.dose_unit, 30),
        dose_frequency=_clip(a.dose_frequency, 60),
        duration_weeks=a.duration_weeks,
        outcome_type=a.outcome_type,
    )


def _unique_names(names: list[str]) -> list[str]:
    """First spelling of each name; PubMed matching is case-insensitive."""
    unique: dict[str, str] = {}
    for raw in names:
        cleaned = raw.strip()
        if cleaned:
            unique.setdefault(cleaned.lower(), cleaned)
    return list(unique.values())


def _clip(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    return value if len(value) <= limit else value[: limit - 1] + "…"
