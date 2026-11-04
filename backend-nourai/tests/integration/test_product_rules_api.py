"""Product rows carry a rule note only from their own label names; E-number-only matches become extras."""
from datetime import datetime, timezone

import pytest

from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.product import Product, ProductIngredient
from app.models.regulation import IngredientSubstance, RegulatedSubstance, RegulatoryRule, SubstanceAlias
from app.services.regulation.identifiers import alias_key

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


async def _substance(session, name, aliases, rules, e_number=None):
    substance = RegulatedSubstance(name=name, e_number=e_number)
    session.add(substance)
    await session.flush()
    for alias, alias_type in aliases:
        session.add(SubstanceAlias(substance_id=substance.id, alias=alias,
                                   normalized_alias=alias_key(alias, alias_type), alias_type=alias_type))
    for place, status, scope in rules:
        session.add(RegulatoryRule(
            substance_id=substance.id, place=place, authority="Authority", kind="law", status=status,
            applies_to=scope, source_url="https://example.gov/rule", last_checked_at=NOW,
            origin="bulk", review_status="published",
        ))
    await session.flush()
    return substance


async def _product(session, category, names, additives=()):
    product = Product(name="Test product", brand="Brand", category=category,
                      extra_data={"additives_tags": list(additives)})
    session.add(product)
    await session.flush()
    for i, name in enumerate(names):
        session.add(ProductIngredient(product_id=product.id, name=name, order_position=i))
    await session.flush()
    return product


@pytest.fixture
async def candy():
    async with async_session_factory() as session:
        tio2 = await _substance(session, "Titanium dioxide", [("titanium dioxide", "name"), ("E171", "e_number")],
                                [("EU", "not_authorised", "food_additive")], e_number="E171")
        await _substance(session, "Tartrazine", [("E102", "e_number")],
                         [("EU", "warning_label", "food_additive")], e_number="E102")
        product = await _product(session, "food", ["Sugar", "Colour: titanium dioxide"], ["en:e171", "en:e102"])
        await session.commit()
        return {"product": str(product.id), "tio2": str(tio2.id)}


def _row(body, name):
    return next(i for i in body["ingredients"] if i["name"] == name)


async def test_row_note_from_label_name(client, candy):
    body = (await client.get(f"/api/v1/products/{candy['product']}?country=CA")).json()
    row = _row(body, "Colour: titanium dioxide")
    assert row["rule_note"]["text"] == "Not authorised as a food additive in the EU"
    assert row["rule_substance_id"] == candy["tio2"]
    assert _row(body, "Sugar")["rule_note"] is None


async def test_tag_only_match_becomes_rule_extra(client, candy):
    body = (await client.get(f"/api/v1/products/{candy['product']}?country=CA")).json()
    [extra] = body["rule_extras"]
    assert extra["text"] == "Warning label required in the EU"
    assert extra["substance_name"] == "Tartrazine"


async def test_glance_counts(client, candy):
    in_france = (await client.get(f"/api/v1/products/{candy['product']}?country=FR")).json()
    assert in_france["rules_glance"] == {"where_you_live": 2, "elsewhere": 0}
    in_canada = (await client.get(f"/api/v1/products/{candy['product']}?country=CA")).json()
    assert in_canada["rules_glance"] == {"where_you_live": 0, "elsewhere": 2}


async def test_canonical_link_never_used_for_notes(client):
    async with async_session_factory() as session:
        curcumin = Ingredient(canonical_name="Curcumin", category="herb", synonyms=[])
        session.add(curcumin)
        await session.flush()
        e100 = await _substance(session, "Curcumin (E100)", [("E100", "e_number")],
                                [("EU", "warning_label", "food_additive")], e_number="E100")
        session.add(IngredientSubstance(ingredient_id=curcumin.id, substance_id=e100.id))
        product = await _product(session, "food", ["Turmeric"])
        await session.execute(
            ProductIngredient.__table__.update()
            .where(ProductIngredient.product_id == product.id)
            .values(ingredient_id=curcumin.id)
        )
        await session.commit()
        product_id = str(product.id)
    body = (await client.get(f"/api/v1/products/{product_id}?country=FR")).json()
    assert _row(body, "Turmeric")["rule_note"] is None
    assert body["rules_glance"] is None


async def test_cosmetic_ignores_food_additive_rules(client):
    async with async_session_factory() as session:
        await _substance(session, "Titanium dioxide", [("titanium dioxide", "name")],
                         [("EU", "not_authorised", "food_additive")], e_number="E171")
        product = await _product(session, "cosmetic", ["Titanium dioxide"])
        await session.commit()
        product_id = str(product.id)
    body = (await client.get(f"/api/v1/products/{product_id}?country=FR")).json()
    row = _row(body, "Titanium dioxide")
    assert row["rule_note"] is None
    assert row["rule_substance_id"] is not None



async def test_row_without_servable_rules_has_no_substance_link(client):
    async with async_session_factory() as session:
        bvo = await _substance(session, "Brominated vegetable oil", [("brominated vegetable oil", "name")], [])
        session.add(RegulatoryRule(
            substance_id=bvo.id, place="US-CA", authority="California", kind="law", status="banned",
            applies_to="food_additive", source_url="https://leginfo.legislature.ca.gov/x", last_checked_at=NOW,
            origin="curated", review_status="draft",
        ))
        product = await _product(session, "food", ["Brominated vegetable oil"])
        await session.commit()
        product_id = str(product.id)
    row = _row((await client.get(f"/api/v1/products/{product_id}?country=US")).json(), "Brominated vegetable oil")
    assert row["rule_note"] is None and row["rule_substance_id"] is None
