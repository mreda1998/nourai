"""Catalog index lookups: GTIN priority, multi-word search, query guards, product links."""
import pytest
from sqlalchemy import select, text, update

from app.db.session import async_session_factory, engine
from app.models.catalog import CatalogEntry
from app.models.ingestion import DataSource
from app.models.product import Product
from app.repositories.catalog import CatalogRepository
from app.services.catalog.records import normalize_search_text

pytestmark = pytest.mark.anyio


async def _source(slug: str) -> DataSource:
    async with async_session_factory() as session:
        return (await session.execute(select(DataSource).where(DataSource.slug == slug))).scalar_one()


async def _add(slug, code, name, *, brand=None, category="food", popularity=0, gtin14=None, countries=()):
    source = await _source(slug)
    async with async_session_factory() as session:
        entry = CatalogEntry(
            source_id=source.id, external_id=code, gtin14=gtin14 or code.zfill(14), name=name, brand=brand,
            category=category, countries=list(countries), search_text=normalize_search_text(name, brand),
            popularity=popularity, content_hash=code,
        )
        session.add(entry)
        await session.commit()
        return entry.id


async def _vacuum_catalog() -> None:
    """Production's bulk-loaded catalog is vacuumed, so the planner can trust index-only scans."""
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        await conn.execute(text("VACUUM ANALYZE catalog_entries"))


async def _explain(session, stmt) -> str:
    sql = stmt.compile(dialect=session.bind.dialect, compile_kwargs={"literal_binds": True})
    return "\n".join((await session.execute(text(f"EXPLAIN {sql}"))).scalars())


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


async def test_a_slow_prefix_query_is_skipped_not_fatal(monkeypatch):
    """The prefix query only improves the window; if it times out, popular matches still return."""
    from app.repositories.catalog import CatalogSearchTimeout

    await _add("open-food-facts", "1", "Chocolate bar", popularity=50, gtin14="00000000000001")
    repo = CatalogRepository(async_session_factory)

    async def slow_prefix(*args, **kwargs):
        raise CatalogSearchTimeout("chocolate")

    monkeypatch.setattr(repo, "_run_prefix", slow_prefix)
    results = await repo.search("chocolate", category=None)
    assert [r.external_id for r in results] == ["1"]


async def test_when_one_query_plan_times_out_the_other_answers(monkeypatch):
    """Popular-first index walks are fast for common words, trigram bitmaps for rare ones; we race both."""
    from app.repositories.catalog import CatalogSearchTimeout

    await _add("open-beauty-facts", "s1", "Shampoo", category="cosmetic", gtin14="00000000000001")
    repo = CatalogRepository(async_session_factory)
    real_run = repo._run

    async def index_walk_times_out(stmt, timeout_ms, query, *, plan=None):
        if plan != "bitmap":
            raise CatalogSearchTimeout(query)
        return await real_run(stmt, timeout_ms, query, plan=plan)

    monkeypatch.setattr(repo, "_run", index_walk_times_out)
    assert [r.external_id for r in await repo.search("shampoo", category=None)] == ["s1"]


async def _french_window_and_a_few_us_products():
    """Like production: the popular matches are French, the few US ones barely scanned."""
    for i in range(70):
        await _add(
            "open-beauty-facts", f"fr{i}", f"Shampooing {i}", category="cosmetic",
            popularity=1000 + i, gtin14=f"000000000{i:05d}", countries=("FR",),
        )
    for i in range(5):
        await _add(
            "open-beauty-facts", f"us{i}", f"Anti dandruff shampoo {i}", category="cosmetic",
            popularity=i, gtin14=f"000000001{i:05d}", countries=("US", "CA"),
        )


async def test_a_country_fills_half_the_window_with_products_sold_there():
    await _french_window_and_a_few_us_products()
    repo = CatalogRepository(async_session_factory)

    global_ids = {r.external_id for r in await repo.search("shampoo", category="cosmetic", limit=60)}
    regional = await repo.search("shampoo", category="cosmetic", country="us", limit=60)

    assert not any(code.startswith("us") for code in global_ids)
    assert len(regional) == 60
    assert {r.external_id for r in regional} >= {f"us{i}" for i in range(5)}


@pytest.mark.parametrize("country", ["", "U", "USA", "1A", "É"])
async def test_a_country_that_is_not_an_iso_code_is_ignored(country):
    await _french_window_and_a_few_us_products()
    results = await CatalogRepository(async_session_factory).search("shampoo", category=None, country=country)
    assert not any(r.external_id.startswith("us") for r in results)


async def test_a_slow_regional_query_is_skipped_not_fatal(monkeypatch):
    from app.repositories.catalog import CatalogSearchTimeout

    await _add("open-food-facts", "1", "Chicken breast", popularity=50, gtin14="00000000000001", countries=("US",))
    repo = CatalogRepository(async_session_factory)
    real_run = repo._run

    async def regional_times_out(stmt, timeout_ms, query, *, plan=None):
        if "= ANY (catalog_entries.countries)" in str(stmt):
            raise CatalogSearchTimeout(query)
        return await real_run(stmt, timeout_ms, query, plan=plan)

    monkeypatch.setattr(repo, "_run", regional_times_out)
    assert [r.external_id for r in await repo.search("chicken", category=None, country="US")] == ["1"]


