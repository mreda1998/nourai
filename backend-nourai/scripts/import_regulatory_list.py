"""Import one official regulatory list into the rules tables.

Usage:
    python -m scripts.import_regulatory_list <slug> [--file path] [--derive] [--force]

Without --file the list is fetched from the source's official URL. --derive then marks additives
missing from a positive list as not authorised there.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

import app.services.regulation.sources  # noqa: F401  (registers every source)
from app.db.session import async_session_factory
from app.services.regulation.importer import SOURCES, derive_not_authorised, import_list


async def run(slug: str, file: Path | None, derive: bool, force: bool) -> None:
    source = SOURCES[slug]
    if file:
        raw, url = file.read_bytes(), source.default_url
    else:
        async with httpx.AsyncClient(timeout=180, follow_redirects=True,
                                     headers={"User-Agent": "Elory rules importer (+https://elory.app)"}) as client:
            if hasattr(source, "fetch"):  # sources that bundle several official files
                raw, url = await source.fetch(client), source.default_url
            else:
                response = await client.get(source.default_url)
                response.raise_for_status()
                raw, url = response.content, str(response.url)
    now = datetime.now(timezone.utc)
    async with async_session_factory() as session:
        async with session.begin():
            result = asdict(await import_list(session, source, raw, url, now, force=force))
            if derive:
                place = source.parse(raw).place
                result["derived_not_authorised"] = await derive_not_authorised(session, place, slug, now)
    print(json.dumps({"source": slug, "url": url, **result}, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("slug", choices=sorted(SOURCES))
    parser.add_argument("--file", type=Path)
    parser.add_argument("--derive", action="store_true")
    parser.add_argument("--force", action="store_true", help="re-parse even if the bytes are unchanged")
    args = parser.parse_args()
    asyncio.run(run(args.slug, args.file, args.derive, args.force))


if __name__ == "__main__":
    main()
