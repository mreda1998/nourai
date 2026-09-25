"""
fetch_sephora_products.py
=========================
Fetches fragrance products from Sephora via the RapidAPI Sephora endpoint.

This script solves the "luxury brand gap" — brands like Louis Vuitton, Creed,
Maison Francis Kurkdjian, and Parfums de Marly are nearly absent from Open
Beauty Facts but are well-represented on Sephora with full EU INCI ingredient
lists.

What this fetches
-----------------
• Women's fragrance (cat150008)
• Men's fragrance (cat150005)
• Unisex fragrance (filtered by product attributes)

From each product the Sephora API returns:
  • displayName, brandName — product identity
  • currentSku.upc — barcode (if available)
  • currentSku.ingredientsEnUs — full INCI ingredient string (EU/US declaration)
  • heroImage — product image URL
  • currentSku.listPrice — price

The INCI string is parsed with the same logic as Open Beauty Facts, and each
ingredient is matched against our canonical ingredient lookup so fragrance
allergens (Linalool, Limonene, Eugenol, etc.) appear as deep-dive links.

Prerequisites
-------------
1.  Create a free RapidAPI account at https://rapidapi.com
2.  Subscribe to the "Sephora" API:
    https://rapidapi.com/DataCrawler/api/sephora2
3.  Set RAPIDAPI_KEY in your .env file

Rate limits (free tier)
-----------------------
    500 requests / month
    Adjust --page-limit accordingly (each page = 60 products, 1 request)

Usage
-----
    python -m scripts.fetch_sephora_products          # women + men fragrance
    python -m scripts.fetch_sephora_products --category women
    python -m scripts.fetch_sephora_products --category men
    python -m scripts.fetch_sephora_products --limit 5   # 5 pages ≈ 300 products
    python -m scripts.fetch_sephora_products --dry-run
    make fetch-sephora
"""
from __future__ import annotations

import argparse
import asyncio
import re
import os
import sys
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory
from app.models.product import Product, ProductCategory, ProductIngredient, IngredientStatus

# ─── Sephora RapidAPI config ──────────────────────────────────────────────────

RAPIDAPI_HOST = "sephora.p.rapidapi.com"
RAPIDAPI_BASE = f"https://{RAPIDAPI_HOST}"

# Sephora category IDs for fragrances
FRAGRANCE_CATEGORIES = {
    "women": "cat150008",   # Women's Fragrance
    "men":   "cat150005",   # Men's Fragrance
}

PAGE_SIZE = 60   # Sephora max per page

# ─── Subcategory inference from Sephora product type tags ────────────────────

_SUBCAT_KEYWORDS: list[tuple[str, str]] = [
    ("eau de parfum",  "Eau de Parfum"),
    ("eau de toilette","Eau de Toilette"),
    ("eau de cologne", "Eau de Cologne"),
    ("parfum",         "Parfum"),
    ("hair mist",      "Hair Mist"),
    ("body mist",      "Body Mist"),
    ("body spray",     "Body Spray"),
    ("solid perfume",  "Solid Perfume"),
    ("oil",            "Perfume Oil"),
]

def _infer_subcategory(name: str, category_name: str) -> str:
    name_lower = name.lower()
    for kw, label in _SUBCAT_KEYWORDS:
        if kw in name_lower:
            return label
    return "Fragrance"


# ─── INCI parsing (reused from fetch_popular_products logic) ─────────────────

_SKIP_TOKENS = {
    "water", "aqua", "eau",
    "ingredients", "inci", "ingrédients", "composition",
    "contains allergens", "warning", "for external use only",
    "keep out of reach of children", "avoid contact with eyes",
    "flammable", "inflammable",
}

_RE_PARENS  = re.compile(r'\([^)]*\)')
_RE_PERCENT = re.compile(r'\d+\.?\d*\s*%')
_RE_SPACES  = re.compile(r'\s+')


