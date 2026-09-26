# Tester Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a TestFlight build friends can use as guests, record every scan/search/view/miss, let them submit unknown products with photos, and generate a report that ranks what to research next.

**Architecture:** Backend (FastAPI + async SQLAlchemy + Postgres) gains two tables, a best-effort event recorder with its own DB session, a multipart submission endpoint backed by a private Supabase Storage bucket, public stack-score endpoints, and an offline HTML report script. The Expo app sends a per-install device ID on every request, persists the guest stack, adds a miss → submit flow, and switches score screens to the public endpoints. Release config moves to Expo CNG (no committed `ios/`).

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2 async, Alembic, httpx, pytest + anyio; Expo SDK 54, expo-router 6, React Native 0.81, expo-image-picker 17, AsyncStorage; EAS Build/Submit; Railway.

**Spec:** `docs/superpowers/specs/2026-09-26-tester-release-design.md`

## Global Constraints

- Analytics must never break a user request: event writes use their own session and swallow errors.
- Device header: `X-Device-Id` (8–64 chars, `[A-Za-z0-9-]`); app version header: `X-App-Version`.
- Event types: `scan`, `search`, `product_view`, `stack_add`, `feedback`; clients may not send `scan`.
- Event `query` ≤ 200 chars; `meta` ≤ 2048 bytes as JSON.
- Submissions: ≤ 3 photos, each ≤ 6 MB, types `image/jpeg`, `image/png`, `image/heic`; ≥ one of barcode/name/photo; 20 per device per 24 h; private bucket `tester-submissions`.
- Score endpoints accept ≤ 50 product UUIDs.
- Tester mode env: `EXPO_PUBLIC_TESTER_MODE=1`. RevenueCat key env: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.
- Never commit secrets. Match surrounding code style (backend: services + thin routers; app: `components/ui` primitives, `Txt`, `Palette`).
- Backend tests: `cd backend-nourai && ~/Desktop/nourai/backend-nourai/venv/bin/pytest -q`. Integration tests need `TEST_DATABASE_URL` == `DATABASE_URL` pointing at a disposable, migrated Postgres (skipped otherwise).
- App check: `cd nourai && npx tsc --noEmit`.

---

### Task 1: Test DB harness, migration 017 and models

**Files:**
- Create: `backend-nourai/alembic/versions/017_tester_insights.py`
- Create: `backend-nourai/app/models/tester.py`
- Modify: `backend-nourai/app/models/__init__.py` (register models)
- Modify: `backend-nourai/app/db/session.py` (NullPool when `environment == "test"`, so each anyio test loop gets fresh connections)
- Create: `backend-nourai/tests/integration/__init__.py`, `backend-nourai/tests/integration/conftest.py`
- Test: `backend-nourai/tests/integration/test_tester_schema.py`

**Interfaces:**
- Produces: `TesterEvent(id, device_id, user_id, event_type, barcode, product_id, query, meta, app_version, created_at)`, `ProductSubmission(id, device_id, user_id, barcode, name, brand, category, note, photo_paths, status, created_at)`; fixture `db_session` (AsyncSession on the test DB) and autouse cleanup truncating `tester_events`, `product_submissions`.

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_tester_schema.py
import pytest
from sqlalchemy import select
from app.models.tester import ProductSubmission, TesterEvent

pytestmark = pytest.mark.anyio

async def test_tester_tables_round_trip(db_session):
    db_session.add(TesterEvent(device_id="dev-12345678", event_type="search", query="cerave", meta={"results": 0}))
    db_session.add(ProductSubmission(device_id="dev-12345678", name="Cleanser", photo_paths=["a/1.jpg"]))
    await db_session.commit()
    event = (await db_session.execute(select(TesterEvent))).scalar_one()
    sub = (await db_session.execute(select(ProductSubmission))).scalar_one()
    assert event.meta == {"results": 0} and event.created_at is not None
    assert sub.status == "new" and sub.photo_paths == ["a/1.jpg"]
