"""Scan, product and search endpoints on top of the catalog index."""
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.api.v1.products import get_catalog_hydrator
from app.db.session import async_session_factory
from app.main import app
from app.models.catalog import CatalogEntry
from app.models.ingestion import DataSource
from app.models.product import Product
from app.services.catalog.hydration import HydrationResult
from app.services.catalog.records import normalize_search_text

pytestmark = pytest.mark.anyio

NUTELLA = "3017620422003"
NUTELLA_GTIN14 = "03017620422003"


class FakeHydrator:
    def __init__(self, status="queued", product_id=None):
        self.status, self.product_id = status, product_id
        self.calls: list[str] = []

    async def hydrate(self, db, *, digits, gtin14):
        self.calls.append(gtin14)
        job = SimpleNamespace(id=uuid.uuid4(), status="queued", product_id=None)
        return HydrationResult(self.status, self.product_id, job)


@pytest.fixture
def hydrator():
    holder = {"fake": FakeHydrator()}
    app.dependency_overrides[get_catalog_hydrator] = lambda: holder["fake"]
    yield holder
    app.dependency_overrides.pop(get_catalog_hydrator, None)


async def _entry(code=NUTELLA, name="Nutella", brand="Ferrero", popularity=100, countries=("FR", "US"), product_id=None):
    async with async_session_factory() as session:
        source_id = (await session.execute(select(DataSource.id).where(DataSource.slug == "open-food-facts"))).scalar_one()
        entry = CatalogEntry(
            source_id=source_id, external_id=code, gtin14=code.zfill(14), name=name, brand=brand, category="food",
            countries=list(countries), image_url="https://img.example/n.jpg", search_text=normalize_search_text(name, brand),
            popularity=popularity, content_hash=code, product_id=product_id,
        )
        session.add(entry)
        await session.commit()
        return entry.id


async def _product(name="Nutella", barcode=NUTELLA):
    async with async_session_factory() as session:
        product = Product(name=name, brand="Ferrero", category="food", barcode=barcode, extra_data={})
        session.add(product)
        await session.commit()
        return product.id


async def test_a_scan_found_only_in_the_index_hydrates_and_returns_the_product(client, hydrator):
    product_id = await _product()
    # The product exists only after hydration; the scan path looks it up by barcode first,
    # so give it a barcode the local lookup won't match before hydration.
    async with async_session_factory() as session:
        product = await session.get(Product, product_id)
        product.barcode = None
        await session.commit()
    await _entry()
    hydrator["fake"] = FakeHydrator("hydrated", product_id)

    response = await client.get(f"/api/v1/products/barcode/{NUTELLA}")

    assert response.status_code == 200
    assert response.json()["id"] == str(product_id)
    async with async_session_factory() as session:
        linked = (await session.execute(select(CatalogEntry.product_id))).scalar_one()
    assert linked == product_id


async def test_a_slow_hydration_returns_202_with_a_preview_from_the_index(client, hydrator):
    await _entry()
    response = await client.get(f"/api/v1/products/barcode/{NUTELLA}")
    assert response.status_code == 202
    body = response.json()
    assert body["preview"] == {"name": "Nutella", "brand": "Ferrero", "image_url": "https://img.example/n.jpg", "category": "food"}


async def test_a_barcode_nobody_has_is_202_without_a_preview(client, hydrator):
    response = await client.get(f"/api/v1/products/barcode/{NUTELLA}")
    assert response.status_code == 202
    assert response.json()["preview"] is None


async def test_unknown_barcodes_report_needs_review(client, hydrator):
    hydrator["fake"] = FakeHydrator("not_found")
    response = await client.get(f"/api/v1/products/barcode/{NUTELLA}")
    assert response.status_code == 202
    assert response.json()["status"] == "needs_review"


async def test_opening_an_unhydrated_catalog_id_hydrates_it(client, hydrator):
    product_id = await _product()
    entry_id = await _entry()
    hydrator["fake"] = FakeHydrator("hydrated", product_id)
    response = await client.get(f"/api/v1/products/catalog:{entry_id}")
    assert response.status_code == 200
    assert response.json()["id"] == str(product_id)
    assert hydrator["fake"].calls == [NUTELLA_GTIN14]


async def test_opening_a_hydrated_catalog_id_skips_hydration(client, hydrator):
    product_id = await _product()
    entry_id = await _entry(product_id=product_id)
    response = await client.get(f"/api/v1/products/catalog:{entry_id}")
    assert response.status_code == 200
    assert response.json()["id"] == str(product_id)
    assert hydrator["fake"].calls == []


async def test_an_unhydrated_catalog_id_that_times_out_returns_a_preview(client, hydrator):
    entry_id = await _entry()
    response = await client.get(f"/api/v1/products/catalog:{entry_id}")
    assert response.status_code == 202
    assert response.json()["preview"]["name"] == "Nutella"


@pytest.mark.parametrize("path", ["catalog:999999", "catalog:abc", "not-a-uuid"])
async def test_bad_product_ids_are_404(client, hydrator, path):
    assert (await client.get(f"/api/v1/products/{path}")).status_code == 404


async def test_search_merges_curated_and_catalog_results_without_duplicates(client, hydrator):
    product_id = await _product(name="Nutella")
    await _entry(code=NUTELLA, product_id=product_id)  # linked to the curated product
    await _entry(code="8000500310427", name="Nutella Biscuits", popularity=500)

    response = await client.get("/api/v1/products/search", params={"q": "nutella", "country": "US", "include_catalog": "true"})

    assert response.status_code == 200
    items = response.json()["products"]
    ids = [item["id"] for item in items]
    assert str(product_id) in ids
    assert len(ids) == len(set(ids)) == 2
    catalog_item = next(item for item in items if item["id"].startswith("catalog:"))
    assert catalog_item["name"] == "Nutella Biscuits"
    assert catalog_item["grade"] is None
    assert catalog_item["in_catalog_only"] is True


async def test_short_queries_search_curated_products_only(client, hydrator):
    await _product(name="Ab crunch")
    await _entry(code="8000500310427", name="Ab bar")
    items = (await client.get("/api/v1/products/search", params={"q": "ab", "include_catalog": "true"})).json()["products"]
    assert [item["name"] for item in items] == ["Ab crunch"]


async def test_older_app_builds_get_curated_results_only(client, hydrator):
    """Builds that predate catalog:<n> ids can't open them, so catalog hits are opt-in."""
    product_id = await _product(name="Nutella")
    await _entry(code="8000500310427", name="Nutella Biscuits", popularity=500)
    items = (await client.get("/api/v1/products/search", params={"q": "nutella"})).json()["products"]
    assert [item["id"] for item in items] == [str(product_id)]
