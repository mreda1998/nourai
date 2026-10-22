"""
Reads and links on the catalog index. Every method runs in its own short
transaction — catalog search sets a statement timeout with SET LOCAL, which
must not leak into the rest of a request.
"""
from __future__ import annotations

import asyncio
import logging
import re
import uuid

from sqlalchemy import select, text, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.catalog import CatalogEntry
from app.models.ingestion import DataSource
from app.services.catalog.records import normalize_search_text

logger = logging.getLogger(__name__)

# The trigram index needs a run of 3+ word characters; shorter or symbol-only
# queries ("ab", "m&m's") would scan the whole table.
_INDEXABLE = re.compile(r"[a-z0-9]{3,}")

# Planner settings for each racing query; a plan not listed here is the planner's choice.
# Both racers are pinned: the planner badly underestimates common words ("chocolate":
# 357 rows estimated, 94k real) and, left to choose, sent both down the trigram bitmap.
_PLANS = {
    # Walk the covering popularity index, index-only, until the window is full. No sorts:
    # expecting few matches, the planner would scan the whole index and sort ("olive oil").
    "walk": ("enable_bitmapscan = off", "enable_seqscan = off", "enable_sort = off"),
    # No index or table scans: forces the trigram bitmap, never the popularity walk.
    "bitmap": ("enable_indexscan = off", "enable_seqscan = off"),
}


class CatalogSearchTimeout(RuntimeError):
    """The catalog query hit its statement timeout; callers fall back to curated search."""


def catalog_query_ok(query: str) -> bool:
    return bool(_INDEXABLE.search(normalize_search_text(query)))


def _like_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class CatalogRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = session_factory

    async def best_for_gtin(self, gtin14: str) -> CatalogEntry | None:
        async with self._sessions() as session:
            return (
                await session.execute(
                    select(CatalogEntry)
                    .join(DataSource, DataSource.id == CatalogEntry.source_id)
                    .where(CatalogEntry.gtin14 == gtin14, DataSource.enabled.is_(True))
                    .order_by(DataSource.priority.asc(), CatalogEntry.popularity.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()

    async def get(self, entry_id: int) -> CatalogEntry | None:
        async with self._sessions() as session:
            return await session.get(CatalogEntry, entry_id)

    async def search(
        self,
        query: str,
        *,
        category: str | None,
        limit: int = 60,
        # Warm searches take ~20 ms; the budget covers a cold cache, where a common
        # word's first search can take ~0.5 s. Timing out returns no catalog results.
        timeout_ms: int = 800,
        prefix_timeout_ms: int = 150,
    ) -> list[CatalogEntry]:
        if not catalog_query_ok(query):
            return []
        q = normalize_search_text(query)
        words = [w for w in q.split() if len(w) >= 2]
        base = (
            select(CatalogEntry)
            .join(DataSource, DataSource.id == CatalogEntry.source_id)
            .where(
                DataSource.enabled.is_(True),
                *(CatalogEntry.search_text.like(f"%{_like_escape(w)}%", escape="\\") for w in words),
            )
        )
        if category:
            base = base.where(CatalogEntry.category == category)
        # Two small popularity-ordered queries instead of one "prefix first" sort, which had
        # to fetch every match of a common word ("chocolate": 100k+ rows). They run in
        # parallel, each in its own transaction: the popular query is the result (its
        # timeout falls back to curated search); the prefix query only adds names that
        # start with the query, so if it's slow it's skipped. rank() re-sorts in Python.
        prefix = base.where(
            CatalogEntry.search_text.like(f"{_like_escape(q.split()[0])}%", escape="\\")
        ).order_by(CatalogEntry.popularity.desc()).limit(max(limit // 2, 1))
        # The window's ids come from index columns alone (an index-only walk); only the
        # rows that made the window are then read from the table. Those rows are ordered
        # here, not in SQL: the walk disables sorts, and an outer ORDER BY would then be
        # met by walking the whole table in popularity order.
        window = base.with_only_columns(CatalogEntry.id).order_by(CatalogEntry.popularity.desc()).limit(limit)
        popular = select(CatalogEntry).where(CatalogEntry.id.in_(window.scalar_subquery()))

        popular_rows, prefix_rows = await asyncio.gather(
            self._race(popular, timeout_ms, query),
            self._run_prefix(prefix, prefix_timeout_ms, query),
            return_exceptions=True,
        )
        if isinstance(popular_rows, BaseException):
            raise popular_rows
        if isinstance(prefix_rows, CatalogSearchTimeout):
            prefix_rows = []
        elif isinstance(prefix_rows, BaseException):
            raise prefix_rows
        popular_rows = sorted(popular_rows, key=lambda entry: entry.popularity, reverse=True)
        unique = {entry.id: entry for entry in [*prefix_rows, *popular_rows]}
        return list(unique.values())[:limit]

    async def _run_prefix(self, stmt, timeout_ms: int, query: str) -> list[CatalogEntry]:
        # Best effort, planner's choice: it only adds names that start with the query.
        return await self._run(stmt, timeout_ms, query)

    async def _race(self, stmt, timeout_ms: int, query: str) -> list[CatalogEntry]:
        """Run the popular query under both plans and keep whichever answers first.

        Walking the popularity index is fast when a word is common and slow when it is
        rare; the trigram bitmap is the reverse. The planner often guesses wrong
        ("shampoo"), and both plans return the same rows, so race them.
        """
        tasks = [
            asyncio.create_task(self._run(stmt, timeout_ms, query, plan="walk")),
            asyncio.create_task(self._run(stmt, timeout_ms, query, plan="bitmap")),
        ]
        failure: BaseException | None = None
        try:
            for finished in asyncio.as_completed(tasks):
                try:
                    return await finished
                except CatalogSearchTimeout as exc:
                    failure = exc
            assert failure is not None
            raise failure
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _configure(self, session: AsyncSession, timeout_ms: int, plan: str | None) -> None:
        await session.execute(text(f"SET LOCAL statement_timeout = {int(timeout_ms)}"))
        for setting in _PLANS.get(plan, ()):
            await session.execute(text(f"SET LOCAL {setting}"))
        # Bound LIKE patterns hide the search word from a cached generic plan, which
        # then walks the popularity index even for rare words ("shampoo": millions of
        # rows). Plan each search for its actual words.
        await session.execute(text("SET LOCAL plan_cache_mode = force_custom_plan"))

    async def _run(self, stmt, timeout_ms: int, query: str, *, plan: str | None = None) -> list[CatalogEntry]:
        async with self._sessions() as session:
            async with session.begin():
                await self._configure(session, timeout_ms, plan)
                try:
                    return list((await session.execute(stmt)).scalars().all())
                except DBAPIError as exc:
                    if "statement timeout" in str(exc).lower():
                        logger.warning("catalog search timed out for %r", query)
                        raise CatalogSearchTimeout(query) from exc
                    raise

    async def link_product(self, gtin14: str, product_id: uuid.UUID) -> None:
        async with self._sessions() as session:
            await session.execute(
                update(CatalogEntry).where(CatalogEntry.gtin14 == gtin14).values(product_id=product_id)
            )
            await session.commit()
