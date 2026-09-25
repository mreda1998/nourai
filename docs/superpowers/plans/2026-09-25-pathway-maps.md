# Pathway Maps and Evidence Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show how each active compound acts in the body (cell location, bound structure, pathway context) and how far human evidence goes (reviewed routes, dose bar, evidence grid), at catalogue scale, without presenting mechanisms or missing data as benefits.

**Architecture:** Four layers. Layer 3 (mechanism facts) is imported automatically from open databases by an idempotent job. Layer 4 (reviewed routes) is authored as YAML in `content/routes/`, checked in CI, merged by PR, and imported as immutable versions. The API computes each ingredient's ladder level and assembles product evidence automatically; the app renders our own evidence chain plus hosted web viewers (Mol*, SwissBioPics, Reactome) in a WebView.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (PostgreSQL/Supabase), Pydantic v2, PyYAML, httpx, pytest; Expo 54 / React Native 0.81, react-native-svg, react-native-webview (new).

**Spec:** `docs/superpowers/specs/2026-09-25-pathway-maps-design.md`

## Global Constraints

- Ladder levels, exactly: `reviewed | mechanism | function | unidentified`, shown as "Reviewed route · Mechanism only · Function only · Not yet identified".
- Layer 3 never produces an outcome claim; only a published route can.
- Published route versions are immutable; a change creates `version + 1` with `supersedes_id`.
- No response defined here returns `ingredient_biodomain_scores` values.
- Product copy says "present in this product", never "active in your body".
- Excluded sources: ChEMBL, IUPHAR/BPS Guide to Pharmacology (share-alike).
- Every viewer panel shows its source attribution; panels with no data are hidden, never filled with placeholders.
- Evidence grid: no totals; rows and columns sorted alphabetically.
- Backend tests run with `/Users/redar/Desktop/nourai/backend-nourai/venv/bin/python -m pytest tests -q` from `backend-nourai/`; app checks with `./node_modules/.bin/tsc --noEmit -p .` from `nourai/`.
- Writes to the shared Supabase database (migration, imports, mechanism job) require the user's explicit go-ahead at execution time.

## File Structure

Backend (`backend-nourai/`):

| File | Responsibility |
|---|---|
| `alembic/versions/017_pathway_maps.py` | New tables + ingredient columns |
| `app/models/pathway.py` | `BioEntity`, `MechanismFact`, `IngredientMechanismAsset`, `PathwayRoute`, `RouteNode`, `RouteLink`, `RouteClaim` |
| `app/models/ingredient.py` | + `active_moiety_id`, `form_note`, `role`, `function_summary` |
| `app/services/routes/schema.py` | Pydantic model of a route YAML file + structural validation |
| `app/services/routes/checks.py` | Citation / number / identifier checks with injectable fetchers |
| `app/services/routes/importer.py` | Import plan (pure) + DB apply |
| `app/services/evidence_views.py` | Ladder level, dose bar, evidence grid (pure) |
| `app/services/mechanisms/clients.py` | Reactome / UniProt / RCSB HTTP clients |
| `app/services/mechanisms/job.py` | Per-compound mechanism import |
| `app/schemas/pathway.py` | API response models |
| `app/api/v1/routes_api.py` | `GET /routes/{slug}` |
| `app/api/v1/ingredients.py` | + `GET /{id}/mechanism` |
| `app/api/v1/products.py` | + `GET /{id}/evidence` |
| `app/viewers/` | `cell.html`, `structure.html`, `pathway.html` + router with allow-listed image cache |
| `scripts/check_routes.py`, `scripts/import_routes.py`, `scripts/import_mechanisms.py`, `scripts/draft_route.py` | CLIs |
| `tests/test_route_schema.py`, `tests/test_route_checks.py`, `tests/test_route_importer.py`, `tests/test_evidence_views.py`, `tests/test_mechanism_job.py`, `tests/fixtures/routes/*.yaml`, `tests/fixtures/mechanisms/*.json` | Tests |

Repo root: `content/routes/*.yaml` (4 routes), `.github/workflows/routes.yml`.

App (`nourai/`):

| File | Responsibility |
|---|---|
| `services/api.ts` | Types + `getIngredientMechanism`, `getRoute`, `getProductEvidence` |
| `components/science/LadderBadge.tsx` | Ladder level pill |
| `components/science/EvidenceChain.tsx` | Our route renderer + claim sheet |
| `components/science/DoseBar.tsx` | Studied range / upper limit / this amount |
| `components/science/EvidenceGrid.tsx` | Compounds × domains grid |
| `components/science/ViewerPanel.tsx` | WebView panel with fallback image + attribution |
| `app/ingredient/[id].tsx` | "How it works" tab uses the above |
| `app/product/[id].tsx` | Evidence section (grid + dose bars) |

