# Catalog coverage — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Open Food Facts / Open Beauty Facts product is findable by search and answers a first scan immediately, via a bulk-loaded index with on-demand hydration.

**Architecture:** A new `catalog_entries` table is bulk-loaded by streaming the public CSV dumps. Search merges curated `products` with index hits through a pure ranking function. Scans and `catalog:` ids hydrate inline through the existing ingestion pipeline (4 s budget, circuit breaker), falling back to the existing queue with a preview.

**Tech Stack:** FastAPI, SQLAlchemy async + asyncpg, PostgreSQL `pg_trgm`, httpx streaming, Alembic; Expo / React Native app.

**Spec:** `docs/superpowers/specs/2026-10-06-catalog-coverage-design.md` (phase 1 of 4).

## Global Constraints

- Supabase Pro: database must stay under 7 GB (`pg_database_size` guard).
- Hydration budget: ~4 s inline; circuit breaker opens for 60 s after 3 consecutive upstream failures.
- Search statement timeout ≈ 300 ms with fallback to the curated `products` search; catalog search needs ≥ 3 characters.
- Source slugs: reuse the existing `open-food-facts` row (priority 50); add `open-beauty-facts` (ODbL, share-alike, priority 55). Lower priority value wins.
- Dumps: `https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz` (≈1.28 GB, TSV, 211 columns, 302 → S3) and `https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz` (≈18 MB). Columns are read **by header name** (order differs between the two).
- Names in the dump contain HTML entities (`M&amp;M`) — unescape.
- Never redistribute the database; attribution comes from `data_sources`.
- Older app builds must keep working (new response fields are additive; `ProductListItem.id` was always a string).

## Review Focus

1. **Restricted / junk barcodes** (in-store `2…` prefixes, `000000000054`) must never enter the index → test in Task 2.
2. **A dump whose format changed** (column renamed, mostly empty names) must abort early, not write garbage → test in Task 3.
3. **Short or symbol queries** (`"m&"`, `"ab"`) must not hit the 4.5M-row index with an unindexable pattern → test in Task 5.
4. **Upstream slow / rate-limited** (429/5xx/timeouts) must not make every scan wait 4 s → circuit-breaker test in Task 6.
5. **A `catalog:` id for an entry that was already hydrated** must return the product, not re-hydrate → test in Task 7.

## File Structure

| File | Responsibility |
|---|---|
| `backend-nourai/alembic/versions/018_catalog_entries.py` | table, indexes, `open-beauty-facts` source row |
| `backend-nourai/app/models/catalog.py` | `CatalogEntry` ORM model |
| `backend-nourai/app/core/countries.py` | OFF country tag → ISO-2 |
| `backend-nourai/app/services/catalog/records.py` | `CatalogRow`, TSV reader, row parsing, search-text normalisation |
| `backend-nourai/app/services/catalog/importer.py` | streaming import loop, guards, checkpoint, additive tally |
| `backend-nourai/app/services/catalog/sink.py` | Postgres upsert sink + checkpoint + size guard |
| `backend-nourai/app/services/catalog/stream.py` | gzip-over-HTTP line streaming |
| `backend-nourai/scripts/catalog_import.py` | CLI |
| `backend-nourai/app/services/catalog/ranking.py` | pure search ranking |
| `backend-nourai/app/repositories/catalog.py` | GTIN lookup, entry fetch, catalog search, link |
| `backend-nourai/app/services/ingestion/product_job.py` | shared "run one product job" used by worker and hydrator |
| `backend-nourai/app/services/catalog/hydration.py` | inline hydration + circuit breaker |
| `backend-nourai/app/api/v1/products.py` | scan / get / search wiring |
| `backend-nourai/app/schemas/ingestion.py`, `app/schemas/product.py` | preview + search result schemas |
| `nourai/services/api.ts`, `nourai/lib/region.ts` | types, `country`, catalog ids |
| `nourai/app/product/[id].tsx`, `nourai/app/(tabs)/scan.tsx` | preview while hydrating |

---

### Task 1: Migration and model