```

- [ ] **Step 2: Run to verify it fails** — `pytest tests/integration -q` → ImportError `app.models.tester`.
- [ ] **Step 3: Implement** migration (tables, indexes `ix_tester_events_device_id`, `ix_tester_events_barcode`, `ix_tester_events_type_created`, `ix_product_submissions_device_created`; FKs `user_profiles.id` / `products.id` ON DELETE SET NULL), models mirroring it (`meta` JSONB server_default `'{}'`, `photo_paths` JSONB server_default `'[]'`, `status` server_default `'new'`), conftest:

```python
# tests/integration/conftest.py
import os
import pytest
from sqlalchemy import text
from app.core.config import settings
from app.db.session import async_session_factory

TEST_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_URL or TEST_URL != settings.database_url:
    pytest.skip("integration tests need TEST_DATABASE_URL == DATABASE_URL (disposable DB)", allow_module_level=True)

TABLES = "tester_events, product_submissions, product_ingredients, product_identifiers, products, ingredients"

@pytest.fixture(autouse=True)
async def _clean():
    async with async_session_factory() as s:
        await s.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
        await s.commit()
    yield

@pytest.fixture
async def db_session():
    async with async_session_factory() as s:
        yield s
```

- [ ] **Step 4: Migrate the disposable DB and run** — `alembic upgrade head` then `pytest tests/integration -q` → PASS; full suite still 32+ passed.
- [ ] **Step 5: Commit** — `feat(backend): tester_events and product_submissions tables`

---

### Task 2: Event recorder, `/insights/events`, scan logging

**Files:**
- Create: `backend-nourai/app/services/insights.py`
- Create: `backend-nourai/app/api/v1/insights.py`
- Modify: `backend-nourai/app/api/deps.py` (`DeviceId`, `AppVersion` header deps)
- Modify: `backend-nourai/app/api/v1/router.py` (prefix `/insights`)
- Modify: `backend-nourai/app/api/v1/products.py` (record `scan` in `get_product_by_barcode`)
- Test: `backend-nourai/tests/test_insights_validation.py` (unit), `backend-nourai/tests/integration/test_insights_events.py`

**Interfaces:**
- Produces: `clean_device_id(raw: str | None) -> str | None`; `async record_event(*, device_id, event_type, user_id=None, barcode=None, product_id=None, query=None, meta=None, app_version=None) -> None`; `EVENT_TYPES`, `CLIENT_EVENT_TYPES`; `POST /api/v1/insights/events` body `{type, product_id?, barcode?, query?, meta?}` → 204.

- [ ] **Step 1: Write failing tests**

```python
# tests/test_insights_validation.py
import pytest
from app.services.insights import clean_device_id

@pytest.mark.parametrize("raw,expected", [
    ("3f2a9c1e-1111-4222-8333-444455556666", "3f2a9c1e-1111-4222-8333-444455556666"),
    ("  abcdEFGH12  ", "abcdEFGH12"), (None, None), ("", None), ("short", None),
    ("x" * 65, None), ("bad id!!", None),
])
def test_clean_device_id(raw, expected):
    assert clean_device_id(raw) == expected

@pytest.mark.anyio
async def test_events_requires_device_header(client):
    r = await client.post("/api/v1/insights/events", json={"type": "search", "query": "x"})
    assert r.status_code == 400

@pytest.mark.anyio
async def test_events_rejects_scan_and_unknown_types(client):
    h = {"X-Device-Id": "device-abc-123"}
    assert (await client.post("/api/v1/insights/events", json={"type": "scan"}, headers=h)).status_code == 422
    assert (await client.post("/api/v1/insights/events", json={"type": "nope"}, headers=h)).status_code == 422

@pytest.mark.anyio
async def test_events_rejects_oversized_meta(client):
    h = {"X-Device-Id": "device-abc-123"}
    r = await client.post("/api/v1/insights/events", json={"type": "feedback", "meta": {"m": "x" * 3000}}, headers=h)
    assert r.status_code == 422
