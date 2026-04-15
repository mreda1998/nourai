"""
Backfill ingredient_id FK on product_ingredients rows that were inserted
before the canonical ingredients table was fully populated.

Applies the same matching logic as fetch_popular_products.py:
  1. Exact match on canonical_name or synonym
  2. Substring containment (key length >= 5)

Also updates the `status` column (CLEAN vs WATCH) while we're here.

Usage
-----
# Dry run — print what would be matched without writing
python -m scripts.backfill_ingredient_links --dry-run

# Apply matches (default)
python -m scripts.backfill_ingredient_links

# Show a summary of unmatched names after running
python -m scripts.backfill_ingredient_links --show-unmatched --limit 50
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.ingredient import Ingredient
from app.models.product import ProductIngredient, IngredientStatus


# ─── Matching (mirrors fetch_popular_products.py) ─────────────────────────────

IngredientLookup = dict[str, Ingredient]


async def build_ingredient_lookup(session: AsyncSession) -> IngredientLookup:
    result = await session.execute(select(Ingredient))
    all_ingredients = result.scalars().all()

    lookup: IngredientLookup = {}
    for ing in all_ingredients:
        lookup[ing.canonical_name.lower().strip()] = ing
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = ing

    print(f"Loaded {len(all_ingredients)} canonical ingredients "
          f"({len(lookup)} lookup keys including synonyms)")
    return lookup


def match_ingredient(raw_name: str, lookup: IngredientLookup) -> Ingredient | None:
    norm = raw_name.lower().strip()
    if not norm:
        return None

    if norm in lookup:
        return lookup[norm]

    best: Ingredient | None = None
    best_key_len = 0
    for key, ing in lookup.items():
        if len(key) >= 5 and (key in norm or norm in key):
            if len(key) > best_key_len:
                best = ing
                best_key_len = len(key)
    return best


def infer_status(canonical: Ingredient | None) -> IngredientStatus:
    if canonical is None:
        return IngredientStatus.WATCH
    if canonical.category in ("additive", "preservative", "sweetener"):
        return IngredientStatus.WATCH
    if canonical.contraindications:
        return IngredientStatus.WATCH
    return IngredientStatus.CLEAN


# ─── Main ─────────────────────────────────────────────────────────────────────

BATCH_SIZE = 500


async def run(dry_run: bool, show_unmatched: bool, unmatched_limit: int) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        lookup = await build_ingredient_lookup(session)

        # Fetch all unlinked rows
        result = await session.execute(
            select(ProductIngredient).where(ProductIngredient.ingredient_id.is_(None))
        )
        unlinked: list[ProductIngredient] = list(result.scalars().all())
        print(f"Found {len(unlinked):,} unlinked product_ingredient rows")

        matched = 0
        unmatched_names: dict[str, int] = {}  # name → count

        for i, pi in enumerate(unlinked):
            canonical = match_ingredient(pi.name, lookup)

            if canonical:
                matched += 1
                if not dry_run:
                    pi.ingredient_id = canonical.id
                    pi.status = infer_status(canonical)
            else:
                name_key = pi.name.strip().lower()
                unmatched_names[name_key] = unmatched_names.get(name_key, 0) + 1

            # Flush in batches
            if not dry_run and (i + 1) % BATCH_SIZE == 0:
                await session.flush()
                print(f"  ... flushed {i + 1:,} / {len(unlinked):,}")

        if not dry_run:
            await session.commit()

    print(f"\nResults:")
    print(f"  Matched:   {matched:,} rows ({matched / len(unlinked) * 100:.1f}%)")
    print(f"  Unmatched: {len(unlinked) - matched:,} rows")
    print(f"  Distinct unmatched names: {len(unmatched_names)}")

    if show_unmatched and unmatched_names:
        print(f"\nTop {unmatched_limit} unmatched ingredient names by frequency:")
        sorted_names = sorted(unmatched_names.items(), key=lambda x: x[1], reverse=True)
        for name, count in sorted_names[:unmatched_limit]:
            print(f"  {count:>5}×  {name}")

    if dry_run:
        print("\n[DRY RUN — no changes written]")
    else:
        print("\nDone.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill ingredient_id FK on product_ingredients")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be matched without writing")
    parser.add_argument("--show-unmatched", action="store_true",
                        help="Print top unmatched ingredient names after run")
    parser.add_argument("--limit", type=int, default=50, dest="unmatched_limit",
                        help="How many unmatched names to show (default: 50)")
    args = parser.parse_args()

    asyncio.run(run(
        dry_run=args.dry_run,
        show_unmatched=args.show_unmatched,
        unmatched_limit=args.unmatched_limit,
    ))


if __name__ == "__main__":
    main()