**Files:**
- Create: `backend-nourai/alembic/versions/018_catalog_entries.py`, `backend-nourai/app/models/catalog.py`
- Modify: `backend-nourai/app/models/__init__.py`, `backend-nourai/tests/integration/conftest.py` (add `catalog_entries` to `_TABLES`)

**Interfaces:**
- Produces: `CatalogEntry` with columns `id:int, source_id:UUID, external_id:str, gtin14:str|None, name:str, brand:str|None, category:str, countries:list[str], image_url:str|None, search_text:str, popularity:int, completeness:float|None, product_id:UUID|None, source_updated_at, imported_at, content_hash:str`.

- [ ] **Step 1:** Write the migration (revision `"018_catalog"`, down `"017"` — not `"018"`, which an unmerged branch already uses):

```python
op.create_table(
    "catalog_entries",
    sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
    sa.Column("source_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("data_sources.id", ondelete="CASCADE"), nullable=False),
    sa.Column("external_id", sa.String(64), nullable=False),
    sa.Column("gtin14", sa.String(14), nullable=True),
    sa.Column("name", sa.Text(), nullable=False),
    sa.Column("brand", sa.Text(), nullable=True),
    sa.Column("category", sa.String(20), nullable=False),
    sa.Column("countries", postgresql.ARRAY(sa.String(2)), nullable=False, server_default="{}"),
    sa.Column("image_url", sa.Text(), nullable=True),
    sa.Column("search_text", sa.Text(), nullable=False),
    sa.Column("popularity", sa.Integer(), nullable=False, server_default="0"),
    sa.Column("completeness", sa.Float(), nullable=True),
    sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
    sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
    sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column("content_hash", sa.String(64), nullable=False),
    sa.UniqueConstraint("source_id", "external_id", name="uq_catalog_entry_source_external"),
)
op.create_index("ix_catalog_entries_gtin14", "catalog_entries", ["gtin14"])
op.create_index("ix_catalog_entries_search_trgm", "catalog_entries", ["search_text"],
                postgresql_using="gin", postgresql_ops={"search_text": "gin_trgm_ops"})
op.create_index("ix_catalog_entries_category_popularity", "catalog_entries", ["category", sa.text("popularity DESC")])
op.create_index("ix_catalog_entries_product_id", "catalog_entries", ["product_id"])
op.execute("""INSERT INTO data_sources (slug, name, source_type, base_url, license_name, license_url,
  attribution_text, share_alike, priority, enabled, extra_data) VALUES
  ('open-beauty-facts', 'Open Beauty Facts', 'product_catalog', 'https://world.openbeautyfacts.org',
   'Open Database License', 'https://opendatacommons.org/licenses/odbl/1-0/',
   'Data and images from Open Beauty Facts contributors', true, 55, true, '{}'::jsonb)
  ON CONFLICT (slug) DO NOTHING""")
```
Downgrade drops the indexes, the table and the `open-beauty-facts` row.

- [ ] **Step 2:** Model `CatalogEntry` mirroring the columns; register in `app/models/__init__.py`.
- [ ] **Step 3:** Create a disposable DB `elory_catalog_test` on the local Postgres, run `alembic upgrade head` against it, then `alembic downgrade 017 && alembic upgrade head` — both must succeed.
- [ ] **Step 4:** Commit `feat(backend): catalog_entries table and Open Beauty Facts source`.

### Task 2: Row parsing

**Files:**
- Create: `backend-nourai/app/core/countries.py`, `backend-nourai/app/services/catalog/__init__.py`, `backend-nourai/app/services/catalog/records.py`
- Test: `backend-nourai/tests/test_catalog_records.py`

**Interfaces:**
- Produces: `CatalogRow` (frozen dataclass: `external_id, gtin14, name, brand, category, countries: tuple[str,...], image_url, popularity: int, completeness: float|None, source_updated_at: datetime|None, search_text, content_hash, additives: tuple[str,...]`); `normalize_search_text(*parts: str|None) -> str`; `iter_tsv(lines: Iterable[str]) -> Iterator[dict[str,str]]`; `parse_off_row(row: dict[str,str], *, default_category: str) -> CatalogRow | None`; `off_countries_to_iso(tags: str) -> tuple[str,...]`.