```

```python
# tests/integration/test_insights_events.py
import pytest
from sqlalchemy import select
from app.models.tester import TesterEvent

pytestmark = pytest.mark.anyio
H = {"X-Device-Id": "device-abc-123", "X-App-Version": "1.0.0"}

async def test_client_event_is_stored(client, db_session):
    r = await client.post("/api/v1/insights/events", json={"type": "search", "query": "  CeraVe cleanser ", "meta": {"results": 0}}, headers=H)
    assert r.status_code == 204
    ev = (await db_session.execute(select(TesterEvent))).scalar_one()
    assert (ev.event_type, ev.query, ev.meta, ev.app_version) == ("search", "CeraVe cleanser", {"results": 0}, "1.0.0")

async def test_barcode_miss_records_queued_scan(client, db_session):
    r = await client.get("/api/v1/products/barcode/3017620422003", headers=H)
    assert r.status_code == 202
    ev = (await db_session.execute(select(TesterEvent))).scalar_one()
    assert ev.event_type == "scan" and ev.barcode == "03017620422003" and ev.meta["result"] == "queued"

async def test_barcode_without_device_header_records_nothing(client, db_session):
    await client.get("/api/v1/products/barcode/3017620422003")
    assert (await db_session.execute(select(TesterEvent))).first() is None

async def test_invalid_barcode_records_invalid_scan(client, db_session):
    r = await client.get("/api/v1/products/barcode/abc", headers=H)
    assert r.status_code == 400
    ev = (await db_session.execute(select(TesterEvent))).scalar_one()
    assert ev.meta["result"] == "invalid" and ev.barcode is None and ev.meta["raw"] == "abc"
```

- [ ] **Step 2: Run** — `pytest tests/test_insights_validation.py tests/integration/test_insights_events.py -q` → FAIL (module missing).
- [ ] **Step 3: Implement** `insights.py` service:

```python
_DEVICE_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
EVENT_TYPES = frozenset({"scan", "search", "product_view", "stack_add", "feedback"})
CLIENT_EVENT_TYPES = EVENT_TYPES - {"scan"}

def clean_device_id(raw):
    value = (raw or "").strip()
    return value if _DEVICE_RE.match(value) else None

async def record_event(*, device_id, event_type, user_id=None, barcode=None, product_id=None,
                       query=None, meta=None, app_version=None, session_factory=async_session_factory):
    if not device_id or event_type not in EVENT_TYPES:
        return
    try:
        async with session_factory() as session:
            session.add(TesterEvent(device_id=device_id, event_type=event_type, user_id=user_id,
                                    barcode=barcode, product_id=product_id,
                                    query=(query or "").strip()[:200] or None, meta=meta or {},
                                    app_version=(app_version or "")[:32] or None))
            await session.commit()
    except Exception:  # analytics must never break a request
        logger.warning("could not record %s event", event_type, exc_info=True)
```

Router: pydantic `ClientEventIn` with `type: Literal[...client types]`, `query: str | None = Field(None, max_length=500)` (trimmed/truncated to 200 by the service), `meta: dict = {}` plus a validator rejecting `len(json.dumps(meta)) > 2048`; 400 when `DeviceId` is None. `deps.py`:

```python
async def get_device_id(x_device_id: Annotated[str | None, Header()] = None) -> str | None:
    return clean_device_id(x_device_id)
async def get_app_version(x_app_version: Annotated[str | None, Header()] = None) -> str | None:
    return (x_app_version or "").strip()[:32] or None
