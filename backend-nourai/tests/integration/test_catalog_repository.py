"""Catalog index lookups: GTIN priority, multi-word search, query guards, product links."""
import pytest
from sqlalchemy import select, update

from app.db.session import async_session_factory
from app.models.catalog import CatalogEntry
from app.models.ingestion import DataSource
from app.models.product import Product
from app.repositories.catalog import CatalogRepository
from app.services.catalog.records import normalize_search_text

pytestmark = pytest.mark.anyio


async def _source(slug: str) -> DataSource:
    async with async_session_factory() as session:
        return (await session.execute(select(DataSource).where(DataSource.slug == slug))).scalar_one()


async def _add(slug, code, name, *, brand=None, category="food", popularity=0, gtin14=None):
    source = await _source(slug)
    async with async_session_factory() as session:
        entry = CatalogEntry(
            source_id=source.id, external_id=code, gtin14=gtin14 or code.zfill(14), name=name, brand=brand,
            category=category, countries=[], search_text=normalize_search_text(name, brand),
            popularity=popularity, content_hash=code,
        )
        session.add(entry)
        await session.commit()
        return entry.id


@pytest.fixture
async def enabled_sources():
    yield
    async with async_session_factory() as session:
        await session.execute(update(DataSource).values(enabled=True))
        await session.commit()


async def test_best_for_gtin_prefers_the_higher_priority_source(enabled_sources):
    await _add("open-beauty-facts", "obf-1", "Beauty copy", gtin14="03017620422003")
    await _add("open-food-facts", "3017620422003", "Nutella")
    repo = CatalogRepository(async_session_factory)
    assert (await repo.best_for_gtin("03017620422003")).name == "Nutella"


async def test_disabled_sources_are_ignored(enabled_sources):
    await _add("open-food-facts", "3017620422003", "Nutella")
    async with async_session_factory() as session:
        await session.execute(update(DataSource).where(DataSource.slug == "open-food-facts").values(enabled=False))
        await session.commit()
    repo = CatalogRepository(async_session_factory)
    assert await repo.best_for_gtin("03017620422003") is None
    assert await repo.search("nutella", category=None) == []


async def test_search_matches_every_word_and_ranks_prefix_then_popularity():
    await _add("open-food-facts", "1", "Biscuits with nutella", brand="Ferrero", popularity=900, gtin14="00000000000001")
    await _add("open-food-facts", "2", "Nutella", brand="Ferrero", popularity=10, gtin14="00000000000002")
    await _add("open-food-facts", "3", "Nutella", brand="Store brand", popularity=5000, gtin14="00000000000003")
    repo = CatalogRepository(async_session_factory)
    results = await repo.search("nut fer", category=None)
    assert [r.external_id for r in results] == ["2", "1"]


async def test_search_filters_by_category_and_caps_the_result_count():
    for i in range(5):
        await _add("open-food-facts", f"f{i}", f"Shampoo food {i}", gtin14=f"0000000000001{i}")
    await _add("open-beauty-facts", "b1", "Shampoo", category="cosmetic", gtin14="00000000000099")
    repo = CatalogRepository(async_session_factory)
    assert [r.external_id for r in await repo.search("shampoo", category="cosmetic")] == ["b1"]
    assert len(await repo.search("shampoo", category=None, limit=3)) == 3


async def test_unindexable_queries_return_nothing_without_querying():
    await _add("open-food-facts", "3017620422003", "M&M's")
    assert await CatalogRepository(async_session_factory).search("m&m's", category=None) == []


async def test_link_product_sets_every_entry_for_the_gtin():
    await _add("open-food-facts", "3017620422003", "Nutella")
    await _add("open-beauty-facts", "obf-1", "Beauty copy", gtin14="03017620422003")
    async with async_session_factory() as session:
        product = Product(name="Nutella", category="food", extra_data={})
        session.add(product)
        await session.commit()
        product_id = product.id
    repo = CatalogRepository(async_session_factory)
    await repo.link_product("03017620422003", product_id)
    async with async_session_factory() as session:
        linked = (await session.execute(select(CatalogEntry.product_id))).scalars().all()
    assert linked == [product_id, product_id]


async def test_get_returns_an_entry_by_id():
    entry_id = await _add("open-food-facts", "3017620422003", "Nutella")
    repo = CatalogRepository(async_session_factory)
    assert (await repo.get(entry_id)).name == "Nutella"
    assert await repo.get(999_999) is None


async def test_an_unpopular_name_prefix_match_survives_a_window_full_of_popular_matches():
    for i in range(70):
        await _add("open-food-facts", f"p{i}", f"Spread with nutella {i}", popularity=1000 + i, gtin14=f"000000000{i:05d}")
    await _add("open-food-facts", "rare", "Nutella", popularity=0, gtin14="00000000099999")
    results = await CatalogRepository(async_session_factory).search("nutella", category=None, limit=60)
    assert len(results) == 60
    assert results[0].external_id == "rare"
