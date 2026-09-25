"""
fetch_popular_products.py
=========================
Expands the golden set by pulling the most-scanned products from
Open Food Facts (food / supplements) and Open Beauty Facts (cosmetics).

How it works
────────────
1.  For each configured category we page through the OFF/OBF search API
    sorted by `unique_scans_n` — real scan popularity from millions of users.

2.  Per product we extract the full ingredient list, then match each
    ingredient against our canonical Ingredient table using:
        a) exact canonical name match  (O(1) dict lookup)
        b) synonym match               (O(1) dict lookup — same dict)
        c) substring containment       (handles "sodium hyaluronate" → Hyaluronic Acid)

    Fuzzy matching is intentionally skipped for the bulk import — it's
    too slow over thousands of products and rarely necessary when synonyms
    are well-defined.

3.  We persist:
        • a Product row (skipped if barcode already exists — idempotent)
        • one ProductIngredient row per ingredient
          – linked to Ingredient FK if matched, name-only otherwise

4.  We deliberately do NOT auto-create canonical ingredient stubs.
    Canonical ingredients are a curated list. Run `seed_golden_set.py`
    or add entries manually to grow the ingredient knowledge base.
    The research agent only processes ingredients that exist in the DB.

Usage
─────
    # Full run — all categories, default targets
    python -m scripts.fetch_popular_products

    # Override limit per category (great for testing)
    python -m scripts.fetch_popular_products --limit 50

    # Single category
    python -m scripts.fetch_popular_products --category supplement

    # Dry run — shows what would be inserted, no DB writes
    python -m scripts.fetch_popular_products --dry-run

After running:
    make research-all    ← enriches existing PENDING ingredients with PubMed studies
"""
from __future__ import annotations

import argparse
import asyncio
import re
import sys
import os
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient
from app.models.product import Product, ProductCategory, ProductIngredient
from app.services.ingredient_matching import build_lookup, infer_status, match_ingredient
from app.services.usda import USDAService, _is_nutriments_sparse

# ─── API endpoints ────────────────────────────────────────────────────────────

OFF_BASE = "https://world.openfoodfacts.org"   # food + supplements
OBF_BASE = "https://world.openbeautyfacts.org"  # cosmetics

PAGE_SIZE = 100   # OFF maximum per page

# Fields we actually need — keeps response payloads small
_FIELDS = (
    "code,product_name,brands,categories_tags,"
    "image_front_url,ingredients_text,ingredients_text_en,ingredients,"
    "nutriments,serving_size,serving_quantity"
)

# ─── Category configuration ───────────────────────────────────────────────────
# Each entry tells us:
#   base_url   — which database (food or beauty)
#   tag        — OFF category tag (en:xyz)
#   category   — our ProductCategory enum value
#   subcategory — display label in our DB
#   target     — how many products to try to fetch (may be fewer if OFF has less)

@dataclass
class CategoryConfig:
    base_url: str
    tag: str
    category: ProductCategory
    subcategory: str
    target: int