DeviceId = Annotated[str | None, Depends(get_device_id)]
AppVersion = Annotated[str | None, Depends(get_app_version)]
```

In `get_product_by_barcode`, add `device_id: DeviceId`, `app_version: AppVersion`; call `record_event(..., meta={"result": "invalid", "raw": barcode[:32]})` before the 400, `{"result": "cached"}` with `product_id` on a local hit (and on the "job already complete" path), and `{"result": "queued", "job_id": str(job.id), "status": job.status}` before returning 202. Pass `user_id=current_user.id if current_user else None`.

- [ ] **Step 4: Run tests** → PASS; full suite green.
- [ ] **Step 5: Commit** — `feat(backend): record tester events and barcode scans`

---

### Task 3: Product submissions with private photo storage

**Files:**
- Create: `backend-nourai/app/services/submission_storage.py`
- Modify: `backend-nourai/app/api/v1/insights.py` (`POST /submissions`)
- Modify: `backend-nourai/app/core/config.py` (`supabase_submissions_bucket = "tester-submissions"`, `submission_daily_limit = 20`)
- Modify: `backend-nourai/.env.example` (document bucket)
- Test: `backend-nourai/tests/integration/test_submissions.py`

**Interfaces:**
- Produces: `SubmissionPhotoStore(bucket: str)` with `.configured -> bool`, `async upload(path: str, data: bytes, content_type: str) -> None`, `async signed_url(path: str, expires_in: int = 604800) -> str | None`; `get_photo_store() -> SubmissionPhotoStore` (FastAPI dependency, overridable in tests); `POST /api/v1/insights/submissions` multipart → 201 `{"id": str, "photos_stored": int}`.

- [ ] **Step 1: Write failing tests** (fake store via `app.dependency_overrides[get_photo_store]`):

```python
class FakeStore:
    def __init__(self, configured=True): self.configured, self.uploads = configured, []
    async def upload(self, path, data, content_type): self.uploads.append((path, len(data), content_type))

JPEG = b"\xff\xd8\xff" + b"0" * 100

async def test_submission_with_photos(client, db_session, store):
    r = await client.post("/api/v1/insights/submissions", headers=H,
        data={"barcode": "3017620422003", "name": "Nutella", "brand": "Ferrero", "category": "food"},
        files=[("photos", ("front.jpg", JPEG, "image/jpeg")), ("photos", ("ing.jpg", JPEG, "image/jpeg"))])
    assert r.status_code == 201 and r.json()["photos_stored"] == 2
    sub = (await db_session.execute(select(ProductSubmission))).scalar_one()
    assert sub.barcode == "03017620422003" and len(sub.photo_paths) == 2
    assert all(p.startswith(f"{sub.id}/") for p in sub.photo_paths)

async def test_submission_needs_some_content(client, store):
    assert (await client.post("/api/v1/insights/submissions", headers=H, data={"note": "hi"})).status_code == 422

async def test_rejects_non_image_and_too_many(client, store):
    bad = [("photos", ("x.txt", b"hello", "text/plain"))]
    assert (await client.post(URL, headers=H, data={"name": "x"}, files=bad)).status_code == 415
    four = [("photos", (f"{i}.jpg", JPEG, "image/jpeg")) for i in range(4)]
    assert (await client.post(URL, headers=H, data={"name": "x"}, files=four)).status_code == 422

async def test_photos_without_storage_is_503_but_text_ok(client, unconfigured_store):
    files = [("photos", ("f.jpg", JPEG, "image/jpeg"))]
    assert (await client.post(URL, headers=H, data={"name": "x"}, files=files)).status_code == 503
    assert (await client.post(URL, headers=H, data={"name": "x"})).status_code == 201