- [ ] **Step 1: Failing tests** (`tests/test_catalog_records.py`):
  - `normalize_search_text("Café  Crème", "L&amp;Oréal")` → `"cafe creme l&oreal"`.
  - A valid OFF row (`code=3017620422003`, `product_name=Nutella`, `brands=Ferrero,Nutella`, `countries_tags=en:france,en:united-states`, `unique_scans_n=1500`, `completeness=0.9`, `last_modified_t=1700000000`, `image_url=…`, `additives_tags=en:e322,en:e476`) → `gtin14="03017620422003"`, `brand="Ferrero"`, `countries=("FR","US")`, `popularity=1500`, `additives=("en:e322","en:e476")`, `category="food"`.
  - `categories_tags` containing `en:dietary-supplements` → `category="supplement"`; OBF call with `default_category="cosmetic"` → `"cosmetic"`.
  - HTML entities unescaped in `name`.
  - Returns `None` for: empty name; invalid check digit; `000000000054`; in-store EAN-13 `2000000000008`; UPC number-system-2 `012345678905` style codes whose significant digits start with `2` (`0234567890128`).
  - `iter_tsv` reads by header and survives a 200 KB field (raise `csv.field_size_limit`).
  - Same input → same `content_hash`; changing `product_name` changes it.
- [ ] **Step 2:** Run `pytest tests/test_catalog_records.py -q` → fails (module missing).
- [ ] **Step 3: Implement.** Key rules:

```python
def _valid_gtin(code: str) -> str | None:
    try:
        n = normalize_gtin(code)
    except ValueError:
        return None
    significant = n.digits.lstrip("0")
    if len(significant) < 6:
        return None                      # internal / placeholder codes
    if significant.startswith("2") and len(n.digits) in (8, 12, 13):
        return None                      # GS1 restricted, in-store numbers
    return n.gtin14
```
`category`: OBF → `default_category`; OFF → `"supplement"` if any of `en:dietary-supplements`, `en:food-supplements`, `en:vitamins`, `en:minerals-supplements` in `categories_tags`, else `"food"`. `popularity = int(unique_scans_n or 0)`; `completeness = float(...)` clamped 0–1; `source_updated_at` from `last_modified_t` (UTC). `image_url = image_url or image_small_url or None`. Name capped at 500 chars, brand = first comma-separated value. `content_hash = sha256` over the tuple of stored fields. `countries.py` maps ~70 OFF tags (`en:united-states`→`US`, `en:united-kingdom`→`GB`, `en:france`→`FR`, …); unknown tags dropped.
- [ ] **Step 4:** Tests pass; full suite green.
- [ ] **Step 5:** Commit `feat(backend): parse Open Food Facts dump rows into catalog rows`.

### Task 3: Import loop, sink, stream, CLI

**Files:**
- Create: `backend-nourai/app/services/catalog/importer.py`, `sink.py`, `stream.py`, `backend-nourai/scripts/catalog_import.py`
- Test: `backend-nourai/tests/test_catalog_importer.py`

**Interfaces:**
- Consumes: `iter_tsv`, `parse_off_row`, `CatalogRow`.
- Produces: `ImportStats` (`read, parsed, skipped, inserted, updated, additives: Counter`); `class ImportAborted(RuntimeError)`; `async def run_import(rows: Iterable[dict[str,str]], *, parse: Callable[[dict], CatalogRow|None], sink: CatalogSink, batch_size: int = 2000, resume_from: int = 0, limit: int | None = None, sanity_after: int = 50_000, min_valid_ratio: float = 0.2) -> ImportStats`; `CatalogSink` protocol: `async write_batch(rows) -> tuple[int,int]`, `async checkpoint(line: int, stats: ImportStats) -> None`, `async check_size() -> None`; `PostgresCatalogSink(session_factory, source_id, max_db_bytes=7_000_000_000)`; `async def stream_gzip_lines(url, *, client=None) -> AsyncIterator[str]`.

