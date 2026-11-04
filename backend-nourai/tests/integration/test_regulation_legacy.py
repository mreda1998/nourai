"""Peptide status fields for older app builds come from sourced, published rules — never from seed data."""
from datetime import datetime, timezone

import pytest

from app.db.session import async_session_factory
from app.models.ingredient import Ingredient
from app.models.regulation import IngredientSubstance, RegulatedSubstance, RegulatoryRule, RuleCheck
from app.services.regulation.legacy import sync_legacy_peptide_fields

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 4, tzinfo=timezone.utc)


async def _peptide(session, name, status_seed=None):
    ingredient = Ingredient(canonical_name=name, category="peptide", synonyms=[], wada_status=status_seed)
    substance = RegulatedSubstance(name=name)
    session.add_all([ingredient, substance])
    await session.flush()
    session.add(IngredientSubstance(ingredient_id=ingredient.id, substance_id=substance.id))
    return ingredient, substance


def _rule(substance, place, status, scope, **kw):
    return RegulatoryRule(substance_id=substance.id, place=place, authority="WADA" if place == "WADA" else "FDA",
                          kind="law", status=status, applies_to=scope, source_url="https://www.wada-ama.org/x",
                          last_checked_at=NOW, origin="curated", review_status="published", **kw)


async def test_bpc157_prohibited_from_rule():
    async with async_session_factory() as session:
        ingredient, substance = await _peptide(session, "BPC-157", status_seed="not_prohibited")
        session.add_all([
            _rule(substance, "WADA", "banned", "sport", sub_scope="S0 Non-approved substances; at all times"),
            _rule(substance, "US", "listed", "medicine", classification="research_chemical"),
        ])
        await session.flush()
        updated = await sync_legacy_peptide_fields(session)
        await session.refresh(ingredient)
    assert updated == 1
    assert ingredient.wada_status == "prohibited_all"
    assert ingredient.us_regulatory_status == "research_chemical"


async def test_in_competition_only():
    async with async_session_factory() as session:
        ingredient, substance = await _peptide(session, "Peptide X")
        session.add(_rule(substance, "WADA", "banned", "sport", sub_scope="S2; in-competition"))
        await session.flush()
        await sync_legacy_peptide_fields(session)
        await session.refresh(ingredient)
    assert ingredient.wada_status == "prohibited_in_competition"


async def test_no_check_no_status():
    async with async_session_factory() as session:
        ingredient, _ = await _peptide(session, "GHK-Cu", status_seed="not_prohibited")
        await session.flush()
        await sync_legacy_peptide_fields(session)
        await session.refresh(ingredient)
    assert ingredient.wada_status is None


async def test_confirmed_wada_check_means_not_prohibited():
    async with async_session_factory() as session:
        ingredient, substance = await _peptide(session, "Collagen peptides")
        session.add(RuleCheck(substance_id=substance.id, place="WADA", applies_to="sport", checked_at=NOW,
                              origin="curated", status="confirmed"))
        await session.flush()
        await sync_legacy_peptide_fields(session)
        await session.refresh(ingredient)
    assert ingredient.wada_status == "not_prohibited"


async def test_fda_approved_medicine():
    async with async_session_factory() as session:
        ingredient, substance = await _peptide(session, "Semaglutide")
        session.add(_rule(substance, "US", "prescription_only", "medicine"))
        await session.flush()
        await sync_legacy_peptide_fields(session)
        await session.refresh(ingredient)
    assert ingredient.us_regulatory_status == "fda_approved"
