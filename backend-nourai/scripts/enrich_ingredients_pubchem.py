"""
enrich_ingredients_pubchem.py
==============================
Enriches canonical ingredient records with scientific data from the NIH
PubChem PUG REST API (completely free, no API key required).

For each ingredient in our DB, PubChem returns:
  • CID (PubChem Compound ID) — stored in extra_data for cross-referencing
  • Molecular formula (e.g. C₉H₁₀O₃)
  • Molecular weight
  • IUPAC name (canonical chemical name)
  • GHS hazard classification (H-statements: H317 = May cause allergic
    skin reaction, H361 = Suspected reproductive toxicant, etc.)
  • Confirmed synonyms — used to expand our matching lookup
  • XLogP3 (lipophilicity — predicts skin absorption potential)

How GHS data is used
--------------------
  H317 "May cause allergic skin reaction"   → adds to side_effects
  H334 "May cause allergy or asthma"        → adds to side_effects
  H360 "May damage fertility or fetus"      → adds to contraindications
  H361 "Suspected reproductive toxicant"    → adds to contraindications
  H400 "Very toxic to aquatic life"         → stored in extra_data.ghs_hazards
  H410 "Very toxic to aquatic life, long lasting" → stored

This data supplements the manually-authored descriptions in seed_fragrance_ingredients.py
and will enrich any new ingredient discovered by the fetchers.

Rate limiting
-------------
PubChem recommends max 5 requests/second. This script uses a 0.25s delay
between requests and a concurrency semaphore of 3.

Usage
-----
    python -m scripts.enrich_ingredients_pubchem          # all ingredients
    python -m scripts.enrich_ingredients_pubchem --category other  # fragrance allergens
    python -m scripts.enrich_ingredients_pubchem --limit 20
    python -m scripts.enrich_ingredients_pubchem --dry-run
    make enrich-pubchem
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.ingredient import Ingredient

PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"
PUBCHEM_VIEW = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view"

# ─── GHS H-statement mapping ──────────────────────────────────────────────────
# Maps GHS H-codes → how they should be used to enrich our ingredient fields.

_GHS_SIDE_EFFECTS: dict[str, str] = {
    "H290": "May be corrosive to metals",
    "H302": "Harmful if swallowed",
    "H304": "May be fatal if swallowed and enters airways",
    "H311": "Toxic in contact with skin",
    "H312": "Harmful in contact with skin",
    "H315": "Causes skin irritation",
    "H317": "May cause allergic skin reaction",
    "H319": "Causes serious eye irritation",
    "H330": "Fatal if inhaled",
    "H331": "Toxic if inhaled",
    "H332": "Harmful if inhaled",
    "H334": "May cause allergy or asthma symptoms or breathing difficulties if inhaled",
    "H335": "May cause respiratory irritation",
    "H336": "May cause drowsiness or dizziness",
    "H400": "Very toxic to aquatic life",
    "H410": "Very toxic to aquatic life with long lasting effects",
    "H411": "Toxic to aquatic life with long lasting effects",
    "H412": "Harmful to aquatic life with long lasting effects",
}

_GHS_CONTRAINDICATIONS: dict[str, str] = {
    "H341": "Suspected of causing genetic defects",
    "H351": "Suspected of causing cancer",
    "H360": "May damage fertility or the unborn child",
    "H361": "Suspected of damaging fertility or the unborn child",
    "H362": "May cause harm to breast-fed children",
    "H370": "Causes damage to organs",
    "H371": "May cause damage to organs",
    "H372": "Causes damage to organs through prolonged or repeated exposure",
    "H373": "May cause damage to organs through prolonged or repeated exposure",
}


# ─── PubChem API calls ────────────────────────────────────────────────────────

async def fetch_compound(
    client: httpx.AsyncClient,
    name: str,
    sem: asyncio.Semaphore,
) -> dict[str, Any] | None:
    """
    Fetch basic compound properties by ingredient name.
    Returns a dict with cid, formula, weight, iupac_name, xlogp.
    """
    async with sem:
        await asyncio.sleep(0.25)
        try:
            resp = await client.get(
                f"{PUBCHEM_BASE}/compound/name/{httpx.URL(name)}/property/"
                "MolecularFormula,MolecularWeight,IUPACName,XLogP/JSON",
                params={"name": name},
                timeout=10.0,
            )
            if resp.status_code == 404:
                return None
            if resp.status_code != 200:
                return None
            data = resp.json()
            props = (data.get("PropertyTable", {}).get("Properties") or [{}])[0]
            return props if props.get("CID") else None
        except (httpx.RequestError, KeyError, IndexError):
            return None


async def fetch_synonyms(
    client: httpx.AsyncClient,
    cid: int,
    sem: asyncio.Semaphore,
) -> list[str]:
    """Fetch top synonyms for a PubChem compound by CID."""
    async with sem:
        await asyncio.sleep(0.25)
        try:
            resp = await client.get(
                f"{PUBCHEM_BASE}/compound/cid/{cid}/synonyms/JSON",
                timeout=10.0,
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            syns = (data.get("InformationList", {})
                        .get("Information", [{}])[0]
                        .get("Synonym", []))
            # Return top 15 synonyms — PubChem often returns hundreds
            return [s for s in syns[:15] if len(s) < 100]
        except (httpx.RequestError, KeyError, IndexError):
            return []


async def fetch_ghs_hazards(
    client: httpx.AsyncClient,
    cid: int,
    sem: asyncio.Semaphore,
) -> list[str]:
    """
    Fetch GHS hazard H-codes for a compound.
    Uses the PUG View API which returns structured safety data.
    """
    async with sem:
        await asyncio.sleep(0.25)
        try:
            resp = await client.get(
                f"{PUBCHEM_VIEW}/data/compound/{cid}/JSON",
                params={"heading": "GHS Classification"},
                timeout=15.0,
            )
            if resp.status_code != 200:
                return []

            data = resp.json()
            h_codes: set[str] = set()

            # Navigate the nested PUG View response structure
            record = data.get("Record", {})
            for section in record.get("Section", []):
                if "GHS" not in section.get("TOCHeading", ""):
                    continue
                for sub in section.get("Section", []):
                    for info in sub.get("Information", []):
                        for markup in info.get("Value", {}).get("StringWithMarkup", []):
                            text = markup.get("String", "")
                            # Extract H-codes from strings like "H317: May cause..."
                            for word in text.split():
                                word_clean = word.rstrip(":,.")
                                if word_clean.startswith("H") and word_clean[1:].isdigit():
                                    h_codes.add(word_clean)

            return sorted(h_codes)
        except (httpx.RequestError, KeyError, IndexError, ValueError):
            return []


# ─── Enrichment logic ─────────────────────────────────────────────────────────

def _merge_unique(existing: list, new_items: list) -> tuple[list, bool]:
    """Add new_items to existing list without duplicates. Returns (merged, changed)."""
    existing_lower = {s.lower() for s in existing}
    additions = [s for s in new_items if s.lower() not in existing_lower]
    if not additions:
        return existing, False
    return existing + additions, True


async def enrich_one(
    session: AsyncSession,
    ingredient: Ingredient,
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    dry_run: bool,
) -> dict[str, Any]:
    """
    Enrich a single ingredient with PubChem data.
    Returns a summary dict of what was changed.
    """
    result = {"name": ingredient.canonical_name, "status": "unchanged", "changes": []}

    # Step 1: Look up compound by canonical name
    props = await fetch_compound(client, ingredient.canonical_name, sem)
    if not props:
        result["status"] = "not_found"
        return result

    cid = props.get("CID")
    changes: list[str] = []

    # Step 2: Collect GHS hazards
    h_codes = await fetch_ghs_hazards(client, cid, sem)

    new_side_effects = [
        _GHS_SIDE_EFFECTS[h] for h in h_codes if h in _GHS_SIDE_EFFECTS
    ]
    new_contraindications = [
        _GHS_CONTRAINDICATIONS[h] for h in h_codes if h in _GHS_CONTRAINDICATIONS
    ]

    # Step 3: Fetch synonyms
    synonyms_from_pubchem = await fetch_synonyms(client, cid, sem)

    # Step 4: Build extra_data payload
    extra = ingredient.extra_data.copy() if ingredient.extra_data else {}
    pubchem_data = {
        "cid":              cid,
        "molecular_formula": props.get("MolecularFormula"),
        "molecular_weight":  props.get("MolecularWeight"),
        "iupac_name":       props.get("IUPACName"),
        "xlogp":            props.get("XLogP"),
        "ghs_h_codes":      h_codes,
        "pubchem_url":      f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
    }
    if extra.get("pubchem") == pubchem_data:
        pass  # No change to PubChem section
    else:
        extra["pubchem"] = pubchem_data
        changes.append(f"pubchem CID={cid}, formula={props.get('MolecularFormula')}")

    if not dry_run:
        # Merge side effects
        merged_se, se_changed = _merge_unique(
            ingredient.side_effects or [], new_side_effects
        )
        if se_changed:
            ingredient.side_effects = merged_se
            changes.append(f"+{len(new_side_effects)} side effects from GHS")

        # Merge contraindications
        merged_ci, ci_changed = _merge_unique(
            ingredient.contraindications or [], new_contraindications
        )
        if ci_changed:
            ingredient.contraindications = merged_ci
            changes.append(f"+{len(new_contraindications)} contraindications from GHS")

        # Merge synonyms (top 5 only to avoid noisy IUPAC strings)
        clean_syns = [s for s in synonyms_from_pubchem[:5]
                      if s.lower() != ingredient.canonical_name.lower()]
        merged_syns, syn_changed = _merge_unique(
            ingredient.synonyms or [], clean_syns
        )
        if syn_changed:
            ingredient.synonyms = merged_syns
            changes.append(f"+{len(clean_syns)} synonyms")

        # Store PubChem metadata
        ingredient.extra_data = extra

        await session.flush()

    result["status"] = "enriched" if changes else "unchanged"
    result["changes"] = changes
    result["cid"] = cid
    return result


# ─── Main ─────────────────────────────────────────────────────────────────────

async def run(
    dry_run: bool,
    limit: int | None,
    category_filter: str | None,
) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        q = select(Ingredient)
        if category_filter:
            q = q.where(Ingredient.category == category_filter)
        result = await session.execute(q)
        ingredients = list(result.scalars().all())

    if limit:
        ingredients = ingredients[:limit]

    print(f"\nNourAI PubChem Ingredient Enricher")
    print("=" * 55)
    print(f"  Ingredients to process : {len(ingredients)}")
    print(f"  Category filter        : {category_filter or 'all'}")
    print(f"  Dry run                : {dry_run}")
    print(f"  Source                 : PubChem PUG REST (NIH, free)")
    print("=" * 55)

    sem = asyncio.Semaphore(3)
    enriched = not_found = unchanged = 0

    async with httpx.AsyncClient() as client:
        for ing in ingredients:
            async with factory() as session:
                # Re-fetch the ingredient in this session for update
                result = await session.execute(
                    select(Ingredient).where(Ingredient.id == ing.id)
                )
                db_ing = result.scalar_one_or_none()
                if not db_ing:
                    continue

                summary = await enrich_one(session, db_ing, client, sem, dry_run)

                if not dry_run and summary["status"] == "enriched":
                    await session.commit()

            status = summary["status"]
            cid_str = f" (CID {summary.get('cid')})" if summary.get("cid") else ""
            if status == "enriched":
                enriched += 1
                changes_str = "; ".join(summary["changes"])
                print(f"  ✓  {ing.canonical_name}{cid_str} — {changes_str}")
            elif status == "not_found":
                not_found += 1
                print(f"  ✗  {ing.canonical_name} — not found in PubChem")
            else:
                unchanged += 1
                print(f"  –  {ing.canonical_name}{cid_str} (already up to date)")

    await engine.dispose()

    print(f"\n{'=' * 55}")
    print(f"  Enriched    : {enriched}")
    print(f"  Unchanged   : {unchanged}")
    print(f"  Not in PubChem: {not_found}")
    if dry_run:
        print("\n  [DRY RUN — nothing written to DB]")
    else:
        print("\nNext steps:")
        print("  make research-all   ← enrich with PubMed clinical studies")
    print("=" * 55)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enrich ingredient records with PubChem GHS safety data (free NIH API)"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing to DB")
    parser.add_argument("--limit", type=int, default=None,
                        help="Process only first N ingredients (for testing)")
    parser.add_argument("--category", type=str, default=None,
                        help="Filter by ingredient category (e.g. 'other', 'vitamin')")
    args = parser.parse_args()
    asyncio.run(run(
        dry_run=args.dry_run,
        limit=args.limit,
        category_filter=args.category,
    ))


if __name__ == "__main__":
    main()
