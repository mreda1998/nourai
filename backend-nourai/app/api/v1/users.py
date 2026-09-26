"""User API endpoints."""
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DBSession, get_subscription_service
from app.models.user import ScanHistoryEntry, SearchHistoryEntry, UserStackEntry
from app.models.ingredient import Ingredient
from app.models.product import Product, ProductIngredient
from app.services.biodomain_scorer import score_product_biodomains
from app.schemas.user import (
    UserProfileResponse,
    UserProfileUpdate,
    ScanHistoryItemResponse,
    ScanHistoryResponse,
    SearchHistoryItemResponse,
    SearchHistoryResponse,
    SearchHistoryCreate,
    DailyScoreCategory,
    DailyScoreResponse,
    HealthDomainFactor,
    HealthDomainResponse,
)
from app.core.biodomains import BIODOMAIN_BY_KEY
from app.schemas.subscription import SubscriptionResponse
from app.services.subscription import SubscriptionService

router = APIRouter()

# Daily Longevity Score: maps the 10 canonical biodomains down to the 5
# categories shown on the new Home screen.
_DAILY_SCORE_CATEGORIES: list[tuple[str, str, list[str]]] = [
    ("nutrition_quality", "Nutrition Quality", ["energy_metabolism", "body_composition"]),
    ("inflammation_balance", "Inflammation Balance", ["inflammation_immune"]),
    ("metabolic_support", "Metabolic Support", ["energy_metabolism"]),
    ("hormonal_stress", "Hormonal & Stress", ["hormonal_endocrine", "sleep_recovery"]),
    ("gut_microbiome", "Gut & Microbiome", ["gut_digestive"]),
]


def _score_qualifier(value: int) -> str:
    if value >= 80:
        return "High"
    if value >= 65:
        return "Good"
    if value >= 50:
        return "Moderate"
    return "Low"


def _today_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    current_user: CurrentUser,
):
    """Get the current user's profile."""
    return UserProfileResponse.model_validate(current_user)


@router.put("/me", response_model=UserProfileResponse)
async def update_user_profile(
    profile_update: UserProfileUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    """Update the current user's profile."""
    update_data = profile_update.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)

    return UserProfileResponse.model_validate(current_user)


@router.post("/me/onboarding")
async def complete_onboarding(
    db: DBSession,
    current_user: CurrentUser,
):
    """Mark onboarding as complete."""
    current_user.onboarding_completed = True
    await db.commit()

    return {"completed": True}


