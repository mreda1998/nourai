# Pathway maps and evidence charts

Status: design approved in conversation, pending written-spec review.
Inputs: `reports/longevity-evidence-product-direction-2026-09-25.md`, `reports/competitive-strategy-2026-09-25.md`.

## Goal

Show people how a molecule acts in the body and how far the human evidence actually goes — for any product, at catalogue scale — without ever presenting a mechanism, a guess or missing data as a proven benefit.

The user-facing promise for every ingredient is one visible ladder of certainty:

**Reviewed route → Mechanism only → Function only → Not yet reviewed**

Scale never forces a guess. It only leaves more ingredients lower on the ladder until someone reviews them.

## Non-goals (this spec)

- Multilingual substance identity at scale (layers 1–2 beyond what exists today) — separate spec.
- The "your stack" overlay on the Conflict Map — separate spec.
- Public lab results — separate spec.
- Any aggregate score. Nothing in this spec produces a number that goes up when a user buys or logs more.
- An admin/web review UI. Review happens through pull requests (see Workflow).
- Share-alike sources (ChEMBL, IUPHAR/BPS Guide to Pharmacology). Excluded until a licensing decision is made.

## Why this scales

Pathways attach to **active compounds**, never to products. Products (millions) resolve automatically to ingredients, ingredients to an active compound (`Magnesium Glycinate → Magnesium`, `Guarana extract → Caffeine`), and routes are written once per compound. Current data: 24,164 distinct raw ingredient names over 112,538 occurrences, dominated by spelling/language variants and functional ingredients that need no pathway. A few hundred reviewed compounds cover the actives that matter; everything else is shown honestly at its ladder level.

## The four layers

| Layer | Question | Produced by | Shown as |
|---|---|---|---|
| 1. Substance identity | What is this label name? | Existing matcher + `ingredient_aliases` (out of scope to extend here) | "Not yet reviewed" when unmatched |
| 2. Role | Active, nutrient, functional, fragrance? | `ingredients.role` + `function_summary` | Function line only, no pathway |
| 3. Mechanism facts | Which molecules/proteins/pathways/cell compartments are involved? | Automatic import from open databases only — no generated wording | "How it works (mechanism, not a proven benefit)" panels |
| 4. Reviewed routes | Does the mechanism lead to a measured human outcome, how much, where does evidence stop? | AI-drafted, machine-checked, human-approved YAML routes | Evidence chain, dose bar, evidence-grid cells |

Layer 3 never produces an outcome claim. Only a published layer-4 route can say an ingredient supports an outcome.

## Data model

### Changes to `ingredients`

- `active_moiety_id` (nullable self-FK): the compound whose routes this form inherits.
- `form_note` (text, nullable): form-specific note, e.g. absorption differences between salts.
- `role` (`active | nutrient | functional | fragrance | unknown`, default `unknown`).
- `function_summary` (text, nullable): one line for functional ingredients.

Route lookup for an ingredient: its own published routes, else those of its `active_moiety_id`.

### Layer 3 — `bio_entities`

| Field | Notes |
|---|---|
| `id` | UUID |
| `kind` | `small_molecule | protein | complex | process | cell_location | outcome` |
| `name`, `plain_name` | Scientific and plain-language labels |
| `chebi_id`, `pubchem_cid`, `uniprot_id`, `reactome_id`, `go_id`, `uniprot_sl_id` | Nullable external identifiers |
| `source_id` | FK `data_sources` |

### Layer 3 — `mechanism_facts`

| Field | Notes |
|---|---|
| `subject_id`, `object_id` | FK `bio_entities` |
| `relation` | `substrate_of | product_of | binds | inhibits | activates | transported_by | participates_in | located_in` |
| `source_id`, `source_reference` | FK `data_sources` + record id/URL in that source |
| `retrieved_at` | Timestamp |
| unique | (`subject_id`, `relation`, `object_id`, `source_id`) |

Plus `ingredient_mechanism_assets` (one row per ingredient × asset kind) for cached viewer inputs:

| Field | Notes |
|---|---|
| `ingredient_id` | FK |
| `kind` | `cell_locations | structure | pathway_illustration | pathway_diagram` |
| `payload` | JSONB — e.g. `{"sls": ["SL-0091","SL-0173"]}`, `{"pdb_id": "5MZP", "ligand": "CFF", "target": "ADORA2A"}`, `{"reactome_ehld": "R-HSA-71291", "highlight": "R-HSA-71288"}` |
| `cached_uri` | Our storage copy of the static fallback image/SVG |
| `attribution` | Text shown under the panel |
| `retrieved_at` | Timestamp |

### Layer 4 — routes

`pathway_routes`

