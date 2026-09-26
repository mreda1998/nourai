"""Tester insights: client-reported events and product submissions."""
import json
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator

from app.api.deps import AppVersion, DeviceId, OptionalUser
from app.services.insights import record_event

router = APIRouter()

_MAX_META_BYTES = 2048


class ClientEventIn(BaseModel):
    type: Literal["search", "product_view", "stack_add", "feedback"]
    product_id: UUID | None = None
    barcode: str | None = Field(default=None, max_length=32)
    query: str | None = Field(default=None, max_length=500)
    meta: dict[str, Any] = Field(default_factory=dict)

    @field_validator("meta")
    @classmethod
    def _meta_is_small(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, default=str)) > _MAX_META_BYTES:
            raise ValueError(f"meta must serialize to at most {_MAX_META_BYTES} bytes")
        return value


def _require_device(device_id: str | None) -> str:
    if not device_id:
        raise HTTPException(status_code=400, detail="X-Device-Id header is required")
    return device_id


@router.post("/events", status_code=status.HTTP_204_NO_CONTENT)
async def post_event(
    body: ClientEventIn,
    device_id: DeviceId,
    app_version: AppVersion,
    current_user: OptionalUser = None,
):
    """Record a search, product view, stack add or feedback message."""
    await record_event(
        device_id=_require_device(device_id),
        event_type=body.type,
        user_id=current_user.id if current_user else None,
        barcode=body.barcode,
        product_id=body.product_id,
        query=body.query,
        meta=body.meta,
        app_version=app_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
