"""
Backfill ingredient_id FK on product_ingredients rows that were inserted
before the canonical ingredients table was fully populated.

Uses the shared matcher in app.services.ingredient_matching:
  1. Exact match on canonical_name or synonym
  2. A library name appearing as whole words in the label name

Also updates the `status` column while we're here.

Usage
-----
# Dry run — print what would be matched without writing
python -m scripts.backfill_ingredient_links --dry-run

# Apply matches (default)
python -m scripts.backfill_ingredient_links

# Show a summary of unmatched names after running
python -m scripts.backfill_ingredient_links --show-unmatched --limit 50

# Re-check rows that are already linked (older, looser matching linked e.g.
# "Oil" to a fish-oil entry). Relinks or unlinks rows the matcher now rejects.
python -m scripts.backfill_ingredient_links --recheck-linked --dry-run
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
from app.models.product import ProductIngredient
from app.services.ingredient_matching import build_lookup, infer_status, match_ingredient


# ─── Lookup (matching lives in app.services.ingredient_matching) ─────────────────────────────

IngredientLookup = dict[str, Ingredient]


async def build_ingredient_lookup(session: AsyncSession) -> IngredientLookup:
    result = await session.execute(select(Ingredient))
    all_ingredients = result.scalars().all()

    lookup = build_lookup(all_ingredients)

    print(f"Loaded {len(all_ingredients)} canonical ingredients "
          f"({len(lookup)} lookup keys including synonyms)")
    return lookup


# ─── Main ─────────────────────────────────────────────────────────────────────

BATCH_SIZE = 500


async def recheck_linked(session: AsyncSession, lookup: IngredientLookup, dry_run: bool) -> None:
    """Re-run already-linked rows through the matcher; fix links it now rejects."""
    result = await session.execute(
        select(ProductIngredient, Ingredient)
        .join(Ingredient, ProductIngredient.ingredient_id == Ingredient.id)
    )
    rows = result.all()
    print(f"Re-checking {len(rows):,} linked product_ingredient rows")

    changes: dict[tuple[str, str, str], int] = {}  # (label, old, new) → count
    for pi, current in rows:
        canonical = match_ingredient(pi.name, lookup)
        if canonical is not None and canonical.id == current.id:
            continue
        key = (pi.name.strip().lower(), current.canonical_name, canonical.canonical_name if canonical else "—")
        changes[key] = changes.get(key, 0) + 1
        if not dry_run:
            pi.ingredient_id = canonical.id if canonical else None
            pi.status = infer_status(canonical)

    print(f"  {sum(changes.values()):,} rows would change ({len(changes)} distinct label → link pairs)")
    for (label, old, new), count in sorted(changes.items(), key=lambda x: -x[1])[:60]:
        print(f"  {count:>5}×  {label!r}: {old} → {new}")
    if not dry_run:
        await session.commit()
        print("  Committed.")


async def run(dry_run: bool, show_unmatched: bool, unmatched_limit: int, recheck: bool = False) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        lookup = await build_ingredient_lookup(session)

        if recheck:
            await recheck_linked(session, lookup, dry_run)
            if dry_run:
                print("\n[DRY RUN — no changes written]")
            return

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
    parser.add_argument("--recheck-linked", action="store_true", dest="recheck",
                        help="Re-check existing links against the current matcher")
    args = parser.parse_args()

    asyncio.run(run(
        dry_run=args.dry_run,
        show_unmatched=args.show_unmatched,
        unmatched_limit=args.unmatched_limit,
        recheck=args.recheck,
    ))


if __name__ == "__main__":
    main()
