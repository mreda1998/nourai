"""Tester insights: client-reported events and product submissions."""
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app.api.deps import AppVersion, DBSession, DeviceId, OptionalUser
from app.core.config import settings
from app.models.tester import ProductSubmission
from app.services.ingestion.normalization import normalize_gtin
from app.services.insights import record_event
from app.services.submission_storage import SubmissionPhotoStore

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


# ─── Product submissions ──────────────────────────────────────────────────────

_MAX_PHOTOS = 3
_MAX_PHOTO_BYTES = 6 * 1024 * 1024
_PHOTO_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/heif": "heic"}
_CATEGORIES = {"food", "supplement", "cosmetic", "otc", "other"}


def get_photo_store() -> SubmissionPhotoStore:
    return SubmissionPhotoStore()


def _submission_barcode(raw: str | None) -> str | None:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if not digits:
        return None
    try:
        return normalize_gtin(digits).gtin14
    except ValueError:
        return digits[:32]  # keep what they scanned even if it is not a valid GTIN


def _clean(value: str | None, limit: int) -> str | None:
    return (value or "").strip()[:limit] or None


@router.post("/submissions", status_code=status.HTTP_201_CREATED)
async def post_submission(
    db: DBSession,
    device_id: DeviceId,
    store: Annotated[SubmissionPhotoStore, Depends(get_photo_store)],
    current_user: OptionalUser = None,
    barcode: Annotated[str | None, Form()] = None,
    name: Annotated[str | None, Form()] = None,
    brand: Annotated[str | None, Form()] = None,
    category: Annotated[str | None, Form()] = None,
    note: Annotated[str | None, Form()] = None,
    photos: Annotated[list[UploadFile] | None, File()] = None,
):
    """A tester asks us to add a product we could not find, ideally with label photos."""
    device = _require_device(device_id)
    photos = photos or []
    barcode_value = _submission_barcode(barcode)
    name_value = _clean(name, 300)
    category_value = _clean(category, 32)

    if not (barcode_value or name_value or photos):
        raise HTTPException(status_code=422, detail="Add a barcode, a name or at least one photo")
    if category_value and category_value not in _CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown category")
    if len(photos) > _MAX_PHOTOS:
        raise HTTPException(status_code=422, detail=f"At most {_MAX_PHOTOS} photos")

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    recent = await db.scalar(
        select(func.count())
        .select_from(ProductSubmission)
        .where(ProductSubmission.device_id == device, ProductSubmission.created_at >= since)
    )
    if (recent or 0) >= settings.submission_daily_limit:
        raise HTTPException(status_code=429, detail="Thanks! That's plenty for today — try again tomorrow.")

    images: list[tuple[bytes, str, str]] = []
    for photo in photos:
        content_type = (photo.content_type or "").lower()
        if content_type not in _PHOTO_TYPES:
            raise HTTPException(status_code=415, detail="Photos must be JPEG, PNG or HEIC")
        data = await photo.read(_MAX_PHOTO_BYTES + 1)
        if len(data) > _MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="Each photo must be 6 MB or smaller")
        images.append((data, content_type, _PHOTO_TYPES[content_type]))
    if images and not store.configured:
        raise HTTPException(status_code=503, detail="Photo uploads are not available right now")

    submission = ProductSubmission(
        device_id=device,
        user_id=current_user.id if current_user else None,
        barcode=barcode_value,
        name=name_value,
        brand=_clean(brand, 200),
        category=category_value,
        note=_clean(note, 2000),
        photo_paths=[],
    )
    db.add(submission)
    await db.flush()

    paths: list[str] = []
    for index, (data, content_type, ext) in enumerate(images, start=1):
        path = f"{submission.id}/{index}.{ext}"
        try:
            await store.upload(path, data, content_type)
        except Exception as exc:
            await db.rollback()
            raise HTTPException(status_code=502, detail="Could not store the photos, please try again") from exc
        paths.append(path)

    submission.photo_paths = paths
    await db.commit()
    return {"id": str(submission.id), "photos_stored": len(paths)}
