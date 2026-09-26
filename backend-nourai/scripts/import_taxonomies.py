"""Download open ingredient taxonomies and load substances + aliases.

Sources: Open Food Facts ingredients / additives / additive classes (ODbL)
and the EU CosIng inventory (EU open data), cached in data/taxonomies/.

Usage: python scripts/import_taxonomies.py [--refresh] [--dry-run]
Idempotent: substances upsert on key; existing aliases (incl. AI/reviewed) are kept.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402
from sqlalchemy.dialects.postgresql import insert  # noqa: E402

from app.db.session import async_session_factory  # noqa: E402
from app.models.identity import Substance, SubstanceAlias  # noqa: E402
from app.models.ingredient import Ingredient  # noqa: E402
from app.services.identity.taxonomies import build_catalog  # noqa: E402
from app.services.ingestion.normalization import normalize_ingredient_alias  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data" / "taxonomies"
SOURCES = {
    "off_ingredients.json": "https://world.openfoodfacts.org/data/taxonomies/ingredients.json",
    "off_additives.json": "https://world.openfoodfacts.org/data/taxonomies/additives.json",
    "off_additives_classes.json": "https://world.openfoodfacts.org/data/taxonomies/additives_classes.json",
    "cosing.csv": "https://raw.githubusercontent.com/openfoodfacts/openbeautyfacts/develop/cosing/COSING_Ingredients-Fragrance.Inventory_v2.csv",
}
CHUNK = 4000


def download(refresh: bool) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        for name, url in SOURCES.items():
            path = DATA / name
            if path.exists() and not refresh:
                continue
            print(f"↓ {name}")
            r = client.get(url)
            r.raise_for_status()
            path.write_bytes(r.content)


async def run(refresh: bool, dry_run: bool) -> None:
    download(refresh)
    off_ing = json.loads((DATA / "off_ingredients.json").read_text())
    off_add = json.loads((DATA / "off_additives.json").read_text())
    off_cls = json.loads((DATA / "off_additives_classes.json").read_text())
    cosing = list(csv.reader((DATA / "cosing.csv").open(encoding="utf-8", errors="replace")))

    async with async_session_factory() as session:
        library = [
            {"id": str(i.id), "canonical_name": i.canonical_name, "synonyms": i.synonyms or []}
            for i in (await session.execute(select(Ingredient))).scalars().all()
        ]
        specs, index = build_catalog(off_ing, off_add, off_cls, cosing, library)
        by_key = {s.key: s for s in specs}
        print(f"{len(specs):,} substances · {len(index):,} aliases · "
              f"{sum(1 for s in specs if s.type == 'class'):,} classes · "
              f"{sum(1 for s in specs if s.ingredient_id):,} linked to the library")
        if dry_run:
            print("[DRY RUN — nothing written]")
            return

        rows = [{
            "key": s.key, "name_en": s.name_en[:500], "type": s.type, "e_number": s.e_number,
            "inci_name": s.inci_name, "cas": (s.cas or None) and s.cas[:100], "wikidata": s.wikidata,
            "source": s.source, "license": s.license, "ingredient_id": s.ingredient_id,
        } for s in specs]
        for i in range(0, len(rows), CHUNK):
            stmt = insert(Substance).values(rows[i:i + CHUNK])
            stmt = stmt.on_conflict_do_update(index_elements=["key"], set_={
                c: stmt.excluded[c] for c in ("name_en", "type", "e_number", "inci_name", "cas", "wikidata", "license")
            } | {"ingredient_id": stmt.excluded.ingredient_id})
            await session.execute(stmt)
        ids = dict((await session.execute(select(Substance.key, Substance.id))).all())

        original: dict[str, tuple[str, str | None, str]] = {}
        for s in specs:
            for alias, lang in s.aliases:
                n = normalize_ingredient_alias(alias)
                if n and index.get(n) == s.key and n not in original:
                    original[n] = (alias, lang, s.source)
        alias_rows = [{
            "substance_id": ids[key], "alias": original.get(n, (n, None, ""))[0], "normalized_alias": n,
            "language": (original.get(n, (None, None))[1] or None) and original[n][1][:10],
            "source": by_key[key].source, "method": "taxonomy", "confidence": 1.0,
        } for n, key in index.items()]
        for i in range(0, len(alias_rows), CHUNK):
            await session.execute(insert(SubstanceAlias).values(alias_rows[i:i + CHUNK]).on_conflict_do_nothing(
                index_elements=["normalized_alias"]))
        await session.commit()
        print("✓ written. Attribution: Open Food Facts (ODbL), EU CosIng.")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--refresh", action="store_true", help="re-download the taxonomies")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    asyncio.run(run(a.refresh, a.dry_run))


if __name__ == "__main__":
    main()
