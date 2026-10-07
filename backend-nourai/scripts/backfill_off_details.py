"""
backfill_off_details.py
=======================
Pull the label details the product screen's bars need from Open Food Facts
for food products we already have: NOVA group (processing card), serving size
(per-serving bars), and label values for the measured nutrients, including
added sugars. Name-matched USDA values for those nutrients are replaced by
the product's own label; every other nutriment is left alone.

Usage
-----
    python -m scripts.backfill_off_details --dry-run --limit 10
    python -m scripts.backfill_off_details --limit 200
    python -m scripts.backfill_off_details --barcode 5999076236640
    python -m scripts.backfill_off_details --force      # refresh products already backfilled

Respects Open Food Facts' read limit (100 product requests a minute).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.references import NUTRIENT_REFERENCES
from app.models.product import Product, ProductCategory

OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OFF_FIELDS = "nova_group,serving_quantity,serving_size,nutriments"
REQUEST_INTERVAL_S = 0.65


def merge_off_details(extra_data: dict | None, off: dict) -> dict:
    """Return a copy of extra_data with OFF's NOVA group, serving and measured-nutrient values."""
    merged = dict(extra_data or {})
    nutriments = dict(merged.get("nutriments") or {})

    try:
        nova = int(off.get("nova_group"))
        if 1 <= nova <= 4:
            merged["nova_group"] = nova
    except (TypeError, ValueError):
        pass
    try:
        qty = float(off.get("serving_quantity"))
        if qty > 0:
            merged["serving_quantity"] = qty
    except (TypeError, ValueError):
        pass
    if isinstance(off.get("serving_size"), str) and off["serving_size"].strip():
        merged["serving_size"] = off["serving_size"].strip()

    off_nutriments = off.get("nutriments") or {}
    for ref in NUTRIENT_REFERENCES:
        for suffix in ("_100g", "_serving"):
            key = f"{ref.off_key}{suffix}"
            if isinstance(off_nutriments.get(key), (int, float)):
                nutriments[key] = off_nutriments[key]
    merged["nutriments"] = nutriments
    merged["off_details"] = True
    return merged


async def main(args: argparse.Namespace) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        stmt = select(Product).where(Product.category == ProductCategory.FOOD, Product.barcode.is_not(None))
        if args.barcode:
            stmt = stmt.where(Product.barcode.in_(args.barcode))
        elif not args.force:
            stmt = stmt.where(~Product.extra_data.has_key("off_details"))
        if args.limit:
            stmt = stmt.limit(args.limit)
        products = list((await session.execute(stmt)).scalars())

    print(f"{len(products)} food products to check")
    updated = missing = 0
    headers = {"User-Agent": settings.openfoodfacts_user_agent}
    async with httpx.AsyncClient(timeout=15, headers=headers) as client:
        for i, product in enumerate(products, 1):
            try:
                resp = await client.get(OFF_URL.format(barcode=product.barcode), params={"fields": OFF_FIELDS})
                data = resp.json() if resp.status_code == 200 else {}
            except (httpx.HTTPError, ValueError) as exc:
                print(f"  [{i}] {product.barcode} request failed: {exc}")
                data = {}
            off = data.get("product") if data.get("status") == 1 else None
            if not off:
                missing += 1
            else:
                merged = merge_off_details(product.extra_data, off)
                summary = f"nova={merged.get('nova_group')} serving={merged.get('serving_size') or merged.get('serving_quantity')}"
                print(f"  [{i}] {product.name[:48]:48} {summary}")
                if not args.dry_run:
                    async with session_factory() as session:
                        values = {"extra_data": merged}
                        if merged.get("serving_size"):
                            values["serving_size"] = merged["serving_size"][:100]
                        await session.execute(update(Product).where(Product.id == product.id).values(**values))
                        await session.commit()
                updated += 1
            await asyncio.sleep(REQUEST_INTERVAL_S)

    await engine.dispose()
    verb = "Would update" if args.dry_run else "Updated"
    print(f"{verb} {updated}; not found on Open Food Facts: {missing}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="include products already backfilled")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--barcode", action="append", help="only this barcode (repeatable)")
    asyncio.run(main(parser.parse_args()))