CATEGORIES: list[CategoryConfig] = [
    # ── Open Food Facts ────────────────────────────────────────────────────
    # Supplements — biggest priority for Elory
    CategoryConfig(OFF_BASE, "en:dietary-supplements",     ProductCategory.SUPPLEMENT, "Supplement",    600),
    CategoryConfig(OFF_BASE, "en:proteins",                ProductCategory.SUPPLEMENT, "Protein",       400),
    CategoryConfig(OFF_BASE, "en:vitamins-and-minerals",   ProductCategory.SUPPLEMENT, "Vitamin",       300),
    # Food — for scanning everyday items
    CategoryConfig(OFF_BASE, "en:protein-bars",            ProductCategory.FOOD,       "Protein Bar",   400),
    CategoryConfig(OFF_BASE, "en:breakfast-cereals",       ProductCategory.FOOD,       "Cereal",        300),
    CategoryConfig(OFF_BASE, "en:beverages",               ProductCategory.FOOD,       "Beverage",      300),
    CategoryConfig(OFF_BASE, "en:snacks",                  ProductCategory.FOOD,       "Snack",         300),
    CategoryConfig(OFF_BASE, "en:plant-based-foods",       ProductCategory.FOOD,       "Plant Food",    200),
    CategoryConfig(OFF_BASE, "en:baby-foods",              ProductCategory.FOOD,       "Baby Food",     100),
    # ── Open Beauty Facts ──────────────────────────────────────────────────
    CategoryConfig(OBF_BASE, "en:face-creams-and-gels",    ProductCategory.COSMETIC,   "Moisturizer",   400),
    CategoryConfig(OBF_BASE, "en:serums",                  ProductCategory.COSMETIC,   "Serum",         300),
    CategoryConfig(OBF_BASE, "en:sun-care",                ProductCategory.COSMETIC,   "Sunscreen",     200),
    CategoryConfig(OBF_BASE, "en:shampoos",                ProductCategory.COSMETIC,   "Shampoo",       300),
    CategoryConfig(OBF_BASE, "en:face-cleansers",          ProductCategory.COSMETIC,   "Cleanser",      200),
    CategoryConfig(OBF_BASE, "en:body-lotions",            ProductCategory.COSMETIC,   "Body Lotion",   200),
    # ── Perfumes / Fragrances ───────────────────────────────────────────────
    # Note: full fragrance formulas are trade secrets. OBF records disclose
    # EU-mandated allergen ingredients (Linalool, Limonene, Geraniol, etc.)
    # plus the carrier blend (Alcohol Denat., Aqua). This is high-value data
    # for users with fragrance sensitivities or contact dermatitis.
    CategoryConfig(OBF_BASE, "en:perfumes",                ProductCategory.COSMETIC,   "Perfume",       400),
    CategoryConfig(OBF_BASE, "en:eau-de-parfum",           ProductCategory.COSMETIC,   "Eau de Parfum", 200),
    CategoryConfig(OBF_BASE, "en:eau-de-toilette",         ProductCategory.COSMETIC,   "Eau de Toilette", 200),
    CategoryConfig(OBF_BASE, "en:deodorants",              ProductCategory.COSMETIC,   "Deodorant",     200),
]
# Target total: ~5,500 products across 19 categories

# ─── Ingredient text parsing ──────────────────────────────────────────────────

# These appear in ingredient lists but aren't real ingredients — skip them.
_SKIP_TOKENS = {
    "water", "aqua", "eau", "wasser", "purified water", "deionized water",
    "distilled water", "mineral water", "spring water",
    "natural flavors", "natural flavours", "artificial flavors",
    "natural and artificial flavors", "other ingredients",
    "less than 2% of", "contains less than", "may contain", "manufactured in",
    "produced in a facility", "processed on equipment", "allergen info",
    # Perfume legal boilerplate / non-ingredient tokens
    "ingredients", "inci", "ingrédients", "composition", "composición",
    "contains allergens", "contient des allergènes", "avertissement",
    "warning", "for external use only", "keep out of reach of children",
    "avoid contact with eyes", "flammable", "inflammable",
}

_RE_PARENS  = re.compile(r'\([^)]*\)')          # remove (parenthetical notes)
_RE_PERCENT = re.compile(r'\d+\.?\d*\s*%')      # remove "10%" etc.
_RE_SPACES  = re.compile(r'\s+')


def _clean(raw: str) -> str:
    """Normalise an ingredient token for matching and storage."""
    s = _RE_PARENS.sub('', raw)
    s = _RE_PERCENT.sub('', s)
    s = _RE_SPACES.sub(' ', s).strip().lower().rstrip('.,;:*†‡')
    return s


