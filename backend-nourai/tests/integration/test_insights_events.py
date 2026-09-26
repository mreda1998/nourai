import pytest
from sqlalchemy import select

from app.models.tester import TesterEvent

pytestmark = pytest.mark.anyio

HEADERS = {"X-Device-Id": "device-abc-123", "X-App-Version": "1.0.0"}


async def test_client_event_is_stored(client, db_session):
    response = await client.post(
        "/api/v1/insights/events",
        json={"type": "search", "query": "  CeraVe cleanser ", "meta": {"results": 0}},
        headers=HEADERS,
    )
    assert response.status_code == 204
    event = (await db_session.execute(select(TesterEvent))).scalar_one()
    assert (event.event_type, event.query, event.meta, event.app_version) == (
        "search",
        "CeraVe cleanser",
        {"results": 0},
        "1.0.0",
    )


async def test_barcode_miss_records_queued_scan(client, db_session):
    response = await client.get("/api/v1/products/barcode/3017620422003", headers=HEADERS)
    assert response.status_code == 202
    event = (await db_session.execute(select(TesterEvent))).scalar_one()
    assert event.event_type == "scan"
    assert event.barcode == "03017620422003"
    assert event.meta["result"] == "queued"


async def test_barcode_without_device_header_records_nothing(client, db_session):
    await client.get("/api/v1/products/barcode/3017620422003")
    assert (await db_session.execute(select(TesterEvent))).first() is None


async def test_invalid_barcode_records_invalid_scan(client, db_session):
    response = await client.get("/api/v1/products/barcode/abc", headers=HEADERS)
    assert response.status_code == 400
    event = (await db_session.execute(select(TesterEvent))).scalar_one()
    assert event.meta["result"] == "invalid"
    assert event.barcode is None
    assert event.meta["raw"] == "abc"
