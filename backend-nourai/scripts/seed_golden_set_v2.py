"""
Seed the golden set of canonical ingredients from a curated CSV.

Usage:
    python -m scripts.seed_golden_set_v2               # full run
    python -m scripts.seed_golden_set_v2 --dry-run     # show what would be created
    python -m scripts.seed_golden_set_v2 --csv path/to/custom.csv

The CSV must have these columns:
    canonical_name  — required, unique
    category        — one of the IngredientCategory enum values (or 'other')
    synonyms        — pipe-separated synonym list (e.g. "Vitamin C|Ascorbate")
    source_layer    — informational: cosmetic_inci | supplement_active | otc_active | food_additive

Rows whose canonical_name already exists in the DB are silently skipped
(idempotent). Existing researched ingredients are never overwritten.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import os
import sys
from pathlib import Path

# Make sure app is importable when run as `python -m scripts.seed_golden_set_v2`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory, ResearchStatus

DEFAULT_CSV = Path(__file__).resolve().parent.parent / "data" / "golden_set_ingredients.csv"

_VALID_CATEGORIES = {e.value for e in IngredientCategory}


async def seed(csv_path: Path, dry_run: bool) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    created = 0
    skipped = 0
    errors = 0

    async with async_session() as db:
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                canonical_name = (row.get("canonical_name") or "").strip()
                if not canonical_name:
                    continue

                # Skip duplicates
                result = await db.execute(
                    select(Ingredient).where(Ingredient.canonical_name == canonical_name)
                )
                if result.scalar_one_or_none() is not None:
                    skipped += 1
                    continue

                # Parse category
                raw_cat = (row.get("category") or "other").strip().lower()
                category = IngredientCategory(raw_cat) if raw_cat in _VALID_CATEGORIES else IngredientCategory.OTHER

                # Parse synonyms (pipe-separated)
                synonyms_raw = (row.get("synonyms") or "").strip()
                synonyms = [s.strip() for s in synonyms_raw.split("|") if s.strip()]

                if dry_run:
                    print(f"  [DRY] Would create: {canonical_name} ({category.value})")
                    created += 1
                    continue

                try:
                    ingredient = Ingredient(
                        canonical_name=canonical_name,
                        category=category,
                        synonyms=synonyms,
                        research_status=ResearchStatus.PENDING,
                    )
                    db.add(ingredient)
                    await db.flush()
                    created += 1
                except Exception as e:
                    print(f"  [ERROR] {canonical_name}: {e}", file=sys.stderr)
                    await db.rollback()
                    errors += 1
                    continue

        if not dry_run:
            await db.commit()

    await engine.dispose()

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Seeding complete:")
    print(f"  Created : {created}")
    print(f"  Skipped : {skipped} (already in DB)")
    if errors:
        print(f"  Errors  : {errors}")
    print(f"\nRun 'make research-all' to enrich {created} new PENDING ingredients (~${created * 0.012:.2f} estimated cost).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed golden set ingredients from CSV")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without writing")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Path to CSV file")
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"ERROR: CSV not found: {args.csv}", file=sys.stderr)
        sys.exit(1)

    asyncio.run(seed(args.csv, args.dry_run))


if __name__ == "__main__":
    main()