def parse_ingredient_names(product: dict[str, Any]) -> list[str]:
    """
    Return a clean, deduplicated list of ingredient name strings from an
    OFF/OBF product dict.

    Priority order:
      1. `ingredients` — structured array already tokenized by OFF/OBF editors.
         Each item has a `text` field (the display name). This is more reliable
         than the free-text field because it has already been split correctly.
      2. `ingredients_text_en` — English free-text fallback.
      3. `ingredients_text` — language-neutral free-text last resort.

    Returns an empty list when no ingredient data is available (these
    products are skipped entirely — they offer no value to Elory).
    """
    # 1. Structured array
    structured = product.get("ingredients") or []
    if isinstance(structured, list) and structured:
        names: list[str] = []
        seen: set[str] = set()
        for item in structured:
            text = _clean(item.get("text") or "")
            if text and len(text) >= 3 and text not in _SKIP_TOKENS and text not in seen:
                names.append(text)
                seen.add(text)
        if names:
            return names

    # 2 + 3. Free-text fallback — split on comma/semicolon
    raw = (
        product.get("ingredients_text_en")
        or product.get("ingredients_text")
        or ""
    )
    if not raw:
        return []

    names = []
    seen = set()
    for part in re.split(r'[,;]', raw):
        token = _clean(part)
        if token and len(token) >= 3 and token not in _SKIP_TOKENS and token not in seen:
            names.append(token)
            seen.add(token)
    return names


# ─── Canonical ingredient matching ───────────────────────────────────────────
#
# We build ONE lookup dict at startup: { lowercased_name → Ingredient }.
# Both canonical names and all synonyms point to the same Ingredient object.
# This makes every lookup O(1) regardless of how many ingredients we have.

IngredientLookup = dict[str, Ingredient]


async def build_ingredient_lookup(session: AsyncSession) -> IngredientLookup:
    """Load all canonical ingredients + synonyms into a flat O(1) lookup dict."""
    result = await session.execute(select(Ingredient))
    all_ingredients = result.scalars().all()

    lookup = build_lookup(all_ingredients)

    print(f"  Loaded {len(all_ingredients)} canonical ingredients "
          f"({len(lookup)} lookup keys including synonyms)")
    return lookup


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

