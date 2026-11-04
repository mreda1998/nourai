"""Bulk lists publish their rules, keep history when a row changes, and derive "not authorised"."""
import json
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.regulation import RegulatedSubstance, RegulatoryRule
from app.services.regulation.importer import (
    ParsedList,
    ParsedRule,
    ParsedSubstance,
    derive_not_authorised,
    import_list,
)

pytestmark = pytest.mark.anyio

NOW = datetime(2026, 11, 4, tzinfo=timezone.utc)
BASIS = ("Only food additives included in the Union list in Annex II may be placed on the market as such "
         "and used in foods under the conditions of use specified therein.")


class FakePositiveList:
    """A tiny positive additive list whose raw bytes are JSON: {"E171": "condition", ...}."""

    name = "Test additive list"
    licence_name = "Test licence"
    licence_url = "https://example.gov/licence"
    default_url = "https://example.gov/list"

    derivable = True

    def __init__(self) -> None:
        self.slug = f"test-list-{uuid.uuid4().hex[:8]}"

    def parse(self, raw: bytes) -> ParsedList:
        rows = json.loads(raw)
        return ParsedList(
            place="EU", applies_to="food_additive", semantics="positive",
            legal_reference="Regulation (EC) No 1333/2008, Article 4(1)", legal_basis_quote=BASIS,
            substances=[ParsedSubstance(key=code, name=f"Additive {code}", e_number=code) for code in rows],
            rules=[
                ParsedRule(substance_key=code, place="EU", authority="European Commission", kind="law",
                           status="allowed_with_limits", applies_to="food_additive", condition=condition,
                           legal_reference="Regulation (EC) No 1333/2008, Annex II",
                           source_url=self.default_url, row_ref=code)
                for code, condition in rows.items()
            ],
        )


def _raw(rows: dict) -> bytes:
    return json.dumps(rows).encode()


async def _rules(session, **where):
    stmt = select(RegulatoryRule)
    for column, value in where.items():
        stmt = stmt.where(getattr(RegulatoryRule, column) == value)
    return (await session.execute(stmt)).scalars().all()


async def test_first_import_publishes():
    source = FakePositiveList()
    async with async_session_factory() as session:
        result = await import_list(session, source, _raw({"E171": "Permitted in 2 food categories"}), source.default_url, NOW)
        await session.commit()
        [rule] = await _rules(session)
    assert result.created == 1 and result.substances_created == 1
    assert rule.review_status == "published" and rule.origin == "bulk"
    assert rule.condition == "Permitted in 2 food categories"
    assert rule.source_record_id is not None


async def test_reimport_unchanged_is_noop():
    source = FakePositiveList()
    raw = _raw({"E171": "Permitted in 2 food categories"})
    async with async_session_factory() as session:
        await import_list(session, source, raw, source.default_url, NOW)
        again = await import_list(session, source, raw, source.default_url, NOW)
        await session.commit()
        rules = await _rules(session)
    assert (again.created, again.retired) == (0, 0)
    assert len(rules) == 1


async def test_changed_row_retires_old_rule():
    source = FakePositiveList()
    async with async_session_factory() as session:
        await import_list(session, source, _raw({"E171": "Permitted in 2 food categories"}), source.default_url, NOW)
        changed = await import_list(session, source, _raw({"E171": "Permitted in 3 food categories"}), source.default_url, NOW)
        await session.commit()
        [old] = await _rules(session, review_status="retired")
        [new] = await _rules(session, review_status="published")
    assert (changed.created, changed.retired) == (1, 1)
    assert new.supersedes_id == old.id
    assert new.condition == "Permitted in 3 food categories"


async def test_missing_row_is_retired():
    source = FakePositiveList()
    async with async_session_factory() as session:
        await import_list(session, source, _raw({"E171": "a", "E102": "b"}), source.default_url, NOW)
        result = await import_list(session, source, _raw({"E102": "b"}), source.default_url, NOW)
        await session.commit()
        published = await _rules(session, review_status="published")
    assert result.retired == 1
    assert len(published) == 1


async def test_derive_not_authorised_only_for_additives():
    source = FakePositiveList()
    async with async_session_factory() as session:
        bromate = RegulatedSubstance(name="Potassium bromate", e_number="E924A")
        sugar = RegulatedSubstance(name="Sugar")
        vanillin = RegulatedSubstance(name="Vanillin")
        session.add_all([bromate, sugar, vanillin])
        await session.flush()
        for substance in (bromate, vanillin):
            session.add(RegulatoryRule(
                substance_id=substance.id, place="US", authority="FDA", kind="law", status="allowed_with_limits",
                applies_to="food_additive", source_url="https://example.gov/us", last_checked_at=NOW,
                origin="bulk", review_status="published",
            ))
        await import_list(session, source, _raw({"E171": "a"}), source.default_url, NOW)
        created = await derive_not_authorised(session, "EU", source.slug, NOW)
        await session.commit()
        derived = await _rules(session, origin="derived")
    assert created == 1
    [rule] = derived
    assert rule.substance_id == bromate.id
    assert rule.status == "not_authorised" and rule.applies_to == "food_additive"
    assert rule.review_status == "published"
    assert rule.legal_reference == "Regulation (EC) No 1333/2008, Article 4(1)"
    assert rule.source_quote == BASIS


async def test_derived_rule_retired_once_list_covers_it():
    source = FakePositiveList()
    async with async_session_factory() as session:
        session.add(RegulatedSubstance(name="Additive E999", e_number="E999"))
        await session.flush()
        await import_list(session, source, _raw({"E171": "a"}), source.default_url, NOW)
        assert await derive_not_authorised(session, "EU", source.slug, NOW) == 1
        await import_list(session, source, _raw({"E171": "a", "E999": "b"}), source.default_url, NOW)
        assert await derive_not_authorised(session, "EU", source.slug, NOW) == 0
        await session.commit()
        live_derived = await _rules(session, origin="derived", review_status="published")
    assert live_derived == []


