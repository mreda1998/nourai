# Catalog coverage — design

Date: 2026-10-06 · Status: approved in conversation, awaiting spec review
Branch: `claude/catalog-coverage` (stacked on PR #2, whose dose bars phase 2 feeds)

## Goal

Make Elory's catalog competitive with Ask Baseline (2M+ products) for a **global** audience, with the
**US** as the market to win. Four problems, all in scope:

1. **Scans miss** — an unknown barcode returns "We are verifying this product" and the user waits.
2. **Search can't find it** — search only covers what was imported (≈6,450 products in the local database).
3. **Supplements are thin** — 11 of 25,034 supplement ingredient rows carry an amount, so the dose check
   runs on ~2 products.
4. **Data quality** — label-language ingredient names ("Nudeln"), no serving size or NOVA on most foods,
   coarse categories, lost Open Food Facts attribution.

Constraints: Supabase **Pro (8 GB)**; backend on Railway (API + `elory-ingestion-worker`); the existing
ingestion pipeline (`data_sources`, `source_records`, `ingestion_jobs`, `product_identifiers`,
`product_revisions`, quality issues, review tasks) is the foundation — extend it, don't replace it.

## Approach: thin index + on-demand hydration

Bulk-load a cheap, replaceable **index** of every product from public dumps. Scan and search hit the index;
a product's full details are **hydrated** through the existing pipeline the first time it's opened.
DSLD (supplements) is the exception — small and dose-rich, it is hydrated eagerly at import.

Rejected: a full mirror (tens of GB, most products never opened) and live-lookup-only (Open Food Facts
allows ~10 search requests/min). Live lookup remains the fallback for barcodes absent from the index.

## 1. Data model and imports

### `catalog_entries` (new table)

| column | notes |
|---|---|
| `id` | bigint identity |
| `source_id` | FK `data_sources` |
| `external_id` | OFF/OBF code · USDA `fdcId` · DSLD label id |
| `gtin14` | nullable (some DSLD labels have no UPC) |
| `name`, `brand` | as published by the source |
| `category` | food / supplement / cosmetic / otc |
| `countries` | ISO-2 array (where sold) |
| `lang`, `image_url` | |
| `search_text` | `name ‖ ' ' ‖ brand`, lower-cased and accent-stripped in Python at import (no `unaccent` extension) |
| `popularity` | OFF `unique_scans_n`; USDA/DSLD: label-count proxy |
| `completeness` | 0–1 |
| `product_id` | FK `products`, set once hydrated |
| `source_updated_at`, `imported_at`, `content_hash` | change detection |

Constraints and indexes: unique `(source_id, external_id)`; btree `gtin14`; GIN trigram on `search_text`;
btree `(category, popularity DESC)`. Estimated 4.5M rows ≈ 1 GB heap + 1–1.5 GB indexes.

Duplicates across sources are **not merged**. The best entry for a GTIN is chosen at read time by
`data_sources.priority`, category-aware: supplements DSLD > OFF; US food USDA > OFF; elsewhere OFF.

### Sources (`data_sources` rows)

| slug | records | licence | contributes |
|---|---|---|---|
| `openfoodfacts` | ~4M | ODbL (attribution, share-alike) | global food, NOVA, taxonomy IDs, additives |
| `openbeautyfacts` | tens of thousands | ODbL | cosmetics |
| `usda-branded` | ~450k | CC0 | US barcodes, per-serving label nutrients |
| `nih-dsld` | ~200k labels | public domain | supplements with per-serving amounts and units |

### Import job

`python -m scripts.catalog_import --source <slug> [--resume] [--force] [--dry-run]`, runnable anywhere
with `DATABASE_URL`; a monthly schedule is phase 4.

- Streams each dump over HTTP and parses it line by line — never written to disk or held in memory
  (OFF JSONL ≈ 7 GB gzipped; Railway disk is ephemeral).
- Filters: a name plus a GTIN, or a DSLD id; known test/internal codes dropped.
- `COPY` into a staging table, then batched upserts on `(source_id, external_id)` that rewrite a row only
  when `content_hash` changed.
- Per-run stats (dump date, added/updated/skipped/malformed) and a resume checkpoint in
  `data_sources.extra_data`.
- While streaming OFF, tallies `additives_tags` frequencies for the research batch (section 3).
- **DSLD** is also hydrated during import: every label becomes a published supplement in `products` with
  `product_ingredients.amount`/`unit` per serving, resolved against the research library — so the dose
  check (PR #2) works without a scan.

## 2. Scan, search and hydration

### Scan — `GET /products/barcode/{code}`

1. Hydrated product for the GTIN → `200`, as today.
2. Else best `catalog_entries` row → hydrate **inline** within a ~4 s budget: fetch the full record
   (OFF/OBF product API; USDA FoodData Central `/food/{fdcId}` with the existing `USDA_API_KEY`), run the
   existing pipeline (product, revision, identifiers), set `catalog_entries.product_id` → `200`.
   On timeout/upstream error → enqueue the existing job and return `202` **with a preview**
   (`name`, `brand`, `image_url`, `category` from the index).
3. Not in the index → live OFF/OBF lookup within the same budget → else queue → else the existing
   submit-product flow.

### Search — `GET /products/search?q=&category=&country=`

- Candidates: hydrated `products` ∪ unhydrated `catalog_entries`, de-duplicated by GTIN / `product_id`.
- Ranking (pure function, unit-tested): exact name/brand prefix > trigram similarity × log(popularity),
  × country boost when `country` (ISO-2) ∈ `countries`, small bonus when hydrated. The query is
  normalised the same way as `search_text`.
- Unhydrated results carry `id = "catalog:<entry id>"`.
- Trigram match on `search_text` with a similarity threshold; `statement_timeout` ≈ 300 ms with fallback
  to a prefix-only search over `products`.
- Logs a `search` insights event with `result_count` (needed for the success metric).

### Opening a result — `GET /products/{id}`

Accepts a UUID or `catalog:<id>`; the latter hydrates inline exactly like the scan path (`200` product or
`202` preview).

### App

- Search results and the product route accept `catalog:` ids; search sends the device region as `country`.
- Scan shows the `202` preview (name, brand, image, "Loading details…") while it polls, instead of
  "We don't know this one yet".

### Upstream load

OFF is called only on first open of a product (well inside 100 product reads/min); afterwards it's served
from our database.

## 3. Data quality (applied at hydration)

1. **English names, provenance kept.** The OFF parser currently prefers each structured ingredient's
   `text` (label language). It will match and display by the taxonomy `id` (`en:noodle` → "Noodle") and
   keep the label's wording in the occurrence's `raw_text`. Items with no `en:` id keep the label text and
   count as not yet reviewed.
2. **ID-based matching.** Fill the existing `ingredient_external_identifiers` with OFF taxonomy ids
   (scheme `off_taxonomy`) and E-numbers (scheme `e_number`) for library ingredients; the resolver checks
   external ids before alias text. A seed script proposes ids from canonical names and synonyms, verifies
   them against OFF's downloadable taxonomy, and writes uncertain ones to a review file.
3. **Additives.** `additives_tags` become ingredient occurrences. Library-matched additives tier as
   Avoid / Watch from curated status; unmatched ones count as unreviewed, never flagged by default. The
   100 most frequent E-numbers (tallied during import) go through the existing research agent, with human
   review before publishing.
4. **Nutrition, serving, NOVA.** The connector keeps per-100 g and per-serving nutriments,
   `serving_size`/`serving_quantity` and `nova_group` (what `backfill_off_details.py` does today, moved into
   the pipeline). USDA hydration takes per-serving label nutrients; when OFF has the same GTIN, missing
   fields (e.g. NOVA) are borrowed with per-field provenance. The main record always comes from the
   priority source.
5. **Categories.** A code-level mapping from OFF `categories_tags`, USDA `brandedFoodCategory` and DSLD
   product type to our four categories plus a subcategory ("Protein bars", "Multivitamins").
6. **Attribution for every source.** `extra_data.source` (single string) becomes `extra_data.sources`
   (list); the product response renders one attribution per contributing source from `data_sources`
   licence fields. A one-off migration restores the ODbL attribution on products whose `source` the USDA
   backfill overwrote.
7. **Quality gates unchanged.** Pipeline quality issues and review tasks still decide publication; an
   unpublished product's index entry still appears in search, with a preview.

## 4. Failure handling

- **Imports:** resumable checkpoint; malformed lines skipped and counted; a run that would change >20% of
  a source's rows aborts without `--force`; refuses to start if database size plus estimated growth would
  exceed 7 GB (`pg_database_size`).
- **Hydration:** 4 s budget; timeout/error → existing queue with backoff + preview. A circuit breaker
  stops inline hydration for 60 s after repeated 429/5xx from a source.
- **Search:** statement timeout with prefix fallback.
- **Licensing:** the database is never redistributed; attribution is shown per source; `share_alike` is
  recorded on each source.

## 5. Testing

- **Unit:** per-source record parsers on small real fixtures (OFF/OBF JSONL lines, a USDA food, a DSLD
  label); GTIN normalisation; source priority; the ranking function; taxonomy-name formatting; category
  mapping; field borrowing with provenance; import filters and change detection.
- **Integration** (existing DB-backed suite): fixture dump → `catalog_entries`; scan index hit → hydrate
  via a fake connector → `200`; timeout → `202` + preview; search ranking and country boost; `catalog:` id
  resolution; DSLD eager hydration produces dose measures.
- **Performance gate** (staging, after the real OFF import): search p95 < 200 ms; GTIN lookup < 20 ms.

## 6. Phases (each shippable)

Each phase gets its own implementation plan, written when the previous phase ships.


1. `catalog_entries` + OFF/OBF import; scan and search on the index; inline hydration with previews;
   `search` events. → scans and search.
2. DSLD full import (eager hydration) + USDA Branded index and hydration. → supplement doses, US coverage.
3. Data quality: taxonomy ids, ID-based matching, additives, category mapping, attribution list + restore
   migration.
4. Monthly refresh schedule; additive research batch.

## 7. Success metrics

Measured from insights events (`scan` already logged; `search` added in phase 1):

| metric | target |
|---|---|
| First-scan hit rate (`200` on first scan) | ≥ 90% (baseline measured before phase 1) |
| Zero-result searches (≥ 3 characters) | < 10% |
| Supplements with ≥ 1 dose bar | ~2 → > 100,000 |
| Hydrated foods with English ingredient names | ≥ 95% |
| NOVA present on OFF-sourced foods where OFF has it | 100% |

## Out of scope

Category percentile and better-alternative swap (they build on phase 3's subcategories), user-submitted
product moderation changes, image hosting changes, and non-English UI.