- [ ] **Step 1: Failing tests** with an in-memory `FakeSink`:
  - Batches of `batch_size`; final partial batch written; `inserted/updated` summed from the sink.
  - `resume_from=3` skips the first 3 data rows without parsing them.
  - `limit=5` stops after 5 data rows.
  - After `sanity_after` rows with valid ratio below `min_valid_ratio` → `ImportAborted` and **no batch written** (sanity checked before the first write by buffering until `sanity_after`, or checking at each batch boundary before writing — the test uses `sanity_after=10, batch_size=5` with 10 junk rows and asserts zero writes).
  - Checkpoint called after every batch with the last processed line.
  - `check_size()` called every 50 batches; a sink raising `ImportAborted` from it stops the run.
  - Additive tags tallied across rows.
  - `stream_gzip_lines` over `httpx.MockTransport` serving a gzipped 3-line body in 7-byte chunks yields exactly the 3 lines (UTF-8 split across chunks).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement.** `PostgresCatalogSink.write_batch` uses

```python
stmt = insert(CatalogEntry).values([...]).on_conflict_do_update(
    index_elements=["source_id", "external_id"],
    set_={c: getattr(stmt.excluded, c) for c in UPDATABLE},
    where=CatalogEntry.content_hash != stmt.excluded.content_hash,
).returning(literal_column("(xmax = 0)"))
```
counting `True` as inserted and `False` as updated (unchanged rows are not returned). `check_size()` runs `SELECT pg_database_size(current_database())` and raises `ImportAborted` above `max_db_bytes`. `checkpoint()` writes `{"line", "stats", "at"}` into `data_sources.extra_data["catalog_import"]`. `stream_gzip_lines` uses `httpx.AsyncClient(follow_redirects=True).stream("GET", url)`, `zlib.decompressobj(16 + zlib.MAX_WBITS)` and an incremental UTF-8 decoder. The CLI (`--source off|obf`, `--url`, `--limit`, `--resume`, `--dry-run` = FakeSink that only counts) bridges the async line stream to `iter_tsv` by collecting lines per chunk.
- [ ] **Step 4:** Tests pass. Then run for real on the test DB: `python -m scripts.catalog_import --source obf` (full, ~18 MB) and `--source off --limit 300000`; record rows, time and DB size.
- [ ] **Step 5:** Commit `feat(backend): stream public dumps into the catalog index`.

### Task 4: Ranking

**Files:**
- Create: `backend-nourai/app/services/catalog/ranking.py`
- Test: `backend-nourai/tests/test_catalog_ranking.py`

**Interfaces:**
- Produces: `Candidate` (frozen: `key: str, name: str, brand: str|None, popularity: int, countries: tuple[str,...], hydrated: bool, payload: Any`); `def rank(query: str, candidates: Iterable[Candidate], *, country: str | None) -> list[Candidate]` (stable, de-duplicates by `key`, first occurrence wins).