---

### Task 1: Data model and migration

**Files:**
- Create: `backend-nourai/app/models/pathway.py`, `backend-nourai/alembic/versions/017_pathway_maps.py`
- Modify: `backend-nourai/app/models/ingredient.py`, `backend-nourai/app/models/__init__.py`
- Test: `backend-nourai/tests/test_pathway_models.py`

**Interfaces:**
- Produces: ORM classes `BioEntity`, `MechanismFact`, `IngredientMechanismAsset`, `PathwayRoute`, `RouteNode`, `RouteLink`, `RouteClaim`; `Ingredient.active_moiety_id`, `.form_note`, `.role`, `.function_summary`; enum `IngredientRole` (`active|nutrient|functional|fragrance|unknown`).

- [ ] **Step 1: Failing test** — tables and columns are registered:

```python
from app.db.base import Base
import app.models  # noqa: F401

def test_pathway_tables_registered():
    for t in ["bio_entities", "mechanism_facts", "ingredient_mechanism_assets",
              "pathway_routes", "route_nodes", "route_links", "route_claims"]:
        assert t in Base.metadata.tables

def test_ingredient_has_role_and_moiety():
    cols = Base.metadata.tables["ingredients"].c
    for c in ["active_moiety_id", "form_note", "role", "function_summary"]:
        assert c in cols

def test_route_versions_unique_per_slug():
    t = Base.metadata.tables["pathway_routes"]
    assert any({c.name for c in con.columns} == {"slug", "version"} for con in t.constraints if con.__class__.__name__ == "UniqueConstraint")
```

- [ ] **Step 2:** Run → FAIL (tables missing).
- [ ] **Step 3:** Implement models per spec "Data model" (column names exactly as spec; `pathway_routes` UniqueConstraint(`slug`,`version`) and a `content_hash` String(64) column; `mechanism_facts` UniqueConstraint(`subject_id`,`relation`,`object_id`,`source_id`); `ingredient_mechanism_assets` UniqueConstraint(`ingredient_id`,`kind`); cascades from route to nodes/links/claims). Migration `017` creates them and adds the four ingredient columns (`role` String(20) server_default `'unknown'`).
- [ ] **Step 4:** Run → PASS; `python -c "import app.main"`.
- [ ] **Step 5:** Commit `feat(pathways): data model and migration 017`.

### Task 2: Route file schema and structural validation

**Files:**
- Create: `backend-nourai/app/services/routes/__init__.py`, `backend-nourai/app/services/routes/schema.py`, `backend-nourai/tests/fixtures/routes/{good.yaml,missing_stop_reason.yaml,mechanism_overclaim.yaml}`
- Test: `backend-nourai/tests/test_route_schema.py`

**Interfaces:**
- Produces: `RouteFile` (pydantic) with `slug, ingredient, create_if_missing: IngredientSeed | None, forms: list[str], domain, title, takeaway, nodes: list[NodeSpec], links: list[LinkSpec], structure: StructureSpec | None`; `load_route(path: Path) -> RouteFile`; `validate_route(route: RouteFile) -> list[str]` (empty = valid). `ClaimSpec` fields: `claim_text, population, comparator, duration, form, dose: DoseSpec | None, outcome_measure, effect: EffectSpec | None, certainty, limitations, citations: list[CitationSpec], drafted_by`.

- [ ] **Step 1: Failing tests**

```python
from pathlib import Path
from app.services.routes.schema import load_route, validate_route
F = Path(__file__).parent / "fixtures" / "routes"

def test_good_route_is_valid():
    assert validate_route(load_route(F / "good.yaml")) == []

def test_stop_without_reason_is_rejected():
    errors = validate_route(load_route(F / "missing_stop_reason.yaml"))
    assert any("stop_reason" in e for e in errors)

def test_mechanism_link_cannot_claim_strong_outcome():
    errors = validate_route(load_route(F / "mechanism_overclaim.yaml"))
    assert any("outcome" in e and "limited" in e for e in errors)

def test_outcome_link_needs_a_claim_with_citation():
    r = load_route(F / "good.yaml")
    r.links[2].claims = []
    assert any("claim" in e for e in validate_route(r))

def test_unknown_node_reference_is_rejected():
    r = load_route(F / "good.yaml")
    r.links[0].to = "nowhere"
    assert any("nowhere" in e for e in validate_route(r))
```

