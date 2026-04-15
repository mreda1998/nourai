"""
backfill_usda_nutrients.py
==========================
Enrich existing food products in the database with USDA FoodData Central
nutrition data when their Open Food Facts nutriments are missing or sparse.

This fixes products like moringa powder, watercress, spinach, and other
whole/specialty foods that appear in the app with no vitamin/mineral info
because OFF doesn't have reliable nutrition data for them.

Usage
-----
    # Show what would be updated (no DB writes)
    python -m scripts.backfill_usda_nutrients --dry-run

    # Update all sparse food products
    python -m scripts.backfill_usda_nutrients

    # Process at most N products (for testing)
    python -m scripts.backfill_usda_nutrients --limit 10

    # Only re-check products already enriched by USDA (useful after USDA DB updates)
    python -m scripts.backfill_usda_nutrients --force

After running:
    Reload the product detail screen in the app — nutrition data appears immediately
    (no cache invalidation needed since we update the DB directly).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import os

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.product import Product, ProductCategory
from app.services.usda import USDAService, _is_nutriments_sparse

BATCH_SIZE = 20   # commit every N updates


async def get_sparse_food_products(
    session: AsyncSession,
    force: bool,
    limit: int | None,
) -> list[Product]:
    """
    Return food products whose nutriments are empty or sparse.

    When force=True, also includes products already enriched by USDA
    (source = 'usda') so they can be refreshed with updated USDA data.
    """
    stmt = (
        select(Product)
        .where(Product.category == ProductCategory.FOOD)
        .order_by(Product.name)
    )
    if limit:
        stmt = stmt.limit(limit * 10)   # over-fetch since we filter below

    result = await session.execute(stmt)
    products = list(result.scalars().all())

    sparse = []
    for p in products:
        extra = p.extra_data or {}
        nutriments = extra.get("nutriments") or {}
        source = extra.get("source", "openfoodfacts")

        if force and source == "usda":
            sparse.append(p)
            continue

        if source != "usda" and _is_nutriments_sparse(nutriments):
            sparse.append(p)

        if limit and len(sparse) >= limit:
            break

    return sparse


async def main(args: argparse.Namespace) -> None:
    if not settings.usda_api_key:
        print("ERROR: USDA_API_KEY is not set in .env")
        print("       Get a free key at https://fdc.nal.usda.gov/api-guide.html")
        sys.exit(1)

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    usda = USDAService()

    async with session_factory() as session:
        products = await get_sparse_food_products(session, args.force, args.limit)

    print(f"\nUSDA Nutriments Backfill")
    print(f"{'=' * 60}")
    print(f"  Mode:     {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Products: {len(products)} food products with sparse/missing nutriments")
    print(f"{'=' * 60}")

    if not products:
        print("Nothing to do — all food products already have nutrition data.")
        await engine.dispose()
        return

    # ── Validate API key with one test request before processing thousands ────
    print("  Validating USDA API key...")
    try:
        test = await usda.fetch_nutriments("spinach")
        if test is not None:
            print(f"  API key OK — test query returned {len(test)} nutrients\n")
        else:
            print("  API key OK — no results for test query (spinach), continuing\n")
    except RuntimeError as exc:
        print(f"\nERROR: {exc}\n")
        await engine.dispose()
        sys.exit(1)

    enriched = 0
    not_found = 0

    async with httpx.AsyncClient(
        headers={"User-Agent": "Elory/1.0 (nutrition-backfill)"},
        follow_redirects=True,
    ) as http:
        batch: list[tuple[Product, dict]] = []

        for i, product in enumerate(products, 1):
            print(f"  [{i:>4}/{len(products)}] {product.name[:60]}")

            try:
                nutriments = await usda.fetch_nutriments(product.name, client=http)
            except RuntimeError as exc:
                # 401/403 — bad or unverified API key. Abort immediately so we
                # don't spam 4000+ failing requests and mislead the user.
                print(f"\nERROR: {exc}\n")
                await engine.dispose()
                sys.exit(1)

            if not nutriments:
                print(f"           → not found in USDA")
                not_found += 1
                continue

            print(f"           → {len(nutriments)} nutrients found")

            if args.dry_run:
                enriched += 1
                continue

            batch.append((product, nutriments))

            # Commit in batches
            if len(batch) >= BATCH_SIZE:
                await _commit_batch(session_factory, batch)
                batch.clear()

        # Commit remaining
        if batch and not args.dry_run:
            await _commit_batch(session_factory, batch)
            enriched += len(batch)

        if not args.dry_run:
            enriched = len(products) - not_found

    await engine.dispose()

    print(f"\n{'=' * 60}")
    print(f"  Enriched:  {enriched} products")
    print(f"  Not found: {not_found} products (USDA had no match)")
    print(f"{'=' * 60}\n")


async def _commit_batch(
    session_factory: async_sessionmaker[AsyncSession],
    batch: list[tuple[Product, dict]],
) -> None:
    """Update extra_data.nutriments for a batch of products in one transaction."""
    async with session_factory() as session:
        for product, nutriments in batch:
            extra = dict(product.extra_data or {})
            extra["nutriments"] = nutriments
            extra["source"] = "usda"
            await session.execute(
                update(Product)
                .where(Product.id == product.id)
                .values(extra_data=extra)
            )
        await session.commit()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill USDA nutrition data for food products with sparse OFF nutriments",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without writing to the database",
    )
    p.add_argument(
        "--limit",
        type=int,
        metavar="N",
        help="Process at most N products (useful for testing)",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch USDA data even for products already enriched (refreshes stale data)",
    )
    return p.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
