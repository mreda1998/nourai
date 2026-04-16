"""
Show the top unmatched ingredient names by frequency — candidates for the
next golden set batch.

Usage:
    python -m scripts.suggest_new_ingredients          # top 50
    python -m scripts.suggest_new_ingredients --limit 100
    make suggest-new-ingredients
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


async def suggest(limit: int) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(
            text(
                """
                SELECT name_raw, count, last_seen_at
                FROM   unmatched_ingredient_log
                ORDER  BY count DESC
                LIMIT  :limit
                """
            ),
            {"limit": limit},
        )
        rows = result.fetchall()

    await engine.dispose()

    if not rows:
        print("No unmatched ingredients logged yet.")
        print("Scan or fetch some products first, then run this again.")
        return

    print(f"\nTop {len(rows)} unmatched ingredients by scan frequency")
    print("(Add promising ones to data/golden_set_ingredients.csv, then run make seed-golden-set)\n")
    print(f"{'#':>3}  {'Count':>6}  {'Last Seen':<12}  Name")
    print("─" * 60)
    for i, (name, count, last_seen) in enumerate(rows, 1):
        date_str = last_seen.strftime("%Y-%m-%d") if last_seen else "unknown"
        print(f"{i:>3}  {count:>6}  {date_str:<12}  {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Suggest new golden set ingredients")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    asyncio.run(suggest(args.limit))


if __name__ == "__main__":
    main()
