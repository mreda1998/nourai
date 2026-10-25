"""Which papers get read, how PubMed metadata corrects an appraisal, and what caps a verdict."""
import asyncio
from types import SimpleNamespace

import httpx
import pytest

from app.services.research.pipeline import (
    ClaimHits,
    plan_studies,
    reconcile_design,
    research_ingredient,
    search_claim,
    tiers_behind_verdict,
)
from app.services.research import pubmed
from app.services.research.pubmed import PubMedUnavailable
from app.services.research.schemas import ClaimSet
from tests.research_factories import make_appraisal, make_article, make_claim


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
