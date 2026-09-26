"""Import a versioned public lab-results JSON manifest.

Usage: python -m scripts.import_lab_results path/to/dataset.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import asdict
from pathlib import Path

from app.db.session import async_session_factory
from app.schemas.laboratory import LabDatasetImport
from app.services.ingestion.lab_importer import import_lab_dataset


async def run(path: Path) -> None:
    manifest = LabDatasetImport.model_validate(json.loads(path.read_text()))
    async with async_session_factory() as session:
        async with session.begin():
            result = await import_lab_dataset(
                session, manifest, raw_asset_uri=str(path.resolve())
            )
    print(json.dumps(asdict(result), indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    asyncio.run(run(args.manifest))


if __name__ == "__main__":
    main()
