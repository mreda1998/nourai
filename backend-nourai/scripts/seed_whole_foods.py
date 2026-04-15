"""
Elory Whole Foods Seeder
=========================
Seeds ~300 whole food products with AI-generated bioactive ingredient profiles.

For each food, Claude Haiku generates:
  - A plain-English summary of the food's nutritional significance
  - A health score (0–100)
  - 3–7 key bioactive compounds with amounts and ingredient metadata

New canonical ingredients discovered across all foods are upserted into the
`ingredients` table and marked PENDING so the research agent can enrich them.

Products are barcode-free and discovered via text search only (no scanner).

Usage
-----
  python -m scripts.seed_whole_foods              # Full run (~300 foods)
  python -m scripts.seed_whole_foods --dry-run    # Preview without writing
  python -m scripts.seed_whole_foods --limit 10   # Test with first 10 foods
  python -m scripts.seed_whole_foods --category fruits   # One category only
  python -m scripts.seed_whole_foods --retry-failed      # Retry foods that errored
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from typing import Any

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory, ResearchStatus
from app.models.product import Product, ProductCategory, ProductIngredient, IngredientStatus

# ─── Whole food catalogue ─────────────────────────────────────────────────────
# Format: (canonical_name, subcategory)
# No barcodes — all found via text search only.

WHOLE_FOODS: list[tuple[str, str]] = [

    # ── Fruits ────────────────────────────────────────────────────────────────
    ("Apple",              "Fruit"),
    ("Banana",             "Fruit"),
    ("Orange",             "Fruit"),
    ("Strawberry",         "Fruit"),
    ("Blueberry",          "Fruit"),
    ("Raspberry",          "Fruit"),
    ("Blackberry",         "Fruit"),
    ("Cranberry",          "Fruit"),
    ("Mango",              "Fruit"),
    ("Pineapple",          "Fruit"),
    ("Watermelon",         "Fruit"),
    ("Red Grapes",         "Fruit"),
    ("Green Grapes",       "Fruit"),
    ("Lemon",              "Fruit"),
    ("Lime",               "Fruit"),
    ("Avocado",            "Fruit"),
    ("Cherry",             "Fruit"),
    ("Peach",              "Fruit"),
    ("Pear",               "Fruit"),
    ("Plum",               "Fruit"),
    ("Kiwi",               "Fruit"),
    ("Papaya",             "Fruit"),
    ("Coconut",            "Fruit"),
    ("Fig",                "Fruit"),
    ("Medjool Date",       "Fruit"),
    ("Pomegranate",        "Fruit"),
    ("Grapefruit",         "Fruit"),
    ("Cantaloupe",         "Fruit"),
    ("Honeydew Melon",     "Fruit"),
    ("Apricot",            "Fruit"),
    ("Nectarine",          "Fruit"),
    ("Passion Fruit",      "Fruit"),
    ("Dragon Fruit",       "Fruit"),
    ("Guava",              "Fruit"),
    ("Persimmon",          "Fruit"),
    ("Tangerine",          "Fruit"),
    ("Lychee",             "Fruit"),
    ("Mulberry",           "Fruit"),
    ("Elderberry",         "Fruit"),
    ("Acai Berry",         "Fruit"),
    ("Tomato",             "Fruit"),
    ("Olive",              "Fruit"),
    ("Jackfruit",          "Fruit"),
    ("Starfruit",          "Fruit"),
    ("Gooseberry",         "Fruit"),

    # ── Vegetables ────────────────────────────────────────────────────────────
    ("Cucumber",           "Vegetable"),
    ("Carrot",             "Vegetable"),
    ("Broccoli",           "Vegetable"),
    ("Spinach",            "Vegetable"),
    ("Kale",               "Vegetable"),
    ("Romaine Lettuce",    "Vegetable"),
    ("Onion",              "Vegetable"),
    ("Red Onion",          "Vegetable"),
    ("Garlic",             "Vegetable"),
    ("Ginger Root",        "Vegetable"),
    ("Sweet Potato",       "Vegetable"),
    ("Potato",             "Vegetable"),
    ("Red Bell Pepper",    "Vegetable"),
    ("Green Bell Pepper",  "Vegetable"),
    ("Celery",             "Vegetable"),
    ("Cauliflower",        "Vegetable"),
    ("Zucchini",           "Vegetable"),
    ("Eggplant",           "Vegetable"),
    ("Asparagus",          "Vegetable"),
    ("Artichoke",          "Vegetable"),
    ("Brussels Sprouts",   "Vegetable"),
    ("Cabbage",            "Vegetable"),
    ("Red Cabbage",        "Vegetable"),
    ("Bok Choy",           "Vegetable"),
    ("Beet",               "Vegetable"),
    ("Radish",             "Vegetable"),
    ("Turnip",             "Vegetable"),
    ("Parsnip",            "Vegetable"),
    ("Leek",               "Vegetable"),
    ("Sweet Corn",         "Vegetable"),
    ("Green Peas",         "Vegetable"),
    ("Green Beans",        "Vegetable"),
    ("Edamame",            "Vegetable"),
    ("Shiitake Mushroom",  "Vegetable"),
    ("White Mushroom",     "Vegetable"),
    ("Portobello Mushroom","Vegetable"),
    ("Arugula",            "Vegetable"),
    ("Swiss Chard",        "Vegetable"),
    ("Collard Greens",     "Vegetable"),
    ("Watercress",         "Vegetable"),
    ("Fennel",             "Vegetable"),
    ("Okra",               "Vegetable"),
    ("Pumpkin",            "Vegetable"),
    ("Butternut Squash",   "Vegetable"),
    ("Jalapeño",           "Vegetable"),
    ("Chili Pepper",       "Vegetable"),
    ("Turmeric Root",      "Vegetable"),
    ("Seaweed (Nori)",     "Vegetable"),
    ("Wakame Seaweed",     "Vegetable"),
    ("Moringa",            "Vegetable"),
    ("Wheatgrass",         "Vegetable"),
    ("Yam",                "Vegetable"),
    ("Cassava",            "Vegetable"),
    ("Taro",               "Vegetable"),

    # ── Meat & Poultry ────────────────────────────────────────────────────────
    ("Chicken Breast",     "Poultry"),
    ("Chicken Thigh",      "Poultry"),
    ("Turkey Breast",      "Poultry"),
    ("Duck Breast",        "Poultry"),
    ("Beef Sirloin",       "Red Meat"),
    ("Ground Beef (80/20)","Red Meat"),
    ("Beef Liver",         "Red Meat"),
    ("Pork Loin",          "Red Meat"),
    ("Pork Belly",         "Red Meat"),
    ("Lamb (Ground)",      "Red Meat"),
    ("Venison",            "Red Meat"),
    ("Bison",              "Red Meat"),
    ("Chicken Liver",      "Poultry"),
    ("Bone Broth",         "Poultry"),

    # ── Fish & Seafood ────────────────────────────────────────────────────────
    ("Atlantic Salmon",    "Fish"),
    ("Wild Salmon",        "Fish"),
    ("Yellowfin Tuna",     "Fish"),
    ("Canned Tuna",        "Fish"),
    ("Sardines",           "Fish"),
    ("Mackerel",           "Fish"),
    ("Atlantic Cod",       "Fish"),
    ("Tilapia",            "Fish"),
    ("Rainbow Trout",      "Fish"),
    ("Atlantic Herring",   "Fish"),
    ("Halibut",            "Fish"),
    ("Sea Bass",           "Fish"),
    ("Anchovies",          "Fish"),
    ("Shrimp",             "Seafood"),
    ("Oysters",            "Seafood"),
    ("Mussels",            "Seafood"),
    ("Clams",              "Seafood"),
    ("Scallops",           "Seafood"),
    ("Crab",               "Seafood"),
    ("Lobster",            "Seafood"),
    ("Squid",              "Seafood"),

    # ── Eggs & Dairy ──────────────────────────────────────────────────────────
    ("Whole Egg",          "Egg"),
    ("Egg White",          "Egg"),
    ("Whole Milk",         "Dairy"),
    ("Skim Milk",          "Dairy"),
    ("Greek Yogurt",       "Dairy"),
    ("Plain Yogurt",       "Dairy"),
    ("Kefir",              "Dairy"),
    ("Cheddar Cheese",     "Dairy"),
    ("Mozzarella",         "Dairy"),
    ("Cottage Cheese",     "Dairy"),
    ("Parmesan",           "Dairy"),
    ("Brie",               "Dairy"),
    ("Gouda",              "Dairy"),
    ("Ricotta",            "Dairy"),
    ("Butter",             "Dairy"),
    ("Ghee",               "Dairy"),
    ("Heavy Cream",        "Dairy"),
    ("Cream Cheese",       "Dairy"),
    ("Goat Cheese",        "Dairy"),
    ("Goat Milk",          "Dairy"),

    # ── Grains & Cereals ──────────────────────────────────────────────────────
    ("Rolled Oats",        "Grain"),
    ("Steel-Cut Oats",     "Grain"),
    ("Brown Rice",         "Grain"),
    ("White Rice",         "Grain"),
    ("Quinoa",             "Grain"),
    ("Whole Wheat Bread",  "Grain"),
    ("Sourdough Bread",    "Grain"),
    ("Barley",             "Grain"),
    ("Buckwheat",          "Grain"),
    ("Millet",             "Grain"),
    ("Rye",                "Grain"),
    ("Amaranth",           "Grain"),
    ("Spelt",              "Grain"),
    ("Whole Wheat Pasta",  "Grain"),
    ("White Pasta",        "Grain"),
    ("Popcorn",            "Grain"),
    ("Corn Tortilla",      "Grain"),

    # ── Legumes & Pulses ─────────────────────────────────────────────────────
    ("Black Beans",        "Legume"),
    ("Chickpeas",          "Legume"),
    ("Red Lentils",        "Legume"),
    ("Green Lentils",      "Legume"),
    ("Kidney Beans",       "Legume"),
    ("Cannellini Beans",   "Legume"),
    ("Soybeans",           "Legume"),
    ("Mung Beans",         "Legume"),
    ("Split Peas",         "Legume"),
    ("Black-Eyed Peas",    "Legume"),
    ("Adzuki Beans",       "Legume"),
    ("Fava Beans",         "Legume"),
    ("Pinto Beans",        "Legume"),
    ("Tempeh",             "Legume"),
    ("Miso",               "Legume"),
    ("Tofu",               "Legume"),
    ("Peanuts",            "Legume"),

    # ── Nuts & Seeds ──────────────────────────────────────────────────────────
    ("Almonds",            "Nut"),
    ("Walnuts",            "Nut"),
    ("Cashews",            "Nut"),
    ("Pistachios",         "Nut"),
    ("Macadamia Nuts",     "Nut"),
    ("Brazil Nuts",        "Nut"),
    ("Pecans",             "Nut"),
    ("Hazelnuts",          "Nut"),
    ("Pine Nuts",          "Nut"),
    ("Chia Seeds",         "Seed"),
    ("Flaxseeds",          "Seed"),
    ("Hemp Seeds",         "Seed"),
    ("Pumpkin Seeds",      "Seed"),
    ("Sunflower Seeds",    "Seed"),
    ("Sesame Seeds",       "Seed"),
    ("Poppy Seeds",        "Seed"),

    # ── Oils & Fats ───────────────────────────────────────────────────────────
    ("Extra Virgin Olive Oil", "Oil"),
    ("Coconut Oil",            "Oil"),
    ("Avocado Oil",            "Oil"),
    ("Flaxseed Oil",           "Oil"),
    ("Sesame Oil",             "Oil"),
    ("Walnut Oil",             "Oil"),
    ("MCT Oil",                "Oil"),

    # ── Herbs & Spices ────────────────────────────────────────────────────────
    ("Turmeric (Ground)",  "Spice"),
    ("Cinnamon",           "Spice"),
    ("Black Pepper",       "Spice"),
    ("Cayenne Pepper",     "Spice"),
    ("Oregano",            "Herb"),
    ("Basil",              "Herb"),
    ("Rosemary",           "Herb"),
    ("Thyme",              "Herb"),
    ("Cumin",              "Spice"),
    ("Coriander",          "Spice"),
    ("Cardamom",           "Spice"),
    ("Clove",              "Spice"),
    ("Nutmeg",             "Spice"),
    ("Saffron",            "Spice"),
    ("Ginger (Ground)",    "Spice"),
    ("Fenugreek",          "Spice"),
    ("Paprika",            "Spice"),
    ("Mint",               "Herb"),
    ("Parsley",            "Herb"),
    ("Cilantro",           "Herb"),
    ("Sage",               "Herb"),
    ("Dill",               "Herb"),
    ("Chives",             "Herb"),
    ("Tarragon",           "Herb"),
    ("Lemongrass",         "Herb"),
    ("Vanilla Bean",       "Spice"),
    ("Star Anise",         "Spice"),

    # ── Fermented & Functional ────────────────────────────────────────────────
    ("Green Tea",          "Beverage"),
    ("Matcha",             "Beverage"),
    ("Black Coffee",       "Beverage"),
    ("Chamomile Tea",      "Beverage"),
    ("Kombucha",           "Fermented"),
    ("Apple Cider Vinegar","Fermented"),
    ("Sauerkraut",         "Fermented"),
    ("Kimchi",             "Fermented"),
    ("Natto",              "Fermented"),
    ("Coconut Water",      "Beverage"),
    ("Dark Chocolate (85%)","Other"),
    ("Raw Honey",          "Other"),
    ("Maple Syrup",        "Other"),
    ("Nutritional Yeast",  "Other"),
    ("Spirulina",          "Other"),
    ("Chlorella",          "Other"),
]

# ─── Claude tool schema ───────────────────────────────────────────────────────

PROFILE_TOOL: dict = {
    "name": "food_bioactive_profile",
    "description": (
        "Structured bioactive compound profile for a whole food. "
        "List only compounds with meaningful research — not macros (protein/carbs/fat) "
        "unless they are the primary bioactive (e.g. leucine in chicken). "
        "Focus on polyphenols, vitamins, minerals, fatty acids, amino acids, and "
        "plant compounds with documented health effects."
    ),
    "input_schema": {
        "type": "object",
        "required": ["summary", "health_score", "key_actives", "bioactives"],
        "properties": {
            "summary": {
                "type": "string",
                "description": "1-2 sentence plain-English description of why this food matters nutritionally.",
            },
            "health_score": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": (
                    "Overall health score. "
                    "Fresh vegetables: 88-98. Fruits: 78-92. Lean proteins: 82-94. "
                    "Fatty fish: 90-96. Whole grains: 68-80. Refined grains: 45-62. "
                    "Full-fat dairy: 65-78. Nuts/seeds: 80-92. Oils: 70-88. "
                    "Red/processed meats: 45-70. Herbs/spices: 85-98. "
                    "Fermented foods: 75-90."
                ),
            },
            "key_actives": {
                "type": "string",
                "description": "Comma-separated list of the 2-4 most notable bioactive compounds.",
            },
            "bioactives": {
                "type": "array",
                "minItems": 2,
                "maxItems": 7,
                "items": {
                    "type": "object",
                    "required": [
                        "canonical_name", "amount_per_100g", "status",
                        "ingredient_category", "synonyms", "mechanism_summary"
                    ],
                    "properties": {
                        "canonical_name": {
                            "type": "string",
                            "description": "Standard scientific or common name (e.g. 'Quercetin', 'Sulforaphane', 'Leucine').",
                        },
                        "synonyms": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Alternative names for matching (e.g. ['L-Leucine', 'leucine']).",
                        },
                        "amount_per_100g": {
                            "type": "string",
                            "description": "Approximate amount per 100g of food (e.g. '4.4mg', '~20mcg', 'trace').",
                        },
                        "status": {
                            "type": "string",
                            "enum": ["clean", "watch"],
                            "description": "'clean' for beneficial/neutral compounds, 'watch' for dose-sensitive ones.",
                        },
                        "ingredient_category": {
                            "type": "string",
                            "enum": [
                                "vitamin", "mineral", "amino_acid", "herb",
                                "probiotic", "enzyme", "fatty_acid",
                                "antioxidant", "preservative", "sweetener",
                                "additive", "other"
                            ],
                        },
                        "mechanism_summary": {
                            "type": "string",
                            "description": "1 sentence mechanism of action (e.g. 'Inhibits NF-κB signalling, reducing pro-inflammatory cytokine production.').",
                        },
                    },
                },
            },
        },
    },
}

# ─── Claude generation ────────────────────────────────────────────────────────

CLAUDE_CONCURRENCY = 3   # keep well under 10k output tokens/min rate limit


async def generate_profile(
    client: anthropic.AsyncAnthropic,
    food_name: str,
    subcategory: str,
    sem: asyncio.Semaphore,
) -> dict[str, Any] | None:
    """Call Claude Haiku to generate a bioactive profile for one food.
    Retries up to 4 times with exponential backoff on rate limit errors.
    """
    async with sem:
        for attempt in range(4):
            try:
                response = await client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=600,
                    tools=[PROFILE_TOOL],
                    tool_choice={"type": "tool", "name": "food_bioactive_profile"},
                    messages=[{
                        "role": "user",
                        "content": (
                            f"Generate a bioactive compound profile for: {food_name} ({subcategory}).\n\n"
                            "Focus on well-studied bioactive compounds with documented health effects. "
                            "Use per-100g amounts. Be precise about canonical compound names — "
                            "use IUPAC or established common names so they can be matched to a research database."
                        ),
                    }],
                )
                for block in response.content:
                    if block.type == "tool_use" and block.name == "food_bioactive_profile":
                        return block.input
            except anthropic.RateLimitError:
                wait = 20 * (attempt + 1)  # 20s, 40s, 60s, 80s
                print(f"  Rate limited on {food_name}, waiting {wait}s (attempt {attempt + 1}/4)...")
                await asyncio.sleep(wait)
            except Exception as e:
                print(f"  ERROR generating profile for {food_name}: {e}")
                return None
        print(f"  FAILED {food_name} after 4 attempts")
        return None


# ─── Database helpers ─────────────────────────────────────────────────────────

async def build_canonical_lookup(session: AsyncSession) -> dict[str, Ingredient]:
    """Load existing canonical ingredients + synonyms into a lookup dict."""
    result = await session.execute(select(Ingredient))
    ingredients = result.scalars().all()
    lookup: dict[str, Ingredient] = {}
    for ing in ingredients:
        lookup[ing.canonical_name.lower().strip()] = ing
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = ing
    return lookup


def find_existing(
    canonical_name: str,
    synonyms: list[str],
    lookup: dict[str, Ingredient],
) -> Ingredient | None:
    """Check if this compound already exists by name or synonym."""
    for key in [canonical_name] + synonyms:
        hit = lookup.get(key.lower().strip())
        if hit:
            return hit
    return None


async def upsert_canonical_ingredient(
    session: AsyncSession,
    bioactive: dict,
    lookup: dict[str, Ingredient],
) -> Ingredient:
    """Insert a new canonical ingredient or return an existing match."""
    existing = find_existing(
        bioactive["canonical_name"],
        bioactive.get("synonyms", []),
        lookup,
    )
    if existing:
        return existing

    cat_str = bioactive.get("ingredient_category", "other")
    try:
        category = IngredientCategory(cat_str)
    except ValueError:
        category = IngredientCategory.OTHER

    ing = Ingredient(
        canonical_name=bioactive["canonical_name"],
        synonyms=bioactive.get("synonyms", []),
        category=category,
        mechanism_summary=bioactive.get("mechanism_summary"),
        research_status=ResearchStatus.PENDING,
    )
    session.add(ing)
    await session.flush()

    # Add to lookup so subsequent foods reuse this entry
    lookup[ing.canonical_name.lower().strip()] = ing
    for syn in (ing.synonyms or []):
        lookup[syn.lower().strip()] = ing

    return ing


async def upsert_whole_food(
    session: AsyncSession,
    food_name: str,
    subcategory: str,
    profile: dict,
    canonical_lookup: dict[str, Ingredient],
    dry_run: bool,
) -> str:
    """
    Insert or repair a whole food product + its ingredient links.

    Returns:
      'created'  — product and ingredients newly inserted
      'repaired' — product already existed but had no ingredients; links added now
      'skipped'  — product exists and already has ingredients; nothing to do
    """
    result = await session.execute(
        select(Product).where(Product.name == food_name, Product.barcode.is_(None))
    )
    existing_product = result.scalar_one_or_none()

    if existing_product:
        # Check if it already has ingredient links
        count_result = await session.execute(
            select(ProductIngredient).where(
                ProductIngredient.product_id == existing_product.id
            ).limit(1)
        )
        if count_result.scalar_one_or_none():
            return "skipped"  # Fully seeded — nothing to do
        # Product exists but has no ingredients — repair it
        product = existing_product
        action = "repaired"
    else:
        if dry_run:
            return "created"
        product = Product(
            barcode=None,
            name=food_name,
            brand=None,
            category=ProductCategory.FOOD,
            subcategory=subcategory,
            summary=profile.get("summary"),
            key_actives=profile.get("key_actives"),
            health_score=profile.get("health_score"),
        )
        session.add(product)
        await session.flush()
        action = "created"

    if dry_run:
        return action

    for pos, bioactive in enumerate(profile.get("bioactives", []), start=1):
        canonical = await upsert_canonical_ingredient(session, bioactive, canonical_lookup)

        status_str = bioactive.get("status", "clean")
        status = IngredientStatus.CLEAN if status_str == "clean" else IngredientStatus.WATCH

        link = ProductIngredient(
            product_id=product.id,
            ingredient_id=canonical.id,
            name=bioactive["canonical_name"],
            amount=bioactive.get("amount_per_100g"),
            status=status,
            order_position=pos,
        )
        session.add(link)

    return action


# ─── Main ─────────────────────────────────────────────────────────────────────

async def run(
    dry_run: bool,
    limit: int | None,
    category_filter: str | None,
    retry_failed: bool,
) -> None:
    if not settings.anthropic_api_key:
        print("ERROR: ANTHROPIC_API_KEY is not set in .env")
        return
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    # Filter food list
    foods = WHOLE_FOODS
    if category_filter:
        foods = [(n, s) for n, s in foods if s.lower() == category_filter.lower()]
    if limit:
        foods = foods[:limit]

    print(f"\nElory Whole Foods Seeder")
    print("=" * 55)
    print(f"  Foods to process : {len(foods)}")
    print(f"  Dry run          : {dry_run}")
    print(f"  Model            : claude-haiku-4-5-20251001")
    print("=" * 55)

    # ── Step 1: Generate all profiles concurrently ────────────────────────────
    print(f"\n[1/3] Generating bioactive profiles via Claude Haiku...")
    sem = asyncio.Semaphore(CLAUDE_CONCURRENCY)
    tasks = [
        generate_profile(client, name, sub, sem)
        for name, sub in foods
    ]
    profiles_raw = await asyncio.gather(*tasks)

    profiles: list[tuple[str, str, dict]] = []
    failed: list[str] = []
    for (name, sub), profile in zip(foods, profiles_raw):
        if profile:
            profiles.append((name, sub, profile))
        else:
            failed.append(name)

    print(f"  Generated: {len(profiles)} / {len(foods)}")
    if failed:
        print(f"  Failed:    {len(failed)} — {', '.join(failed[:10])}")

    if dry_run:
        print("\n[DRY RUN] Sample output (first 3 foods):")
        for name, sub, profile in profiles[:3]:
            print(f"\n  {name} ({sub}) — score {profile.get('health_score')}")
            print(f"    {profile.get('summary', '')[:100]}...")
            for b in profile.get("bioactives", []):
                print(f"    • {b['canonical_name']} {b.get('amount_per_100g', '')} [{b.get('ingredient_category')}]")
        print("\n[DRY RUN — nothing written to DB]")
        return

    # ── Step 2: Build canonical lookup from DB ────────────────────────────────
    print(f"\n[2/3] Loading existing canonical ingredients...")
    async with factory() as session:
        canonical_lookup = await build_canonical_lookup(session)
    n_existing = len({v.id for v in canonical_lookup.values()})
    print(f"  Found {n_existing} existing canonical ingredients")

    # ── Step 3: Seed each food in its own transaction ─────────────────────────
    # One session per food: a single DB error can't abort the entire run.
    print(f"\n[3/3] Seeding {len(profiles)} foods...")
    seeded = 0
    repaired = 0
    skipped = 0
    db_errors: list[str] = []
    new_ingredients: set[str] = set()

    for name, sub, profile in profiles:
        try:
            async with factory() as session:
                # Track new ingredients before attempting upsert
                for b in profile.get("bioactives", []):
                    if not find_existing(b["canonical_name"], b.get("synonyms", []), canonical_lookup):
                        new_ingredients.add(b["canonical_name"])

                result = await upsert_whole_food(
                    session, name, sub, profile, canonical_lookup, dry_run=False
                )
                await session.commit()

            if result == "created":
                seeded += 1
                print(f"  ✓  {name}")
            elif result == "repaired":
                repaired += 1
                print(f"  ↻  {name} (repaired — ingredients added)")
            else:
                skipped += 1
                print(f"  –  {name} (already complete, skipped)")

        except Exception as e:
            db_errors.append(name)
            print(f"  ✗  {name} — DB error: {e}")

    print(f"\n{'=' * 55}")
    print(f"  Foods created      : {seeded}")
    print(f"  Foods repaired     : {repaired}")
    print(f"  Foods skipped      : {skipped}")
    print(f"  Claude failures    : {len(failed)}")
    print(f"  DB errors          : {len(db_errors)}")
    if db_errors:
        print(f"  DB error foods: {', '.join(db_errors[:10])}")
    print(f"  New canonical ingredients added: {len(new_ingredients)}")
    if new_ingredients:
        print(f"  New ingredients: {', '.join(sorted(new_ingredients)[:15])}")
        if len(new_ingredients) > 15:
            print(f"    ... and {len(new_ingredients) - 15} more")
    print(f"\nNext steps:")
    print(f"  make migrate         — apply migration 006 if not done yet")
    print(f"  make research-all    — enrich new ingredients with PubMed studies")
    print(f"  make backfill-links  — link product ingredients to canonical table")
    print("=" * 55)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed ~300 whole foods with AI-generated bioactive profiles"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Generate profiles but don't write to DB")
    parser.add_argument("--limit", type=int, default=None,
                        help="Process only the first N foods (for testing)")
    parser.add_argument("--category", type=str, default=None,
                        help="Filter by subcategory (e.g. Fruit, Vegetable, Fish)")
    parser.add_argument("--retry-failed", action="store_true",
                        help="(future) Re-run foods that previously errored")
    args = parser.parse_args()

    asyncio.run(run(
        dry_run=args.dry_run,
        limit=args.limit,
        category_filter=args.category,
        retry_failed=args.retry_failed,
    ))


if __name__ == "__main__":
    main()