def _clean(raw: str) -> str:
    s = _RE_PARENS.sub('', raw)
    s = _RE_PERCENT.sub('', s)
    return _RE_SPACES.sub(' ', s).strip().lower().rstrip('.,;:*†‡')


def parse_inci_string(inci: str) -> list[str]:
    """
    Parse a raw INCI ingredient string from Sephora into a clean list.

    Sephora stores ingredients as a comma-separated string, sometimes with
    language variants separated by '/' or duplicate sections.
    """
    if not inci:
        return []

    # Remove everything after a known section-separator pattern
    # e.g. "...Linalool. Ingredients for EU: ..." → take only first part
    for sep in ["\nIngredients for", "\nINGREDIENTS:", "Ingredients (EU):"]:
        if sep.lower() in inci.lower():
            inci = inci[:inci.lower().index(sep.lower())]

    names: list[str] = []
    seen: set[str] = set()

    for part in re.split(r'[,;]', inci):
        token = _clean(part)
        if token and len(token) >= 2 and token not in _SKIP_TOKENS and token not in seen:
            names.append(token)
            seen.add(token)

    return names


# ─── Canonical ingredient lookup ──────────────────────────────────────────────

async def build_lookup(session: AsyncSession) -> dict[str, Ingredient]:
    result = await session.execute(select(Ingredient))
    ingredients = result.scalars().all()
    lookup: dict[str, Ingredient] = {}
    for ing in ingredients:
        lookup[ing.canonical_name.lower().strip()] = ing
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = ing
    print(f"  Loaded {len(ingredients)} canonical ingredients "
          f"({len(lookup)} lookup keys including synonyms)")
    return lookup


def match_ingredient(raw_name: str, lookup: dict[str, Ingredient]) -> Ingredient | None:
    norm = raw_name.lower().strip()
    if norm in lookup:
        return lookup[norm]
    best: Ingredient | None = None
    best_len = 0
    for key, ing in lookup.items():
        if len(key) >= 5 and (key in norm or norm in key):
            if len(key) > best_len:
                best = ing
                best_len = len(key)
    return best


def infer_status(canonical: Ingredient | None, name: str) -> IngredientStatus | None:
    name_lower = name.lower()
    # Flag EU-banned materials as AVOID
    if any(banned in name_lower for banned in ["lilial", "lyral", "hicc", "oakmoss"]):
        return IngredientStatus.AVOID
    if canonical is None:
        return None  # Not in our library: unknown, not a concern
    if canonical.category in (
        IngredientCategory.ADDITIVE,
        IngredientCategory.PRESERVATIVE,
        IngredientCategory.SWEETENER,
    ):
        return IngredientStatus.WATCH
    if canonical.contraindications:
        return IngredientStatus.WATCH
    return IngredientStatus.CLEAN


# ─── Sephora API client ───────────────────────────────────────────────────────

async def fetch_sephora_page(
    client: httpx.AsyncClient,
    category_id: str,
    page: int,
    sem: asyncio.Semaphore,
) -> list[dict[str, Any]]:
    """Fetch one page of Sephora fragrance products."""
    async with sem:
        await asyncio.sleep(0.5)   # polite rate limiting
        try:
            resp = await client.get(
                f"{RAPIDAPI_BASE}/products/list",
                params={
                    "categoryId": category_id,
                    "pageSize":   PAGE_SIZE,
                    "currentPage": page,
                    "sortBy": "TOP_SELLERS",
                },
                headers={
                    "x-rapidapi-host": RAPIDAPI_HOST,
                    "x-rapidapi-key":  settings.rapidapi_key,
                },
                timeout=15.0,
            )
            if resp.status_code == 429:
                print(f"    [rate-limit] page {page} — waiting 10s...")
                await asyncio.sleep(10)
                return []
            if resp.status_code != 200:
                print(f"    [HTTP {resp.status_code}] page {page}: {resp.text[:200]}")
                return []
            data = resp.json()
            return data.get("products") or []
        except httpx.RequestError as exc:
            print(f"    [network error] page {page}: {exc}")
            return []


