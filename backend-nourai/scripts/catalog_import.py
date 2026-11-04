"""
catalog_import.py
=================
Stream a public product dump into the catalog index (`catalog_entries`).

    python -m scripts.catalog_import --source obf                # Open Beauty Facts (~18 MB)
    python -m scripts.catalog_import --source off                # Open Food Facts (~1.3 GB gzipped)
    python -m scripts.catalog_import --source off --limit 300000 # a sample
    python -m scripts.catalog_import --source off --resume       # continue an interrupted run
    python -m scripts.catalog_import --source off --dry-run      # parse only, write nothing
    python -m scripts.catalog_import --source openfda            # US OTC personal care (~28 MB zip)
    python -m scripts.catalog_import --source usda --file ~/Downloads/FoodData_Central_branded_food_csv_….zip

Runs anywhere with DATABASE_URL. The Open Food Facts dumps are streamed and
parsed line by line, nothing written to disk. The US dumps are zips, which
can't be streamed: pass one you downloaded with --file, or it's downloaded to
a temporary directory and removed afterwards. USDA publishes a new dated dump
every six months (https://fdc.nal.usda.gov/download-datasets); --url takes it.

The US sources only add products no other source indexes, so a product
already in Open Food Facts isn't listed twice; --dry-run still reads the index
to report how many that leaves. Re-running is safe: unchanged rows are
skipped, changed rows are updated, nothing is deleted.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import tempfile
import time
from functools import partial

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.ingestion import DataSource
from app.services.catalog.importer import DryRunSink, ImportAborted, run_import
from app.services.catalog.records import aiter_tsv, parse_off_row
from app.services.catalog.sink import NewGtinsOnly, PostgresCatalogSink
from app.services.catalog.stream import stream_gzip_lines
from app.services.catalog.us_records import iter_openfda_ndc, iter_usda_branded, parse_openfda_row, parse_usda_row

SOURCES = {
    "off": ("open-food-facts", "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz", "food"),
    "obf": ("open-beauty-facts", "https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz", "cosmetic"),
    "openfda": ("openfda", "https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip", "cosmetic"),
    "usda": (
        "usda-fooddata-central",
        "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2026-10-29.zip",
        "food",
    ),
}
# Zipped dumps: how to read rows from the file, and how to parse each row.
_ZIPPED = {
    "openfda": (iter_openfda_ndc, parse_openfda_row),
    "usda": (iter_usda_branded, parse_usda_row),
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
    if args.source in _ZIPPED:
        sink = NewGtinsOnly(sink, async_session_factory, source.id)
    resume_from = await sink.resume_line() if args.resume and not args.dry_run else 0

    with tempfile.TemporaryDirectory() as scratch:
        if args.source in _ZIPPED:
            read, parse = _ZIPPED[args.source]
            path = args.file or await _download(url, os.path.join(scratch, "dump.zip"))
            print(f"{slug}: reading {path}" + (f" from row {resume_from:,}" if resume_from else ""))
            rows = read(path)
        else:
            print(f"{slug}: streaming {url}" + (f" from row {resume_from:,}" if resume_from else ""))
            rows = aiter_tsv(stream_gzip_lines(url))
            parse = partial(parse_off_row, default_category=default_category)

        started = time.monotonic()
        try:
            stats = await run_import(
                rows, parse=parse, sink=sink, batch_size=args.batch_size, resume_from=resume_from, limit=args.limit,
            )
        except ImportAborted as exc:
            print(f"aborted: {exc}")
            return 1
    if not args.dry_run:
        await sink.finish(stats, url=args.file or url)

    elapsed = time.monotonic() - started
    print(
        f"{slug}: read {stats.read:,} · indexed {stats.parsed:,} · skipped {stats.skipped:,} · "
        f"inserted {stats.inserted:,} · updated {stats.updated:,} · {elapsed:,.0f}s"
    )
    if isinstance(sink, NewGtinsOnly):
        print(f"{slug}: {sink.held_elsewhere:,} already indexed by another source, left out")
    if args.dry_run:
        print(f"dry run: {sink.rows:,} rows would be written")
    return 0


async def _download(url: str, path: str) -> str:
    print(f"downloading {url}")
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0), follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            with open(path, "wb") as out:
                async for chunk in response.aiter_bytes(1 << 20):
                    out.write(chunk)
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=sorted(SOURCES), required=True)
    parser.add_argument("--url", help="override the dump URL")
    parser.add_argument("--file", help="a dump already downloaded (openfda, usda)")
    parser.add_argument("--limit", type=int, help="stop after this many rows")
    parser.add_argument("--resume", action="store_true", help="continue from the last checkpoint")
    parser.add_argument("--dry-run", action="store_true", help="parse only; write nothing")
    parser.add_argument("--batch-size", type=int, default=2000)
    sys.exit(asyncio.run(main(parser.parse_args())))
