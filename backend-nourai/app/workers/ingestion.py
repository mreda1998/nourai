"""Run the durable product and image ingestion worker."""
from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from uuid import UUID

from app.core.config import settings
from app.db.session import async_session_factory
from app.models.ingestion import IngestionJob
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsNotFound
from app.services.ingestion.image_pipeline import ProductImagePipeline
from app.services.ingestion.product_pipeline import ProductIngestionPipeline
from app.services.ingestion.queue import IngestionQueue


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("elory.ingestion")


class IngestionWorker:
    def __init__(self) -> None:
        self.queue = IngestionQueue(
            async_session_factory,
            lease_seconds=settings.ingestion_job_lease_seconds,
            default_max_attempts=settings.ingestion_job_max_attempts,
        )
        self.products = ProductIngestionPipeline()
        self.images = ProductImagePipeline(async_session_factory)
        self.stop_event = asyncio.Event()

    async def run(self, *, once: bool = False) -> None:
        while not self.stop_event.is_set():
            job = await self.queue.claim(settings.ingestion_worker_id)
            if job is None:
                if once:
                    return
                try:
                    await asyncio.wait_for(
                        self.stop_event.wait(), timeout=settings.ingestion_poll_seconds
                    )
                except TimeoutError:
                    pass
                continue
            await self._handle(job)
            if once:
                return

    async def _handle(self, job: IngestionJob) -> None:
        logger.info("processing job=%s type=%s attempt=%s", job.id, job.job_type, job.attempts)
        try:
            if job.job_type == "product_barcode":
                await self._ingest_product(job)
            elif job.job_type == "process_image":
                asset_id = UUID(str(job.payload["asset_id"]))
                if not settings.image_processing_enabled:
                    await self.queue.complete(
                        job.id, result={"asset_id": str(asset_id), "skipped": True}
                    )
                    return
                try:
                    await self.images.process(asset_id)
                except Exception as exc:
                    await self.images.mark_failed(asset_id, exc)
                    raise
                await self.queue.complete(
                    job.id, result={"asset_id": str(asset_id), "processed": True}
                )
            else:
                raise ValueError(f"Unsupported ingestion job type: {job.job_type}")
        except OpenFoodFactsNotFound:
            await self.queue.needs_review(
                job.id,
                result={
                    "reason": "not_found",
                    "message": "No trusted catalog record was found for this barcode",
                },
            )
        except Exception as exc:
            logger.exception("job failed job=%s", job.id)
            await self.queue.fail(job.id, exc)

    async def _ingest_product(self, job: IngestionJob) -> None:
        barcode = str(job.payload["barcode"])
        gtin14 = str(job.payload["gtin14"])
        async with async_session_factory() as session:
            result = await self.products.ingest_barcode(
                session,
                barcode=barcode,
                gtin14=gtin14,
                job=job,
            )

        if result.needs_review:
            await self.queue.needs_review(
                job.id,
                product_id=result.product_id,
                source_record_id=result.source_record_id,
                result={"message": result.message or "Editorial review required"},
            )
            return

        for asset_id in result.asset_ids:
            async with async_session_factory() as session:
                async with session.begin():
                    await self.queue.enqueue(
                        session,
                        job_type="process_image",
                        idempotency_key=f"image:authentic-v1:{asset_id}",
                        payload={"asset_id": str(asset_id)},
                        priority=150,
                    )
        await self.queue.complete(
            job.id,
            product_id=result.product_id,
            source_record_id=result.source_record_id,
            result={
                "product_id": str(result.product_id),
                "revision_created": result.revision_created,
                "image_jobs": len(result.asset_ids),
            },
        )


async def _run(once: bool) -> None:
    worker = IngestionWorker()
    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_name, worker.stop_event.set)
    await worker.run(once=once)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Elory's ingestion worker")
    parser.add_argument("--once", action="store_true", help="Claim at most one job")
    args = parser.parse_args()
    asyncio.run(_run(args.once))


if __name__ == "__main__":
    main()