async def fetch_product_detail(
    client: httpx.AsyncClient,
    product_id: str,
    sem: asyncio.Semaphore,
) -> dict[str, Any] | None:
    """
    Fetch full product detail including ingredientsEnUs.

    The list endpoint returns partial data; the detail endpoint returns the
    full INCI string.
    """
    async with sem:
        await asyncio.sleep(0.3)
        try:
            resp = await client.get(
                f"{RAPIDAPI_BASE}/products/detail",
                params={"productId": product_id},
                headers={
                    "x-rapidapi-host": RAPIDAPI_HOST,
                    "x-rapidapi-key":  settings.rapidapi_key,
                },
                timeout=15.0,
            )
            if resp.status_code != 200:
                return None
            return resp.json()
        except httpx.RequestError:
            return None


# ─── Product extraction ───────────────────────────────────────────────────────

def extract_product_data(raw: dict[str, Any]) -> dict[str, Any] | None:
    """
    Extract the fields we care about from a Sephora API product dict.
    Returns None if essential fields are missing.
    """
    name  = (raw.get("displayName") or "").strip()
    brand = (raw.get("brandName") or "").strip()
    if not name or not brand:
        return None

    current_sku = raw.get("currentSku") or {}

    # Try to get INCI from multiple possible field names
    inci_raw = (
        current_sku.get("ingredientsEnUs")
        or current_sku.get("ingredients")
        or raw.get("ingredientsEnUs")
        or ""
    )

    upc    = (current_sku.get("upc") or "").strip() or None
    image  = (raw.get("heroImage") or current_sku.get("skuImages", {}).get("imageUrl") or "")
    price  = current_sku.get("listPrice") or current_sku.get("salePrice")

    return {
        "name":    name,
        "brand":   brand,
        "upc":     upc,
        "inci":    inci_raw,
        "image":   image or None,
        "price":   str(price) if price else None,
        "product_id": raw.get("productId"),
    }


# ─── DB insertion ─────────────────────────────────────────────────────────────

async def barcode_or_name_exists(
    session: AsyncSession,
    upc: str | None,
    name: str,
    brand: str,
) -> bool:
    if upc:
        r = await session.execute(
            select(Product.id).where(Product.barcode == upc)
        )
        if r.scalar_one_or_none():
            return True
    # Fall back to name+brand uniqueness
    r = await session.execute(
        select(Product.id).where(
            Product.name == name,
            Product.brand == brand,
        )
    )
    return r.scalar_one_or_none() is not None


async def insert_product(
    session: AsyncSession,
    data: dict[str, Any],
    gender_cat: str,
    lookup: dict[str, Ingredient],
    dry_run: bool,
) -> bool:
    if await barcode_or_name_exists(session, data["upc"], data["name"], data["brand"]):
        return False

    ing_names = parse_inci_string(data["inci"])
    if not ing_names:
        return False   # No ingredient data — skip

    if dry_run:
        print(f"    [dry] {data['brand']} — {data['name'][:55]}  "
              f"({len(ing_names)} ingredients)")
        return True

    subcategory = _infer_subcategory(data["name"], gender_cat)
    matched: list[str] = []
    links: list[dict] = []

    for pos, raw_name in enumerate(ing_names[:80], start=1):
        canonical = match_ingredient(raw_name, lookup)
        if canonical:
            matched.append(canonical.canonical_name)
        links.append({
            "name":          raw_name.title()[:500],
            "ingredient_id": canonical.id if canonical else None,
            "status":        infer_status(canonical, raw_name),
            "order_position": pos,
        })

    key_actives = ", ".join(matched[:4]) or None

    product = Product(
        barcode=data["upc"],
        name=data["name"][:255],
        brand=data["brand"][:255],
        category=ProductCategory.COSMETIC,
        subcategory=subcategory,
        image_url=data["image"],
        key_actives=key_actives,
        price=data["price"],
        extra_data={
            "source": "sephora",
            "sephora_product_id": data.get("product_id"),
        },
    )
    session.add(product)
    await session.flush()

    for link in links:
        session.add(ProductIngredient(product_id=product.id, **link))

    return True


