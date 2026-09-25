"""
Atelier premium endpoints.

GET /atelier/circadian    — time-ordered supplement schedule for the user's stack
GET /atelier/conflict-map — interaction graph (nodes + edges) for the user's stack
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.ingredient import Ingredient
from app.models.ingredient_evidence import IngredientEvidence
from app.models.ingredient_interaction import IngredientInteraction
from app.models.product import Product, ProductIngredient
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
    today = _today_start()
    stack_result = await db.execute(
        select(UserStackEntry.time_of_day, ProductIngredient, Ingredient)
        .join(ProductIngredient, ProductIngredient.product_id == UserStackEntry.product_id)
        .outerjoin(Ingredient, ProductIngredient.ingredient_id == Ingredient.id)
        .where(
            UserStackEntry.user_id == current_user.id,
            UserStackEntry.logged_at >= today,
        )
    )
    rows = stack_result.all()
    if not rows:
        return CircadianResponse(
            chronotype=_chronotype_from_sleep_quality(current_user.sleep_quality),
            schedule=[],
            empty_reason="stack_empty",
        )

    schedule: list[ScheduleItem] = []
    seen: set[tuple[str, str]] = set()
    for time_of_day, product_ingredient, ingredient in rows:
        display_name = ingredient.canonical_name if ingredient else product_ingredient.name
        slots = ingredient.optimal_times if ingredient and ingredient.optimal_times else None

        if slots:
            timing_slots = slots
        else:
            window = time_of_day or "morning"
            timing_slots = [{
                "window": window,
                "reason": (
                    ingredient.circadian_notes
                    if ingredient and ingredient.circadian_notes
                    else "No evidence-backed timing rule is stored yet; using your logged time."
                ),
                "with_food": False,
            }]

        for slot in timing_slots:
            window = slot.get("window", time_of_day or "morning")
            time_str = _WINDOW_TIMES.get(window, "08:00")
            key = (display_name, time_str)
            if key in seen:
                continue
            seen.add(key)
            schedule.append(ScheduleItem(
                time=time_str,
                ingredient_name=display_name,
                note=slot.get("reason", ""),
                with_food=slot.get("with_food", False),
                synergy=bool(slots),
                evidence_dots=_evidence_dots(ingredient) if ingredient else 1,
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

    # Collect ingredient IDs that appear in at least one interaction.
    # If no interaction rows exist yet, still return the stack compounds as
    # neutral nodes so the UI can distinguish "no known interactions" from
    # "empty stack".
    active_ids: set[uuid.UUID] = set()
    for ix in interactions:
        active_ids.add(ix.ingredient_id_a)
        active_ids.add(ix.ingredient_id_b)

    if not active_ids:
        active_ids = id_set

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


# ─── Evidence Pulse ───────────────────────────────────────────────────────────

_STUDY_TIER: dict[str, int] = {
    "meta_analysis": 4,
    "systematic_review": 4,
    "rct": 3,
    "cohort": 2,
    "case_control": 2,
    "cross_sectional": 1,
    "review": 1,
    "in_vitro": 1,
    "animal": 1,
    "case_report": 1,
    "other": 1,
}

_CONFIDENCE_BOOST: dict[str, int] = {"high": 1, "moderate": 0, "low": -1}


def _evidence_dots_from_study(study_type: str | None, confidence: str) -> int:
    tier = _STUDY_TIER.get(study_type or "other", 1)
    boost = _CONFIDENCE_BOOST.get(confidence, 0)
    return max(1, min(4, tier + boost))


def _tone_from_direction(direction: str) -> str:
    if direction == "benefit":
        return "sage"
    if direction == "risk":
        return "alert"
    return "ink"


class EvidenceArticle(BaseModel):
    ingredient: str
    tone: str
    dots: int
    headline: str
    excerpt: str
    journal: str


class EvidencePulseResponse(BaseModel):
    articles: list[EvidenceArticle]


@router.get("/evidence-pulse", response_model=EvidencePulseResponse)
async def get_evidence_pulse(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = 10,
) -> EvidencePulseResponse:
    """Return the most recent high-confidence evidence for the user's stack ingredients."""
    ingredient_ids = await _stack_ingredient_ids(db, current_user.id)
    if not ingredient_ids:
        return EvidencePulseResponse(articles=[])

    ev_result = await db.execute(
        select(IngredientEvidence, Ingredient.canonical_name)
        .join(Ingredient, IngredientEvidence.ingredient_id == Ingredient.id)
        .where(IngredientEvidence.ingredient_id.in_(ingredient_ids))
        .order_by(
            IngredientEvidence.year.desc().nulls_last(),
            IngredientEvidence.confidence.desc(),
        )
        .limit(limit)
    )
    rows = ev_result.all()

    articles = []
    for ev, ingredient_name in rows:
        year_str = str(ev.year) if ev.year else "—"
        journal_str = f"{ev.journal or 'Unknown journal'} · {year_str}"
        articles.append(EvidenceArticle(
            ingredient=ingredient_name,
            tone=_tone_from_direction(ev.direction),
            dots=_evidence_dots_from_study(ev.study_type, ev.confidence),
            headline=ev.title or ev.finding,
            excerpt=ev.finding,
            journal=journal_str,
        ))

    return EvidencePulseResponse(articles=articles)


# ─── Exposure Ledger ──────────────────────────────────────────────────────────

