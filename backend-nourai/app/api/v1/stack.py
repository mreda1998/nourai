"""Stack API endpoints for user supplement logs."""
from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import CurrentUser, get_stack_service
from app.schemas.user import StackEntryCreate, StackEntryResponse
from app.services.stack import StackService

router = APIRouter()


@router.get("", response_model=list[StackEntryResponse])
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

    return [StackEntryResponse.model_validate(e) for e in entries]


@router.post("", response_model=StackEntryResponse, status_code=201)
async def add_to_stack(
    entry: StackEntryCreate,
    current_user: CurrentUser = None,
    service: Annotated[StackService, Depends(get_stack_service)] = None,
):
    """Add a product to user's stack."""
    try:
        stack_entry = await service.add_to_stack(current_user.id, entry)
        return StackEntryResponse.model_validate(stack_entry)
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


@router.get("/{entry_id}", response_model=StackEntryResponse)
async def get_stack_entry(
    entry_id: UUID,
    current_user: CurrentUser = None,
    service: Annotated[StackService, Depends(get_stack_service)] = None,
):
    """Get a specific stack entry."""
    entry = await service.get_stack_entry(current_user.id, entry_id)

    if not entry:
        raise HTTPException(status_code=404, detail="Stack entry not found")

    return StackEntryResponse.model_validate(entry)
