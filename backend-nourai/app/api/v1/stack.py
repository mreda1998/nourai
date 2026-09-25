"""Stack API endpoints for user supplement logs."""
from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import CurrentUser, get_stack_service
from app.schemas.product import grade_from_score
from app.schemas.user import StackEntryCreate, StackEntryWithProduct
from app.services.stack import StackService

router = APIRouter()


def _entry_with_product(entry) -> StackEntryWithProduct:
    product = entry.product
    return StackEntryWithProduct(
        id=entry.id,
        product_id=entry.product_id,
        logged_at=entry.logged_at,
        time_of_day=entry.time_of_day,
        quantity=entry.quantity,
        unit=entry.unit,
        notes=entry.notes,
        created_at=entry.created_at,
        product_name=product.name,
        product_brand=product.brand,
        product_image_url=product.image_url,
        product_grade=grade_from_score(product.health_score),
        product_category=product.category.value if product.category else "supplement",
    )


@router.get("", response_model=list[StackEntryWithProduct])
async def get_stack(
    stack_date: date | None = Query(None, alias="date"),
    current_user: CurrentUser = None,
    service: Annotated[StackService, Depends(get_stack_service)] = None,
):
    """Get user's stack for a specific date (defaults to today)."""
    if stack_date:
        target_datetime = datetime.combine(stack_date, datetime.min.time())
        entries = await service.get_daily_stack(current_user.id, target_datetime)
    else:
        entries = await service.get_daily_stack(current_user.id, datetime.utcnow())

    return [_entry_with_product(e) for e in entries]


@router.post("", response_model=StackEntryWithProduct, status_code=201)
async def add_to_stack(
    entry: StackEntryCreate,
    current_user: CurrentUser = None,
    service: Annotated[StackService, Depends(get_stack_service)] = None,
):
    """Add a product to user's stack."""
    try:
        stack_entry = await service.add_to_stack(current_user.id, entry)
        return _entry_with_product(stack_entry)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{entry_id}", status_code=204)
async def remove_from_stack(
    entry_id: UUID,
    current_user: CurrentUser = None,
    service: Annotated[StackService, Depends(get_stack_service)] = None,
):
    """Remove an entry from user's stack."""
    deleted = await service.remove_from_stack(current_user.id, entry_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Stack entry not found")


@router.get("/{entry_id}", response_model=StackEntryWithProduct)
async def get_stack_entry(
    entry_id: UUID,
    current_user: CurrentUser = None,
    service: Annotated[StackService, Depends(get_stack_service)] = None,
):
    """Get a specific stack entry."""
    entry = await service.get_stack_entry(current_user.id, entry_id)

    if not entry:
        raise HTTPException(status_code=404, detail="Stack entry not found")

    return _entry_with_product(entry)