@router.get("/me/history", response_model=ScanHistoryResponse)
async def get_scan_history(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get the current user's scan history, newest first."""
    count_result = await db.execute(
        select(func.count()).where(ScanHistoryEntry.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(ScanHistoryEntry)
        .where(ScanHistoryEntry.user_id == current_user.id)
        .options(selectinload(ScanHistoryEntry.product))
        .order_by(ScanHistoryEntry.scanned_at.desc())
        .limit(limit)
        .offset(offset)
    )
    entries = list(result.scalars().all())

    def _grade(health_score: int | None) -> str:
        if health_score is None:
            return "C"
        if health_score >= 80:
            return "A"
        if health_score >= 60:
            return "B"
        if health_score >= 40:
            return "C"
        return "D"

    items = [
        ScanHistoryItemResponse(
            id=e.id,
            product_id=e.product_id,
            product_name=e.product.name,
            product_brand=e.product.brand,
            product_grade=_grade(e.product.health_score),
            product_category=e.product.category.value if e.product.category else "supplement",
            product_image_url=e.product.image_url,
            scanned_at=e.scanned_at,
        )
        for e in entries
    ]

    return ScanHistoryResponse(items=items, total=total)


@router.post("/me/history", response_model=ScanHistoryItemResponse, status_code=201)
async def add_to_scan_history(
    body: dict,
    db: DBSession,
    current_user: CurrentUser,
):
    """Record a product scan/view in history."""
    product_id_raw = body.get("product_id")
    if not product_id_raw:
        raise HTTPException(status_code=422, detail="product_id is required")

    try:
        product_id = UUID(str(product_id_raw))
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid product_id")

    # Verify product exists
    product_result = await db.execute(select(Product).where(Product.id == product_id))
    product = product_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    entry = ScanHistoryEntry(user_id=current_user.id, product_id=product_id)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    def _grade(health_score: int | None) -> str:
        if health_score is None:
            return "C"
        if health_score >= 80:
            return "A"
        if health_score >= 60:
            return "B"
        if health_score >= 40:
            return "C"
        return "D"

    return ScanHistoryItemResponse(
        id=entry.id,
        product_id=entry.product_id,
        product_name=product.name,
        product_brand=product.brand,
        product_grade=_grade(product.health_score),
        product_category=product.category.value if product.category else "supplement",
        product_image_url=product.image_url,
        scanned_at=entry.scanned_at,
    )


@router.get("/me/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    current_user: CurrentUser,
    service: Annotated[SubscriptionService, Depends(get_subscription_service)],
):
    """Get the current user's subscription status."""
    subscription = await service.get_subscription(current_user.id)

    if not subscription:
        # Return free tier status if no subscription exists
        from app.models.subscription import SubscriptionStatus, SubscriptionTier

        return SubscriptionResponse(
            tier=SubscriptionTier.FREE,
            status=SubscriptionStatus.ACTIVE,
            is_premium=False,
            expires_at=None,
        )

    return SubscriptionResponse(
        tier=subscription.tier,
        status=subscription.status,
        is_premium=subscription.is_premium,
        expires_at=subscription.expires_at,
    )


@router.get("/me/daily-score", response_model=DailyScoreResponse)
async def get_daily_score(
    db: DBSession,
    current_user: CurrentUser,
):
    """Aggregate today's stack into the Daily Longevity Score and its 5 sub-scores."""
    today = _today_start()

    stack_result = await db.execute(
        select(UserStackEntry.product_id).where(
            UserStackEntry.user_id == current_user.id,
            UserStackEntry.logged_at >= today,
        )
    )
    product_ids = list({pid for pid in stack_result.scalars().all()})

    if not product_ids:
        return DailyScoreResponse(
            overall=0,
            qualifier=_score_qualifier(0),
            categories=[
                DailyScoreCategory(key=key, label=label, value=0)
                for key, label, _ in _DAILY_SCORE_CATEGORIES
            ],
        )

    pi_result = await db.execute(
        select(ProductIngredient)
        .where(ProductIngredient.product_id.in_(product_ids))
        .options(
            selectinload(ProductIngredient.ingredient).selectinload(Ingredient.biodomain_scores)
        )
    )
    product_ingredients = list(pi_result.scalars().all())

    domain_scores, overall = score_product_biodomains(product_ingredients)
    domain_values = {d.biodomain: d.display_value for d in domain_scores}

    categories = []
    for key, label, domains in _DAILY_SCORE_CATEGORIES:
        values = [domain_values[d] for d in domains if d in domain_values]
        value = round(sum(values) / len(values)) if values else 0
        categories.append(DailyScoreCategory(key=key, label=label, value=value))

    return DailyScoreResponse(
        overall=overall,
        qualifier=_score_qualifier(overall),
        categories=categories,
    )


def _factor_strength(confidence_weight: float) -> str:
    if confidence_weight >= 1.0:
        return "Strong"
    if confidence_weight >= 0.6:
        return "Moderate"
    return "Limited"


def _factor_direction(direction_sign: int) -> str:
    if direction_sign > 0:
        return "benefit"
    if direction_sign < 0:
        return "harm"
    return "neutral"


@router.get("/me/health-domain/{biodomain}", response_model=HealthDomainResponse)
async def get_health_domain(
    biodomain: str,
    db: DBSession,
    current_user: CurrentUser,
):
    """Score + top contributing ingredients for a single biodomain, from today's stack."""
    domain_def = BIODOMAIN_BY_KEY.get(biodomain)
    if not domain_def:
        raise HTTPException(status_code=404, detail="Unknown biodomain")

    today = _today_start()
    stack_result = await db.execute(
        select(UserStackEntry.product_id).where(
            UserStackEntry.user_id == current_user.id,
            UserStackEntry.logged_at >= today,
        )
    )
    product_ids = list({pid for pid in stack_result.scalars().all()})

    if not product_ids:
        return HealthDomainResponse(
            biodomain=biodomain, label=domain_def.name, score=0,
            qualifier=_score_qualifier(0), factors=[],
        )

    pi_result = await db.execute(
        select(ProductIngredient)
        .where(ProductIngredient.product_id.in_(product_ids))
        .options(
            selectinload(ProductIngredient.ingredient).selectinload(Ingredient.biodomain_scores)
        )
    )
    product_ingredients = list(pi_result.scalars().all())

    domain_scores, _ = score_product_biodomains(product_ingredients)
    match = next((d for d in domain_scores if d.biodomain == biodomain), None)

    if not match:
        return HealthDomainResponse(
            biodomain=biodomain, label=domain_def.name, score=0,
            qualifier=_score_qualifier(0), factors=[],
        )

    factors = [
        HealthDomainFactor(
            ingredient_name=c.ingredient_name,
            strength=_factor_strength(c.confidence_weight),
            direction=_factor_direction(c.direction_sign),
        )
        for c in sorted(match.contributions, key=lambda c: abs(c.weighted_score), reverse=True)[:6]
    ]

    score = round(match.display_value)
    return HealthDomainResponse(
        biodomain=biodomain, label=domain_def.name, score=score,
        qualifier=_score_qualifier(score), factors=factors,
    )


@router.get("/me/search-history", response_model=SearchHistoryResponse)
async def get_search_history(
    db: DBSession,
    current_user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Get the current user's search history, newest first."""
    count_result = await db.execute(
        select(func.count()).where(SearchHistoryEntry.user_id == current_user.id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(SearchHistoryEntry)
        .where(SearchHistoryEntry.user_id == current_user.id)
        .order_by(SearchHistoryEntry.searched_at.desc())
        .limit(limit)
        .offset(offset)
    )
    entries = list(result.scalars().all())

    return SearchHistoryResponse(
        items=[SearchHistoryItemResponse.model_validate(e) for e in entries],
        total=total,
    )


@router.post("/me/search-history", response_model=SearchHistoryItemResponse, status_code=201)
async def add_to_search_history(
    body: SearchHistoryCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    """Record a search in history."""
    entry = SearchHistoryEntry(
        user_id=current_user.id,
        query=body.query,
        result_type=body.result_type,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    return SearchHistoryItemResponse.model_validate(entry)
