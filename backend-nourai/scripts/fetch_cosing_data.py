"""
fetch_cosing_data.py
=====================
Downloads and processes the EU CosIng (Cosmetic Ingredient) database,
maintained by the European Commission under Regulation (EC) No 1223/2009.

What CosIng provides
--------------------
• Official INCI names for every cosmetic ingredient recognised in the EU
• Restriction status: Prohibited (Annex II), Restricted (Annex III),
  Regulated UV filter (Annex VI), Regulated preservative (Annex V),
  Regulated colorant (Annex IV)
• Maximum allowed concentrations for restricted substances
• Wording of conditions and warnings (e.g. "not for children under 3")
• Function codes (e.g. PRESERVATIVE, FRAGRANCE, UV-ABSORBER)

Why this matters for NourAI
----------------------------
• Lets us flag EU-banned ingredients as AVOID automatically
• Lets us surface EU restriction limits ("max 1% in rinse-off")
• Dramatically improves our IngredientStatus accuracy for cosmetics
• Gives us official INCI synonyms to expand our matching lookup

Data source
-----------
The European Commission publishes CosIng as downloadable CSV files at:
  https://ec.europa.eu/growth/tools-databases/cosing/

This script fetches the "ingredients" CSV and processes it into our DB.
The CSV is updated quarterly. File is ~15 MB.

How data is stored
------------------
• If a canonical ingredient exists in our DB:
    – Updates `extra_data.cosing` with the CosIng metadata
    – Sets IngredientStatus guidance in `extra_data.cosing.restriction`
    – If Annex II (Prohibited): adds "EU BANNED" to contraindications
    – If Annex III (Restricted): adds restriction text to side_effects
• Provides a report of all CosIng "Prohibited" substances so new ones
  can be added to seed_fragrance_ingredients.py

Usage
-----
    python -m scripts.fetch_cosing_data          # full run
    python -m scripts.fetch_cosing_data --dry-run
    python -m scripts.fetch_cosing_data --report-banned
    make fetch-cosing
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import io
import os
import sys
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient

# ─── CosIng download URL ──────────────────────────────────────────────────────
# The European Commission hosts the CosIng database as a downloadable CSV.
# URL format: search all ingredients, export as CSV.
# This URL returns all ingredients including Annex entries.

COSING_INGREDIENTS_URL = (
    "https://ec.europa.eu/growth/tools-databases/cosing/pdf/COSING_Ingredients-and-Fragrance-Inventory_v2.csv"
)

# Fallback: If the above URL changes (EC updates it periodically), the backup
# approach is to download from the CosIng search export directly.
COSING_SEARCH_URL = "https://ec.europa.eu/growth/tools-databases/cosing/"

# ─── CosIng Annex classification ─────────────────────────────────────────────

ANNEX_LABELS: dict[str, str] = {
    "II":  "Prohibited (EU Annex II)",
    "III": "Restricted (EU Annex III)",
    "IV":  "Regulated colorant (EU Annex IV)",
    "V":   "Regulated preservative (EU Annex V)",
    "VI":  "Regulated UV filter (EU Annex VI)",
}


# ─── CSV parsing ──────────────────────────────────────────────────────────────

def parse_cosing_csv(content: str) -> list[dict[str, Any]]:
    """
    Parse the CosIng CSV into a list of ingredient records.

    CosIng CSV columns (varies by version, but typically includes):
      CosIng Ref No., INCI name, INN name, Ph. Eur. Name, CAS No., EC No.,
      Chem/IUPAC Name, Restriction, Conditions of use (product type),
      Wording, Annex, Function, Update date
    """
    reader = csv.DictReader(io.StringIO(content), delimiter=',')
    records = []
    for row in reader:
        # Normalize column names (CosIng uses inconsistent casing)
        normalized = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items()}
        records.append(normalized)
    return records


def extract_inci_name(record: dict) -> str | None:
    """Extract the primary INCI name from a CosIng record."""
    for key in ["inci_name", "inci", "name", "ingredient_name"]:
        val = record.get(key, "").strip()
        if val and val != "-":
            return val
    return None


def extract_annex(record: dict) -> str | None:
    """Extract the EU Annex classification (II, III, IV, V, VI, or None)."""
    for key in ["annex", "annex_no", "annex_number"]:
        val = record.get(key, "").strip()
        if val and val.upper() in ANNEX_LABELS:
            return val.upper()
    return None


def extract_restriction_text(record: dict) -> str | None:
    """Extract the restriction wording from a CosIng record."""
    for key in ["wording", "conditions_of_use", "condition", "restriction_text"]:
        val = record.get(key, "").strip()
        if val and val != "-":
            return val[:500]
    return None


def extract_cas(record: dict) -> str | None:
    for key in ["cas_no.", "cas_no", "cas", "cas_number"]:
        val = record.get(key, "").strip()
        if val and val != "-":
            return val
    return None


def extract_functions(record: dict) -> list[str]:
    for key in ["function", "functions", "product_function"]:
        val = record.get(key, "").strip()
        if val and val != "-":
            return [f.strip() for f in val.split(",") if f.strip()]
    return []


# ─── Ingredient matching ──────────────────────────────────────────────────────

def build_lookup(ingredients: list[Ingredient]) -> dict[str, Ingredient]:
    lookup: dict[str, Ingredient] = {}
    for ing in ingredients:
        lookup[ing.canonical_name.lower().strip()] = ing
        for syn in (ing.synonyms or []):
            lookup[syn.lower().strip()] = ing
    return lookup


def find_match(inci_name: str, lookup: dict[str, Ingredient]) -> Ingredient | None:
    norm = inci_name.lower().strip()
    if norm in lookup:
        return lookup[norm]
    # Partial match for cases like "Linalool hydroperoxides" → "Linalool"
    for key, ing in lookup.items():
        if len(key) >= 6 and (key in norm or norm in key):
            return ing
    return None


# ─── DB update ────────────────────────────────────────────────────────────────

async def update_ingredient(
    session: AsyncSession,
    ingredient: Ingredient,
    cosing_record: dict[str, Any],
    annex: str | None,
    restriction_text: str | None,
    dry_run: bool,
) -> list[str]:
    """
    Apply CosIng data to an ingredient record. Returns list of change descriptions.
    """
    changes: list[str] = []
    if dry_run:
        return [f"would apply CosIng (Annex {annex})"] if annex else ["would update CosIng metadata"]

    # Build the cosing metadata block
    extra = dict(ingredient.extra_data or {})
    cosing_meta = {
        "ref_no":       cosing_record.get("cosing_ref_no.", cosing_record.get("ref_no", "")),
        "cas_number":   cosing_record.get("_cas"),
        "functions":    cosing_record.get("_functions", []),
        "annex":        annex,
        "annex_label":  ANNEX_LABELS.get(annex, "") if annex else None,
        "restriction":  restriction_text,
        "source":       "EU CosIng",
    }
    extra["cosing"] = cosing_meta
    ingredient.extra_data = extra
    changes.append(f"CosIng metadata (Annex {annex or 'none'})")

    # Annex II = Prohibited — flag as strongly as possible
    if annex == "II":
        banned_str = "EU BANNED (Cosmetics Regulation Annex II)"
        existing_ci = ingredient.contraindications or []
        if not any("EU BANNED" in c for c in existing_ci):
            ingredient.contraindications = existing_ci + [banned_str]
            changes.append("marked EU BANNED in contraindications")

    # Annex III = Restricted — add restriction wording to side_effects
    elif annex == "III" and restriction_text:
        existing_se = ingredient.side_effects or []
        restriction_note = f"EU restricted: {restriction_text}"
        if not any("EU restricted" in s for s in existing_se):
            ingredient.side_effects = existing_se + [restriction_note]
            changes.append("added EU restriction text to side_effects")

    await session.flush()
    return changes


# ─── Main ─────────────────────────────────────────────────────────────────────

async def run(dry_run: bool, report_banned: bool) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    print("\nNourAI EU CosIng Data Fetcher")
    print("=" * 60)
    print(f"  Source   : European Commission CosIng database")
    print(f"  Dry run  : {dry_run}")
    print("=" * 60)

    # ── Step 1: Download CosIng CSV ───────────────────────────────────────────
    print(f"\n[1/3] Downloading CosIng CSV...")
    print(f"  URL: {COSING_INGREDIENTS_URL}")

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            resp = await client.get(COSING_INGREDIENTS_URL)
            if resp.status_code != 200:
                print(f"  ERROR: HTTP {resp.status_code}")
                print(f"  The CosIng URL may have changed. Check:")
                print(f"  {COSING_SEARCH_URL}")
                await engine.dispose()
                return
            raw_content = resp.text
    except httpx.RequestError as exc:
        print(f"  ERROR: {exc}")
        await engine.dispose()
        return

    print(f"  Downloaded {len(raw_content):,} bytes")

    # ── Step 2: Parse CSV ─────────────────────────────────────────────────────
    print(f"\n[2/3] Parsing CosIng records...")
    try:
        records = parse_cosing_csv(raw_content)
    except Exception as exc:
        print(f"  ERROR parsing CSV: {exc}")
        print(f"  First 500 chars of response: {raw_content[:500]}")
        await engine.dispose()
        return

    print(f"  Parsed {len(records):,} CosIng records")

    # Count by annex for the report
    annex_counts: dict[str, int] = {}
    for rec in records:
        annex = extract_annex(rec)
        annex_counts[annex or "none"] = annex_counts.get(annex or "none", 0) + 1

    for annex, count in sorted(annex_counts.items()):
        label = ANNEX_LABELS.get(annex, "No restriction") if annex != "none" else "No restriction"
        print(f"    Annex {annex:6s}: {count:>6,}  ({label})")

    if report_banned:
        print(f"\n  ── Annex II PROHIBITED substances ──────────────────────")
        for rec in records:
            if extract_annex(rec) == "II":
                name = extract_inci_name(rec) or "(unknown)"
                restriction = extract_restriction_text(rec) or ""
                print(f"    • {name}")
                if restriction:
                    print(f"      → {restriction[:120]}")
        print()

    # Enrich records with parsed fields for matching
    for rec in records:
        rec["_cas"]       = extract_cas(rec)
        rec["_functions"] = extract_functions(rec)

    # ── Step 3: Match and update DB ───────────────────────────────────────────
    print(f"\n[3/3] Matching CosIng records to DB ingredients...")

    async with factory() as session:
        result = await session.execute(select(Ingredient))
        all_ingredients = list(result.scalars().all())

    lookup = build_lookup(all_ingredients)
    print(f"  DB has {len(all_ingredients)} canonical ingredients "
          f"({len(lookup)} lookup keys)")

    matched_count  = 0
    updated_count  = 0
    skipped_count  = 0
    annex_matches: dict[str, int] = {}

    for rec in records:
        inci_name = extract_inci_name(rec)
        if not inci_name:
            skipped_count += 1
            continue

        ingredient = find_match(inci_name, lookup)
        if not ingredient:
            skipped_count += 1
            continue

        matched_count += 1
        annex = extract_annex(rec)
        restriction_text = extract_restriction_text(rec)

        annex_matches[annex or "none"] = annex_matches.get(annex or "none", 0) + 1

        async with factory() as session:
            result = await session.execute(
                select(Ingredient).where(Ingredient.id == ingredient.id)
            )
            db_ing = result.scalar_one_or_none()
            if not db_ing:
                continue

            changes = await update_ingredient(
                session, db_ing, rec, annex, restriction_text, dry_run
            )
            if not dry_run:
                await session.commit()

        if changes:
            updated_count += 1
            annex_str = f" [Annex {annex}]" if annex else ""
            print(f"  ✓  {ingredient.canonical_name}{annex_str} — {'; '.join(changes)}")

    await engine.dispose()

    print(f"\n{'=' * 60}")
    print(f"  CosIng records total    : {len(records):,}")
    print(f"  Matched to our DB       : {matched_count}")
    print(f"  Updated in DB           : {updated_count}")
    print(f"  No DB match (skipped)   : {skipped_count}")
    print(f"\n  Matched by Annex:")
    for annex, count in sorted(annex_matches.items()):
        label = ANNEX_LABELS.get(annex, "No restriction")
        print(f"    Annex {annex:6s}: {count:>4}  ({label})")
    if dry_run:
        print("\n  [DRY RUN — nothing written to DB]")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download EU CosIng database and enrich ingredient safety data"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be updated without writing to DB")
    parser.add_argument("--report-banned", action="store_true",
                        help="Print all Annex II prohibited substances to stdout")
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run, report_banned=args.report_banned))


if __name__ == "__main__":
    main()
