"""Write catalog rows to PostgreSQL: batched upserts, a resume checkpoint, a size budget."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, literal_column, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.catalog import CatalogEntry
from app.models.ingestion import DataSource
from app.services.catalog.importer import ImportAborted, ImportStats
from app.services.catalog.records import CatalogRow

_UPDATABLE = (
    "gtin14", "name", "brand", "category", "countries", "image_url", "search_text",
    "popularity", "completeness", "source_updated_at", "content_hash",
)


class PostgresCatalogSink:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        source_id: uuid.UUID,
        *,
        max_db_bytes: int = 7_000_000_000,
    ) -> None:
        self._sessions = session_factory
        self._source_id = source_id
        self._max_db_bytes = max_db_bytes

    async def write_batch(self, rows: list[CatalogRow]) -> tuple[int, int]:
        # ON CONFLICT can't touch one row twice per statement; the last copy of a code wins.
        unique = {row.external_id: row for row in rows}
        values = [
            {
                "source_id": self._source_id,
                "external_id": row.external_id,
                "gtin14": row.gtin14,
                "name": row.name,
                "brand": row.brand,
                "category": row.category,
                "countries": list(row.countries),
                "image_url": row.image_url,
                "search_text": row.search_text,
                "popularity": row.popularity,
                "completeness": row.completeness,
                "source_updated_at": row.source_updated_at,
                "content_hash": row.content_hash,
            }
            for row in unique.values()
        ]
        if not values:
            return 0, 0
        stmt = insert(CatalogEntry).values(values)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_catalog_entry_source_external",
            set_={**{col: getattr(stmt.excluded, col) for col in _UPDATABLE}, "imported_at": func.now()},
            where=CatalogEntry.content_hash != stmt.excluded.content_hash,
        ).returning(literal_column("(xmax = 0)"))
        async with self._sessions() as session:
            flags = (await session.execute(stmt)).scalars().all()
            await session.commit()
        inserted = sum(1 for flag in flags if flag)
        return inserted, len(flags) - inserted

    async def checkpoint(self, line: int, stats: ImportStats) -> None:
        await self._record({"line": line, "stats": stats.as_dict(top_additives=0), "at": _now()})

    async def finish(self, stats: ImportStats, *, url: str) -> None:
        await self._record({"line": 0, "completed_at": _now(), "url": url, "stats": stats.as_dict()})

    async def resume_line(self) -> int:
        async with self._sessions() as session:
            extra = (
                await session.execute(select(DataSource.extra_data).where(DataSource.id == self._source_id))
            ).scalar_one()
        return int(((extra or {}).get("catalog_import") or {}).get("line") or 0)

    async def check_size(self) -> None:
        async with self._sessions() as session:
            size = (await session.execute(text("SELECT pg_database_size(current_database())"))).scalar_one()
        if size > self._max_db_bytes:
            raise ImportAborted(
                f"database is {size / 1e9:.2f} GB, over the {self._max_db_bytes / 1e9:.1f} GB budget"
            )

    async def _record(self, value: dict) -> None:
        async with self._sessions() as session:
            source = await session.get(DataSource, self._source_id)
            source.extra_data = {**(source.extra_data or {}), "catalog_import": value}
            await session.commit()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
