"""
Seed the most popular ingredients (data/top_ingredients.json) so they can be researched
and so scanned products link to them.

For each entry: the canonical ingredient (research_status=pending when new), an approved
alias for every name it appears under on labels — the only way ingestion links a
product's ingredient to it — and a link on product rows already stored under one of
those names. Re-running is safe: existing ingredients and their research are untouched.

    python -m scripts.seed_top_ingredients            # data/top_ingredients.json
    python -m scripts.seed_top_ingredients --dry-run  # report only
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_factory
from app.models.ingestion import IngredientAlias
from app.models.ingredient import Ingredient, ResearchStatus
from app.models.product import ProductIngredient
from app.services.ingestion.normalization import normalize_ingredient_alias

DATA = Path(__file__).resolve().parent.parent / "data" / "top_ingredients.json"
# "Sugar 30%" on a label is still sugar.
_TRAILING_PERCENT = re.compile(r"\s*\d+(?:[.,]\d+)?\s*%$")


def _label_key(name: str) -> str:
    return normalize_ingredient_alias(_TRAILING_PERCENT.sub("", name))


async def seed(session: AsyncSession, entries: list[dict]) -> dict[str, int]:
    existing = {
        ingredient.canonical_name.casefold(): ingredient
        for ingredient in (await session.execute(select(Ingredient))).scalars()
    }
    created = 0
    by_entry: list[tuple[Ingredient, list[str]]] = []
    for entry in entries:
        name = entry["canonical_name"]
        names = [name, *entry.get("aliases", [])]
        ingredient = existing.get(name.casefold())
        if ingredient is None:
            ingredient = Ingredient(
                canonical_name=name,
                category=entry["category"],
                synonyms=[a for a in entry.get("aliases", []) if a.casefold() != name.casefold()],
                research_status=ResearchStatus.PENDING,
            )
            session.add(ingredient)
            existing[name.casefold()] = ingredient
            created += 1
        by_entry.append((ingredient, names))
    await session.flush()

    known = set((await session.execute(
        select(IngredientAlias.ingredient_id, IngredientAlias.normalized_alias).where(
            IngredientAlias.language == "", IngredientAlias.market_country == ""
        )
    )).all())
    added = 0
    owners: dict[str, set[uuid.UUID]] = {}
    for ingredient, names in by_entry:
        for alias in names:
            key = normalize_ingredient_alias(alias)
            if not key:
                continue
            owners.setdefault(key, set()).add(ingredient.id)
            if (ingredient.id, key) in known:
                continue
            session.add(IngredientAlias(
                ingredient_id=ingredient.id, alias=alias, normalized_alias=key,
                alias_type="label_name", confidence=1.0, approved=True,
            ))
            known.add((ingredient.id, key))
            added += 1
    await session.flush()

    # A name two ingredients claim stays unlinked, as ingestion leaves it.
    unambiguous = {key: next(iter(ids)) for key, ids in owners.items() if len(ids) == 1}
    linked = 0
    rows = (await session.execute(
        select(ProductIngredient.id, ProductIngredient.name).where(ProductIngredient.ingredient_id.is_(None))
    )).all()
    for row_id, name in rows:
        ingredient_id = unambiguous.get(_label_key(name))
        if ingredient_id is not None:
            await session.execute(
                update(ProductIngredient).where(ProductIngredient.id == row_id).values(ingredient_id=ingredient_id)
            )
            linked += 1
    return {"ingredients_created": created, "aliases_added": added, "product_rows_linked": linked}


async def main(dry_run: bool) -> None:
    entries = json.loads(DATA.read_text())
    async with async_session_factory() as session:
        report = await seed(session, entries)
        if dry_run:
            await session.rollback()
        else:
            await session.commit()
    print(f"{'[dry run] ' if dry_run else ''}{len(entries)} entries: {report}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    asyncio.run(main(parser.parse_args().dry_run))
