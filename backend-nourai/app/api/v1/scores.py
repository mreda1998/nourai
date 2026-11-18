"""Score an explicit list of products — works for guests' on-device stacks."""
from fastapi import APIRouter, HTTPException

from app.api.deps import DBSession
from app.schemas.user import DailyScoreResponse, HealthDomainResponse, StackScoreRequest
from app.services.stack_review import StackReview, stack_review
from app.services.stack_score import daily_score, health_domain, load_product_ingredients

router = APIRouter()


@router.post("/daily", response_model=DailyScoreResponse)
async def score_stack(body: StackScoreRequest, db: DBSession):
    """Daily score and its 5 categories for the given products."""
    return daily_score(await load_product_ingredients(db, body.product_ids))


@router.post("/domain/{biodomain}", response_model=HealthDomainResponse)
async def score_stack_domain(biodomain: str, body: StackScoreRequest, db: DBSession):
    """One biodomain's score and top contributing ingredients for the given products."""
    result = health_domain(biodomain, await load_product_ingredients(db, body.product_ids))
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown biodomain")
    return result


@router.post("/review", response_model=StackReview)
async def review_stack(body: StackScoreRequest, db: DBSession):
    """What holds up, what to know and what overlaps across the given products. No score."""
    return stack_review(await load_product_ingredients(db, body.product_ids))
