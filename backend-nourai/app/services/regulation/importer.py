"""Import an official list: substances, rules and checked places, with history when a row changes.

Official lists are the authority, so their rules publish without row-by-row review. Each fetch is
stored as a source record; re-importing identical bytes only refreshes "last checked".
"""
from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Literal, Protocol

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import DataSource, SourceRecord
from app.models.regulation import RegulatedSubstance, RegulatoryRule, RuleCheck, SubstanceAlias
from app.services.regulation.identifiers import alias_key, normalize_e_number

RECORD_TYPE = "regulatory_list"
_ROMAN_SUFFIX = re.compile(r"(?<=[0-9A-Z])[IVX]+$")


@dataclass
class ParsedSubstance:
    key: str  # stable within the source: E-number, CAS or a normalised name
    name: str
    e_number: str | None = None
    cas: str | None = None
    inci: str | None = None
    aliases: list[tuple[str, str, str]] = field(default_factory=list)  # (alias, alias_type, language)


@dataclass
class ParsedRule:
    substance_key: str
    place: str
    authority: str
    kind: str
    status: str
    applies_to: str | None
    source_url: str
    row_ref: str
    classification: str | None = None
    sub_scope: str | None = None
    condition: str | None = None
    limit_value: float | None = None
    limit_unit: str | None = None
    limit_basis: str | None = None
    effective_from: date | None = None
    effective_until: date | None = None
    legal_reference: str | None = None


@dataclass
class ParsedList:
    place: str
    applies_to: str | None
    semantics: Literal["positive", "negative", "listing"]
    substances: list[ParsedSubstance]
    rules: list[ParsedRule]
    checked_keys: list[str] = field(default_factory=list)
    # For positive lists: the article saying only listed substances may be used.
    legal_reference: str | None = None
    legal_basis_quote: str | None = None


class BulkSource(Protocol):
    slug: str
    name: str
    licence_name: str
    licence_url: str
    default_url: str

    def parse(self, raw: bytes) -> ParsedList: ...


SOURCES: dict[str, BulkSource] = {}


def register(source: BulkSource) -> BulkSource:
    SOURCES[source.slug] = source
    return source


@dataclass
class ImportResult:
    created: int = 0
    retired: int = 0
    unchanged: int = 0
    substances_created: int = 0
    checks: int = 0


_IDENTITY = (
    "place", "applies_to", "sub_scope", "status", "classification", "condition", "limit_value",
    "limit_unit", "limit_basis", "effective_from", "effective_until", "legal_reference",
)


def _identity(substance_id: uuid.UUID, rule) -> tuple:
    return (substance_id, *(getattr(rule, f) for f in _IDENTITY))


def _slot(substance_id: uuid.UUID, rule) -> tuple:
    return (substance_id, rule.place, rule.applies_to, rule.sub_scope)


async def _data_source(session: AsyncSession, source: BulkSource, url: str, parsed: ParsedList | None) -> DataSource:
    row = (await session.execute(select(DataSource).where(DataSource.slug == source.slug))).scalar_one_or_none()
    if row is None:
        row = DataSource(slug=source.slug, name=source.name, source_type=RECORD_TYPE, extra_data={})
        session.add(row)
    row.base_url = url
    row.license_name = source.licence_name
    row.license_url = source.licence_url
    if parsed is not None:
        row.extra_data = {
            **(row.extra_data or {}), "place": parsed.place, "semantics": parsed.semantics,
            "legal_reference": parsed.legal_reference, "legal_basis_quote": parsed.legal_basis_quote,
            "list_url": url, "authority": parsed.rules[0].authority if parsed.rules else None,
        }
    await session.flush()
    return row


