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
from app.services.regulation.identifiers import alias_key, normalize_e_number


@dataclass(frozen=True)
class SubstanceMatch:
    substance_id: uuid.UUID
    via: str  # "name" | "e_number"


async def match_substances(
    session: AsyncSession, names: list[str], e_numbers: list[str]
) -> tuple[dict[str, SubstanceMatch], dict[str, SubstanceMatch]]:
    """(by_name, by_e_number), keyed by the caller's original strings."""
    name_keys = {name: alias_key(name, "name") for name in names}
    e_keys = {raw: key for raw in e_numbers if (key := normalize_e_number(raw))}
    keys = {k for k in name_keys.values() if k} | set(e_keys.values())
    if not keys:
        return {}, {}

    rows = await session.execute(
        select(SubstanceAlias.normalized_alias, SubstanceAlias.substance_id).where(
            SubstanceAlias.approved.is_(True), SubstanceAlias.normalized_alias.in_(keys)
        )
    )
    owners: dict[str, set[uuid.UUID]] = {}
    for key, substance_id in rows.all():
        owners.setdefault(key, set()).add(substance_id)

    def resolve(mapping: dict[str, str], via: str) -> dict[str, SubstanceMatch]:
        matched = {}
        for original, key in mapping.items():
            candidates = owners.get(key, set())
            if len(candidates) == 1:
                matched[original] = SubstanceMatch(substance_id=next(iter(candidates)), via=via)
        return matched

    return resolve(name_keys, "name"), resolve(e_keys, "e_number")
