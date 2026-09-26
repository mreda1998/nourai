"""Queue a prioritized newline/CSV barcode manifest without crawling search APIs.

Usage: python -m scripts.enqueue_barcodes barcodes.csv
The first column is treated as the barcode; an optional header is ignored.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings
from app.db.session import async_session_factory
from app.services.ingestion.normalization import normalize_gtin
from app.services.ingestion.queue import IngestionQueue


async def run(path: Path, run_key: str) -> None:
    queue = IngestionQueue(
        async_session_factory,
        lease_seconds=settings.ingestion_job_lease_seconds,
        default_max_attempts=settings.ingestion_job_max_attempts,
    )
    accepted = 0
    inserted = 0
    invalid = 0
    batch: list[dict] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        rows = csv.reader(handle)
        async with async_session_factory() as session:
            for row in rows:
                if not row:
                    continue
                try:
                    gtin = normalize_gtin(row[0])
                except ValueError:
                    invalid += 1
                    continue
                batch.append(
                    {
                        "job_type": "product_barcode",
                        "idempotency_key": f"batch:off-v3.6:{run_key}:{gtin.gtin14}",
                        "payload": {"barcode": gtin.digits, "gtin14": gtin.gtin14},
                        "priority": 100,
                    }
                )
                accepted += 1
                if len(batch) == 1000:
                    inserted += await queue.enqueue_many(session, batch)
                    await session.commit()
                    batch.clear()
            inserted += await queue.enqueue_many(session, batch)
            await session.commit()
    print(
        f"Accepted {accepted} barcodes; inserted {inserted} new jobs; "
        f"skipped {invalid} invalid/header rows"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument(
        "--run-key",
        default=datetime.now(timezone.utc).date().isoformat(),
        help="Idempotency window/version (defaults to the current UTC date)",
    )
    args = parser.parse_args()
    asyncio.run(run(args.manifest, args.run_key))


if __name__ == "__main__":
    main()