async def test_derive_treats_sub_variant_as_covered_by_its_group_entry():
    source = FakePositiveList()
    async with async_session_factory() as session:
        session.add(RegulatedSubstance(name="Lecithins (i)", e_number="E322I"))
        await session.flush()
        await import_list(session, source, _raw({"E322": "a"}), source.default_url, NOW)
        assert await derive_not_authorised(session, "EU", source.slug, NOW) == 0


async def test_force_reparses_identical_bytes():
    source = FakePositiveList()
    raw = _raw({"E171": "a"})
    async with async_session_factory() as session:
        await import_list(session, source, raw, source.default_url, NOW)
        source.parse = lambda raw_bytes, original=source.parse: _changed(original(raw_bytes))
        skipped = await import_list(session, source, raw, source.default_url, NOW)
        forced = await import_list(session, source, raw, source.default_url, NOW, force=True)
    assert (skipped.created, skipped.retired) == (0, 0)
    assert (forced.created, forced.retired) == (1, 1)


def _changed(parsed):
    for rule in parsed.rules:
        rule.condition = "Parser now reads it differently"
    return parsed


async def test_reimport_after_rules_lost_reparses():
    source = FakePositiveList()
    raw = _raw({"E171": "a"})
    async with async_session_factory() as session:
        await import_list(session, source, raw, source.default_url, NOW)
        await session.execute(RegulatoryRule.__table__.delete())
        again = await import_list(session, source, raw, source.default_url, NOW)
    assert again.created == 1


async def test_derive_refuses_without_the_list():
    source = FakePositiveList()
    async with async_session_factory() as session:
        session.add(RegulatedSubstance(name="FD&C Red No. 3", e_number="E127"))
        await import_list(session, source, _raw({}), source.default_url, NOW)
        assert await derive_not_authorised(session, "EU", source.slug, NOW) == 0
        assert await _rules(session, origin="derived") == []



class FakeNamedList(FakePositiveList):
    """A list keyed by name, like Health Canada's: never derivable."""

    derivable = False

    def __init__(self, names: dict[str, list[str]] | None = None) -> None:
        super().__init__()
        self.names = names or {}

    def parse(self, raw: bytes) -> ParsedList:
        rows = json.loads(raw)
        return ParsedList(
            place="CA", applies_to="food_additive", semantics="positive",
            substances=[ParsedSubstance(key=name.casefold(), name=name,
                                        aliases=[(a, "name", "en") for a in self.names.get(name, [])]) for name in rows],
            rules=[ParsedRule(substance_key=name.casefold(), place="CA", authority="Health Canada", kind="law",
                              status="allowed_with_limits", applies_to="food_additive", condition=condition,
                              source_url=self.default_url, row_ref=name) for name, condition in rows.items()],
        )


async def test_derive_refuses_non_derivable_sources():
    from app.services.regulation.importer import SOURCES
    named = FakeNamedList()
    SOURCES[named.slug] = named
    try:
        async with async_session_factory() as session:
            session.add(RegulatedSubstance(name="Tartrazine", e_number="E102"))
            await import_list(session, named, _raw({"Sunset yellow": "a"}), named.default_url, NOW)
            with pytest.raises(ValueError):
                await derive_not_authorised(session, "CA", named.slug, NOW)
    finally:
        SOURCES.pop(named.slug, None)


async def test_cross_source_reimport_is_stable():
    first, other = FakeNamedList(), FakeNamedList({"Annatto extract": ["Annatto"]})
    async with async_session_factory() as session:
        await import_list(session, first, _raw({"Annatto": "a"}), first.default_url, NOW)
        await import_list(session, other, _raw({"Annatto extract": "b"}), other.default_url, NOW)
        again = await import_list(session, first, _raw({"Annatto": "a", "_": None}) .replace(b', "_": null', b""), first.default_url, NOW, force=True)
        count = len((await session.execute(select(RegulatedSubstance))).scalars().all())
    assert (again.created, again.retired, again.substances_created) == (0, 0, 0)
    assert count == 2


async def test_group_code_covered_by_its_sub_variants():
    source = FakePositiveList()
    async with async_session_factory() as session:
        session.add(RegulatedSubstance(name="Carotenes", e_number="E160A"))
        await session.flush()
        await import_list(session, source, _raw({"E160AI": "a", "E160AII": "b"}), source.default_url, NOW)
        assert await derive_not_authorised(session, "EU", source.slug, NOW) == 0


async def test_unapproved_alias_never_merges():
    from app.models.regulation import SubstanceAlias
    group, specific = FakeNamedList(), FakeNamedList()
    async with async_session_factory() as session:
        parabens = RegulatedSubstance(name="Butyl and propyl parabens")
        session.add(parabens)
        await session.flush()
        session.add(SubstanceAlias(substance_id=parabens.id, alias="Propylparaben", normalized_alias="propylparaben",
                                   alias_type="inci", approved=False))
        await import_list(session, specific, _raw({"Propylparaben": "a"}), specific.default_url, NOW)
        names = sorted(s.name for s in (await session.execute(select(RegulatedSubstance))).scalars())
    assert names == ["Butyl and propyl parabens", "Propylparaben"]


async def test_conflicting_cas_never_merges():
    from app.services.regulation.importer import upsert_substance
    async with async_session_factory() as session:
        first, _ = await upsert_substance(session, ParsedSubstance(key="a", name="Retinol", cas="68-26-8"), None)
        second, created = await upsert_substance(session, ParsedSubstance(key="b", name="Retinol", cas="127-47-9"), None)
    assert created and first.id != second.id