async def fetch_page(
    client: httpx.AsyncClient,
    cfg: CategoryConfig,
    page: int,
    sem: asyncio.Semaphore,
) -> list[dict[str, Any]]:
    """
    Fetch one page (100 products) from the OFF/OBF search API.

    We use a semaphore to cap concurrent requests at 3 — well under
    OFF's unauthenticated rate limit (~100 req/min). A 0.2 s sleep
    per request adds extra headroom and keeps us a polite citizen.
    """
    params: dict[str, Any] = {
        "action":         "process",
        "tagtype_0":      "categories",
        "tag_contains_0": "contains",
        "tag_0":          cfg.tag,
        "sort_by":        "unique_scans_n",   # most scanned = most popular
        "page_size":      PAGE_SIZE,
        "page":           page,
        "json":           "1",
        "fields":         _FIELDS,
    }

    async with sem:
        try:
            await asyncio.sleep(0.2)
            resp = await client.get(
                f"{cfg.base_url}/cgi/search.pl",
                params=params,
                timeout=20.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("products") or []
        except Exception as exc:
            print(f"    [HTTP] {cfg.tag} page {page} error: {exc}")
            return []


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def barcode_exists(session: AsyncSession, barcode: str) -> bool:
    result = await session.execute(
        select(Product.id).where(Product.barcode == barcode)
    )
    return result.scalar_one_or_none() is not None


async def insert_product(
    session: AsyncSession,
    raw: dict[str, Any],
    cfg: CategoryConfig,
    lookup: IngredientLookup,
    dry_run: bool,
    http_client: httpx.AsyncClient | None = None,
    usda: USDAService | None = None,
) -> bool:
    """
    Validate, transform, and persist one OFF/OBF product.

    Returns True  → product was inserted (or would be in dry-run mode).
    Returns False → product was skipped (missing barcode/name/ingredients,
                    or already exists in the DB).
    """
    barcode = (raw.get("code") or "").strip()
    name    = (raw.get("product_name") or "").strip()
    brand   = ((raw.get("brands") or "").split(",")[0]).strip()

    # Hard requirements: a barcode and a name
    if not barcode or not name:
        return False

    # Skip products already in DB (makes the script safely re-runnable)
    if await barcode_exists(session, barcode):
        return False

    # Parse the ingredient list — products with no ingredients are skipped.
    # They offer Elory no analytical value.
    ing_names = parse_ingredient_names(raw)
    if not ing_names:
        return False

    if dry_run:
        print(f"    [dry-run] {brand or '?'} — {name[:60]}  ({len(ing_names)} ingredients)")
        return True

    # Build ingredient link objects.
    # We track matched canonical names for the key_actives summary field.
    links: list[dict] = []
    matched_names: list[str] = []

    for position, ing_name in enumerate(ing_names[:60], start=1):   # cap at 60
        canonical = match_ingredient(ing_name, lookup)
        if canonical:
            matched_names.append(canonical.canonical_name)

        # Truncate display name — some OFF entries embed full multi-language
        # disclaimer text as a single "ingredient" token.
        display_name = ing_name.title()[:500]

        links.append({
            "name":          display_name,
            "ingredient_id": canonical.id if canonical else None,
            "status":        infer_status(canonical),
            "order_position": position,
        })

    # Derive a minimal summary from the first 3 matched canonical ingredients.
    # This is placeholder text — the research agent will enrich it later.
    key_actives = ", ".join(matched_names[:3]) or None
    summary = f"Contains {key_actives}" if key_actives else None

    # ── Nutrition data: OFF nutriments with USDA fallback ─────────────────────
    # For food products, OFF often has empty nutriments for whole/specialty foods
    # (moringa, watercress, spinach, etc.). When sparse, try USDA FoodData Central
    # which has research-grade micronutrient data for whole foods.
    off_nutriments: dict = raw.get("nutriments") or {}
    final_nutriments = off_nutriments
    nutriments_source = "openfoodfacts"

    if (
        cfg.category == ProductCategory.FOOD
        and _is_nutriments_sparse(off_nutriments)
        and usda is not None
        and usda.available
    ):
        usda_nutriments = await usda.fetch_nutriments(name, client=http_client)
        if usda_nutriments:
            final_nutriments = usda_nutriments
            nutriments_source = "usda"
            print(f"    [USDA] Enriched '{name[:50]}' ({len(usda_nutriments)} nutrients)")

    product = Product(
        barcode=barcode,
        name=name[:255],
        brand=brand[:255] if brand else None,
        category=cfg.category,
        subcategory=cfg.subcategory,
        image_url=raw.get("image_front_url"),
        summary=summary,
        key_actives=key_actives,
        serving_size=raw.get("serving_size"),
        # health_score is left None intentionally — computed by the research
        # agent once ingredient evidence is available.
        extra_data={
            "source": nutriments_source,
            "nutriments": final_nutriments,
            "serving_quantity": raw.get("serving_quantity"),
        },
    )
    session.add(product)
    await session.flush()   # materialise product.id before creating links

    for link_data in links:
        session.add(ProductIngredient(
            product_id=product.id,
            **link_data,
        ))

    return True


# ─── Category processor ───────────────────────────────────────────────────────

async def process_category(
    client: httpx.AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    cfg: CategoryConfig,
    sem: asyncio.Semaphore,
    lookup: IngredientLookup,
    dry_run: bool,
    usda: USDAService | None = None,
) -> tuple[int, int]:
    """
    Fetch all pages for one category until we hit the target or run out of results.

    Each page is committed in its own transaction — so a failure on page 5
    doesn't discard the first 4 pages of work.

    Returns (inserted_count, skipped_count).
    """
    db_name = "OBF" if "openbeauty" in cfg.base_url else "OFF"
    print(f"\n  [{db_name}] {cfg.tag}")
    print(f"  {'─' * 55}")

    inserted = 0
    skipped  = 0
    page     = 1

    while inserted < cfg.target:
        products_on_page = await fetch_page(client, cfg, page, sem)
        if not products_on_page:
            break   # No more results from OFF

        async with session_factory() as session:
            batch = 0
            for raw_product in products_on_page:
                ok = await insert_product(
                    session, raw_product, cfg, lookup, dry_run,
                    http_client=client, usda=usda,
                )
                if ok:
                    inserted += 1
                    batch += 1
                else:
                    skipped += 1
            if not dry_run:
                await session.commit()

        print(f"    Page {page:>3}  +{batch} new  "
              f"({inserted} total inserted, {skipped} skipped so far)")

        page += 1
        if len(products_on_page) < PAGE_SIZE:
            break   # Last page — no point requesting the next

    return inserted, skipped


# ─── Entry point ──────────────────────────────────────────────────────────────

async def main(args: argparse.Namespace) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    # Filter and/or override limits based on CLI args
    categories = CATEGORIES
    if args.category:
        key = args.category.lower()
        categories = [
            c for c in CATEGORIES
            if key in c.tag.lower() or key in c.subcategory.lower() or key in c.category.value
        ]
        if not categories:
            print(f"ERROR: No category matching '{args.category}'. "
                  f"Try: supplement, protein, cereal, beverage, snack, cosmetic, serum, shampoo...")
            await engine.dispose()
            return

    if args.limit:
        categories = [
            CategoryConfig(c.base_url, c.tag, c.category, c.subcategory, args.limit)
            for c in categories
        ]

    total_target = sum(c.target for c in categories)

    # Pre-load the canonical ingredient lookup once — shared across all categories.
    # This avoids re-querying the DB for every product.
    async with session_factory() as session:
        lookup = await build_ingredient_lookup(session)

    print(f"\nElory Product Fetcher — Open Food Facts + Open Beauty Facts")
    print(f"{'=' * 60}")
    usda = USDAService()

    print(f"  Mode:        {'DRY RUN' if args.dry_run else 'LIVE'}")
    print(f"  Categories:  {len(categories)}")
    print(f"  Target:      {total_target:,} products")
    print(f"  Source:      OFF (food/supplement), OBF (cosmetic)")
    print(f"  USDA key:    {'yes — nutriments fallback active' if usda.available else 'no — set USDA_API_KEY to enable'}")
    print(f"{'=' * 60}")

    sem = asyncio.Semaphore(3)   # max 3 concurrent requests

    headers = {
        "User-Agent": f"{settings.openfoodfacts_user_agent} (hello@elory.app)",
    }

    total_inserted = 0
    total_skipped  = 0

    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        for cfg in categories:
            ins, skip = await process_category(
                client, session_factory, cfg, sem, lookup, args.dry_run,
                usda=usda,
            )
            total_inserted += ins
            total_skipped  += skip

    await engine.dispose()

    print(f"\n{'=' * 60}")
    print(f"  Inserted:    {total_inserted:,} new products")
    print(f"  Skipped:     {total_skipped:,} (no ingredients / already in DB)")
    print(f"\nNext steps:")
    print(f"  make research-all    ← enrich any PENDING ingredients with PubMed studies")
    print(f"{'=' * 60}\n")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Fetch popular products from Open Food Facts + Open Beauty Facts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--category",
        metavar="NAME",
        help="Only fetch this category (partial match on tag, subcategory, or category value). "
             "Examples: supplement, protein, serum, shampoo",
    )
    p.add_argument(
        "--limit",
        type=int,
        metavar="N",
        help="Override the target product count for every category (useful for testing)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be inserted without writing to the database",
    )
    return p.parse_args()


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
