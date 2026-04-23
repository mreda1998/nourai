"""
Peptides intelligence endpoints.

GET /peptides — browse all peptides (premium-gated)
  ?search=     case-insensitive name match (min 2 chars)
  ?us_status=  filter by us_regulatory_status value
  ?wada_safe=  true → exclude prohibited_in_competition and prohibited_all
"""
from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.ingredient import Ingredient, IngredientCategory
from app.schemas.ingredient import PeptidesResponse

router = APIRouter()

WADA_PROHIBITED = {"prohibited_in_competition", "prohibited_all"}


@router.get("", response_model=PeptidesResponse)
async def list_peptides(
    db: DBSession,
    current_user: CurrentUser,
    search: str | None = Query(default=None, min_length=2),
    us_status: str | None = Query(default=None),
    wada_safe: bool = Query(default=False),
) -> PeptidesResponse:
    """Return all peptides with optional search and filter params."""
    stmt = select(Ingredient).where(Ingredient.category == IngredientCategory.PEPTIDE)

    if search:
        stmt = stmt.where(Ingredient.canonical_name.ilike(f"%{search}%"))

    if us_status:
        stmt = stmt.where(Ingredient.us_regulatory_status == us_status)

    if wada_safe:
        stmt = stmt.where(Ingredient.wada_status.notin_(WADA_PROHIBITED))

    stmt = stmt.order_by(Ingredient.canonical_name)

    result = await db.execute(stmt)
    peptides = result.scalars().all()

    return PeptidesResponse(peptides=list(peptides), total=len(peptides))