Fixture `good.yaml` is the creatine example from the spec with `forms: [Creatine Monohydrate]`; the other two copy it and (a) set `evidence_stops_here: true` without `stop_reason`, (b) make the `atp → lean` link `evidence_type: established_biochemistry, strength: strong`.

- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Implement. Rules in `validate_route`: node ids unique; link endpoints exist; `evidence_stops_here` ⇒ non-empty `stop_reason`; every link whose `to` node has role `outcome` and is not a stop ⇒ ≥1 claim, each claim ≥1 citation; links into `outcome` nodes with `evidence_type in {established_biochemistry, proposed}` ⇒ `strength` ∈ {`limited`,`insufficient`} (message contains "outcome" and "limited"); `certainty` ∈ {`high`,`moderate`,`low`,`very_low`}; `effect.ci` has two ordered numbers.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(pathways): route file schema and validation`.

### Task 3: Citation, number and identifier checks + CLI

**Files:**
- Create: `backend-nourai/app/services/routes/checks.py`, `backend-nourai/scripts/check_routes.py`
- Test: `backend-nourai/tests/test_route_checks.py`

**Interfaces:**
- Consumes: `RouteFile`, `load_route`, `validate_route`.
- Produces: `Fetchers` protocol `{abstract(pmid) -> str | None, doi_exists(doi) -> bool, chebi_exists(id) -> bool, reactome_exists(id) -> bool, uniprot_exists(id) -> bool}`; `HttpFetchers(client: httpx.Client)`; `check_route(route, fetchers) -> CheckReport` where `CheckReport.errors: list[str]`, `.needs_full_text: list[str]` (claim texts whose numbers are absent from the abstract), `.ok: bool` (no errors). `numbers_in(claim) -> list[str]` returns the formatted numbers to find (effect estimate, CI bounds, dose bounds).

- [ ] **Step 1: Failing tests** (fake fetchers, no network)

```python
from app.services.routes.checks import check_route, numbers_in
from app.services.routes.schema import load_route
from pathlib import Path
F = Path(__file__).parent / "fixtures" / "routes"
ABSTRACT = "lean tissue mass (mean difference =1.37 kg [95% CI =0.97-1.76]) ... 3 to 5 g"

class Fake:
    def __init__(self, abstract=ABSTRACT, ok=True): self.a, self.ok = abstract, ok
    def abstract(self, pmid): return self.a if self.ok else None
    def doi_exists(self, doi): return self.ok
    def chebi_exists(self, i): return self.ok
    def reactome_exists(self, i): return self.ok
    def uniprot_exists(self, i): return self.ok

def test_good_route_passes():
    rep = check_route(load_route(F / "good.yaml"), Fake())
    assert rep.ok and rep.needs_full_text == []

def test_unresolvable_citation_fails():
    rep = check_route(load_route(F / "good.yaml"), Fake(ok=False))
    assert not rep.ok and any("29138605" in e for e in rep.errors)

def test_number_missing_from_abstract_needs_full_text():
    rep = check_route(load_route(F / "good.yaml"), Fake(abstract="no numbers here"))
    assert rep.ok and rep.needs_full_text

