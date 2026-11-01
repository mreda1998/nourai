"""Which papers get read, how PubMed metadata corrects an appraisal, and what caps a verdict."""
import asyncio
from types import SimpleNamespace

import httpx
import pytest

from app.services.research.pipeline import (
    ClaimHits,
    ResearchIncomplete,
    plan_studies,
    reconcile_design,
    research_ingredient,
    search_claim,
    tiers_behind_verdict,
)
from app.services.research import pubmed
from app.services.research.pubmed import PubMedUnavailable
from app.services.research.schemas import ClaimSet, ClaimVerdict
from tests.research_factories import link, make_appraisal, make_article, make_claim


class _ClaimsOnlyLLM:
    async def draft_claims(self, *args):
        return ClaimSet(search_names=["curcumin"], claims=[make_claim("Eases joint pain")])


@pytest.mark.anyio
async def test_an_unreachable_pubmed_fails_the_research_instead_of_judging_claims_on_nothing(monkeypatch):
    """Otherwise a network outage would replace good research with 'not enough research'."""
    monkeypatch.setattr(pubmed, "_RETRY_DELAYS", (0, 0))
    attempts = []

    def offline(request: httpx.Request) -> httpx.Response:
        attempts.append(request.url.path)
        raise httpx.ConnectError("nodename nor servname provided", request=request)

    ingredient = SimpleNamespace(canonical_name="Curcumin", category="herb", synonyms=[], mechanism_summary=None)
    async with httpx.AsyncClient(transport=httpx.MockTransport(offline)) as http:
        with pytest.raises(PubMedUnavailable):
            await research_ingredient(ingredient, _ClaimsOnlyLLM(), http, asyncio.Semaphore(3))
    assert len(attempts) >= 3  # retried before giving up


class _FlakyLLM:
    """Claims and papers come back; verdicts or appraisals can fail transiently (None)."""

    def __init__(self, *, verdicts_fail=False, appraisals_fail=0):
        self.verdicts_fail, self.appraisals_fail = verdicts_fail, appraisals_fail
        self.appraised = 0

    async def draft_claims(self, *args):
        return ClaimSet(search_names=["curcumin"], claims=[make_claim("Eases joint pain", terms=["joint pain"])])

    async def appraise(self, name, claims, article):
        self.appraised += 1
        if self.appraised <= self.appraisals_fail:
            return None
        return make_appraisal(claim_links=[link(1)])

    async def judge_claim(self, *args):
        return None if self.verdicts_fail else ClaimVerdict(
            verdict="moderate", certainty="moderate", certainty_reasons=[], reality="ok", effect_size=None,
            applies_to=None, avoid_if=None, dose_note=None, key_pmids=[],
        )

    async def summarize(self, *args):
        return None


