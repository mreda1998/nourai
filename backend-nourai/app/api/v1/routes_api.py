"""Reviewed evidence routes (ingredient → mechanism → measured outcome)."""
from fastapi import APIRouter, HTTPException

from app.api.deps import DBSession
from app.repositories.pathway import PathwayRepository
from app.schemas.pathway import RouteOut, route_out

router = APIRouter()


@router.get("/{slug}", response_model=RouteOut, response_model_by_alias=True)
async def get_route(slug: str, db: DBSession) -> RouteOut:
    route = await PathwayRepository(db).route_by_slug(slug)
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    return route_out(route)