def test_numbers_are_formatted_like_papers():
    claim = load_route(F / "good.yaml").links[2].claims[0]
    assert {"1.37", "0.97", "1.76"} <= set(numbers_in(claim))
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Number matching normalises the abstract (unicode minus → `-`, strip thin spaces) and checks each number as a whole token (`(?<![\d.])1.37(?![\d])`); signs ignored (abstracts write "-0.33" or "0.33 lower"). `HttpFetchers` uses PubMed efetch (`rettype=abstract&retmode=text`), `https://api.crossref.org/works/{doi}`, `https://www.ebi.ac.uk/chebi/backend/api/public/compound/{id}/` (fallback `https://www.ebi.ac.uk/ols4/api/ontologies/chebi/terms?obo_id=CHEBI:{n}`), `https://reactome.org/ContentService/data/query/{id}`, `https://rest.uniprot.org/uniprotkb/{acc}.json`. `scripts/check_routes.py [paths…]` (default `content/routes/*.yaml`): runs `validate_route` then `check_route`, prints a Markdown report, exits 1 on any error.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(pathways): route citation and identifier checks`.

### Task 4: Route importer (versioned)

**Files:**
- Create: `backend-nourai/app/services/routes/importer.py`, `backend-nourai/scripts/import_routes.py`
- Test: `backend-nourai/tests/test_route_importer.py`

**Interfaces:**
- Consumes: `RouteFile`, ORM classes from Task 1.
- Produces: `content_hash(route: RouteFile) -> str` (sha256 of canonical JSON); `plan_import(route, latest: PublishedSummary | None) -> ImportAction` where `PublishedSummary = (version: int, content_hash: str)` and `ImportAction.kind ∈ {"create","new_version","unchanged"}`, `.version: int`; `async apply_route(session, route, *, reviewer: str, commit: str, source_path: str) -> ImportAction`.

- [ ] **Step 1: Failing tests** (pure part)

```python
from app.services.routes.importer import plan_import, content_hash
from app.services.routes.schema import load_route
from pathlib import Path
R = load_route(Path(__file__).parent / "fixtures" / "routes" / "good.yaml")

def test_first_import_creates_version_1():
    a = plan_import(R, None); assert (a.kind, a.version) == ("create", 1)

def test_same_content_is_unchanged():
    a = plan_import(R, (1, content_hash(R))); assert a.kind == "unchanged"

def test_changed_content_creates_next_version():
    a = plan_import(R, (3, "different")); assert (a.kind, a.version) == ("new_version", 4)

def test_hash_ignores_yaml_key_order():
    assert content_hash(R) == content_hash(R.model_copy(deep=True))
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `apply_route`: find ingredient by `canonical_name` (case-insensitive); if absent and `create_if_missing` present, create it with `role='active'`; else raise. Set `role='active'` on it. For each name in `forms`, find the ingredient and set `active_moiety_id`. Upsert `bio_entities` for nodes carrying chebi/reactome/uniprot ids. Insert `PathwayRoute(status='published', published_at=now, reviewed_by=reviewer, source_commit=commit, source_path=…, content_hash=…)` with nodes/links/claims; when `new_version`, set `supersedes_id` and mark the previous row `retired`. Store `structure` spec as an `ingredient_mechanism_assets(kind='structure')` row (reviewed pins win over automatic). `scripts/import_routes.py [paths…] --reviewer NAME --commit SHA` (defaults from `git log -1 --format=%an/%H -- <file>`), `--dry-run` prints actions only.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(pathways): versioned route importer`.


### Task 5: Ladder, dose bar and evidence grid (pure)

**Files:**
- Create: `backend-nourai/app/services/evidence_views.py`
- Test: `backend-nourai/tests/test_evidence_views.py`

**Interfaces:**
- Produces:
  - `ladder_level(*, has_published_route: bool, has_mechanism: bool, role: str | None, function_summary: str | None) -> Literal["reviewed","mechanism","function","unidentified"]`
  - `dose_bar(*, studied_low: float, studied_high: float, studied_unit: str, upper_limit: str | None, amount: str | None, amount_unit: str | None) -> DoseBar` with fields `studied_low_mg | None`, `studied_high_mg | None`, `unit_label: str`, `upper_limit_value: float | None`, `amount_value: float | None`, `amount_note: str | None` ("Amount on this product unknown" / "Units not comparable").
  - `evidence_grid(rows: list[GridInput]) -> Grid` where `GridInput = (compound: str, level, published: list[(domain, direction, strength)])`; `Grid.columns: list[str]` (alphabetical domains with ≥1 published cell), `Grid.rows: list[GridRow]` alphabetical, each cell `{"state": "supports"|"mixed"|"risk"|"mechanism"|"not_reviewed", "strength": str | None}`.

- [ ] **Step 1: Failing tests**

```python
from app.services.evidence_views import ladder_level, dose_bar, evidence_grid

def test_ladder_order():
    assert ladder_level(has_published_route=True, has_mechanism=True, role="active", function_summary=None) == "reviewed"
    assert ladder_level(has_published_route=False, has_mechanism=True, role="unknown", function_summary=None) == "mechanism"
    assert ladder_level(has_published_route=False, has_mechanism=False, role="functional", function_summary=None) == "function"
    assert ladder_level(has_published_route=False, has_mechanism=False, role="unknown", function_summary=None) == "unidentified"