# ─── Category processor ───────────────────────────────────────────────────────

async def process_category(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    category_id: str,
    category_name: str,
    page_limit: int,
    sem: asyncio.Semaphore,
    lookup: dict[str, Ingredient],
    dry_run: bool,
) -> tuple[int, int]:
    print(f"\n  [Sephora] {category_name} (categoryId={category_id})")
    print(f"  {'─' * 55}")

    inserted = 0
    skipped  = 0

    for page in range(1, page_limit + 1):
        products_raw = await fetch_sephora_page(client, category_id, page, sem)
        if not products_raw:
            print(f"    Page {page}: empty — stopping")
            break

        async with session_factory() as session:
            batch = 0
            for raw in products_raw:
                data = extract_product_data(raw)
                if not data:
                    skipped += 1
                    continue

                ok = await insert_product(session, data, category_name, lookup, dry_run)
                if ok:
                    inserted += 1
                    batch += 1
                else:
                    skipped += 1

            if not dry_run:
                await session.commit()

        print(f"    Page {page:>3}  +{batch} new  "
              f"({inserted} total, {skipped} skipped)")

        if len(products_raw) < PAGE_SIZE:
            break   # Last page

    return inserted, skipped


# ─── Entry point ──────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    if not settings.rapidapi_key:
        print("ERROR: RAPIDAPI_KEY is not set in .env")
        print("  Get a free key at https://rapidapi.com and subscribe to the Sephora API.")
        return

    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    # Select which categories to fetch
    if args.category and args.category in FRAGRANCE_CATEGORIES:
        categories = {args.category: FRAGRANCE_CATEGORIES[args.category]}
    else:
        categories = FRAGRANCE_CATEGORIES

    page_limit = args.limit or 50   # 50 pages × 60 products = up to 3,000 per category

    async with factory() as session:
        lookup = await build_lookup(session)

    print(f"\nNourAI Sephora Fragrance Fetcher")
    print(f"{'=' * 60}")
    print(f"  Mode        : {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Categories  : {', '.join(categories.keys())}")
    print(f"  Page limit  : {page_limit} pages × {PAGE_SIZE} = up to "
          f"{page_limit * PAGE_SIZE * len(categories):,} products")
    print(f"  API calls   : ~{page_limit * len(categories)} (check your RapidAPI quota)")
    print(f"{'=' * 60}")

    sem = asyncio.Semaphore(2)   # max 2 concurrent requests to Sephora
    total_inserted = 0
    total_skipped  = 0

    async with httpx.AsyncClient(follow_redirects=True) as client:
        for cat_name, cat_id in categories.items():
            ins, skip = await process_category(
                client, factory, cat_id, cat_name,
                page_limit, sem, lookup, args.dry_run,
            )
            total_inserted += ins
            total_skipped  += skip

    await engine.dispose()

    print(f"\n{'=' * 60}")
    print(f"  Inserted : {total_inserted:,} new products")
    print(f"  Skipped  : {total_skipped:,} (no ingredients / already in DB)")
    print(f"\nNext steps:")
    print(f"  make research-all    ← enrich fragrance ingredients with PubMed data")
    print(f"  make backfill-links  ← re-link any unmatched ingredients")
    print(f"{'=' * 60}\n")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Fetch luxury fragrance products from Sephora via RapidAPI"
    )
    p.add_argument("--category", choices=["women", "men"],
                   help="Fetch only one gender category")
    p.add_argument("--limit", type=int, metavar="PAGES",
                   help="Max pages to fetch per category (default: 50, = ~3 000 products)")
    p.add_argument("--dry-run", action="store_true",
                   help="Print what would be inserted without writing to DB")
    return p.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
