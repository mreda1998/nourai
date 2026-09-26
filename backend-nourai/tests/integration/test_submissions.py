import pytest
from sqlalchemy import select

from app.api.v1.insights import get_photo_store
from app.core.config import settings
from app.main import app
from app.models.tester import ProductSubmission

pytestmark = pytest.mark.anyio

URL = "/api/v1/insights/submissions"
HEADERS = {"X-Device-Id": "device-abc-123"}
JPEG = b"\xff\xd8\xff" + b"0" * 100


class FakeStore:
    def __init__(self, configured: bool = True):
        self.configured = configured
        self.uploads: list[tuple[str, int, str]] = []

    async def upload(self, path: str, data: bytes, content_type: str) -> None:
        self.uploads.append((path, len(data), content_type))


@pytest.fixture
def store():
    fake = FakeStore()
    app.dependency_overrides[get_photo_store] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_photo_store, None)


@pytest.fixture
def unconfigured_store():
    fake = FakeStore(configured=False)
    app.dependency_overrides[get_photo_store] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_photo_store, None)


async def test_submission_with_photos(client, db_session, store):
    response = await client.post(
        URL,
        headers=HEADERS,
        data={"barcode": "3017620422003", "name": "Nutella", "brand": "Ferrero", "category": "food"},
        files=[
            ("photos", ("front.jpg", JPEG, "image/jpeg")),
            ("photos", ("ingredients.jpg", JPEG, "image/jpeg")),
        ],
    )
    assert response.status_code == 201
    assert response.json()["photos_stored"] == 2

    submission = (await db_session.execute(select(ProductSubmission))).scalar_one()
    assert submission.barcode == "03017620422003"
    assert (submission.name, submission.brand, submission.category) == ("Nutella", "Ferrero", "food")
    assert len(submission.photo_paths) == 2
    assert all(path.startswith(f"{submission.id}/") for path in submission.photo_paths)
    assert [upload[0] for upload in store.uploads] == submission.photo_paths


async def test_submission_needs_some_content(client, store):
    response = await client.post(URL, headers=HEADERS, data={"note": "hello"})
    assert response.status_code == 422


async def test_submission_requires_device(client, store):
    response = await client.post(URL, data={"name": "x"})
    assert response.status_code == 400


async def test_rejects_bad_category(client, store):
    response = await client.post(URL, headers=HEADERS, data={"name": "x", "category": "weapons"})
    assert response.status_code == 422


async def test_keeps_unparseable_barcode_digits(client, db_session, store):
    response = await client.post(URL, headers=HEADERS, data={"barcode": "12345", "name": "x"})
    assert response.status_code == 201
    submission = (await db_session.execute(select(ProductSubmission))).scalar_one()
    assert submission.barcode == "12345"


async def test_rejects_non_image_and_too_many(client, store):
    not_image = [("photos", ("x.txt", b"hello", "text/plain"))]
    assert (await client.post(URL, headers=HEADERS, data={"name": "x"}, files=not_image)).status_code == 415

    four = [("photos", (f"{i}.jpg", JPEG, "image/jpeg")) for i in range(4)]
    assert (await client.post(URL, headers=HEADERS, data={"name": "x"}, files=four)).status_code == 422


async def test_rejects_oversized_photo(client, store, monkeypatch):
    monkeypatch.setattr("app.api.v1.insights._MAX_PHOTO_BYTES", 50)
    files = [("photos", ("f.jpg", JPEG, "image/jpeg"))]
    assert (await client.post(URL, headers=HEADERS, data={"name": "x"}, files=files)).status_code == 413


async def test_photos_without_storage_is_503_but_text_ok(client, db_session, unconfigured_store):
    files = [("photos", ("f.jpg", JPEG, "image/jpeg"))]
    assert (await client.post(URL, headers=HEADERS, data={"name": "x"}, files=files)).status_code == 503
    assert (await client.post(URL, headers=HEADERS, data={"name": "x"})).status_code == 201
    assert len((await db_session.execute(select(ProductSubmission))).scalars().all()) == 1


async def test_daily_limit(client, store, monkeypatch):
    monkeypatch.setattr(settings, "submission_daily_limit", 2)
    for _ in range(2):
        assert (await client.post(URL, headers=HEADERS, data={"name": "x"})).status_code == 201
    assert (await client.post(URL, headers=HEADERS, data={"name": "x"})).status_code == 429