def _four_papers(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("esearch.fcgi"):
        return httpx.Response(200, json={"esearchresult": {"idlist": ["1", "2", "3", "4"]}})
    papers = "".join(
        f"<PubmedArticle><MedlineCitation><PMID>{p}</PMID><Article><ArticleTitle>t</ArticleTitle>"
        f"<Abstract><AbstractText>{'x' * 150}</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle>"
        for p in request.url.params["id"].split(",")
    )
    return httpx.Response(200, text=f"<PubmedArticleSet>{papers}</PubmedArticleSet>")


async def _research(llm):
    ingredient = SimpleNamespace(canonical_name="Curcumin", category="herb", synonyms=[], mechanism_summary=None)
    async with httpx.AsyncClient(transport=httpx.MockTransport(_four_papers)) as http:
        return await research_ingredient(ingredient, llm, http, asyncio.Semaphore(3))


@pytest.mark.anyio
async def test_a_verdict_that_failed_to_come_back_fails_the_research(monkeypatch):
    """A transient error must not be stored as 'not enough research' for a claim that has studies."""
    monkeypatch.setattr(pubmed, "_interval", lambda: 0)
    with pytest.raises(ResearchIncomplete, match="verdict"):
        await _research(_FlakyLLM(verdicts_fail=True))


@pytest.mark.anyio
async def test_losing_too_many_paper_reads_fails_the_research(monkeypatch):
    monkeypatch.setattr(pubmed, "_interval", lambda: 0)
    with pytest.raises(ResearchIncomplete, match="appraisals"):
        await _research(_FlakyLLM(appraisals_fail=2))  # 2 of 4 papers lost
    result = await _research(_FlakyLLM(appraisals_fail=0))
    assert len(result.studies) == 4


async def _searched_tiers(claim) -> list[str]:
    tiers = []

    def pubmed_api(request: httpx.Request) -> httpx.Response:
        term = request.url.params["term"]
        tiers.append(next(tier for tier in pubmed.TIERS if pubmed.build_query(["sucralose"], claim.outcome_terms, tier) == term))
        return httpx.Response(200, json={"esearchresult": {"idlist": ["1", "2", "3"]}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(pubmed_api)) as http:
        await search_claim(http, asyncio.Semaphore(3), ["sucralose"], claim, 0)
    return tiers


@pytest.mark.anyio
async def test_safety_claims_always_look_at_toxicology_too():
    """Harm is often first shown in animals or the lab; a safety verdict must see that work."""
    tiers = await _searched_tiers(make_claim("Forms harmful compounds when heated", kind="safety", terms=["heating"]))
    assert "preclinical" in tiers


@pytest.mark.anyio
async def test_benefit_claims_with_human_studies_skip_animal_work():
    tiers = await _searched_tiers(make_claim("Helps weight loss", terms=["weight loss"]))
    assert "preclinical" not in tiers


def test_every_claim_gets_studies_even_when_another_claim_has_many_trials():
    hits = [
        ClaimHits(claim_index=0, priority=1, by_tier={"reviews": ["r1", "r2"], "trials": [f"t{i}" for i in range(20)]}),
        ClaimHits(claim_index=1, priority=5, by_tier={"observational": ["o1", "o2", "o3"]}),
    ]
    planned = plan_studies(hits, max_studies=10, per_claim_floor=3)
    assert len(planned) == 10
    assert {"o1", "o2", "o3"} <= set(planned)
    assert planned[:2] == ["r1", "r2"]


def test_planning_prefers_reviews_then_trials_and_never_repeats_a_paper():
    hits = [
        ClaimHits(claim_index=0, priority=1, by_tier={"trials": ["shared", "t1"], "observational": ["o1"]}),
        ClaimHits(claim_index=1, priority=2, by_tier={"reviews": ["r1"], "trials": ["shared"]}),
    ]
    planned = plan_studies(hits, max_studies=10, per_claim_floor=1)
    assert planned.count("shared") == 1
    assert planned.index("r1") < planned.index("t1") < planned.index("o1")


def test_pubmed_publication_types_correct_the_design_and_fill_the_registry():
    article = make_article("1", publication_types=["Journal Article", "Randomized Controlled Trial"],
                           registry_ids=["NCT00000001"])
    fixed = reconcile_design(make_appraisal(design="cohort", registration_id=None), article)
    assert fixed.design == "rct"
    assert fixed.registration_id == "NCT00000001"

    meta = make_article("2", publication_types=["Meta-Analysis", "Systematic Review"])
    assert reconcile_design(make_appraisal(design="systematic_review"), meta).design == "meta_analysis"


def test_a_crossover_trial_stays_a_crossover_trial():
    article = make_article("1", publication_types=["Randomized Controlled Trial"])
    assert reconcile_design(make_appraisal(design="crossover_rct"), article).design == "crossover_rct"


def test_a_positive_verdict_is_capped_by_the_studies_that_support_it():
    links = [("supports", "low"), ("supports", "moderate"), ("refutes", "high")]
    assert tiers_behind_verdict("moderate", links) == ["low", "moderate"]
    assert tiers_behind_verdict("unlikely", links) == ["high"]
    assert tiers_behind_verdict("mixed", links) == ["low", "moderate", "high"]
