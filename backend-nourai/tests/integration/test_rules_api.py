"""The ingredient page and the substance endpoint serve published rules only, grouped by substance."""
from datetime import datetime, timezone

import pytest

from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.regulation import IngredientSubstance, RegulatedSubstance, RegulatoryRule

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def _rule(substance, place, status, scope, review_status="published", **kw):
    return RegulatoryRule(
        substance_id=substance.id, place=place, authority="Authority", kind="law", status=status,
        applies_to=scope, source_url=f"https://example.gov/{place.lower()}", last_checked_at=NOW,
        origin="bulk", review_status=review_status, **kw,
    )


@pytest.fixture
async def titanium():
    async with async_session_factory() as session:
        ingredient = Ingredient(canonical_name="Titanium dioxide", category="additive", synonyms=[],
                                research_status="complete")
        e171 = RegulatedSubstance(name="Titanium dioxide (E171)", e_number="E171")
        ci = RegulatedSubstance(name="Titanium dioxide (CI 77891)")
        session.add_all([ingredient, e171, ci])
        await session.flush()
        session.add_all([
            IngredientSubstance(ingredient_id=ingredient.id, substance_id=e171.id,
                                scope_label="As a food additive (E171)"),
            IngredientSubstance(ingredient_id=ingredient.id, substance_id=ci.id,
                                scope_label="As a cosmetic colour (CI 77891)"),
        ])
        draft = _rule(e171, "FR", "banned", "food", review_status="draft")
        session.add_all([
            _rule(e171, "EU", "not_authorised", "food_additive", legal_reference="Regulation (EU) 2022/63"),
            _rule(e171, "US", "allowed_with_limits", "food_additive", condition="Up to 1% by weight",
                  legal_reference="21 CFR 73.575"),
            draft,
            _rule(ci, "EU", "allowed_with_limits", "cosmetic"),
        ])
        await session.commit()
        return {"ingredient": str(ingredient.id), "e171": str(e171.id), "draft": str(draft.id)}


async def test_ingredient_rules_grouped_by_substance(client, titanium):
    response = await client.get(f"/api/v1/ingredients/{titanium['ingredient']}?country=CA")
    assert response.status_code == 200
    rules = response.json()["rules"]
    assert rules["country"] == "CA"
    by_label = {s["scope_label"]: s for s in rules["substances"]}
    assert set(by_label) == {"As a food additive (E171)", "As a cosmetic colour (CI 77891)"}
    e171 = by_label["As a food additive (E171)"]
    assert e171["summary"] == "Not authorised as a food additive in the EU. Allowed with limits in the US."
    us = next(row for row in e171["places"] if row["place"] == "US")
    assert us["rules"][0]["condition"] == "Up to 1% by weight"
    assert us["rules"][0]["status_label"] == "Allowed with limits"
    assert us["rules"][0]["source"]["legal_reference"] == "21 CFR 73.575"
    served = [r["id"] for s in rules["substances"] for row in s["places"] for r in row["rules"]]
    assert titanium["draft"] not in served
    assert "FR" not in [row["place"] for row in e171["places"]]


async def test_legacy_fields_still_present(client, titanium):
    body = (await client.get(f"/api/v1/ingredients/{titanium['ingredient']}")).json()
    assert "us_regulatory_status" in body and "wada_status" in body


async def test_bad_country_falls_back(client, titanium):
    response = await client.get(f"/api/v1/ingredients/{titanium['ingredient']}?country=zzz")
    assert response.status_code == 200
    assert response.json()["rules"]["country"] == "CA"


async def test_substance_endpoint(client, titanium):
    response = await client.get(f"/api/v1/substances/{titanium['e171']}?country=FR")
    assert response.status_code == 200
    body = response.json()
    assert body["e_number"] == "E171"
    assert body["ingredient_ids"] == [titanium["ingredient"]]
    first = body["rules"]["substances"][0]["places"][0]
    assert first["place_name"] == "France"
    assert first["via_place"] == "EU"
    assert first["is_yours"] is True


async def test_unknown_substance_404(client):
    response = await client.get("/api/v1/substances/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_ingredient_without_substances_has_no_rules(client):
    async with async_session_factory() as session:
        ingredient = Ingredient(canonical_name="Magnesium", category="mineral", synonyms=[],
                                research_status="complete")
        session.add(ingredient)
        await session.commit()
        ingredient_id = str(ingredient.id)
    body = (await client.get(f"/api/v1/ingredients/{ingredient_id}")).json()
    assert body["rules"] is None
