# Product and laboratory ingestion architecture

## Decision

Elory remains one backend codebase with two independently scalable processes:

- **API:** serves canonical, published product data and creates idempotent jobs on cache misses.
- **Worker:** leases PostgreSQL jobs, fetches upstream records, resolves entities, creates revisions, and processes authentic images.

PostgreSQL is intentionally the first durable queue. It provides transactional
idempotency, leases with `SKIP LOCKED`, retry state, and an audit trail without
introducing Kafka or another operations surface before throughput requires it.

```text
mobile scan / batch manifest
            │
            ▼
       FastAPI API ───── known GTIN ─────► published Product projection
            │
            └──── miss (202) ─────► ingestion_jobs (PostgreSQL)
                                           │ leased by N workers
                                           ▼
                                    upstream connectors
                                           │
                  ┌────────────────────────┼─────────────────────┐
                  ▼                        ▼                     ▼
            SourceRecord             ProductRevision       ProductAsset
          (immutable raw)          (immutable normalized)  (authentic media)
                  │                        │                     │
                  └────────► quality rules / review ◄────────────┘
                                           │
                                           ▼
                                  published Product projection
```

## Product scale target

Use coverage milestones, not a vanity total:

1. **25,000 high-value products:** supplements, packaged foods, cosmetics, and
   OTC products most likely to be scanned in the initial markets. Require a
   valid GTIN, name, ingredient statement, source provenance, and ideally a
   verified front image.
2. **100,000 products:** expand based on scan misses, retailer/category demand,
   and market coverage. Keep review effort concentrated on frequent products.
3. **250,000+ products:** switch acquisition to licensed bulk exports/deltas.
   The normalization, revision, quality, asset, and serving layers remain the
   same; only the connector feeding `SourceRecord` changes.

Do not crawl Open Food Facts search endpoints to build the catalogue. Seed the
first milestone from a prioritized GTIN manifest (`make enqueue-barcodes FILE=…`)
and use bulk daily exports for larger refreshes. Manifest jobs use a daily (or
operator-supplied) run key, so reruns are idempotent within a batch while later
refreshes can create a new source snapshot/revision.

## Data contracts

- `data_sources`: ownership, license, attribution, and source priority.
- `source_records`: immutable raw snapshots identified by source/external ID/hash.
- `product_identifiers`: GTIN-14 and future retailer/regulatory identifiers.
- `product_revisions`: immutable formulation snapshots with field provenance.
- `product_ingredient_occurrences`: ordered, nested raw ingredient occurrences.
- `ingredient_aliases`: approved exact aliases only; ambiguous names are not
  silently linked.
- `quality_issues` and `review_tasks`: explicit machine and editorial queues.
- `products` and `product_ingredients`: current published read projections for
  mobile compatibility.

## Image policy

Product imagery is evidence. Never use a generative model to redraw a package,
repair label text, add missing areas, or create a plausible front view.

The `authentic-v1` pipeline may only:

- apply EXIF orientation;
- flatten transparency on white;
- resize without upscaling;
- standardize to JPEG;
- compute cryptographic/perceptual hashes and a basic quality score;
- retain source URL, license, attribution, and original bytes when storage is configured.

Prefer, in order: manufacturer/brand media feeds with explicit rights, retailer
feeds with image rights, then contributor datasets such as Open Food Facts with
their required attribution/share-alike terms. Manual replacement must create a
new asset row rather than overwrite provenance.

## Public laboratory results

Lab evidence is stored as:

```text
LabDataset → LabSample → LabAnalysis → LabObservation → LabInterpretation
```

The observation is the published measurement. Interpretations are separately
versioned applications of a named threshold, jurisdiction, and population. A
sample is linked to a product only by exact GTIN (and optionally a future exact
lot/formulation match); unlinked records remain available as dataset evidence
instead of being guessed onto a product.

Every imported dataset needs a publisher, source URL, versioned slug, license,
method, sample identity, units/basis, and raw published artifact URI. Reusing a
slug with changed content is rejected.

Start with `docs/examples/lab_dataset.example.json`, copy values exactly from
the published artifact, then run `make import-lab FILE=path/to/manifest.json`.

## Operations

- Run migration `015` before the new API or worker.
- Run one API deployment and one worker deployment from the same image.
- Scale worker replicas horizontally; leases prevent duplicate active work.
- Monitor queue depth/age, retry/dead counts, unresolved ingredient rate,
  product quality-score distribution, image failure rate, and review backlog.
- Back up PostgreSQL and retain original licensed source artifacts.