async def _substance(session: AsyncSession, parsed: ParsedSubstance, source_id: uuid.UUID) -> tuple[RegulatedSubstance, bool]:
    e_number = normalize_e_number(parsed.e_number) if parsed.e_number else None
    found = None
    if e_number:
        found = (await session.execute(
            select(RegulatedSubstance).where(RegulatedSubstance.e_number == e_number)
        )).scalar_one_or_none()
    if found is None and parsed.cas:
        found = (await session.execute(
            select(RegulatedSubstance).where(RegulatedSubstance.cas == parsed.cas).limit(2)
        )).scalars().all()
        found = found[0] if len(found) == 1 else None
    if found is None:
        key = alias_key(parsed.inci or parsed.name, "name")
        owners = (await session.execute(
            select(SubstanceAlias.substance_id).where(SubstanceAlias.normalized_alias == key).distinct()
        )).scalars().all()
        if len(owners) == 1:
            found = await session.get(RegulatedSubstance, owners[0])

    created = found is None
    if created:
        found = RegulatedSubstance(name=parsed.name, e_number=e_number, cas=parsed.cas, inci=parsed.inci)
        session.add(found)
        await session.flush()
    else:
        found.e_number = found.e_number or e_number
        found.cas = found.cas or parsed.cas
        found.inci = found.inci or parsed.inci

    wanted = [(parsed.name, "name", "")] + list(parsed.aliases)
    if parsed.inci:
        wanted.append((parsed.inci, "inci", ""))
    if e_number:
        wanted.append((e_number, "e_number", ""))
    existing = set((await session.execute(
        select(SubstanceAlias.normalized_alias).where(SubstanceAlias.substance_id == found.id)
    )).scalars())
    for alias, alias_type, language in wanted:
        key = alias_key(alias, alias_type)
        if key and key not in existing:
            existing.add(key)
            session.add(SubstanceAlias(substance_id=found.id, alias=alias[:500], normalized_alias=key[:500],
                                       alias_type=alias_type, language=language, source_id=source_id))
    return found, created


async def import_list(
    session: AsyncSession, source: BulkSource, raw: bytes, fetched_url: str, now: datetime, force: bool = False
) -> ImportResult:
    """Import one fetch. Identical bytes only refresh "last checked", unless `force` (a parser changed)."""
    result = ImportResult()
    content_hash = hashlib.sha256(raw).hexdigest()
    data_source = await _data_source(session, source, fetched_url, None)
    seen = (await session.execute(
        select(SourceRecord.id).where(
            SourceRecord.source_id == data_source.id, SourceRecord.record_type == RECORD_TYPE,
            SourceRecord.content_hash == content_hash,
        )
    )).scalar_one_or_none()
    if seen is not None and not force:
        bumped = await session.execute(
            update(RegulatoryRule)
            .where(RegulatoryRule.source_id == data_source.id, RegulatoryRule.review_status == "published")
            .values(last_checked_at=now)
        )
        result.unchanged = bumped.rowcount or 0
        if result.unchanged:
            return result
        # Same bytes but no live rules (lost or never written): parse again rather than trust the hash.

    parsed = source.parse(raw)
    data_source = await _data_source(session, source, fetched_url, parsed)
    record = await session.get(SourceRecord, seen) if seen is not None else None
    if record is None:
        record = SourceRecord(
            source_id=data_source.id, external_id=fetched_url[:255], record_type=RECORD_TYPE,
            request_url=fetched_url, content_hash=content_hash, fetched_at=now,
            license_snapshot={"name": source.licence_name, "url": source.licence_url},
        )
        session.add(record)
        await session.flush()

    substances: dict[str, RegulatedSubstance] = {}
    for item in parsed.substances:
        substance, created = await _substance(session, item, data_source.id)
        substances[item.key] = substance
        result.substances_created += int(created)
    await session.flush()

    current = (await session.execute(
        select(RegulatoryRule).where(
            RegulatoryRule.source_id == data_source.id, RegulatoryRule.origin == "bulk",
            RegulatoryRule.review_status == "published",
        )
    )).scalars().all()
    by_identity: dict[tuple, list[RegulatoryRule]] = {}
    for rule in current:
        by_identity.setdefault(_identity(rule.substance_id, rule), []).append(rule)

    kept: set[uuid.UUID] = set()
    new_rules: list[tuple[RegulatoryRule, tuple]] = []
    for item in parsed.rules:
        substance = substances.get(item.substance_key)
        if substance is None:
            continue
        identity = _identity(substance.id, item)
        match = next((r for r in by_identity.get(identity, []) if r.id not in kept), None)
        if match is not None:
            kept.add(match.id)
            match.last_checked_at = now
            match.source_record_id = record.id
            result.unchanged += 1
            continue
        rule = RegulatoryRule(
            substance_id=substance.id, authority=item.authority, kind=item.kind,
            **{f: getattr(item, f) for f in _IDENTITY}, source_url=item.source_url,
            source_id=data_source.id, source_record_id=record.id, source_quote=f"{source.name}: {item.row_ref}",
            last_checked_at=now, origin="bulk", review_status="published",
        )
        new_rules.append((rule, _slot(substance.id, item)))

    retired_by_slot: dict[tuple, RegulatoryRule] = {}
    for rule in current:
        if rule.id not in kept:
            rule.review_status = "retired"
            retired_by_slot.setdefault(_slot(rule.substance_id, rule), rule)
            result.retired += 1
    for rule, slot in new_rules:
        if (previous := retired_by_slot.get(slot)) is not None:
            rule.supersedes_id = previous.id
        session.add(rule)
        result.created += 1

    for key in parsed.checked_keys:
        substance = substances.get(key)
        if substance is None or parsed.applies_to is None:
            continue
        check = (await session.execute(
            select(RuleCheck).where(RuleCheck.substance_id == substance.id, RuleCheck.place == parsed.place,
                                    RuleCheck.applies_to == parsed.applies_to)
        )).scalar_one_or_none()
        if check is None:
            check = RuleCheck(substance_id=substance.id, place=parsed.place, applies_to=parsed.applies_to,
                              origin="bulk", checked_at=now)
            session.add(check)
        check.checked_at, check.status, check.source_id = now, "confirmed", data_source.id
        result.checks += 1
    await session.flush()
    return result


