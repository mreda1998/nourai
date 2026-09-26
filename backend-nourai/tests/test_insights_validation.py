import pytest

from app.services.insights import clean_device_id


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("3f2a9c1e-1111-4222-8333-444455556666", "3f2a9c1e-1111-4222-8333-444455556666"),
        ("  abcdEFGH12  ", "abcdEFGH12"),
        (None, None),
        ("", None),
        ("short", None),
        ("x" * 65, None),
        ("bad id!!", None),
    ],
)
def test_clean_device_id(raw, expected):
    assert clean_device_id(raw) == expected


@pytest.mark.anyio
async def test_events_requires_device_header(client):
    response = await client.post("/api/v1/insights/events", json={"type": "search", "query": "x"})
    assert response.status_code == 400


@pytest.mark.anyio
async def test_events_rejects_scan_and_unknown_types(client):
    headers = {"X-Device-Id": "device-abc-123"}
    scan = await client.post("/api/v1/insights/events", json={"type": "scan"}, headers=headers)
    unknown = await client.post("/api/v1/insights/events", json={"type": "nope"}, headers=headers)
    assert scan.status_code == 422
    assert unknown.status_code == 422


@pytest.mark.anyio
async def test_events_rejects_oversized_meta(client):
    headers = {"X-Device-Id": "device-abc-123"}
    response = await client.post(
        "/api/v1/insights/events", json={"type": "feedback", "meta": {"m": "x" * 3000}}, headers=headers
    )
    assert response.status_code == 422
