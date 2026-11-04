"""Label names and E-numbers match substances through approved, unambiguous aliases only."""
import pytest

from app.db.session import async_session_factory
from app.models.regulation import RegulatedSubstance, SubstanceAlias
from app.services.regulation.identifiers import alias_key
from app.services.regulation.matching import match_substances

pytestmark = pytest.mark.anyio


async def _substance(session, name, aliases, e_number=None):
    substance = RegulatedSubstance(name=name, e_number=e_number)
    session.add(substance)
    await session.flush()
    for alias, alias_type, language, approved in aliases:
        session.add(SubstanceAlias(
            substance_id=substance.id, alias=alias, normalized_alias=alias_key(alias, alias_type),
            alias_type=alias_type, language=language, approved=approved,
        ))
    await session.flush()
    return substance


async def test_name_and_e_number_match():
    async with async_session_factory() as session:
        tio2 = await _substance(session, "Titanium dioxide", [
            ("titanium dioxide", "name", "en", True),
            ("dioxyde de titane", "name", "fr", True),
            ("E171", "e_number", "", True),
        ], e_number="E171")
        by_name, by_e = await match_substances(session, ["Dioxyde de titane"], ["en:e171"])
    assert by_name["Dioxyde de titane"].substance_id == tio2.id
    assert by_name["Dioxyde de titane"].via == "name"
    assert by_e["en:e171"].substance_id == tio2.id
    assert by_e["en:e171"].via == "e_number"


async def test_ambiguous_alias_stays_unmatched():
    async with async_session_factory() as session:
        await _substance(session, "Tocopherol", [("vitamin e", "name", "en", True)])
        await _substance(session, "Tocopheryl acetate", [("vitamin e", "name", "en", True)])
        by_name, _ = await match_substances(session, ["Vitamin E"], [])
    assert "Vitamin E" not in by_name


async def test_unapproved_alias_ignored():
    async with async_session_factory() as session:
        await _substance(session, "Carmine", [("cochineal", "name", "en", False)])
        by_name, _ = await match_substances(session, ["Cochineal"], [])
    assert by_name == {}