- [ ] **Step 1: Failing tests:** name prefix beats a more popular substring match; brand prefix beats plain substring; country match lifts a less popular product above a more popular foreign one; popularity breaks ties; hydrated bonus breaks exact ties; duplicate keys collapse; query normalised like `search_text` (`"CAFÉ"` matches `"cafe noir"`).
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3:** Implement `score = 4·name_prefix + 2.5·brand_prefix + 1.5·all_words_in_name + 0.6·log10(1+popularity) + 1.5·country_match + 0.3·hydrated`, sort by `(-score, -popularity, name)`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(backend): rank merged product and catalog search results`.

### Task 5: Catalog repository

**Files:**
- Create: `backend-nourai/app/repositories/catalog.py`
- Test: `backend-nourai/tests/integration/test_catalog_repository.py`

**Interfaces:**
- Produces: `CatalogRepository(session)` with `async best_for_gtin(gtin14) -> CatalogEntry | None` (enabled sources, `priority ASC, popularity DESC`); `async get(entry_id: int) -> CatalogEntry | None`; `async search(query: str, *, category: str | None, limit: int = 60) -> list[CatalogEntry]`; `async link_product(gtin14, product_id) -> None` (sets `product_id` on every entry with that GTIN); `def catalog_query_ok(query: str) -> bool`.

- [ ] **Step 1: Failing tests (integration DB):** GTIN lookup returns the higher-priority source; disabled sources ignored; `search` matches every word (`"nut fer"` → Nutella/Ferrero), filters by category, orders by prefix then popularity, caps at `limit`; `catalog_query_ok("ab")`, `catalog_query_ok("m&")`, `catalog_query_ok("  ")` are `False`, `catalog_query_ok("nut")` is `True` (needs one word of ≥ 3 alphanumerics); `link_product` sets all entries for the GTIN.
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement.** Words of ≥ 2 characters from the normalised query, each `search_text LIKE '%' || :w || '%'` (escape `%`/`_`), at least one word ≥ 3 so the trigram index is used; `ORDER BY (search_text LIKE :q || '%') DESC, popularity DESC LIMIT :limit`; `SET LOCAL statement_timeout = '300ms'` in the same transaction.
- [ ] **Step 4:** Tests pass on the test DB.
- [ ] **Step 5:** Commit `feat(backend): catalog repository`.

### Task 6: Shared product job + hydration

**Files:**
- Create: `backend-nourai/app/services/ingestion/product_job.py`, `backend-nourai/app/services/catalog/hydration.py`
- Modify: `backend-nourai/app/workers/ingestion.py` (use `run_product_job`)
- Test: `backend-nourai/tests/test_catalog_hydration.py`

**Interfaces:**
- Produces: `ProductJobOutcome` (`status: Literal["complete","needs_review","not_found"], product_id: UUID|None`); `async def run_product_job(queue, pipeline, job, session_factory) -> ProductJobOutcome` (body of today's `_ingest_product` + the `OpenFoodFactsNotFound` branch); `CircuitBreaker(failures=3, cooldown_s=60, clock=time.monotonic)` with `allow() -> bool`, `success()`, `failure()`; `HydrationResult` (`status: Literal["hydrated","queued","not_found"], product_id: UUID|None, job: IngestionJob`); `CatalogHydrator(queue, pipeline, session_factory, breaker, budget_s=4.0)` with `async hydrate(db, *, digits, gtin14) -> HydrationResult`; module-level `default_breaker`.

- [ ] **Step 1: Failing tests** (fake queue + fake pipeline, no DB):
  - Fast pipeline → `hydrated` with product id; job completed.
  - Pipeline sleeping past `budget_s=0.05` → `queued`; breaker records a failure.
  - Three failures (timeout or `OpenFoodFactsError`) → breaker open → next call returns `queued` **without calling the pipeline**; after `cooldown_s` (fake clock) it tries again.
  - `OpenFoodFactsNotFound` → `not_found` (job marked needs_review), breaker **not** tripped.
  - Job already `complete` with a product (idempotent enqueue) → `hydrated` without calling the pipeline.
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement.** `hydrate` enqueues with key `barcode:off-v3.6:{gtin14}` (unchanged, so the worker dedupes), commits, then `asyncio.wait_for(run_product_job(...), budget_s)`. Worker `_handle` calls `run_product_job` for `product_barcode` jobs (behaviour unchanged).
- [ ] **Step 4:** Tests pass; full suite green (worker behaviour unchanged).
- [ ] **Step 5:** Commit `feat(backend): inline hydration with a circuit breaker`.

### Task 7: API wiring

**Files:**
- Modify: `backend-nourai/app/api/v1/products.py`, `backend-nourai/app/schemas/ingestion.py`, `backend-nourai/app/schemas/product.py`
- Test: `backend-nourai/tests/integration/test_catalog_api.py`

**Interfaces:**
- Consumes: `CatalogRepository`, `CatalogHydrator`, `rank`, `Candidate`.
- Produces: `CatalogPreview` (`name, brand, image_url, category`); `BarcodeIngestionResponse.preview: CatalogPreview | None`; `SearchResultItem` (`id: str, name, brand, category, image_url, grade: str | None, is_ai_generated: bool = False, in_catalog_only: bool`); `ProductSearchResultsResponse(products: list[SearchResultItem], total, limit, offset)`.

- [ ] **Step 1: Failing integration tests** (FastAPI client, hydrator overridden with a fake via `app.dependency_overrides`):
  - Scan of an unknown GTIN present in the index with a fast fake → `200` product, catalog entry linked.
  - Same with a timing-out fake → `202` with `preview.name` from the index.
  - `GET /products/catalog:<id>` for an unhydrated entry → hydrates; for an entry with `product_id` → returns that product **without calling the hydrator**; unknown id → `404`; `GET /products/not-a-uuid` → `404`.
  - `GET /products/search?q=nutella&country=US` merges curated and catalog results, de-duplicated (an index entry linked to a curated product appears once, as the product), catalog items have `id` starting `catalog:` and `grade: null`; `q=ab` searches products only.
- [ ] **Step 2:** Run → fails.
- [ ] **Step 3: Implement.** Scan: local hit → as today; else `hydrator.hydrate(...)`; `hydrated` → `200`; otherwise `202` with `preview` from `best_for_gtin` (message as today). `GET /products/{product_id}` takes `str`: `catalog:<int>` path as specified; else `UUID(...)` or `404`. Search: curated `service.search_products(limit=60)` + catalog `search(limit=60)` when `catalog_query_ok`; build `Candidate`s (catalog entries with `product_id` use the product's key `p:<uuid>`), `rank`, slice `offset:offset+limit`, `total = len(ranked)`. A statement timeout in the catalog query logs and falls back to curated-only.
- [ ] **Step 4:** Tests pass; full suite green.
- [ ] **Step 5:** Commit `feat(backend): scan, product and search endpoints use the catalog index`.

### Task 8: App

**Files:**
- Create: `nourai/lib/region.ts`
- Modify: `nourai/services/api.ts`, `nourai/app/(tabs)/search.tsx`, `nourai/app/product/[id].tsx`, `nourai/app/(tabs)/scan.tsx`

- [ ] **Step 1:** `region.ts`: `deviceRegion(): string | undefined` from `Intl.DateTimeFormat().resolvedOptions().locale` (`"en-US"` → `"US"`), guarded with try/catch.
- [ ] **Step 2:** `api.ts`: `ProductListItem.grade: string | null`; `BarcodeIngestionResponse.preview?: { name: string; brand?: string | null; image_url?: string | null; category: string } | null`; `searchProducts(q, { limit, category, country })`; `getProduct(id): Promise<Product | BarcodeIngestionResponse>` and `getProductWithFallback` widened accordingly.
- [ ] **Step 3:** `search.tsx` passes `country: deviceRegion()`.
- [ ] **Step 4:** `product/[id].tsx`: when the load returns an ingestion response, show the preview (image, brand, name) with "Loading details…" and poll `getIngestionStatus` (max ~45 polls, `poll_after_ms`); on `complete` → `router.replace('/product/<product_id>')`; on `needs_review`/`dead` → the existing "Product unavailable" state.
- [ ] **Step 5:** `scan.tsx`: while polling, the message reads `"<name> · <brand> — loading details…"` when a preview exists.
- [ ] **Step 6:** `npx tsc --noEmit` clean; lint changed files with a temporary flat config.
- [ ] **Step 7:** Commit `feat(app): catalog search results and previews while products load`.

### Task 9: End-to-end check and performance gate

- [ ] **Step 1:** Point a worktree backend at the test DB (OBF full + OFF sample imported, golden set seeded), run Metro, and verify in the simulator: search for a product only in the index → open it → it hydrates; scan path via deep link.
- [ ] **Step 2:** Run the full OFF import in the background on the test DB; then measure: `EXPLAIN ANALYZE` of the catalog search for 20 common queries (p95 target < 200 ms) and GTIN lookup (< 20 ms); record DB size.
- [ ] **Step 3:** Record results in the spec's phase-1 notes; commit `docs: phase 1 import and performance results`.