def test_dose_bar_converts_grams_to_studied_units():
    b = dose_bar(studied_low=3, studied_high=5, studied_unit="g", upper_limit=None, amount="5000", amount_unit="mg")
    assert b.amount_value == 5 and b.unit_label == "g"

def test_dose_bar_unknown_amount():
    b = dose_bar(studied_low=3, studied_high=5, studied_unit="g", upper_limit=None, amount=None, amount_unit=None)
    assert b.amount_value is None and b.amount_note == "Amount on this product unknown"

def test_dose_bar_incomparable_units():
    b = dose_bar(studied_low=100, studied_high=400, studied_unit="mg", upper_limit=None, amount="2", amount_unit="capsules")
    assert b.amount_value is None and b.amount_note == "Units not comparable"

def test_grid_has_no_totals_and_marks_unreviewed():
    g = evidence_grid([("Creatine", "reviewed", [("body_composition", "supports", "moderate")]),
                       ("Glycerin", "function", []), ("Caffeine", "mechanism", [])])
    assert g.columns == ["body_composition"]
    assert [r.compound for r in g.rows] == ["Caffeine", "Creatine", "Glycerin"]
    assert g.rows[0].cells["body_composition"]["state"] == "mechanism"
    assert g.rows[2].cells["body_composition"]["state"] == "not_reviewed"
    assert not hasattr(g, "total")
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; reuse `app.services.biodomain_scorer._normalize_to_mg` for mass units; `upper_limit` parsed only when it has a leading number and a mass unit.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(pathways): ladder, dose bar and evidence grid`.

### Task 6: API endpoints

**Files:**
- Create: `backend-nourai/app/schemas/pathway.py`, `backend-nourai/app/api/v1/routes_api.py`, `backend-nourai/app/repositories/pathway.py`
- Modify: `backend-nourai/app/api/v1/router.py`, `backend-nourai/app/api/v1/ingredients.py`, `backend-nourai/app/api/v1/products.py`
- Test: `backend-nourai/tests/test_pathway_api.py`

**Interfaces:**
- Consumes: Task 1 models, Task 5 functions.
- Produces (JSON): `RouteOut {slug, version, title, takeaway, domain, reviewed_by, published_at, nodes[{id,label,plain_label,role}], links[{from,to,relation_text,evidence_type,strength,evidence_stops_here,stop_reason,claims[ClaimOut]}]}`; `MechanismOut {ingredient_id, name, level, route: RouteOut|null, via_moiety: str|null, assets[{kind, payload, fallback_url, attribution}], facts_count}`; `ProductEvidenceOut {grid: {columns, rows[{compound, level, cells}]}, dose_bars[{compound, route_slug, bar}]}`.

- [ ] **Step 1: Failing tests** — route serialization is pure: `route_out(route_orm_like) -> RouteOut` on a `SimpleNamespace` tree; and the router exposes the three paths:

```python
from app.main import app
def test_paths_registered():
    paths = {r.path for r in app.routes}
    assert "/api/v1/routes/{slug}" in paths
    assert "/api/v1/ingredients/{ingredient_id}/mechanism" in paths
    assert "/api/v1/products/{product_id}/evidence" in paths
