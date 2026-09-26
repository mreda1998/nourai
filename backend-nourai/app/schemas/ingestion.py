"""Public contracts for asynchronous barcode ingestion."""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel


JobStatus = Literal["queued", "running", "retry", "complete", "needs_review", "dead"]


class BarcodeIngestionResponse(BaseModel):
    job_id: UUID
    status: JobStatus
    gtin14: str
    product_id: UUID | None = None
    poll_after_ms: int = 1200
    message: str


class IngestionJobResponse(BaseModel):
    job_id: UUID
    status: JobStatus
    product_id: UUID | None = None
    poll_after_ms: int = 1200
    message: str

