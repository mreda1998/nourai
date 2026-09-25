"""Small durable PostgreSQL queue with leases, retries, and idempotency."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.ingestion import IngestionJob, IngestionJobStatus


class IngestionQueue:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        lease_seconds: int = 300,
        default_max_attempts: int = 5,
    ) -> None:
        self._session_factory = session_factory
        self._lease_seconds = lease_seconds
        self._default_max_attempts = default_max_attempts

    async def enqueue(
        self,
        session: AsyncSession,
        *,
        job_type: str,
        idempotency_key: str,
        payload: dict[str, Any],
        priority: int = 100,
        max_attempts: int | None = None,
    ) -> IngestionJob:
        values = {
            "job_type": job_type,
            "idempotency_key": idempotency_key,
            "payload": payload,
            "priority": priority,
            "max_attempts": max_attempts or self._default_max_attempts,
        }
        await session.execute(
            insert(IngestionJob)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[IngestionJob.idempotency_key])
        )
        job = (
            await session.execute(
                select(IngestionJob).where(
                    IngestionJob.idempotency_key == idempotency_key
                )
            )
        ).scalar_one()

        # A fresh scan may retry a job that exhausted its attempts due to a
        # temporary upstream outage. The same row remains the audit trail.
        if job.status == IngestionJobStatus.DEAD.value:
            job.status = IngestionJobStatus.QUEUED.value
            job.attempts = 0
            job.available_at = datetime.now(timezone.utc)
            job.last_error = None
            job.completed_at = None
            job.result = None
        return job

    async def enqueue_many(
        self,
        session: AsyncSession,
        jobs: list[dict[str, Any]],
    ) -> int:
        """Insert a manifest chunk in one round trip, ignoring existing keys."""
        if not jobs:
            return 0
        now = datetime.now(timezone.utc)
        rows = [
            {
                "id": uuid4(),
                "job_type": str(job["job_type"]),
                "idempotency_key": str(job["idempotency_key"]),
                "payload": dict(job["payload"]),
                "priority": int(job.get("priority", 100)),
                "status": IngestionJobStatus.QUEUED.value,
                "attempts": 0,
                "max_attempts": int(
                    job.get("max_attempts", self._default_max_attempts)
                ),
                "available_at": now,
            }
            for job in jobs
        ]
        result = await session.execute(
            insert(IngestionJob)
            .values(rows)
            .on_conflict_do_nothing(index_elements=[IngestionJob.idempotency_key])
        )
        return max(result.rowcount or 0, 0)

    async def claim(self, worker_id: str) -> IngestionJob | None:
        now = datetime.now(timezone.utc)
        stale_before = now - timedelta(seconds=self._lease_seconds)
        async with self._session_factory() as session:
            async with session.begin():
                job = (
                    await session.execute(
                        select(IngestionJob)
                        .where(
                            or_(
                                and_(
                                    IngestionJob.status.in_(
                                        [
                                            IngestionJobStatus.QUEUED.value,
                                            IngestionJobStatus.RETRY.value,
                                        ]
                                    ),
                                    IngestionJob.available_at <= now,
                                ),
                                and_(
                                    IngestionJob.status == IngestionJobStatus.RUNNING.value,
                                    IngestionJob.locked_at < stale_before,
                                ),
                            )
                        )
                        .order_by(
                            IngestionJob.priority.asc(),
                            IngestionJob.available_at.asc(),
                            IngestionJob.created_at.asc(),
                        )
                        .with_for_update(skip_locked=True)
                        .limit(1)
                    )
                ).scalar_one_or_none()
                if job is None:
                    return None
                job.status = IngestionJobStatus.RUNNING.value
                job.locked_at = now
                job.locked_by = worker_id
                job.attempts += 1
            return job

    async def complete(
        self,
        job_id: UUID,
        *,
        result: dict[str, Any] | None = None,
        product_id: UUID | None = None,
        source_record_id: UUID | None = None,
    ) -> None:
        await self._finish(
            job_id,
            status=IngestionJobStatus.COMPLETE.value,
            result=result,
            product_id=product_id,
            source_record_id=source_record_id,
        )

    async def needs_review(
        self,
        job_id: UUID,
        *,
        result: dict[str, Any] | None = None,
        product_id: UUID | None = None,
        source_record_id: UUID | None = None,
    ) -> None:
        await self._finish(
            job_id,
            status=IngestionJobStatus.NEEDS_REVIEW.value,
            result=result,
            product_id=product_id,
            source_record_id=source_record_id,
        )

    async def _finish(
        self,
        job_id: UUID,
        *,
        status: str,
        result: dict[str, Any] | None,
        product_id: UUID | None = None,
        source_record_id: UUID | None = None,
    ) -> None:
        async with self._session_factory() as session:
            async with session.begin():
                job = await session.get(IngestionJob, job_id, with_for_update=True)
                if job is None:
                    return
                job.status = status
                job.result = result
                job.product_id = product_id or job.product_id
                job.source_record_id = source_record_id or job.source_record_id
                job.completed_at = datetime.now(timezone.utc)
                job.locked_at = None
                job.locked_by = None

    async def fail(self, job_id: UUID, error: Exception | str) -> None:
        async with self._session_factory() as session:
            async with session.begin():
                job = await session.get(IngestionJob, job_id, with_for_update=True)
                if job is None:
                    return
                job.last_error = str(error)[:4000]
                job.locked_at = None
                job.locked_by = None
                if job.attempts >= job.max_attempts:
                    job.status = IngestionJobStatus.DEAD.value
                    job.completed_at = datetime.now(timezone.utc)
                    return
                delay_seconds = min(15 * (2 ** max(job.attempts - 1, 0)), 900)
                job.status = IngestionJobStatus.RETRY.value
                job.available_at = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