async def test_daily_limit(client, store, monkeypatch):
    monkeypatch.setattr(settings, "submission_daily_limit", 2)
    for _ in range(2):
        assert (await client.post(URL, headers=H, data={"name": "x"})).status_code == 201
    assert (await client.post(URL, headers=H, data={"name": "x"})).status_code == 429
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Storage uses Supabase Storage REST (`POST {supabase_url}/storage/v1/object/{bucket}/{path}` with `Authorization: Bearer <service_role>`, `apikey`, `x-upsert: true`; signing via `POST /storage/v1/object/sign/{bucket}/{path}` `{"expiresIn": n}` → `{supabase_url}/storage/v1{signedURL}`). Endpoint: require device (400), validate category in `{food, supplement, cosmetic, otc, other}`, normalize barcode with `normalize_gtin` (fallback to raw digits ≤ 32 chars), count submissions for the device in the last 24 h (429 at limit), read each upload (≤ 6 MB → 413; content type check → 415), 503 if photos and `not store.configured`, create row, upload to `{id}/{n}.{ext}`, save `photo_paths`, commit.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(backend): product submissions with private photo storage`

---

### Task 4: Stack score service and public `/scores` endpoints

**Files:**
- Create: `backend-nourai/app/services/stack_score.py`
- Create: `backend-nourai/app/api/v1/scores.py`
- Modify: `backend-nourai/app/api/v1/users.py` (use the service; behaviour unchanged)
- Modify: `backend-nourai/app/api/v1/router.py` (prefix `/scores`)
- Modify: `backend-nourai/app/schemas/user.py` (`StackScoreRequest`)
- Test: `backend-nourai/tests/test_stack_score.py`

**Interfaces:**
- Produces: `score_qualifier(int) -> str`; `async load_product_ingredients(db, product_ids: list[UUID]) -> list[ProductIngredient]`; `daily_score(product_ingredients) -> DailyScoreResponse`; `health_domain(biodomain: str, product_ingredients) -> HealthDomainResponse | None` (None = unknown key); `StackScoreRequest{product_ids: list[UUID] (max 50)}`; `POST /api/v1/scores/daily`, `POST /api/v1/scores/domain/{biodomain}`.

- [ ] **Step 1: Write failing tests** (no DB: patch `load_product_ingredients` to return `[]`):

```python
async def test_daily_score_empty_stack(client):
    with patch("app.api.v1.scores.load_product_ingredients", new=AsyncMock(return_value=[])):
        r = await client.post("/api/v1/scores/daily", json={"product_ids": []})
    assert r.status_code == 200 and r.json()["overall"] == 0 and len(r.json()["categories"]) == 5

async def test_domain_unknown_is_404(client):
    with patch("app.api.v1.scores.load_product_ingredients", new=AsyncMock(return_value=[])):
        r = await client.post("/api/v1/scores/domain/not_a_domain", json={"product_ids": []})
    assert r.status_code == 404

async def test_too_many_ids_is_422(client):
    ids = [str(uuid4()) for _ in range(51)]
    assert (await client.post("/api/v1/scores/daily", json={"product_ids": ids})).status_code == 422

def test_score_qualifier_bands():
    assert [score_qualifier(v) for v in (85, 70, 55, 10)] == ["High", "Good", "Moderate", "Low"]
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** by moving `_DAILY_SCORE_CATEGORIES`, `_score_qualifier`, `_factor_strength`, `_factor_direction` and the two computations out of `users.py` verbatim into `stack_score.py`; `users.py` endpoints call `load_product_ingredients` + `daily_score` / `health_domain` on today's entries.
- [ ] **Step 4: Run** full suite → PASS.
- [ ] **Step 5: Commit** — `feat(backend): score any stack via public /scores endpoints`

---

### Task 5: Tester report

**Files:**
- Create: `backend-nourai/scripts/tester_report.py`
- Modify: `backend-nourai/Makefile` (`tester-report` target)
- Test: `backend-nourai/tests/integration/test_tester_report.py`

**Interfaces:**
- Produces: `async gather_report(session, since: datetime | None) -> dict` with keys `overview`, `missed`, `unmatched_submissions`, `products`, `research_priority`, `categories`, `zero_searches`, `feedback`, `testers`; `render_html(report: dict, photo_urls: dict[str, str]) -> str`; CLI `python -m scripts.tester_report [--days N] [--out PATH]`.

- [ ] **Step 1: Write failing test** seeding: ingredient A (research complete), ingredient B (pending); product P (barcode `3017620422003`, category food) with ingredients A, B and one unlinked "mystery gum"; events: device d1 scan of P's GTIN (queued), d2 product_view P, d1 scan of unknown GTIN `00000000000017` twice, d2 search "rare serum" `{results: 0}`, d1 feedback; submission for the unknown GTIN.

