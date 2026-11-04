"""A regulated substance's rules — for label ingredients we haven't researched."""
from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.api.deps import DBSession
from app.core.regulation import normalize_country
from app.models.regulation import RegulatedSubstance
from app.schemas.regulation import SubstanceDetail, build_rules_block
from app.services.regulation.store import ingredient_ids_for_substance, load_rule_facts

router = APIRouter()


@router.get("/{substance_id}", response_model=SubstanceDetail)
async def get_substance(substance_id: uuid.UUID, db: DBSession, country: str | None = Query(None)) -> SubstanceDetail:
    substance = await db.get(RegulatedSubstance, substance_id)
    if substance is None:
        raise HTTPException(status_code=404, detail="Substance not found")
    facts = await load_rule_facts(db, [substance.id])
    return SubstanceDetail(
        id=str(substance.id), name=substance.name, e_number=substance.e_number, inci=substance.inci,
        ingredient_ids=await ingredient_ids_for_substance(db, substance.id),
        rules=build_rules_block([(substance, None)], facts, normalize_country(country), date.today()),
    )
