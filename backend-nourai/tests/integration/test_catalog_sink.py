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


async def test_new_gtins_only_skips_products_another_source_already_indexes():
    from app.services.catalog.importer import DryRunSink
    from app.services.catalog.sink import NewGtinsOnly

    off = PostgresCatalogSink(async_session_factory, await _source_id())
    await off.write_batch([row("3017620422003")])
    async with async_session_factory() as session:
        usda_id = (await session.execute(select(DataSource.id).where(DataSource.slug == "usda-fooddata-central"))).scalar_one()

    dry = NewGtinsOnly(DryRunSink(), async_session_factory, usda_id)
    assert await dry.write_batch([row("3017620422003"), row("49000006346")]) == (0, 0)
    assert (dry.rows, dry.held_elsewhere) == (1, 1)

    usda = NewGtinsOnly(PostgresCatalogSink(async_session_factory, usda_id), async_session_factory, usda_id)
    assert await usda.write_batch([row("3017620422003"), row("49000006346")]) == (1, 0)
    # Its own rows aren't "held elsewhere": a re-run updates them.
    assert await usda.write_batch([row("49000006346", "Coca-Cola")]) == (0, 1)
    assert usda.held_elsewhere == 1
