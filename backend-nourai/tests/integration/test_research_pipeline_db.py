"""Claim-based research end to end: PubMed and Claude faked, storage real."""
import asyncio
import json

import httpx
import pytest
from sqlalchemy import func, select

from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.ingredient_claim import IngredientClaim, IngredientClaimEvidence
from app.models.ingredient_evidence import IngredientEvidence
from app.services.research.pipeline import research_ingredient, store_research
from app.services.research.pubmed import build_query
from app.services.research.schemas import ClaimSet, ClaimVerdict, IngredientSummary
from tests.research_factories import link, make_appraisal, make_claim

pytestmark = pytest.mark.anyio

JOINTS = make_claim("Eases joint pain", priority=1, terms=["osteoarthritis"])
LIVER = make_claim("Can harm the liver", kind="safety", priority=2, terms=["liver injury"])

APPRAISALS = {
    "100": make_appraisal(design="meta_analysis", studies_included=12, n_enrolled=None, n_analyzed=None,
                          duration_weeks=None, claim_links=[link(1)], goal_tags=["less_inflammation"]),
    "101": make_appraisal(n_enrolled=34, n_analyzed=34, duration_weeks=1, blinding="open_label",
                          claim_links=[link(1)], method_summary="34 adults took 500 mg a day for a week."),
    "102": make_appraisal(tests_ingredient=False, claim_links=[link(1)]),
    "201": make_appraisal(design="cohort", randomized=None, blinding="not_applicable", control="not_applicable",
                          n_enrolled=5000, n_analyzed=5000, comparison_basis="association", outcome_type="safety",
                          result="favours_control", claim_links=[link(2)]),
}


class FakeLLM:
    def __init__(self):
        self.judged: dict[str, list[str]] = {}

    async def draft_claims(self, name, category, synonyms, mechanism):
        # "Curcumin" (the ingredient's own name) is folded into "curcumin": no duplicate search terms.
        return ClaimSet(search_names=NAMES, claims=[LIVER, JOINTS])

    async def appraise(self, name, claims, article):
        return APPRAISALS[article.pmid]

    async def judge_claim(self, name, claim, studies):
        self.judged[claim.claim] = [s.pmid for s in studies]
        verdict = "moderate" if claim is JOINTS else "limited"
        return ClaimVerdict(
            verdict=verdict, certainty="high", certainty_reasons=[], reality=f"Reality for {claim.claim}.",
            effect_size=None, applies_to=None, avoid_if=None, dose_note=None, key_pmids=["100", "999", "201"],
        )

    async def summarize(self, name, judged):
        return IngredientSummary(common_belief="People take curcumin for joints.", evidence_reality="It helps a bit.")


NAMES = ["curcumin", "turmeric"]
SEARCH_RESULTS = {
    build_query(NAMES, ["osteoarthritis"], "reviews"): ["100"],
    build_query(NAMES, ["osteoarthritis"], "trials"): ["101", "102"],
    build_query(NAMES, ["liver injury"], "observational"): ["201"],
}


def _pubmed(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("esearch.fcgi"):
        ids = SEARCH_RESULTS.get(request.url.params["term"], [])
        return httpx.Response(200, json={"esearchresult": {"idlist": ids}})
    pmids = request.url.params["id"].split(",")
    articles = "".join(
        f"<PubmedArticle><MedlineCitation><PMID>{p}</PMID><Article><Journal><Title>J</Title></Journal>"
        f"<ArticleTitle>Study {p}</ArticleTitle><Abstract><AbstractText>{'x' * 150}</AbstractText></Abstract>"
        f"</Article></MedlineCitation></PubmedArticle>"
        for p in pmids
    )
    return httpx.Response(200, text=f"<PubmedArticleSet>{articles}</PubmedArticleSet>")


async def _run(llm: FakeLLM) -> Ingredient:
    async with async_session_factory() as session:
        ingredient = (await session.execute(select(Ingredient))).scalar_one()
    async with httpx.AsyncClient(transport=httpx.MockTransport(_pubmed)) as http:
        result = await research_ingredient(ingredient, llm, http, asyncio.Semaphore(3))
    async with async_session_factory() as session:
        await store_research(session, ingredient.id, result)
        await session.commit()
    return ingredient


@pytest.fixture
async def curcumin():
    async with async_session_factory() as session:
        session.add(Ingredient(canonical_name="Curcumin", category="herb", synonyms=["turmeric"]))
        await session.commit()


async def test_research_stores_claims_judged_from_weighed_studies(curcumin):
    llm = FakeLLM()
    ingredient = await _run(llm)

    async with async_session_factory() as session:
        claims = (await session.execute(
            select(IngredientClaim).where(IngredientClaim.ingredient_id == ingredient.id)
            .order_by(IngredientClaim.position)
        )).scalars().all()
        evidence = {e.pmid: e for e in (await session.execute(select(IngredientEvidence))).scalars()}
        links = (await session.execute(select(IngredientClaimEvidence))).scalars().all()
        stored = await session.get(Ingredient, ingredient.id)

    # Claims in order of how common the belief is; the meta-analysis is weighed first.
    assert [c.claim for c in claims] == ["Eases joint pain", "Can harm the liver"]
    assert llm.judged["Eases joint pain"] == ["100", "101"]
    assert claims[0].study_count == 2 and claims[0].certainty == "high"
    assert claims[0].key_pmids == ["100"]  # PMIDs the model wasn't given are dropped
    # A cohort can't carry a high-certainty verdict.
    assert claims[1].certainty == "moderate"
    assert len(links) == 3

    # The off-target paper is not stored; how each study was done is.
    assert set(evidence) == {"100", "101", "201"}
    small = evidence["101"]
    assert small.method_summary == "34 adults took 500 mg a day for a week."
    assert small.quality_tier == "low"
    assert {f["label"] for f in small.quality_flags} >= {"Small study (34 people)", "Lasted 1 week", "Not blinded"}
    assert small.confidence == "low" and small.direction == "benefit"
    assert small.dose_amount == 1000 and small.duration_weeks == 1
    assert evidence["201"].direction == "risk"
    assert evidence["100"].goal_tags == ["less_inflammation"]

    assert stored.evidence_level == "strong"
    assert stored.common_belief == "People take curcumin for joints."
    assert stored.research_status == "complete"


async def test_a_rerun_replaces_the_previous_research(curcumin):
    await _run(FakeLLM())
    await _run(FakeLLM())
    async with async_session_factory() as session:
        claim_count = await session.scalar(select(func.count()).select_from(IngredientClaim))
        evidence_count = await session.scalar(select(func.count()).select_from(IngredientEvidence))
    assert (claim_count, evidence_count) == (2, 3)
