"""Rule notes on a product's own label rows, extras for E-number-only matches, and the glance counts.

Only the label decides: a row matches a substance through its own name, and the product's E-number
tags match directly. The canonical ingredient link is never used, so "turmeric" never picks up the
rules for the E100 colour.
"""
from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.regulation import CATEGORY_SCOPES, normalize_country
from app.models.product import Product
from app.models.regulation import RegulatedSubstance
from app.schemas.product import ProductWithDetails
from app.schemas.regulation import RuleNoteOut, RulesGlanceOut
from app.services.regulation.matching import match_substances
from app.services.regulation.rules import NoteView, glance, note_for
from app.services.regulation.store import load_rule_facts


def _note_out(note: NoteView, name: str | None) -> RuleNoteOut:
    return RuleNoteOut(text=note.text, status=note.status, place=note.place, more=note.more,
                       substance_id=note.substance_id, substance_name=name)


async def attach_rules(
    session: AsyncSession,
    product: Product,
    response: ProductWithDetails,
    country: str | None,
    today: date | None = None,
) -> ProductWithDetails:
    today = today or date.today()
    country = normalize_country(country)
    rows = [row for row in response.ingredients if not row.is_nutrient]
    tags = (product.extra_data or {}).get("additives_tags") or []
    by_name, by_e = await match_substances(session, [row.name for row in rows], list(tags))
    substance_ids = {m.substance_id for m in by_name.values()} | {m.substance_id for m in by_e.values()}
    if not substance_ids:
        return response

    facts = await load_rule_facts(session, list(substance_ids))
    names: dict[uuid.UUID, str] = dict((await session.execute(
        select(RegulatedSubstance.id, RegulatedSubstance.name).where(RegulatedSubstance.id.in_(substance_ids))
    )).all())
    category = getattr(product.category, "value", product.category)
    scopes = CATEGORY_SCOPES.get(category, ())

    def note(substance_id: uuid.UUID) -> NoteView | None:
        rules, _ = facts.get(str(substance_id), ([], []))
        return note_for(rules, scopes, country, today)

    notes: list[NoteView] = []
    on_rows: set[uuid.UUID] = set()
    for row in rows:
        match = by_name.get(row.name)
        if not match:
            continue
        on_rows.add(match.substance_id)
        if facts.get(str(match.substance_id)):  # nothing reviewed yet: no rules screen to open
            row.rule_substance_id = str(match.substance_id)
        if found := note(match.substance_id):
            row.rule_note = _note_out(found, names.get(match.substance_id))
            notes.append(found)

    for substance_id in sorted({m.substance_id for m in by_e.values()} - on_rows, key=str):
        if found := note(substance_id):
            response.rule_extras.append(_note_out(found, names.get(substance_id)))
            notes.append(found)

    where, elsewhere = glance(notes, country)
    if where or elsewhere:
        response.rules_glance = RulesGlanceOut(where_you_live=where, elsewhere=elsewhere)
    return response
