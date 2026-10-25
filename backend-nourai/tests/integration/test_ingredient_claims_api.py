"""The ingredient deep dive returns claims with verdicts and how each study was done."""
import pytest

from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.ingredient_claim import IngredientClaim, IngredientClaimEvidence
from app.models.ingredient_evidence import IngredientEvidence

pytestmark = pytest.mark.anyio


@pytest.fixture
async def curcumin_id():
    async with async_session_factory() as session:
        ingredient = Ingredient(canonical_name="Curcumin", category="herb", synonyms=[], evidence_level="moderate",
                                research_status="complete")
        session.add(ingredient)
        await session.flush()
        legacy = IngredientEvidence(ingredient_id=ingredient.id, pmid="1", finding="Old finding.", direction="benefit",
                                    confidence="high", year=2024)
        trial = IngredientEvidence(
            ingredient_id=ingredient.id, pmid="2", finding="Less pain than placebo.", direction="benefit",
            confidence="moderate", year=2020, study_type="rct",
            method_summary="140 adults with knee pain took 1 g a day or a placebo for 12 weeks.",
            caveat="Funded by the maker.", quality_score=0.54, quality_tier="moderate",
            quality_flags=[{"code": "industry", "label": "Industry-funded"}],
            intervention_form="turmeric extract", dose_amount=1000, dose_unit="mg", dose_frequency="once daily",
            duration_weeks=12, outcome_type="patient_reported",
        )
        review = IngredientEvidence(
            ingredient_id=ingredient.id, pmid="3", finding="Pooled trials found less pain.", direction="benefit",
            confidence="high", year=2018, study_type="meta_analysis", quality_score=0.95, quality_tier="high",
            quality_flags=[],
        )
        session.add_all([legacy, trial, review])
        await session.flush()
        claim = IngredientClaim(
            ingredient_id=ingredient.id, position=0, kind="benefit", claim="Eases joint pain",
            why_people_believe="Traditional use and marketing.", verdict="moderate", certainty="moderate",
            certainty_reasons=["Small trials"], reality="Modest relief in knee osteoarthritis.",
            key_pmids=["3"], study_count=2,
        )
        session.add(claim)
        await session.flush()
        session.add_all([
            IngredientClaimEvidence(claim_id=claim.id, evidence_id=review.id, stance="supports", relevance="direct"),
            IngredientClaimEvidence(claim_id=claim.id, evidence_id=trial.id, stance="supports", relevance="direct"),
        ])
        await session.commit()
        return str(ingredient.id), str(trial.id), str(review.id)


async def test_deep_dive_returns_claims_and_study_methods(client, curcumin_id):
    ingredient_id, trial_id, review_id = curcumin_id
    response = await client.get(f"/api/v1/ingredients/{ingredient_id}")
    assert response.status_code == 200
    body = response.json()

    [claim] = body["claims"]
    assert claim["claim"] == "Eases joint pain"
    assert claim["verdict"] == "moderate" and claim["certainty"] == "moderate"
    assert claim["certainty_reasons"] == ["Small trials"]
    # A claim's studies come strongest first.
    assert [s["evidence_id"] for s in claim["studies"]] == [review_id, trial_id]
    assert claim["studies"][0]["stance"] == "supports"

    # Appraised studies first by weight; studies from the old pipeline keep their order after them.
    assert [e["pmid"] for e in body["evidence"]] == ["3", "2", "1"]
    trial = body["evidence"][1]
    assert trial["method_summary"].startswith("140 adults")
    assert trial["quality_tier"] == "moderate"
    assert trial["quality_flags"] == [{"code": "industry", "label": "Industry-funded"}]
    assert (trial["dose_amount"], trial["dose_unit"], trial["duration_weeks"]) == (1000, "mg", 12)

    # Older app builds still get every field they read.
    legacy = body["evidence"][2]
    assert legacy["finding"] == "Old finding." and legacy["confidence"] == "high"
    assert legacy["quality_flags"] == [] and legacy["method_summary"] is None
