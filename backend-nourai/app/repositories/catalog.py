"""
Reads and links on the catalog index. Every method runs in its own short
transaction — catalog search sets a statement timeout with SET LOCAL, which
must not leak into the rest of a request.
"""
from __future__ import annotations

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
        timeout_ms: int = 300,
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
        # to fetch every match of a common word ("chocolate": 100k+ rows). The first keeps
        # names that start with the query even when they're not popular; rank() re-sorts.
        prefix = base.where(
            CatalogEntry.search_text.like(f"{_like_escape(q.split()[0])}%", escape="\\")
        ).order_by(CatalogEntry.popularity.desc()).limit(max(limit // 2, 1))
        popular = base.order_by(CatalogEntry.popularity.desc()).limit(limit)

        async with self._sessions() as session:
            async with session.begin():
                await session.execute(text(f"SET LOCAL statement_timeout = {int(timeout_ms)}"))
                try:
                    found = list((await session.execute(prefix)).scalars().all())
                    found += (await session.execute(popular)).scalars().all()
                except DBAPIError as exc:
                    if "statement timeout" in str(exc).lower():
                        logger.warning("catalog search timed out for %r", query)
                        raise CatalogSearchTimeout(query) from exc
                    raise
        unique = {entry.id: entry for entry in found}
        return list(unique.values())[:limit]

    async def link_product(self, gtin14: str, product_id: uuid.UUID) -> None:
        async with self._sessions() as session:
            await session.execute(
                update(CatalogEntry).where(CatalogEntry.gtin14 == gtin14).values(product_id=product_id)
            )
            await session.commit()
