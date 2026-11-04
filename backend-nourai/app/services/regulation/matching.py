"""Match a label's own ingredient names and E-numbers to regulated substances.

Conservative like `resolve_ingredients`: exact keys on approved aliases only, and a key claimed by more
than one substance stays unmatched.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.regulation import SubstanceAlias
from app.services.regulation.identifiers import alias_key, normalize_e_number, strip_function_prefix


@dataclass(frozen=True)
class SubstanceMatch:
    substance_id: uuid.UUID
    via: str  # "name" | "e_number"


async def match_substances(
    session: AsyncSession, names: list[str], e_numbers: list[str]
) -> tuple[dict[str, SubstanceMatch], dict[str, SubstanceMatch]]:
    """(by_name, by_e_number), keyed by the caller's original strings.

    A label row written as an E-number ("E171", "émulsifiant : E471") matches by E-number. A name
    claimed by one specific substance wins over a group entry that lists it as a member.
    """
    name_keys = {name: alias_key(name, "name") for name in names}
    row_e_keys = {name: key for name in names if (key := normalize_e_number(strip_function_prefix(name)))}
    e_keys = {raw: key for raw in e_numbers if (key := normalize_e_number(raw))}
    keys = {k for k in name_keys.values() if k} | set(e_keys.values()) | set(row_e_keys.values())
    if not keys:
        return {}, {}

    rows = await session.execute(
        select(SubstanceAlias.normalized_alias, SubstanceAlias.substance_id, SubstanceAlias.alias_type).where(
            SubstanceAlias.approved.is_(True), SubstanceAlias.normalized_alias.in_(keys)
        )
    )
    specific: dict[str, set[uuid.UUID]] = {}
    members: dict[str, set[uuid.UUID]] = {}
    for key, substance_id, alias_type in rows.all():
        (members if alias_type == "group_member" else specific).setdefault(key, set()).add(substance_id)

    def owner(key: str) -> uuid.UUID | None:
        candidates = specific.get(key) or members.get(key) or set()
        return next(iter(candidates)) if len(candidates) == 1 else None

    by_name: dict[str, SubstanceMatch] = {}
    for name in names:
        if (key := row_e_keys.get(name)) and (found := owner(key)):
            by_name[name] = SubstanceMatch(substance_id=found, via="e_number")
        elif (found := owner(name_keys[name])):
            by_name[name] = SubstanceMatch(substance_id=found, via="name")
    by_e = {raw: SubstanceMatch(substance_id=found, via="e_number") for raw, key in e_keys.items() if (found := owner(key))}
    return by_name, by_e
