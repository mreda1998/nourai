"""
Atelier premium endpoints.

GET /atelier/circadian    — time-ordered supplement schedule for the user's stack
GET /atelier/conflict-map — interaction graph (nodes + edges) for the user's stack
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import or_, select

from app.api.deps import CurrentUser, DBSession
from app.models.ingredient import Ingredient
from app.models.ingredient_interaction import IngredientInteraction
from app.models.product import ProductIngredient
from app.models.user import UserStackEntry

router = APIRouter()


# ─── require_premium (no-op until subscriptions go live) ─────────────────────

async def require_premium(current_user: CurrentUser) -> CurrentUser:
    # TODO: check current_user.subscription.is_premium
    return current_user


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _today_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def _stack_ingredient_ids(db: DBSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    """Return ingredient_ids for all products in the user's stack today."""
    today = _today_start()

    stack_result = await db.execute(
        select(UserStackEntry.product_id)
        .where(
            UserStackEntry.user_id == user_id,
            UserStackEntry.logged_at >= today,
        )
    )
    product_ids = stack_result.scalars().all()
    if not product_ids:
        return []

    pi_result = await db.execute(
        select(ProductIngredient.ingredient_id)
        .where(
            ProductIngredient.product_id.in_(product_ids),
            ProductIngredient.ingredient_id.isnot(None),
        )
    )
    return list({uid for uid in pi_result.scalars().all() if uid is not None})


# ─── Circadian Protocol ───────────────────────────────────────────────────────

class ScheduleItem(BaseModel):
    time: str
    ingredient_name: str
    note: str
    with_food: bool
    synergy: bool
    evidence_dots: int


class CircadianResponse(BaseModel):
    chronotype: str
    schedule: list[ScheduleItem]
    empty_reason: str | None = None


def _chronotype_from_sleep_quality(sleep_quality: str | None) -> str:
    mapping = {
        "excellent": "strong_morning",
        "good": "moderate_morning",
        "fair": "moderate_evening",
        "poor": "late_chronotype",
    }
    return mapping.get(sleep_quality or "", "moderate_morning")


def _evidence_dots(ingredient: Ingredient) -> int:
    count = len(ingredient.evidence) if ingredient.evidence else 0
    if count >= 10:
        return 4
    if count >= 5:
        return 3
    if count >= 2:
        return 2
    return 1


_WINDOW_TIMES = {
    "morning": "07:00",
    "afternoon": "13:00",
    "evening": "18:30",
    "night": "21:30",
}


@router.get("/circadian", response_model=CircadianResponse)
async def get_circadian(
    db: DBSession,
    current_user: CurrentUser,
) -> CircadianResponse:
    """Return time-ordered supplement schedule derived from the user's stack."""
    ingredient_ids = await _stack_ingredient_ids(db, current_user.id)
    if not ingredient_ids:
        return CircadianResponse(
            chronotype=_chronotype_from_sleep_quality(current_user.sleep_quality),
            schedule=[],
            empty_reason="timing_data_pending",
        )

    result = await db.execute(
        select(Ingredient).where(
            Ingredient.id.in_(ingredient_ids),
            Ingredient.optimal_times.isnot(None),
        )
    )
    ingredients = result.scalars().all()

    if not ingredients:
        return CircadianResponse(
            chronotype=_chronotype_from_sleep_quality(current_user.sleep_quality),
            schedule=[],
            empty_reason="timing_data_pending",
        )

    schedule: list[ScheduleItem] = []
    for ing in ingredients:
        for slot in (ing.optimal_times or []):
            window = slot.get("window", "morning")
            time_str = _WINDOW_TIMES.get(window, "08:00")
            schedule.append(ScheduleItem(
                time=time_str,
                ingredient_name=ing.canonical_name,
                note=slot.get("reason", ing.circadian_notes or ""),
                with_food=slot.get("with_food", False),
                synergy=False,
                evidence_dots=_evidence_dots(ing),
            ))

    schedule.sort(key=lambda s: s.time)

    return CircadianResponse(
        chronotype=_chronotype_from_sleep_quality(current_user.sleep_quality),
        schedule=schedule,
    )


# ─── Conflict Map ─────────────────────────────────────────────────────────────

class ConflictNode(BaseModel):
    id: str
    label: str
    tone: str


class ConflictEdge(BaseModel):
    ingredient_a_id: str
    ingredient_b_id: str
    type: str
    mechanism: str
    confidence: str


class ConflictNote(BaseModel):
    type: str
    pair: str
    note: str


class ConflictMapResponse(BaseModel):
    nodes: list[ConflictNode]
    edges: list[ConflictEdge]
    notes: list[ConflictNote]


def _node_tone(ingredient_id: str, edges: list[ConflictEdge]) -> str:
    types = {e.type for e in edges if e.ingredient_a_id == ingredient_id or e.ingredient_b_id == ingredient_id}
    if "caution" in types:
        return "alert"
    if "synergy" in types:
        return "accent"
    return "sand"


@router.get("/conflict-map", response_model=ConflictMapResponse)
async def get_conflict_map(
    db: DBSession,
    current_user: CurrentUser,
) -> ConflictMapResponse:
    """Return interaction graph for the user's current stack."""
    ingredient_ids = await _stack_ingredient_ids(db, current_user.id)
    if not ingredient_ids:
        return ConflictMapResponse(nodes=[], edges=[], notes=[])

    id_set = set(ingredient_ids)

    interactions_result = await db.execute(
        select(IngredientInteraction).where(
            IngredientInteraction.ingredient_id_a.in_(ingredient_ids),
            IngredientInteraction.ingredient_id_b.in_(ingredient_ids),
        )
    )
    interactions = interactions_result.scalars().all()

    # Collect ingredient IDs that appear in at least one interaction
    active_ids: set[uuid.UUID] = set()
    for ix in interactions:
        active_ids.add(ix.ingredient_id_a)
        active_ids.add(ix.ingredient_id_b)

    if not active_ids:
        return ConflictMapResponse(nodes=[], edges=[], notes=[])

    ing_result = await db.execute(
        select(Ingredient).where(Ingredient.id.in_(active_ids))
    )
    ing_map = {ing.id: ing for ing in ing_result.scalars().all()}

    edges = [
        ConflictEdge(
            ingredient_a_id=str(ix.ingredient_id_a),
            ingredient_b_id=str(ix.ingredient_id_b),
            type=ix.interaction_type,
            mechanism=ix.mechanism,
            confidence=ix.confidence,
        )
        for ix in interactions
    ]

    nodes = [
        ConflictNode(
            id=str(ing_id),
            label=ing_map[ing_id].canonical_name,
            tone=_node_tone(str(ing_id), edges),
        )
        for ing_id in active_ids
        if ing_id in ing_map
    ]

    notes = [
        ConflictNote(
            type=ix.interaction_type,
            pair=f"{ing_map[ix.ingredient_id_a].canonical_name} + {ing_map[ix.ingredient_id_b].canonical_name}",
            note=ix.mechanism,
        )
        for ix in interactions
        if ix.ingredient_id_a in ing_map and ix.ingredient_id_b in ing_map
    ]

    return ConflictMapResponse(nodes=nodes, edges=edges, notes=notes)