EXPOSURE_RULES: dict[str, tuple[str, ...]] = {
    "Added caffeine": ("caffeine", "guarana", "yerba mate", "green tea extract"),
    "Added sugars": ("sugar", "sucrose", "fructose", "glucose", "dextrose", "corn syrup", "maltodextrin"),
    "Seed oils": ("canola oil", "soybean oil", "sunflower oil", "safflower oil", "corn oil", "cottonseed oil", "grapeseed oil"),
    "Emulsifiers / thickeners": ("lecithin", "carrageenan", "polysorbate", "mono-", "diglyceride", "cellulose gum", "xanthan gum", "guar gum"),
    "Artificial sweeteners": ("sucralose", "aspartame", "acesulfame", "saccharin", "neotame", "advantame"),
    "Preservatives": ("paraben", "phenoxyethanol", "benzoate", "sorbate", "bha", "bht", "sodium nitrite", "potassium sorbate"),
    "Synthetic fragrance": ("fragrance", "parfum", "limonene", "linalool", "citral", "coumarin", "geraniol"),
}

EXPOSURE_NOTES: dict[str, str] = {
    "Added caffeine": "Caffeine-containing ingredients on product labels; this is not a mg dose estimate.",
    "Added sugars": "Sugar-like ingredients on labels; nutrition-panel grams are not yet integrated here.",
    "Seed oils": "Common refined seed oils identified from ingredient names.",
    "Emulsifiers / thickeners": "Functional additives identified from ingredient names.",
    "Artificial sweeteners": "Non-nutritive sweeteners identified from ingredient names.",
    "Preservatives": "Preservative ingredients identified from category or name.",
    "Synthetic fragrance": "Fragrance allergens or parfum/fragrance terms identified from cosmetic labels.",
}


class ExposureDay(BaseModel):
    date: str
    high: float
    moderate: float
    low: float


class ExposureCategory(BaseModel):
    name: str
    load: float
    delta: str
    sources: int
    alert: bool
    note: str


class ExposureLedgerResponse(BaseModel):
    summary: str
    chart: list[ExposureDay]
    categories: list[ExposureCategory]
    caveat: str


def _classify_exposures(product: Product, pi: ProductIngredient, ingredient: Ingredient | None) -> set[str]:
    name = " ".join(
        part.lower()
        for part in [
            pi.name or "",
            ingredient.canonical_name if ingredient else "",
            product.sugar or "",
        ]
        if part
    )
    ingredient_category = str(ingredient.category).lower() if ingredient else ""
    matches: set[str] = set()

    for category, terms in EXPOSURE_RULES.items():
        if any(term in name for term in terms):
            matches.add(category)

    if "preservative" in ingredient_category:
        matches.add("Preservatives")
    if product.category == "cosmetic" and any(term in name for term in ("fragrance", "parfum")):
        matches.add("Synthetic fragrance")

    return matches


def _severity(pi: ProductIngredient) -> float:
    status = pi.effective_status
    if status == "avoid":
        return 1.0
    if status == "watch":
        return 0.7
    return 0.45


@router.get("/exposure-ledger", response_model=ExposureLedgerResponse)
async def get_exposure_ledger(
    db: DBSession,
    current_user: CurrentUser,
) -> ExposureLedgerResponse:
    """Return a relative label-exposure ledger from the user's 14-day stack log."""
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today - timedelta(days=13), datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    result = await db.execute(
        select(UserStackEntry.logged_at, Product, ProductIngredient, Ingredient)
        .join(Product, UserStackEntry.product_id == Product.id)
        .join(ProductIngredient, ProductIngredient.product_id == Product.id)
        .outerjoin(Ingredient, ProductIngredient.ingredient_id == Ingredient.id)
        .where(
            UserStackEntry.user_id == current_user.id,
            UserStackEntry.logged_at >= start,
            UserStackEntry.logged_at < end,
        )
    )
    rows = result.all()

    daily: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    today_scores: dict[str, float] = defaultdict(float)
    source_names: dict[str, set[str]] = defaultdict(set)

    for logged_at, product, pi, ingredient in rows:
        day = logged_at.date()
        for category in _classify_exposures(product, pi, ingredient):
            score = _severity(pi)
            daily[day][category] += score
            if day == today:
                today_scores[category] += score
                source_names[category].add(product.name)

    chart: list[ExposureDay] = []
    for offset in range(13, -1, -1):
        day = today - timedelta(days=offset)
        total = sum(daily[day].values())
        chart.append(ExposureDay(
            date=day.isoformat(),
            high=round(min(1.0, total / 8), 2),
            moderate=round(min(1.0, total / 5), 2),
            low=round(min(1.0, total / 3), 2),
        ))

    categories: list[ExposureCategory] = []
    for name in sorted(EXPOSURE_RULES):
        today_score = today_scores.get(name, 0.0)
        previous_scores = [
            daily[today - timedelta(days=offset)].get(name, 0.0)
            for offset in range(1, 14)
        ]
        previous_avg = sum(previous_scores) / len(previous_scores) if previous_scores else 0
        delta_value = 0 if previous_avg == 0 else round(((today_score - previous_avg) / previous_avg) * 100)
        if previous_avg == 0 and today_score > 0:
            delta = "new"
        else:
            delta = f"{delta_value:+d}%"

        if today_score <= 0:
            continue

        categories.append(ExposureCategory(
            name=name,
            load=round(min(1.0, today_score / 3), 2),
            delta=delta,
            sources=len(source_names[name]),
            alert=today_score >= 1.4,
            note=EXPOSURE_NOTES[name],
        ))

    categories.sort(key=lambda c: c.load, reverse=True)
    total_today = sum(today_scores.values())
    summary = "No label-exposure signals found in today's stack."
    if total_today > 0:
        if total_today >= 4:
            level = "higher than usual"
        elif total_today >= 2:
            level = "moderate"
        else:
            level = "low"
        summary = f"Today's relative label exposure is {level} across {len(categories)} tracked categories."

    return ExposureLedgerResponse(
        summary=summary,
        chart=chart,
        categories=categories,
        caveat="This is a relative label screen, not a dose, blood-level, toxicity, or clinical-risk estimate.",
    )