```python
async def test_report_ranks_what_matters(db_session):
    report = await gather_report(db_session, since=None)
    assert report["overview"] == {"testers": 2, "scans": 3, "scan_hits": 1, "searches": 1, "submissions": 1}
    assert report["missed"][0]["barcode"] == "00000000000017" and report["missed"][0]["testers"] == 1
    assert report["missed"][0]["submissions"][0]["name"] == "Mystery"
    assert report["products"][0]["name"] == "P" and report["products"][0]["testers"] == 2
    names = {r["name"]: r for r in report["research_priority"]}
    assert names["B"]["status"] == "unresearched" and names["mystery gum"]["status"] == "unlinked"
    assert "A" not in names or names["A"]["status"] == "researched"
    assert report["zero_searches"][0]["query"] == "rare serum"
    html = render_html(report, {})
    assert "Research priority" in html and "rare serum" in html
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with SQL (CTE resolving each scan to a product via `coalesce(event.product_id, product_identifiers(gtin), products.barcode IN (gtin14, right(gtin14,13), right(gtin14,12), ltrim(gtin14,'0')))`), "used products" = resolved scans ∪ `product_view` ∪ `stack_add`, research priority grouped by ingredient (linked) or `lower(name)` (unlinked, excluding nutrient rows), ordered by distinct testers desc then product count. HTML is self-contained (inline CSS, escaped text). `main()` signs submission photo paths via `SubmissionPhotoStore` when configured and writes `reports/tester-report-YYYY-MM-DD.html`.
- [ ] **Step 4: Run** → PASS; also run the CLI against the disposable DB.
- [ ] **Step 5: Commit** — `feat(backend): tester report ranking misses and research priorities`

---

### Task 6: App plumbing — device ID, headers, insights client, API methods

**Files:**
- Create: `nourai/lib/device-id.ts`, `nourai/lib/insights.ts`, `nourai/lib/tester-mode.ts`
- Modify: `nourai/services/api.ts`

**Interfaces:**
- Produces: `getDeviceId(): Promise<string>`; `TESTER_MODE: boolean`; `track(type: 'search'|'product_view'|'stack_add'|'feedback', fields?: { product_id?: string; barcode?: string; query?: string; meta?: Record<string, unknown> }): void`; `api.trackEvent(body)`, `api.submitProduct(input: ProductSubmissionInput): Promise<{ id: string; photos_stored: number }>`, `api.getStackScore(productIds: string[]): Promise<DailyScoreResponse>`, `api.getStackDomain(biodomain: string, productIds: string[]): Promise<HealthDomainResponse>`.

- [ ] **Step 1:** `device-id.ts` — AsyncStorage key `elory.deviceId`; v4 UUID from `Math.random` (not security sensitive); memoized promise.
- [ ] **Step 2:** `api.ts` fetch wrapper adds `X-Device-Id` and `X-App-Version` (`Constants.expoConfig?.version`), and skips `Content-Type: application/json` when `body instanceof FormData`; add the four methods; `getProductByBarcode` unchanged.
- [ ] **Step 3:** `insights.ts` — fire-and-forget `api.trackEvent(...).catch(() => {})`.
- [ ] **Step 4:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** — `feat(app): device id, insights client and new API methods`

---

### Task 7: Persist the stack locally and track stack adds

**Files:**
- Modify: `nourai/context/app-state.tsx`

- [ ] **Step 1:** Load `elory.stack.v1` from AsyncStorage on mount (revive `scannedAt` to `Date`), save on every change after load; `hydrateFromServer` keeps its "don't overwrite local" rule; `clearStack` also clears storage.
- [ ] **Step 2:** In `addToStack`, call `track('stack_add', { product_id })` when the id is a UUID.
- [ ] **Step 3:** `npx tsc --noEmit` → 0.
- [ ] **Step 4: Commit** — `fix(app): persist guest stack across launches`

---

### Task 8: Scan miss flow and product submission screen

**Files:**
- Modify: `nourai/app/(tabs)/scan.tsx` (miss card, honest copy, `via=scan`)
- Create: `nourai/app/submit-product.tsx`
- Modify: `nourai/app/_layout.tsx` (register `submit-product` as modal; allow it in the route guard)

- [ ] **Step 1:** In `onScan`, remember the barcode; on `needs_review`/`dead`/404 set phase `missing` (other errors stay `error`). Render `MissCard` with "We don't know this one yet", "Help add it" → `router.push({ pathname: '/submit-product', params: { barcode } })`, "Scan again".
- [ ] **Step 2:** Replace "Nothing is recorded or stored." with "Elory only reads the barcode. Scans help us decide which products to add next."
- [ ] **Step 3:** `submit-product.tsx`: params `barcode?`, `name?`; three photo slots (Front, Ingredients, Other) using `ImagePicker.launchCameraAsync({ quality: 0.6 })` with library fallback when camera permission is denied or unavailable (simulator); fields name/brand (auth-style `TextInput`), category `Chip`s, note; submit builds `FormData` (`{ uri, name: 'front.jpg', type: 'image/jpeg' }`), shows sending state, thank-you state with "Scan another" / "Done", inline error text on failure.
- [ ] **Step 4:** `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `feat(app): help-add-it flow for unknown products`

