"""Public contracts for asynchronous barcode ingestion."""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel


JobStatus = Literal["queued", "running", "retry", "complete", "needs_review", "dead"]


class CatalogPreview(BaseModel):
    """What the catalog index already knows while full details load."""

    name: str
    brand: str | None = None
    image_url: str | None = None
    category: str


class BarcodeIngestionResponse(BaseModel):
    job_id: UUID
    status: JobStatus
    gtin14: str
    product_id: UUID | None = None
    poll_after_ms: int = 1200
    message: str
    preview: CatalogPreview | None = None


class IngestionJobResponse(BaseModel):
    job_id: UUID
    status: JobStatus
    product_id: UUID | None = None
    poll_after_ms: int = 1200
    message: str