@pytest.mark.parametrize(
    ("category", "walked_index"),
    [(None, "ix_catalog_entries_popularity_region"), ("cosmetic", "ix_catalog_entries_category_popularity_region")],
)
async def test_the_regional_walk_filters_countries_without_reading_the_table(monkeypatch, category, walked_index):
    """In production, filtering countries from the table cost a page read per candidate (1.1 s)."""
    await _french_window_and_a_few_us_products()
    await _vacuum_catalog()
    repo = CatalogRepository(async_session_factory)
    real_run = repo._run
    regional_walks: list[str] = []

    async def explain_then_run(stmt, timeout_ms, query, *, plan=None):
        if plan == "walk" and "= ANY (catalog_entries.countries)" in str(stmt):
            async with async_session_factory() as session, session.begin():
                await repo._configure(session, timeout_ms, plan)
                regional_walks.append(await _explain(session, stmt))
        return await real_run(stmt, timeout_ms, query, plan=plan)

    monkeypatch.setattr(repo, "_run", explain_then_run)
    await repo.search("shampoo", category=category, country="US")
    [walk] = regional_walks
    assert f"Index Only Scan using {walked_index}" in walk
    assert "Bitmap" not in walk


@pytest.mark.parametrize(
    ("query", "category", "walked_index"),
    [
        ("chocolate", None, "ix_catalog_entries_popularity_region"),
        ("chocolate scrub", None, "ix_catalog_entries_popularity_region"),
        ("chocolate", "cosmetic", "ix_catalog_entries_category_popularity_region"),
    ],
)
async def test_each_racing_query_is_pinned_to_its_own_plan(monkeypatch, query, category, walked_index):
    """In production the planner misjudged common words ("chocolate": 357 rows estimated, 94k
    real) and sent both racers down the trigram bitmap, so every common-word search timed out.
    One racer must walk popularity order without reading the table; the other must use a bitmap."""
    for i in range(20):
        await _add(
            "open-beauty-facts", f"c{i}", f"Chocolate scrub {i}", category="cosmetic",
            popularity=i, gtin14=f"0000000000{i:04d}",
        )
    await _vacuum_catalog()
    repo = CatalogRepository(async_session_factory)
    real_run = repo._run
    plans: dict[str | None, str] = {}

    async def explain_then_run(stmt, timeout_ms, query, *, plan=None):
        async with async_session_factory() as session, session.begin():
            await repo._configure(session, timeout_ms, plan)
            plans[plan] = await _explain(session, stmt)
        return await real_run(stmt, timeout_ms, query, plan=plan)

    monkeypatch.setattr(repo, "_run", explain_then_run)
    assert len(await repo.search(query, category=category)) == 20
    walk, bitmap = plans["walk"], plans["bitmap"]
    assert f"Index Only Scan using {walked_index}" in walk
    assert "Bitmap" not in walk
    assert "Bitmap Index Scan" in bitmap
    assert "Index Only Scan" not in bitmap
    assert "Seq Scan on catalog_entries" not in bitmap


async def test_catalog_queries_never_use_parallel_workers(monkeypatch):
    """In production the planner ran the popularity walk with parallel workers: they raced
    far past the LIMIT ("rice crackers": 1.1M index entries and 6.8 s for 60 rows, against
    0.15 s for a similar search run by one process), so cold searches timed out empty.
    Here parallelism is made free, so the planner picks it unless the search forbids it."""
    for i in range(300):
        await _add("open-food-facts", f"r{i}", f"Rice crackers {i}", popularity=i, gtin14=f"00000000{i:06d}", countries=("US",))
    await _vacuum_catalog()
    repo = CatalogRepository(async_session_factory)
    real_run = repo._run
    plans: list[str] = []

    async def explain_then_run(stmt, timeout_ms, query, *, plan=None):
        async with async_session_factory() as session, session.begin():
            for setting in ("parallel_setup_cost = 0", "parallel_tuple_cost = 0",
                            "min_parallel_index_scan_size = 0", "min_parallel_table_scan_size = 0"):
                await session.execute(text(f"SET LOCAL {setting}"))
            await repo._configure(session, timeout_ms, plan)
            plans.append(await _explain(session, stmt))
        return await real_run(stmt, timeout_ms, query, plan=plan)

    monkeypatch.setattr(repo, "_run", explain_then_run)
    await repo.search("rice crackers", category=None, country="US")
    assert len(plans) == 5  # popular walk + bitmap, prefix, regional walk + bitmap
    assert not [p for p in plans if "Gather" in p]


async def test_when_both_query_plans_time_out_the_search_times_out(monkeypatch):
    from app.repositories.catalog import CatalogSearchTimeout

    repo = CatalogRepository(async_session_factory)

    async def always_times_out(stmt, timeout_ms, query, *, plan=None):
        raise CatalogSearchTimeout(query)

    monkeypatch.setattr(repo, "_run", always_times_out)
    with pytest.raises(CatalogSearchTimeout):
        await repo.search("shampoo", category=None)
