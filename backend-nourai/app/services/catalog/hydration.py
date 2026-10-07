"""
Hydrate a product inline the first time someone scans or opens it: enqueue
the usual job (so the worker remains the safety net), then try to finish it
within a small time budget. A circuit breaker stops inline attempts for a
while after repeated upstream failures, so a rate-limited source doesn't make
every scan wait out the budget.
"""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ingestion import IngestionJob
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsError
from app.services.ingestion.product_job import ProductJobOutcome, run_product_job


class CircuitBreaker:
    def __init__(self, failures: int = 3, cooldown_s: float = 60.0, clock: Callable[[], float] = time.monotonic):
        self._threshold = failures
        self._cooldown = cooldown_s
        self._clock = clock
        self._failures = 0
        self._open_until = 0.0

    def allow(self) -> bool:
        return self._clock() >= self._open_until

    def success(self) -> None:
        self._failures = 0

    def failure(self) -> None:
        self._failures += 1
        if self._failures >= self._threshold:
            self._open_until = self._clock() + self._cooldown
            self._failures = 0


default_breaker = CircuitBreaker()


@dataclass(frozen=True, slots=True)
class HydrationResult:
    status: Literal["hydrated", "queued", "not_found"]
    product_id: UUID | None
    job: IngestionJob


RunJob = Callable[[Any, Any, IngestionJob, Any], Awaitable[ProductJobOutcome]]


class CatalogHydrator:
    def __init__(
        self,
        queue: Any,
        pipeline: Any,
        session_factory: Any,
        *,
        breaker: CircuitBreaker = default_breaker,
        budget_s: float = 4.0,
        run_job: RunJob = run_product_job,
    ) -> None:
        self._queue = queue
        self._pipeline = pipeline
        self._sessions = session_factory
        self._breaker = breaker
        self._budget = budget_s
        self._run_job = run_job

    async def hydrate(self, db: AsyncSession, *, digits: str, gtin14: str) -> HydrationResult:
        job = await self._queue.enqueue(
            db,
            job_type="product_barcode",
            idempotency_key=f"barcode:off-v3.6:{gtin14}",
            payload={"barcode": digits, "gtin14": gtin14},
            priority=50,
        )
        await db.commit()

        if job.status == "complete" and job.product_id:
            return HydrationResult("hydrated", job.product_id, job)
        if job.status in ("needs_review", "dead"):
            return HydrationResult("not_found", None, job)
        if not self._breaker.allow():
            return HydrationResult("queued", None, job)

        try:
            outcome = await asyncio.wait_for(
                self._run_job(self._queue, self._pipeline, job, self._sessions), self._budget
            )
        except (asyncio.TimeoutError, OpenFoodFactsError):
            # The job is still queued; the worker retries it with backoff.
            self._breaker.failure()
            return HydrationResult("queued", None, job)

        self._breaker.success()
        if outcome.status == "complete" and outcome.product_id:
            return HydrationResult("hydrated", outcome.product_id, job)
        return HydrationResult("not_found", None, job)