```

plus `test_route_out_orders_nodes_by_position` using SimpleNamespace fixtures.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Repository: `latest_published_route(ingredient_id)` (own, else via `active_moiety_id`), `route_by_slug(slug)`, `assets_for(ingredient_id)`, `fact_count(ingredient_id)` (facts whose subject entity is linked through `ingredient_external_identifiers` scheme `chebi`). Product evidence: product → product_ingredients with `ingredient_id` → distinct active compound (moiety or self) → level + published routes → grid; dose bar per published route with a claim dose, using the product ingredient amount/unit. Register `/routes` router; `/ingredients/{id}/mechanism` must be declared before `/{ingredient_id}` catch-alls if any conflict.
- [ ] **Step 4:** Run → PASS; manual `curl localhost:8001/api/v1/routes/creatine-strength-training` after Task 9.
- [ ] **Step 5:** Commit `feat(pathways): mechanism, route and product evidence endpoints`.

### Task 7: Mechanism import job

**Files:**
- Create: `backend-nourai/app/services/mechanisms/__init__.py`, `clients.py`, `job.py`, `backend-nourai/scripts/import_mechanisms.py`, `backend-nourai/tests/fixtures/mechanisms/*.json`
- Test: `backend-nourai/tests/test_mechanism_job.py`

**Interfaces:**
- Produces: `MechanismClients` protocol with `reactome_compounds(name) -> list[(st_id, chebi_id)]`, `reactome_pathways(chebi_id) -> list[(st_id, name)]`, `reactome_ancestors(st_id) -> list[list[(st_id, name, has_ehld)]]`, `reactome_proteins(st_id) -> list[(uniprot, gene)]`, `uniprot_locations(acc) -> list[(sl_id, name)]`, `rcsb_ligand(chebi_id) -> str | None`, `rcsb_best_human_entry(comp_id) -> (pdb_id, title) | None`; `HttpMechanismClients(client)`; `build_mechanism(name, clients) -> MechanismResult {chebi_id, pathways, ehld: (st_id, highlight) | None, sl_ids: list[str] (≤6, most frequent first), structure: {pdb_id, ligand, title} | None, facts: list[(subject, relation, object, source, ref)]}` (pure given clients); `async persist_mechanism(session, ingredient, result)`.

- [ ] **Step 1: Failing tests** with a fake clients object built from recorded JSON (record once with `scripts/import_mechanisms.py --record tests/fixtures/mechanisms --ingredient Creatine` and `Caffeine`):

```python
def test_creatine_mechanism_from_recorded_responses():
    r = build_mechanism("Creatine", recorded("creatine"))
    assert r.chebi_id == "57947"
    assert ("R-HSA-71288", "Creatine metabolism") in r.pathways
    assert r.ehld == ("R-HSA-71291", "R-HSA-71288")
    assert "SL-0086" in r.sl_ids and len(r.sl_ids) <= 6
    assert all(f[2] for f in r.facts)

def test_missing_pieces_do_not_fail_the_rest():
    c = recorded("creatine"); c.rcsb_ligand = lambda _chebi: None
    r = build_mechanism("Creatine", c)
    assert r.structure is None and r.pathways
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement against the verified endpoints: Reactome `search/query?query={name}&species=Homo sapiens&cluster=true` (Chemical Compound entries with `databaseName == "ChEBI"`), `data/mapping/ChEBI/{id}/pathways?species=9606`, `data/event/{id}/ancestors`, `data/participants/{id}/referenceEntities`; UniProt `uniprotkb/{acc}.json?fields=cc_subcellular_location`; RCSB search v2 (`text_chem` `rcsb_chem_comp_related.resource_accession_code == CHEBI:{id}` → comp id; `text` comp_id + `Homo sapiens`, sorted by `rcsb_entry_info.resolution_combined` asc) and `https://data.rcsb.org/rest/v1/core/entry/{id}` for the title. Each step in its own try/except. `persist_mechanism` registers `data_sources` (`reactome` CC0, `rhea` CC BY 4.0, `uniprot` CC BY 4.0, `rcsb-pdb` public domain, `swissbiopics` CC BY 4.0), upserts entities/facts, writes assets `cell_locations`, `pathway_illustration`, `pathway_diagram`, `structure` (skip `structure` when a reviewed pin exists), sets `ingredient_external_identifiers(scheme='chebi')`. CLI: `--ingredient NAME` (repeatable) or `--top N` (active-role or linked ingredients ranked by product occurrences), `--dry-run`, `--record DIR`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(pathways): automatic mechanism import from open databases`.

### Task 8: Hosted viewers

**Files:**
- Create: `backend-nourai/app/viewers/__init__.py` (router), `backend-nourai/app/viewers/templates/{cell,structure,pathway}.html`
- Modify: `backend-nourai/app/main.py` (include viewers router at `/viewers`)
- Test: `backend-nourai/tests/test_viewers.py`

**Interfaces:**
- Produces: `GET /viewers/cell?sls=SL-0086,SL-0173`, `GET /viewers/structure?pdb=5MZP&ligand=CFF`, `GET /viewers/pathway?ehld=R-HSA-71291&highlight=R-HSA-71288`, `GET /viewers/image?url=…` (disk-cached proxy; host allow-list `cdn.rcsb.org`, `reactome.org`, `www.swissbiopics.org`). Each page posts `{"type":"ready"}` / `{"type":"error"}` via `window.ReactNativeWebView?.postMessage`.

- [ ] **Step 1: Failing tests** (TestClient): pages return 200 HTML containing the parameter; invalid ids → 422 (`sls` must match `^SL-\d{4}(,SL-\d{4})*$`, `pdb` `^[0-9A-Za-z]{4}$`, `ligand` `^[0-9A-Za-z]{1,5}$`, Reactome ids `^R-HSA-\d+$`); `/viewers/image?url=https://evil.example/x.png` → 400.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `structure.html` loads Mol* from `https://cdn.jsdelivr.net/npm/molstar@latest/build/viewer/molstar.js` + css, `molstar.Viewer.create(el, {layoutIsExpanded:false, layoutShowControls:false, viewportShowExpand:false})`, `viewer.loadPdb(pdb)`, then focus the ligand via the structure-focus behaviour; `cell.html` loads `https://www.swissbiopics.org/static/swissbiopics.js` with the `sibSwissBioPicsSlLiItem` template and `<sib-swissbiopics-sl taxid="9606" sls=…>`; `pathway.html` inlines the Reactome EHLD SVG and adds a CSS class to the region whose id contains the highlight stable id. All use Elory canvas colour `#F3F0E9`, no page chrome, attribution line at the bottom. Image proxy caches under `backend-nourai/.cache/viewers/` keyed by sha256(url).
- [ ] **Step 4:** Run → PASS; open each URL in a browser and confirm it renders.
- [ ] **Step 5:** Commit `feat(pathways): hosted Mol*, SwissBioPics and Reactome viewers`.

### Task 9: Route content and CI

**Files:**
- Create: `content/routes/creatine-strength-training.yaml`, `content/routes/caffeine-sleep.yaml`, `content/routes/psyllium-ldl.yaml`, `content/routes/nmn-nad.yaml`, `.github/workflows/routes.yml`

- [ ] **Step 1:** Write the four routes from the verified abstracts:
  - Creatine (PMID 29138605): lean tissue +1.37 kg (95% CI 0.97–1.76), 22 RCTs, n=721, age 57–70, resistance training 2–3 d/wk for 7–52 wk; also chest-press SMD 0.35 (0.16–0.53). Nodes creatine → phosphocreatine (CHEBI:58092) → ATP regeneration (R-HSA-71288) → lean mass/strength; boundary lifespan. `forms: [Creatine Monohydrate]`.
  - Caffeine (PMID 39377163): 23 men, crossover; 100 mg no significant sleep effect; 400 mg within 12 h of bedtime delayed sleep onset; perceived quality −34.02% at 4 h. Nodes caffeine (CHEBI:27732) → adenosine A2A receptor blocked (UniProt P29274) → alertness ↑ / sleep disruption at high dose late; `structure: {pdb: 5MZP, ligand: CFF}`; boundary "individual safe cutoff".
  - Psyllium (PMID 30239559): 28 trials, n=1924, median ~10.2 g/day, LDL −0.33 mmol/L (95% CI −0.38, −0.27), GRADE moderate; nodes psyllium gel → bile-acid excretion ↑ (R-HSA-194068) → LDL ↓; boundary "cardiovascular events not measured here".
  - NMN (PMID 39116016): 12 RCTs, n=513; blood NAD ↑; most clinical metabolic outcomes not different; all studies some concerns/high risk of bias. `create_if_missing: {canonical_name: Nicotinamide Mononucleotide, category: other, synonyms: [NMN, β-NMN]}`; nodes NMN (CHEBI:16171) → NAD⁺ (CHEBI:15846, R-HSA-196807) → blood NAD ↑ (human RCT, moderate) → metabolic health (stop: "not shown in trials").
- [ ] **Step 2:** Run `scripts/check_routes.py` → fix until 0 errors; list any `needs_full_text` claims for the reviewer.
- [ ] **Step 3:** Workflow `routes.yml`: on PRs touching `content/routes/**` or `backend-nourai/**`, set up Python 3.13, install `backend-nourai/requirements.txt`, run pytest and `python backend-nourai/scripts/check_routes.py content/routes/*.yaml`, and post the report as a PR comment. A second job runs weekly (`schedule: cron '0 6 * * 1'`) on `main`, re-running `check_routes.py` against published routes and opening a GitHub issue labelled `citation-review` when any citation or identifier stops resolving.
- [ ] **Step 4:** Commit `content: first four reviewed routes + CI`.

### Task 10: Route drafting script

**Files:**
- Create: `backend-nourai/scripts/draft_route.py`

- [ ] **Step 1:** Implement with the Anthropic SDK (load the `claude-api` skill first for current model id and SDK usage): input `--ingredient NAME --pmid … [--pmid …]`; fetch the abstracts; ask the model for a YAML matching `RouteFile` with `drafted_by: ai`, only using numbers present in the provided abstracts; validate with `validate_route` + `check_route`; write `content/routes/<slug>.yaml`; print the check report. Does not open PRs itself (the author does, so review stays human).
- [ ] **Step 2:** Dry run on psyllium with `--out /tmp` to confirm valid output (requires `ANTHROPIC_API_KEY`).
- [ ] **Step 3:** Commit `feat(pathways): AI route drafting script`.

### Task 11: App — types, WebView panel, ladder badge

**Files:**
- Modify: `nourai/services/api.ts`, `nourai/package.json` (add `react-native-webview` via `npx expo install react-native-webview`)
- Create: `nourai/components/science/{LadderBadge,ViewerPanel,index}.tsx`

**Interfaces:**
- Produces: TS types `LadderLevel`, `RouteOut`, `ClaimOut`, `MechanismOut`, `MechanismAsset`, `ProductEvidenceOut`, `DoseBarOut`; `api.getIngredientMechanism(id)`, `api.getRoute(slug)`, `api.getProductEvidence(productId)`; `<LadderBadge level />`; `<ViewerPanel title subtitle viewerPath fallbackUrl attribution height />` (WebView to `${API_ORIGIN}${viewerPath}`, shows fallback `expo-image` on error/timeout 12 s; hides entirely when both fail).

- [ ] **Step 1:** Implement; `API_ORIGIN` derived from `EXPO_PUBLIC_API_URL` minus `/api/v1`.
- [ ] **Step 2:** `tsc` clean.
- [ ] **Step 3:** Commit `feat(app): pathway API types, viewer panel and ladder badge`.

### Task 12: App — evidence chain, dose bar, evidence grid

**Files:**
- Create: `nourai/components/science/{EvidenceChain,DoseBar,EvidenceGrid}.tsx`

- [ ] **Step 1:** Design pass (frontend-design skill) within the existing design system (`constants/theme.ts`, Instrument Serif + Inter): vertical chain; node cards by role; connectors solid for human evidence types, dashed for others; evidence-type chip on every connector; boundary card with stop reason; tap → bottom sheet (`components/ui/Sheet`) with population, comparator, duration, dose, estimate + CI, certainty, limitations, citations (tap opens PubMed/DOI).
- [ ] **Step 2:** DoseBar: horizontal track, studied range band, upper-limit tick, amount marker, note text when amount unknown/incomparable. EvidenceGrid: compounds × domains, cell = dot colour by state + strength label, legend, no totals.
- [ ] **Step 3:** `tsc` clean.
- [ ] **Step 4:** Commit `feat(app): evidence chain, dose bar and evidence grid`.

### Task 13: App — screens

**Files:**
- Modify: `nourai/app/ingredient/[id].tsx`, `nourai/app/product/[id].tsx`

- [ ] **Step 1:** Ingredient "How it works" tab: fetch `getIngredientMechanism`; render LadderBadge → (reviewed) takeaway + EvidenceChain + DoseBar → ViewerPanel cell → ViewerPanel structure → ViewerPanel pathway; show "via Magnesium" note when `via_moiety`. Keep existing mechanism text only when level is `unidentified`/`function` and it exists, labelled "Summary (not yet reviewed)".
- [ ] **Step 2:** Product Details tab: "Evidence" section with EvidenceGrid + DoseBars from `getProductEvidence`; hidden when grid has no rows.
- [ ] **Step 3:** `tsc` clean.
- [ ] **Step 4:** Commit `feat(app): How it works tab and product evidence section`.

### Task 14: Integrate and verify end to end

- [ ] **Step 1:** (User go-ahead) `alembic upgrade head` on the shared database.
- [ ] **Step 2:** (User go-ahead) `scripts/import_routes.py content/routes/*.yaml`; `scripts/import_mechanisms.py --ingredient Creatine --ingredient Caffeine --ingredient "Psyllium Husk" --ingredient "Nicotinamide Mononucleotide"`; then `--top 50`.
- [ ] **Step 3:** Rebuild the simulator app (`npx expo run:ios --port 8082`) for the WebView module.
- [ ] **Step 4:** Verify in the simulator: Creatine (reviewed chain, dose bar, cell, pathway), Caffeine (structure 5MZP), Creatine Monohydrate (inherits via moiety), a mechanism-only ingredient, Glycerin (function/unidentified), a product page evidence grid; airplane-mode fallback for one panel.
- [ ] **Step 5:** Full backend tests + `tsc`; commit; push.