| Field | Notes |
|---|---|
| `slug` | e.g. `creatine-strength-training` |
| `version` | Integer; published versions are immutable |
| `ingredient_id` | The active compound |
| `title`, `takeaway` | Plain language |
| `domain` | Backend biodomain key the outcome informs (for the evidence grid) |
| `status` | `draft | in_review | published | retired` |
| `reviewed_by`, `reviewed_at`, `published_at` | Filled on publish |
| `supersedes_id` | Previous version |
| `source_path`, `source_commit` | YAML file + git commit it was imported from |

`route_nodes`: `route_id`, `position`, `bio_entity_id` (nullable for product-input nodes), `label`, `plain_label`, `node_role` (`input | mechanism | outcome | boundary`).

`route_links`: `route_id`, `from_node`, `to_node`, `relation_text`, `evidence_type` (`meta_analysis | human_rct | human_observational | preclinical | established_biochemistry | proposed`), `strength` (`strong | moderate | limited | insufficient`), `evidence_stops_here` (bool), `stop_reason` (text, required when true).

`route_claims` (one or more per link):

| Field | Notes |
|---|---|
| `claim_text` | Exact wording shown |
| `population`, `comparator`, `duration`, `form` | Applicability |
| `dose_low`, `dose_high`, `dose_unit`, `dose_basis` | e.g. 3–5 g/day; basis `per_day` |
| `outcome_measure` | e.g. lean tissue mass |
| `effect_estimate`, `ci_low`, `ci_high`, `effect_unit` | Nullable when not reported |
| `certainty` | `high | moderate | low | very_low` (GRADE scale, set by the reviewer) |
| `limitations` | Plain text |
| `citations` | JSONB list of `{pmid?, doi?, url?}` — at least one |
| `checks` | JSONB — results of automated checks (below) |
| `drafted_by` | `ai | human` |

## Route files and review workflow

Routes live in the repo at `content/routes/<slug>.yaml`. Example (abridged):

```yaml
slug: creatine-strength-training
ingredient: Creatine
domain: body_composition
title: From scoop to strength
takeaway: >
  With resistance training, creatine adds a small, well-measured gain in lean
  mass and strength. Without training, the effect is unclear.
nodes:
  - {id: dose, role: input, label: Creatine monohydrate}
  - {id: pcr, role: mechanism, label: Muscle phosphocreatine, chebi: "CHEBI:17287"}
  - {id: atp, role: mechanism, label: Faster ATP regeneration, reactome: R-HSA-71288}
  - {id: lean, role: outcome, label: Lean mass with resistance training}
  - {id: life, role: boundary, label: Lifespan}
links:
  - from: dose
    to: pcr
    evidence_type: established_biochemistry
    strength: strong
  - from: pcr
    to: atp
    evidence_type: established_biochemistry
    strength: strong
  - from: atp
    to: lean
    evidence_type: meta_analysis
    strength: moderate
    claims:
      - claim_text: Lean tissue mass was higher with creatine than placebo when combined with resistance training.
        population: Older adults (22 RCTs, n=721)
        comparator: Placebo + resistance training
        dose: {low: 3, high: 5, unit: g, basis: per_day}
        outcome_measure: Lean tissue mass
        effect: {estimate: 1.37, ci: [0.97, 1.76], unit: kg}
        citations: [{pmid: "29138605"}]
  - from: lean
    to: life
    evidence_stops_here: true
    stop_reason: No human study has measured lifespan with creatine.
```

Workflow:

1. **Draft** — a script (`scripts/draft_route.py <ingredient>`) asks Claude to draft a route YAML from specified primary sources (reports, meta-analyses, pathway databases) and opens a PR. Drafts carry `drafted_by: ai`.
2. **Automated checks (CI)**, blocking merge on failure:
   - YAML validates against the schema; every non-boundary outcome link has ≥1 claim; every `evidence_stops_here` has a `stop_reason`.
   - Every PMID/DOI resolves (PubMed E-utilities / Crossref).
   - Every numeric value in a claim (effect, CI bounds, dose bounds, sample size) appears in the cited abstract; otherwise the claim is marked `needs_full_text` and the reviewer must confirm it explicitly in the PR.
   - Every `chebi` / `reactome` / `uniprot` id resolves.
   - No outcome link may use `evidence_type: established_biochemistry` or `proposed` with `strength` above `limited`.
3. **Review** — the reviewer reads the PR (rendered preview comment of the chain); merging is approval. The merge commit's author becomes `reviewed_by`.
4. **Publish** — `scripts/import_routes.py` imports merged files; a changed file creates a new `version` with `supersedes_id`, never editing a published row. Git history is the public change log.

## Automatic mechanism job (layer 3)

