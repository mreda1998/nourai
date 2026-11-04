"""Curated drafts and proposed checks are stored but never served until reviewed."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.regulation import IngredientSubstance, RegulatedSubstance, RegulatoryRule, RuleCheck
from app.services.regulation.curation import CheckedPlace, CuratedRuleDraft, DraftResult, store_drafts
from app.services.regulation.documents import DocumentText

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 4, tzinfo=timezone.utc)
URL = "https://www.legislation.gov.uk/example"


async def test_drafts_stored_unserved(client):
    async with async_session_factory() as session:
        ingredient = Ingredient(canonical_name="Melatonin", category="hormone", synonyms=[], research_status="complete")
        substance = RegulatedSubstance(name="Melatonin")
        session.add_all([ingredient, substance])
        await session.flush()
        session.add(IngredientSubstance(ingredient_id=ingredient.id, substance_id=substance.id))
        draft = CuratedRuleDraft(
            place="GB", authority="MHRA", kind="law", status="prescription_only", applies_to="supplement",
            condition_en="Classed as a medicine; not sold as a supplement",
            source_quote="Melatonin is a prescription-only medicine in the United Kingdom.",
            quote_location="Section 2", source_url=URL,
        )
        result = DraftResult(kept=[draft], dropped=[], checked=[(CheckedPlace(place="GB", applies_to="food"), URL)])
        document = DocumentText(url=URL, title="Example", text="…", content_hash="abc", fetched_at=NOW)
        stored = await store_drafts(session, substance.id, result, [document], NOW)
        await session.commit()
        ingredient_id = ingredient.id
        [rule] = (await session.execute(select(RegulatoryRule))).scalars().all()
        [check] = (await session.execute(select(RuleCheck))).scalars().all()

    assert stored == 1
    assert (rule.review_status, rule.origin) == ("draft", "curated")
    assert rule.condition == "Classed as a medicine; not sold as a supplement"
    assert rule.source_quote.startswith("Melatonin is a prescription-only")
    assert (check.status, check.documents) == ("pending", [URL])

    body = (await client.get(f"/api/v1/ingredients/{ingredient_id}?country=GB")).json()
    assert body["rules"] is None or body["rules"]["substances"] == []
