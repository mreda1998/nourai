"""A product found only in a US source is ingested under that source's provenance and licence."""
import pytest
from sqlalchemy import select

from app.db.session import async_session_factory
from app.models.ingestion import DataSource, SourceRecord
from app.models.product import Product
from app.services.ingestion.connectors.base import SourceNotFound
from app.services.ingestion.connectors.chain import ConnectorChain
from app.services.ingestion.connectors.openfda import OPENFDA, openfda_product
from app.services.ingestion.connectors.openfoodfacts import OpenFoodFactsRecord
from app.services.ingestion.product_pipeline import ProductIngestionPipeline
from app.services.ingestion.queue import IngestionQueue

pytestmark = pytest.mark.anyio

UPC = "0086800103554"
GTIN14 = "00086800103554"
SUNSCREEN = {
    "product_type": "HUMAN OTC DRUG", "marketing_category": "OTC MONOGRAPH DRUG", "route": ["TOPICAL"],
    "brand_name": "Neutrogena Ultra Sheer Face Serum Sunscreen SPF 60", "labeler_name": "Kenvue Brands LLC",
    "dosage_form": "LOTION", "active_ingredients": [{"name": "AVOBENZONE", "strength": "30 mg/mL"}],
    "packaging": [], "product_ndc": "69968-0829",
}


class NotInOpenFoodFacts:
    async def fetch_product(self, barcode):
        raise SourceNotFound("off")


class FakeOpenFDA:
    async def fetch_product(self, barcode):
        return OpenFoodFactsRecord(
            barcode=barcode, request_url="https://api.fda.gov/drug/ndc.json?search=x", schema_version="openfda-ndc",
            product=openfda_product(SUNSCREEN, {"inactive_ingredient": ["Inactive ingredients Water, Glycerin"]}),
            source=OPENFDA,
        )


async def test_an_openfda_product_is_ingested_as_a_cosmetic_under_openfdas_licence():
    queue = IngestionQueue(async_session_factory)
    async with async_session_factory() as session:
        job = await queue.enqueue(
            session, job_type="product_barcode", idempotency_key=f"barcode:test:{GTIN14}",
            payload={"barcode": UPC, "gtin14": GTIN14}, priority=50,
        )
        await session.commit()

    pipeline = ProductIngestionPipeline(ConnectorChain([NotInOpenFoodFacts(), FakeOpenFDA()]))
    async with async_session_factory() as session:
        result = await pipeline.ingest_barcode(session, barcode=UPC, gtin14=GTIN14, job=job)

    assert not result.needs_review
    async with async_session_factory() as session:
        product = await session.get(Product, result.product_id)
        record = await session.get(SourceRecord, result.source_record_id)
        source = await session.get(DataSource, record.source_id)
    assert (product.name, product.category) == ("Neutrogena Ultra Sheer Face Serum Sunscreen SPF 60", "cosmetic")
    assert product.extra_data["source"] == "openfda"
    assert product.extra_data["ingredients_text"] == "Avobenzone 3%, Water, Glycerin"
    assert source.slug == "openfda"
    assert record.license_snapshot["name"] == "Public Domain (CC0 1.0)"
