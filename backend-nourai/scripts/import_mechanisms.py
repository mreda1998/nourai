"""Fill layer 3 (mechanism facts + viewer assets) from open databases.

Usage:
  python scripts/import_mechanisms.py --ingredient Creatine [--ingredient Caffeine ...]
  python scripts/import_mechanisms.py --top 50        # most-used active compounds
  python scripts/import_mechanisms.py --ingredient Creatine --dry-run
  python scripts/import_mechanisms.py --ingredient Creatine --record tests/fixtures/mechanisms

Idempotent. Reviewed (pinned) assets are never overwritten.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import func, select  # noqa: E402

from app.db.session import async_session_factory  # noqa: E402
from app.models.ingredient import Ingredient  # noqa: E402
from app.models.pathway import PathwayRoute, RouteNode, RouteStatus  # noqa: E402
from app.models.product import ProductIngredient  # noqa: E402
from app.services.mechanisms.clients import HttpMechanismClients, RecordingClients  # noqa: E402
from app.services.mechanisms.job import build_mechanism, persist_mechanism  # noqa: E402


async def _targets(session, names: list[str], top: int | None) -> list[Ingredient]:
    if names:
        rows = []
        for n in names:
            ing = (await session.execute(
                select(Ingredient).where(func.lower(Ingredient.canonical_name) == n.lower())
            )).scalar_one_or_none()
            if ing is None:
                print(f"✗ {n}: not in the library")
            else:
                rows.append(ing)
        return rows
    # Most-used compounds: forms count toward their active moiety.
    compound = func.coalesce(Ingredient.active_moiety_id, Ingredient.id)
    counts = (await session.execute(
        select(compound, func.count(ProductIngredient.id))
        .join(ProductIngredient, ProductIngredient.ingredient_id == Ingredient.id)
        .group_by(compound).order_by(func.count(ProductIngredient.id).desc()).limit(top)
    )).all()
    return [await session.get(Ingredient, cid) for cid, _ in counts]


async def _route_pathways(session, ingredient_id) -> list[tuple[str, str]]:
    """Reactome ids named in the compound's reviewed route (e.g. psyllium, a fibre)."""
    rows = (await session.execute(
        select(RouteNode.label, RouteNode.bio_entity_id)
        .join(PathwayRoute, PathwayRoute.id == RouteNode.route_id)
        .where(PathwayRoute.ingredient_id == ingredient_id, PathwayRoute.status == RouteStatus.PUBLISHED.value)
    )).all()
    from app.models.pathway import BioEntity
    out = []
    for label, entity_id in rows:
        if entity_id:
            e = await session.get(BioEntity, entity_id)
            if e and e.reactome_id and re.match(r"^R-HSA-\d+$", e.reactome_id):
                out.append((e.reactome_id, label))
    return out


async def run(names: list[str], top: int | None, dry_run: bool, record: Path | None) -> None:
    http = HttpMechanismClients()
    async with async_session_factory() as session:
        for ingredient in await _targets(session, names, top):
            clients = http
            if record:
                record.mkdir(parents=True, exist_ok=True)
                slug = re.sub(r"[^a-z0-9]+", "-", ingredient.canonical_name.lower()).strip("-")
                clients = RecordingClients(http, record / f"{slug}.json")
            extra = await _route_pathways(session, ingredient.id)
            result = build_mechanism(ingredient.canonical_name, clients, extra_pathways=extra)
            summary = (f"ChEBI {result.chebi_id or '—'} · {len(result.pathways)} pathways · "
                       f"{len(result.sl_ids)} cell locations · structure {result.structure['pdb_id'] if result.structure else '—'}")
            if not dry_run:
                # Persist even when nothing was found, so stale automatic assets are removed.
                await persist_mechanism(session, ingredient, result)
            if not result.found_anything:
                print(f"· {ingredient.canonical_name}: nothing found ({summary})")
            else:
                print(f"{'·' if dry_run else '✓'} {ingredient.canonical_name}: {summary}")
        if dry_run:
            await session.rollback()
            print("\n[DRY RUN — nothing written]")
        else:
            await session.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ingredient", action="append", default=[])
    parser.add_argument("--top", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--record", type=Path)
    args = parser.parse_args()
    if not args.ingredient and not args.top:
        parser.error("pass --ingredient NAME or --top N")
    asyncio.run(run(args.ingredient, args.top, args.dry_run, args.record))


if __name__ == "__main__":
    main()
