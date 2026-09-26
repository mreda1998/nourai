# Ingredient Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Resolve every label ingredient name to a canonical substance (or class/mixture/junk) from open taxonomies, with a local model for the long tail, and show clean English names.

**Spec:** `docs/superpowers/specs/2026-09-26-ingredient-identity-design.md`

**Global constraints:** the model only chooses among retrieved candidates; choices outside the list are discarded; confidence ≥ 0.85 to accept; ODbL/CosIng licence recorded per substance; DB writes on the shared Supabase database were approved with this design; tests run with `backend-nourai/venv` pytest.

### Task 1: Cleaning + normalisation — `app/services/identity/clean.py`
- [ ] Tests (`tests/test_identity_clean.py`) with real names: "_Lait_", "E330 - Acide citrique", "Dont Acides Gras 7.0G Saturés" (junk), "Ingredients" (junk), "Arômes Naturels" (plural candidate), "  Sucre. " → "sucre".
- [ ] Implement `clean_name(raw) -> CleanName(normalized, junk: bool, e_number: str|None, singular: str|None)` reusing `normalize_ingredient_alias`.
- [ ] Commit.

### Task 2: Models + migration 019
- [ ] `app/models/identity.py`: `Substance`, `SubstanceAlias`, `NameResolution`; `ProductIngredient.substance_id`, `.display_name`; trigram GIN index on `substance_aliases.normalized_alias`.
- [ ] Metadata test; offline SQL render; commit.

### Task 3: Taxonomy import — `app/services/identity/taxonomies.py`, `scripts/import_taxonomies.py`
- [ ] Pure parsers tested on fixture snippets: OFF entry → substance (name_en, e_number, wikidata, type class when entry has children and no e_number? no — type from a curated class list + OFF `parents`-free heuristics kept simple: `class` when OFF key in CLASS_KEYS or name ends with plural class words), CosIng row → substance (INCI, CAS).
- [ ] Priority rule when aliases collide; library linking by exact alias.
- [ ] Commit; run import.

### Task 4: Exact lookup + candidates — `lookup.py`, `candidates.py`
- [ ] Tests for exact / singular / E-number (pure over an in-memory index).
- [ ] Trigram candidate query (Postgres `similarity`), top 10 with substance type.
- [ ] Commit.

### Task 5: Local model — `llm.py`
- [ ] Tests with a fake transport: valid choice accepted; out-of-range discarded; low confidence → review; class verdict recorded.
- [ ] Ollama client (`/api/chat`, `format: json`, temperature 0, batches of 10).
- [ ] Commit.

### Task 6: Resolver job — `scripts/resolve_names.py`
- [ ] Distinct names → clean → exact → candidates → model → `name_resolutions`, `ai` aliases, product rows (`substance_id`, `display_name`, library `ingredient_id`), review tasks; `--no-llm`, `--limit`, `--dry-run`; coverage report.
- [ ] Run `--no-llm` for all names; commit.

### Task 7: Accuracy check — `scripts/eval_name_model.py`
- [ ] Hold out 200 exact-resolved names, hide their exact alias, measure model accuracy + confident-accuracy; report.

### Task 8: Display
- [ ] `MobileIngredient`: `name` = display name, `label_name`, `kind`; junk omitted; app shows a "Class" tag.
- [ ] tsc; commit.

### Task 9: Model run
- [ ] Top 500 unresolved names through the model; report coverage and review count; then the full run in the background.
