"""Substances, their rules and the places we checked, stored and linked to ingredients."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.regulation import (
    IngredientSubstance,
    RegulatedSubstance,
    RegulatoryRule,
    RuleCheck,
    SubstanceAlias,
)

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 4, tzinfo=timezone.utc)


async def test_rule_round_trip():
    async with async_session_factory() as session:
        ingredient = Ingredient(canonical_name="Titanium dioxide", category="additive", synonyms=[])
        substance = RegulatedSubstance(name="Titanium dioxide", e_number="E171")
        session.add_all([ingredient, substance])
        await session.flush()
        session.add_all([
            SubstanceAlias(substance_id=substance.id, alias="titanium dioxide",
                           normalized_alias="titanium dioxide", alias_type="name", language="en"),
            IngredientSubstance(ingredient_id=ingredient.id, substance_id=substance.id,
                                scope_label="As a food additive (E171)"),
            RegulatoryRule(
                substance_id=substance.id, place="EU", authority="European Commission", kind="law",
                status="not_authorised", applies_to="food_additive",
                source_url="https://eur-lex.europa.eu/eli/reg/2022/63/oj", last_checked_at=NOW,
                origin="bulk", review_status="published",
            ),
            RuleCheck(substance_id=substance.id, place="CA", applies_to="food_additive",
                      checked_at=NOW, origin="bulk"),
        ])
        await session.commit()
        ingredient_id = ingredient.id

    async with async_session_factory() as session:
        loaded = (await session.execute(
            select(Ingredient).where(Ingredient.id == ingredient_id).options(
                selectinload(Ingredient.substances).selectinload(RegulatedSubstance.rules),
                selectinload(Ingredient.substances).selectinload(RegulatedSubstance.checks),
                selectinload(Ingredient.substances).selectinload(RegulatedSubstance.aliases),
            )
        )).scalar_one()
        [substance] = loaded.substances
        assert substance.rules[0].status == "not_authorised"
        assert substance.checks[0].status == "confirmed"
        assert substance.aliases[0].approved is True


async def test_rule_check_unique():
    async with async_session_factory() as session:
        substance = RegulatedSubstance(name="Tartrazine", e_number="E102")
        session.add(substance)
        await session.flush()
        for _ in range(2):
            session.add(RuleCheck(substance_id=substance.id, place="CA", applies_to="food_additive",
                                  checked_at=NOW, origin="bulk"))
        with pytest.raises(IntegrityError):
            await session.commit()


async def test_expert_view_may_omit_scope_but_law_may_not():
    async with async_session_factory() as session:
        substance = RegulatedSubstance(name="Aspartame", e_number="E951")
        session.add(substance)
        await session.flush()
        session.add(RegulatoryRule(
            substance_id=substance.id, place="IARC", authority="IARC", kind="expert_view",
            status="classification", classification="Group 2B", applies_to=None,
            source_url="https://monographs.iarc.who.int/list-of-classifications/", last_checked_at=NOW,
            origin="bulk", review_status="published",
        ))
        await session.commit()
        session.add(RegulatoryRule(
            substance_id=substance.id, place="EU", authority="European Commission", kind="law",
            status="allowed_with_limits", applies_to=None,
            source_url="https://eur-lex.europa.eu/", last_checked_at=NOW, origin="bulk",
        ))
        with pytest.raises(IntegrityError):
            await session.commit()