async def derive_not_authorised(session: AsyncSession, place: str, source_slug: str, now: datetime) -> int:
    """Additives absent from a positive list are not authorised there.

    Only substances with an E-number / INS count as additives here: inventories such as the FDA's
    list flavourings and GRAS substances too, which a positive additive list never covers.
    """
    data_source = (await session.execute(select(DataSource).where(DataSource.slug == source_slug))).scalar_one()
    meta = data_source.extra_data or {}
    covered = set((await session.execute(
        select(RegulatoryRule.substance_id).where(
            RegulatoryRule.source_id == data_source.id, RegulatoryRule.place == place,
            RegulatoryRule.applies_to == "food_additive", RegulatoryRule.review_status == "published",
            RegulatoryRule.origin == "bulk",
        )
    )).scalars())
    if not covered:
        # Without the list itself, every additive would look "not authorised".
        return 0
    derived = (await session.execute(
        select(RegulatoryRule).where(
            RegulatoryRule.source_id == data_source.id, RegulatoryRule.place == place,
            RegulatoryRule.origin == "derived", RegulatoryRule.review_status == "published",
        )
    )).scalars().all()
    already = set()
    for rule in derived:
        if rule.substance_id in covered:
            rule.review_status = "retired"
        else:
            rule.last_checked_at = now
            already.add(rule.substance_id)

    additives = (await session.execute(
        select(RegulatedSubstance.id, RegulatedSubstance.e_number).where(RegulatedSubstance.e_number.is_not(None))
    )).all()
    covered_codes = {code for sid, code in additives if sid in covered}
    created = 0
    for substance_id, code in additives:
        if substance_id in covered or substance_id in already:
            continue
        # A sub-variant such as E322(i) is covered by its group entry E322.
        if _ROMAN_SUFFIX.sub("", code) in covered_codes:
            continue
        session.add(RegulatoryRule(
            substance_id=substance_id, place=place, authority=meta.get("authority") or data_source.name, kind="law",
            status="not_authorised", applies_to="food_additive", legal_reference=meta.get("legal_reference"),
            source_url=meta.get("list_url") or data_source.base_url or "", source_id=data_source.id,
            source_quote=meta.get("legal_basis_quote"), last_checked_at=now, origin="derived",
            review_status="published",
        ))
        created += 1
    await session.flush()
    return created
