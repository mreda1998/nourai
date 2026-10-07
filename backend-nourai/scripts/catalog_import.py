"""
catalog_import.py
=================
Stream a public product dump into the catalog index (`catalog_entries`).

    python -m scripts.catalog_import --source obf                # Open Beauty Facts (~18 MB)
    python -m scripts.catalog_import --source off                # Open Food Facts (~1.3 GB gzipped)
    python -m scripts.catalog_import --source off --limit 300000 # a sample
    python -m scripts.catalog_import --source off --resume       # continue an interrupted run
    python -m scripts.catalog_import --source off --dry-run      # parse only, write nothing

Runs anywhere with DATABASE_URL. Nothing is written to disk; the dump is
streamed and parsed line by line. Re-running is safe: unchanged rows are
skipped, changed rows are updated, nothing is deleted.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from functools import partial

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.ingestion import DataSource
from app.services.catalog.importer import DryRunSink, ImportAborted, run_import
from app.services.catalog.records import aiter_tsv, parse_off_row
from app.services.catalog.sink import PostgresCatalogSink
from app.services.catalog.stream import stream_gzip_lines

SOURCES = {
    "off": ("open-food-facts", "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz", "food"),
    "obf": ("open-beauty-facts", "https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz", "cosmetic"),
}


async def main(args: argparse.Namespace) -> int:
    slug, default_url, default_category = SOURCES[args.source]
    url = args.url or default_url
    async with async_session_factory() as session:
        source = (await session.execute(select(DataSource).where(DataSource.slug == slug))).scalar_one_or_none()
    if source is None or not source.enabled:
        print(f"data source {slug!r} is missing or disabled — run migrations first")
        return 2

    sink = DryRunSink() if args.dry_run else PostgresCatalogSink(async_session_factory, source.id)
    resume_from = await sink.resume_line() if args.resume and not args.dry_run else 0
    print(f"{slug}: streaming {url}" + (f" from row {resume_from:,}" if resume_from else ""))

    started = time.monotonic()
    try:
        stats = await run_import(
            aiter_tsv(stream_gzip_lines(url)),
            parse=partial(parse_off_row, default_category=default_category),
            sink=sink,
            batch_size=args.batch_size,
            resume_from=resume_from,
            limit=args.limit,
        )
    except ImportAborted as exc:
        print(f"aborted: {exc}")
        return 1
    if not args.dry_run:
        await sink.finish(stats, url=url)

    elapsed = time.monotonic() - started
    print(
        f"{slug}: read {stats.read:,} · indexed {stats.parsed:,} · skipped {stats.skipped:,} · "
        f"inserted {stats.inserted:,} · updated {stats.updated:,} · {elapsed:,.0f}s"
    )
    if args.dry_run:
        print(f"dry run: {sink.rows:,} rows would be written")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=sorted(SOURCES), required=True)
    parser.add_argument("--url", help="override the dump URL")
    parser.add_argument("--limit", type=int, help="stop after this many rows")
    parser.add_argument("--resume", action="store_true", help="continue from the last checkpoint")
    parser.add_argument("--dry-run", action="store_true", help="parse only; write nothing")
    parser.add_argument("--batch-size", type=int, default=2000)
    sys.exit(asyncio.run(main(parser.parse_args())))