`scripts/import_mechanisms.py [--ingredient NAME | --top N]`, idempotent, per active compound:

| Step | Source (license) | Writes |
|---|---|---|
| Resolve molecule | PubChem, ChEBI (open) — matches below a confidence threshold create a `review_tasks` row instead | `ingredient_external_identifiers`, `bio_entities` |
| Reactions and pathways | Reactome ContentService (CC0), Rhea (CC BY 4.0) | `mechanism_facts`, `pathway_illustration`/`pathway_diagram` assets |
| Cell locations | UniProt subcellular locations of participating human proteins (CC BY 4.0) | `cell_locations` asset (SL ids) |
| Target structure | RCSB PDB search by ligand + human target (public domain); prefer best resolution | `structure` asset |

Each source registers a `data_sources` row with license and attribution. Failures on one step never block others; missing assets simply hide their panel.

## API

- `GET /ingredients/{id}/mechanism` → ladder level, published route (if any, via active moiety), mechanism assets with attribution.
- `GET /routes/{slug}` → latest published version with nodes, links, claims.
- `GET /products/{id}/evidence` → evidence grid rows (one per active compound present) and dose bars (product amount vs claim dose range vs `upper_limit`), each cell carrying its ladder level.

Ladder level is computed, not stored: published route → `reviewed`; else any mechanism fact → `mechanism`; else `role` is not `unknown` or `function_summary` is set → `function`; else `unidentified`.

## App

### How it works tab (ingredient page)

Panels in order, each rendered only when its data exists:

1. Ladder badge.
2. **Evidence chain** — Elory's own component (react-native-svg), vertical: input → mechanism → outcome → boundary. Solid links for human evidence, dashed with the stop reason where evidence ends. Tapping a link opens a sheet with claim details (population, comparator, duration, dose, estimate with CI, limitations, citations). Only for reviewed routes. Visual style to be finalised during implementation with a design pass — the first mockups were rejected on look, not structure.
3. **Where it acts** — SwissBioPics cell with highlighted compartments.
4. **See it bind** — Mol* focused on the ligand in its target.
5. **The bigger picture** — Reactome illustration with the relevant region highlighted; link to the exact reaction diagram.

Panels 3–5 display the source attribution beneath them.

### Viewer hosting

- The backend serves three small static pages: `/viewers/cell?sls=…`, `/viewers/structure?pdb=…&ligand=…`, `/viewers/pathway?ehld=…&highlight=…`. Mol* and SwissBioPics load there, not in the app bundle.
- The app shows them with `react-native-webview` (new native dependency → one development-build rebuild).
- Each panel falls back to its cached static image when offline or when the WebView fails, and to nothing (panel hidden) when no asset exists.

### Charts

- **Dose bar** (route screen and product page): studied range from the claim, `upper_limit` marker when known, product/logged amount marker. Incompatible or missing units → the bar shows the studied range only with "Amount on this product unknown".
- **Evidence grid** (product page): rows = active compounds, columns = domains that have at least one published route in the catalogue. Cell = direction (supports / mixed / risk) + strength from published routes, else `mechanism only`, else `not reviewed`. No totals, sorting by alphabet only.

## Error handling and honesty rules

- Missing data hides a panel or shows its ladder level; it never shows a placeholder claim.
- A route whose citations stop resolving is caught by a weekly scheduled CI check, which opens a `citation-review` issue for the reviewer; the route stays published until a corrected version is merged.
- The API never returns AI-derived `ingredient_biodomain_scores` values in any response defined here.
- Product-page copy may say "present in this product", never "active in your body".

## Testing

- Backend unit tests: YAML schema validation, versioning (published rows immutable), ladder-level computation, active-moiety inheritance, dose-bar unit handling (mg/g/µg, IU, unknown), evidence-grid assembly.
- CI checks tested with fixture YAMLs (good route; missing stop reason; number absent from abstract; unresolvable PMID).
- Mechanism job tested against recorded API responses (no live calls in tests).
- App: TypeScript check; manual simulator pass on the four routes, a mechanism-only ingredient, a function-only ingredient and an unidentified one; offline fallback check.

## Rollout

1. Schema + migrations; route import; API; ladder badge.
2. Creatine route end to end (YAML → PR → CI → import → app chain + dose bar).
3. Viewer pages + WebView panels; mechanism job for the four compounds.
4. Caffeine, psyllium, NMN routes; evidence grid on product pages.
5. Mechanism job for the top ~50 actives by scan count.

## Open questions

- Reviewer identity shown to users: named reviewer per route, or "Reviewed by Elory's science team"? (Default for now: named, from the merge author.)
- Whether to seek a share-alike licensing decision to use ChEMBL/GtoPdb target data.