---

### Task 9: Search, product-view and feedback tracking

**Files:**
- Modify: `nourai/app/(tabs)/search.tsx` (track searches with result counts; no-results CTA; `via=search`)
- Modify: `nourai/app/product/[id].tsx` (track view with `via`; "Something look wrong?" feedback sheet)
- Create: `nourai/components/FeedbackSheet.tsx`
- Modify: `nourai/app/profile-hub.tsx` (Beta feedback row in tester mode)
- Modify: stack list navigation to pass `via=stack` (`nourai/app/(tabs)/stack.tsx`)

- [ ] **Step 1:** After each product/ingredient search resolves, `track('search', { query: q, meta: { mode, results } })`. Empty state with a query gets a second action: "Help add it" → `/submit-product?name=<q>`.
- [ ] **Step 2:** Product page: after load, `track('product_view', { product_id, meta: { via } })` (skip `usda-` ids for `product_id`, put them in meta). Below the tabs content, a quiet "Something look wrong?" link opens `FeedbackSheet`.
- [ ] **Step 3:** `FeedbackSheet` (uses `Sheet`): multiline input, Send → `track('feedback', { product_id?, meta: { message, context } })`, thank-you state.
- [ ] **Step 4:** `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `feat(app): track searches, views and tester feedback`

---

### Task 10: Scores from the local stack

**Files:**
- Modify: `nourai/app/(tabs)/index.tsx`, `nourai/app/domains.tsx`, `nourai/components/elory/HealthDomainScreen.tsx`
- Modify: `nourai/constants/biodomains.ts` (`APP_DOMAIN_TO_BIODOMAIN`)

- [ ] **Step 1:** `APP_DOMAIN_TO_BIODOMAIN = { skin: 'skin_appearance', sleep: 'sleep_recovery', gut: 'gut_digestive', hormonal: 'hormonal_endocrine', fitness: 'body_composition', hair: null }`.
- [ ] **Step 2:** Today: `api.getStackScore(uuidIds(stack))`. Domains grid and domain screen: `api.getStackDomain(mapped, ids)`; `hair` (null) shows "Hair scoring is coming soon." instead of calling the API. Treat `score === 0 && factors.length === 0` as "Not enough data yet".
- [ ] **Step 3:** `npx tsc --noEmit` → 0.
- [ ] **Step 4: Commit** — `fix(app): score the current stack for guests and members`

---

### Task 11: Tester mode and RevenueCat key handling

**Files:**
- Modify: `nourai/lib/revenue-cat.ts`, `nourai/context/purchases-context.tsx`, `nourai/app/settings/subscription.tsx`

- [ ] **Step 1:** `revenue-cat.ts`: key = `EXPO_PUBLIC_REVENUECAT_IOS_KEY` ?? (`__DEV__` ? test key : undefined); `configureRevenueCat()` returns `false` and does nothing when `TESTER_MODE` or no key; export `isRevenueCatConfigured()`.
- [ ] **Step 2:** `PurchasesProvider`: when not configured → `isLoading=false`, `isPremium=TESTER_MODE`, actions resolve to no-ops (`false` / `PAYWALL_RESULT.NOT_PRESENTED`).
- [ ] **Step 3:** Subscription screen: in tester mode show "Beta build — every feature is unlocked while you test." instead of plans.
- [ ] **Step 4:** `npx tsc --noEmit` → 0.
- [ ] **Step 5: Commit** — `feat(app): tester mode unlocks premium without RevenueCat`

---

### Task 12: Release configuration

**Files:**
- Delete from git: `nourai/ios/**`; Modify: `nourai/.gitignore` (`/ios`, `/android`)
- Modify: `nourai/app.json`, `nourai/eas.json`, `backend-nourai/railway.toml`
- Create: `nourai/assets/splash-icon.png` (logo on transparent, from `assets/images/logo.png`)

- [ ] **Step 1:** `git rm -r --cached nourai/ios` (keep the local folder), ignore it.
- [ ] **Step 2:** `app.json`: `ios.usesAppleSignIn: true`; `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`; `ios.privacyManifests.NSPrivacyAccessedAPITypes` for UserDefaults (`CA92.1`), FileTimestamp (`C617.1`), SystemBootTime (`35F9.1`), DiskSpace (`E174.1`); plugins `["expo-image-picker", { cameraPermission, photosPermission }]` and `["expo-splash-screen", { image: "./assets/splash-icon.png", imageWidth: 180, backgroundColor: "#F3F0E9" }]`; drop the legacy top-level `splash`.
- [ ] **Step 3:** `eas.json`: `cli.appVersionSource: "remote"`; `testflight` profile `{ "extends": "production", "env": { "EXPO_PUBLIC_TESTER_MODE": "1" } }`; keep API URL placeholder documented.
- [ ] **Step 4:** `railway.toml` start command: `sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT"`.
- [ ] **Step 5:** `npx expo config --type public` succeeds; `npx expo-doctor` reviewed.
- [ ] **Step 6: Commit** — `chore(release): CNG ios, TestFlight profile, privacy manifest, splash`

---

### Task 13: Runbook and tester note

**Files:**
- Create: `docs/testflight-runbook.md`
- Modify: `DEPLOYMENT.md` (link to runbook; fix `elory/` → `nourai/` paths)

- [ ] **Step 1:** Runbook sections: 0 revoke leaked OpenAI key; 1 Railway (API + worker services from `railway.toml`/`railway.worker.toml`, env vars list, domain, verify `/health`); 2 Supabase (create private `tester-submissions` bucket; Apple provider); 3 Apple + App Store Connect record; 4 EAS (`npm i -g eas-cli`, `eas login`, set `EXPO_PUBLIC_API_URL`, `eas build -p ios --profile testflight`, `eas submit -p ios --latest`); 5 TestFlight external group + public link + Beta App Review; 6 "What to Test" text for friends; 7 `make tester-report` weekly.
- [ ] **Step 2: Commit** — `docs: TestFlight runbook and tester note`

---

### Task 14: End-to-end verification

- [ ] **Step 1:** Backend full suite + integration suite on the disposable DB.
- [ ] **Step 2:** Run API locally against the disposable DB with a seeded product; run the iOS simulator (dev build) with `EXPO_PUBLIC_TESTER_MODE=1`; verify: onboarding → search → product page → add to stack → relaunch keeps stack → Today score renders → search with no results → Help add it → submit (library photo) → report shows the search, view, stack add and submission.
- [ ] **Step 3:** Fix anything found (each fix its own commit).
