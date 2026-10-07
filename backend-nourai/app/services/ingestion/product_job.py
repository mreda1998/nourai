"""
Run one product_barcode ingestion job to completion. Shared by the worker and
by inline hydration, so a product reaches the database the same way whichever
path gets there first.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.ingestion import IngestionJob
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsNotFound
from app.services.ingestion.product_pipeline import ProductIngestionPipeline
from app.services.ingestion.queue import IngestionQueue


@dataclass(frozen=True, slots=True)
class ProductJobOutcome:
    status: Literal["complete", "needs_review", "not_found"]
    product_id: UUID | None


async def run_product_job(
    queue: IngestionQueue,
    pipeline: ProductIngestionPipeline,
    job: IngestionJob,
    session_factory: async_sessionmaker[AsyncSession],
) -> ProductJobOutcome:
    barcode = str(job.payload["barcode"])
    gtin14 = str(job.payload["gtin14"])
    try:
        async with session_factory() as session:
            result = await pipeline.ingest_barcode(session, barcode=barcode, gtin14=gtin14, job=job)
    except OpenFoodFactsNotFound:
        await queue.needs_review(
            job.id,
            result={
                "reason": "not_found",
                "message": "No trusted catalog record was found for this barcode",
            },
        )
        return ProductJobOutcome("not_found", None)

    if result.needs_review:
        await queue.needs_review(
            job.id,
            product_id=result.product_id,
            source_record_id=result.source_record_id,
            result={"message": result.message or "Editorial review required"},
        )
        return ProductJobOutcome("needs_review", result.product_id)

    for asset_id in result.asset_ids:
        async with session_factory() as session:
            async with session.begin():
                await queue.enqueue(
                    session,
                    job_type="process_image",
                    idempotency_key=f"image:authentic-v1:{asset_id}",
                    payload={"asset_id": str(asset_id)},
                    priority=150,
                )
    await queue.complete(
        job.id,
        product_id=result.product_id,
        source_record_id=result.source_record_id,
        result={
            "product_id": str(result.product_id),
            "revision_created": result.revision_created,
            "image_jobs": len(result.asset_ids),
        },
    )
    return ProductJobOutcome("complete", result.product_id)
