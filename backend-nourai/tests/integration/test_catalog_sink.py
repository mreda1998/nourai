"""Upserts into catalog_entries count inserts and real changes, and skip unchanged rows."""
import pytest
from sqlalchemy import func, select

from app.db.session import async_session_factory
from app.models.catalog import CatalogEntry
from app.models.ingestion import DataSource
from app.services.catalog.importer import ImportStats
from app.services.catalog.records import CatalogRow
from app.services.catalog.sink import PostgresCatalogSink

pytestmark = pytest.mark.anyio


def row(code: str, name: str = "Nutella") -> CatalogRow:
    return CatalogRow(
        external_id=code, gtin14=code.zfill(14), name=name, brand="Ferrero", category="food",
        countries=("FR",), image_url=None, popularity=10, completeness=0.5, source_updated_at=None,
        search_text=name.lower(), content_hash=f"{code}:{name}",
    )


async def _source_id():
    async with async_session_factory() as session:
        return (await session.execute(select(DataSource.id).where(DataSource.slug == "open-food-facts"))).scalar_one()


async def test_upsert_counts_inserts_changes_and_ignores_unchanged_rows():
    sink = PostgresCatalogSink(async_session_factory, await _source_id())
    assert await sink.write_batch([row("3017620422003"), row("49000006346")]) == (2, 0)
    assert await sink.write_batch([row("3017620422003"), row("49000006346")]) == (0, 0)
    assert await sink.write_batch([row("3017620422003", "Nutella B-ready")]) == (0, 1)
    async with async_session_factory() as session:
        assert (await session.execute(select(func.count()).select_from(CatalogEntry))).scalar_one() == 2


async def test_duplicate_codes_in_one_batch_keep_the_last_copy():
    sink = PostgresCatalogSink(async_session_factory, await _source_id())
    assert await sink.write_batch([row("3017620422003", "Old"), row("3017620422003", "New")]) == (1, 0)
    async with async_session_factory() as session:
        names = (await session.execute(select(CatalogEntry.name))).scalars().all()
    assert names == ["New"]


async def test_checkpoint_round_trips_and_size_budget_is_enforced():
    from app.services.catalog.importer import ImportAborted

    sink = PostgresCatalogSink(async_session_factory, await _source_id(), max_db_bytes=1)
    await sink.checkpoint(1234, ImportStats(read=1234))
    assert await sink.resume_line() == 1234
    with pytest.raises(ImportAborted):
        await sink.check_size()
