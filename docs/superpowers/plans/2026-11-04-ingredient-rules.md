# Ingredient Rules by Country — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, for every ingredient Elory can identify, what the law says in each covered place (and what expert bodies say, kept apart), each with official source and dates. Flag only noteworthy rules on product pages. Ship all curated data, approved by the owner.

**Architecture:**

- **Storage.** A new `regulation` domain in the backend stores substances (separate from the curated `ingredients` list), aliases, rules and checked places, with provenance through the existing `data_sources` / `source_records`.
- **Ingestion.** Rules arrive two ways: deterministic bulk importers per official list, and a curated path (Claude extracts from supplied documents, code verifies quotes, owner approves through a CLI).
- **Logic.** Pure functions turn published rules into place rows, summary lines and product notes. FastAPI exposes them on the ingredient detail, a new substance endpoint, and the product detail. The Expo app renders a Rules section, a rules-only screen, and product row notes.

**Tech Stack:**

- Backend: FastAPI, SQLAlchemy 2 async, Alembic, Postgres (Supabase), httpx, Anthropic SDK (`ResearchLLM.extract`), pytest (anyio).
- Parsing: new dependencies `beautifulsoup4`, `pypdf`, `openpyxl`.
- App: Expo Router, React Native, the existing `components/ui` primitives, and `node:test` for pure TypeScript helpers.

**Spec:** `docs/superpowers/specs/2026-11-04-ingredient-rules-design.md` (read it first; this plan argues from it).

## Global Constraints

**Data integrity**

- A rule is served only when `review_status = 'published'` **and** it has `source_url` and `last_checked_at`. Drafts and retired rules are never served.
- Rules are never written from model memory. The curated extractor is only ever called with a fetched official document in the prompt.
- Absence of a rule is never rendered as "allowed". "No specific rule" appears only for a place with a `rule_checks` row.
- Only bare facts with a link and attribution are stored. No explanatory text is copied from a source.
- A source whose terms forbid commercial reuse of bare facts does not ship until the owner has cleared it with the publisher.

**Vocabularies**

- Law status vocabulary, exactly: `banned`, `not_authorised`, `prescription_only`, `approval_required`, `warning_label`, `allowed_with_limits`, `allowed`, `listed`.
- Expert-view rows never use the law vocabulary. `kind = 'expert_view'`, and `status = 'classification'` with the body's own label in `classification`.
- Places, exactly: `EU`, `FR`, `DE`, `IT`, `GB`, `CA`, `US`, `US-CA`, `AU`, `NZ`, `WADA`. Expert bodies: `IARC`, `JECFA`, `EFSA`.
- Scopes, exactly: `food`, `food_additive`, `supplement`, `cosmetic`, `medicine`, `sport`.
- Category → scopes, exactly:
  - food → food, food_additive
  - supplement → supplement, food_additive, sport
  - cosmetic → cosmetic
  - otc → medicine, cosmetic
- Flagging statuses (product page), exactly: `banned`, `not_authorised`, `prescription_only`, `warning_label`. WADA reaches supplements through the `sport` scope.
- Note order: the person's own places first, then severity (`banned` > `not_authorised` > `prescription_only` > `warning_label`), then `EU` before others, then place order as listed above.

**Behaviour**

- Product-page notes come only from direct label matches (row name alias or E-number), never via the canonical ingredient link.
- Country comes from the app's `deviceRegion()` (`nourai/lib/region.ts`), with fallback `CA`. US users see `US-CA` as its own row.
- An EU member country's row shows its national rule if one exists, otherwise the EU rule labelled as an EU rule. `GB` is not EU.
- Rules are free, with no premium gating.
- Legacy fields: `us_regulatory_status` and `wada_status` stay in the ingredient API for older builds.

**Fixed UI copy**

- Footer: "Rules change. Last checked {date}. Not legal advice."
- IARC explainer: "This rates whether it can cause cancer, not how likely it is at normal amounts."
- Rules-only screen note: "Not researched yet".

**Operations**

- Enable RLS on every new table in the migration (production convention; not otherwise in alembic).
- Large imports run out of band, from a Mac against production, like the research runs. Deploys run `alembic upgrade head` under a 120 s healthcheck.
- Claude model: `settings.research_model` (Sonnet 5.5) for curated extraction.

## Review Focus

1. **An ingredient name that matches two substances.** An alias claimed by two substances, such as "vitamin E" in English and French, must stay unmatched rather than pick one. Test: Task 3 `test_ambiguous_alias_stays_unmatched`.
2. **A product whose E-number tag matches a substance no label row names.** The rule must still surface, as an extra row, not vanish. Test: Task 6 `test_tag_only_match_becomes_rule_extra`.
3. **A rule with a future effective date, and one whose `effective_until` has passed.** The future one flags now "from {date}". The expired one is not served. Test: Task 4 `test_expired_rule_not_served` and `test_future_ban_flags_with_date`.
4. **Re-importing an unchanged list.** It must not create duplicate rules or retire anything. A changed row must retire the old rule and keep history. Test: Task 7 `test_reimport_unchanged_is_noop` and `test_changed_row_retires_old_rule`.
5. **A country code outside every covered place** (e.g. `JP`, `ES`, lowercase `fr`, junk). ES resolves to EU via membership, JP gets no "yours" row but still sees all places, and lowercase is normalised. Junk falls back to `CA` with no 500. Test: Task 2 `test_country_resolution_edge_cases`, Task 5 `test_bad_country_falls_back`.

---

## File Structure

**Backend (`backend-nourai/`)**

| File | Responsibility |
|---|---|
| `alembic/versions/021_regulatory_rules.py` | New tables, indexes, RLS |
| `app/models/regulation.py` | `RegulatedSubstance`, `SubstanceAlias`, `IngredientSubstance`, `RegulatoryRule`, `RuleCheck` |
| `app/core/regulation.py` | Fixed vocabularies, places, membership, category → scopes, display phrases |
| `app/services/regulation/__init__.py` | Package |
| `app/services/regulation/identifiers.py` | `normalize_e_number`, alias normalisation |
| `app/services/regulation/matching.py` | Label names / E-numbers → substances |
| `app/services/regulation/rules.py` | Pure logic: place rows, summary line, product notes, glance |
| `app/services/regulation/store.py` | DB loading of published rules/checks into pure dataclasses |
| `app/services/regulation/importer.py` | Bulk import framework, versioning, positive-list derivation |
| `app/services/regulation/sources/*.py` | One parser per official list |
| `app/services/regulation/documents.py` | Fetch an official document → plain text (HTML/PDF) |
| `app/services/regulation/curation.py` | Draft schema, quote verification, Claude extraction, draft storage |
| `app/services/regulation/review.py` | Apply review decisions; progress counts |
| `app/services/regulation/legacy.py` | Sync peptide legacy fields from published rules |
| `app/schemas/regulation.py` | API response models |
| `app/api/v1/substances.py` | `GET /substances/{id}` |
| `app/api/v1/ingredients.py` | Add `rules` + `country` to the detail endpoint |
| `app/api/v1/products.py`, `app/schemas/product.py` | `rule_note`, `rule_extras`, `rules_glance`, `country` |
| `app/services/ingestion/product_pipeline.py`, `connectors/openfoodfacts.py` | Persist OFF `additives_tags` |
| `scripts/import_regulatory_list.py` | Bulk import CLI |
| `scripts/curate_rules.py` | Curated extraction CLI (manifest-driven) |
| `scripts/review_rules.py` | Owner review CLI (resumable) |
| `scripts/check_rules_golden_set.py` | Golden-set acceptance check against a populated DB |
| `data/regulation/golden_set.json` | Owner-approved oracle |
| `data/regulation/curation/*.json` | Curation manifests (substance, places, document URLs) |
| `scripts/fetch_cosing_data.py` | **Delete** (superseded; writes a column that doesn't exist) |

**App (`nourai/`)**

| File | Responsibility |
|---|---|
| `services/api.ts` | Types + `country` on calls + `getSubstance` |
| `utils/rules.ts` | Status labels/tones, date formatting, glance text (pure) |
| `tests/rules.test.cjs` | node:test for `utils/rules.ts` |
| `components/rules/RulesSection.tsx` | The Rules section (place rows, detail sheet, expert views, footer) |
| `app/ingredient/[id].tsx` | Mount RulesSection under BeliefReality; remove old "Regulatory status" block |
| `app/substance/[id].tsx` | Rules-only screen |
| `app/product/[id].tsx`, `components/product/ProductSections.tsx` | Row notes, rule extras, At a glance line, routing |

---

## Part A — Backend foundation

### Task 1: Data model and migration

**Files:**
- Create: `backend-nourai/app/models/regulation.py`
- Create: `backend-nourai/alembic/versions/021_regulatory_rules.py`
- Modify: `backend-nourai/app/models/__init__.py` (import + `__all__`)
- Modify: `backend-nourai/tests/integration/conftest.py` (`_TABLES`)
- Test: `backend-nourai/tests/integration/test_regulation_schema.py`

**Interfaces:**
- Produces the following tables. All use `UUIDMixin`, and `TimestampMixin` where noted. Column types follow the existing models.
  - `RegulatedSubstance` → `regulated_substances` (Timestamp)
    - `name: str`
    - `e_number: str | None` (normalised, partial unique where not null)
    - `cas: str | None` (indexed), `ec: str | None`, `inci: str | None`, `unii: str | None`
    - `identifiers: dict` (JSONB, default `{}`)
  - `SubstanceAlias` → `regulated_substance_aliases`
    - `substance_id` FK cascade
    - `alias: str`, `normalized_alias: str` (indexed)
    - `alias_type: str` (`name` | `inci` | `e_number` | `cas`)
    - `language: str` (default `""`)
    - `source_id` FK `data_sources` null
    - `approved: bool` (default True)
    - Unique (`substance_id`, `normalized_alias`).
  - `IngredientSubstance` → `ingredient_substances`
    - `ingredient_id` FK cascade, `substance_id` FK cascade; composite PK
    - `scope_label: str | None` (e.g. "As a food additive (E171)")
  - `RegulatoryRule` → `regulatory_rules` (Timestamp)
    - `substance_id` FK cascade
    - `place: str(8)`, `authority: str(120)`
    - `kind: str(12)` (`law` | `expert_view`)
    - `status: str(24)`, `classification: str(80) | None`
    - `applies_to: str(16) | None`: nullable only for expert views, enforced by the check constraint
      `kind = 'expert_view' OR applies_to IS NOT NULL`. Expert classifications are about an agent, not a
      product scope.
    - `sub_scope: str | None`, `condition: str | None`
    - `limit_value: float | None`, `limit_unit: str(30) | None`, `limit_basis: str(60) | None`
    - `effective_from: date | None`, `effective_until: date | None`
    - `legal_reference: str | None`, `source_url: str` (not null)
    - `source_id` FK `data_sources` null, `source_record_id` FK `source_records` null
    - `source_quote: str | None`, `why: str | None`
    - `last_checked_at: datetime` (not null)
    - `origin: str(10)` (`bulk` | `curated` | `derived`)
    - `review_status: str(12)` (default `draft`)
    - `reviewed_by: str(120) | None`, `reviewed_at: datetime | None`, `review_note: str | None`
    - `supersedes_id` FK self null
    - Indexes on (`substance_id`, `review_status`) and (`place`).
  - `RuleCheck` → `rule_checks`
    - `substance_id` FK cascade, `place: str(8)`, `applies_to: str(16)`
    - `checked_at: datetime`, `origin: str(10)`
    - `source_id` FK null, `documents: list` (JSONB, default `[]`), `reviewed_by: str | None`
    - Unique (`substance_id`, `place`, `applies_to`).
  - Relationships: `RegulatedSubstance.aliases`, `.rules`, `.checks`; `Ingredient.substances` via the `ingredient_substances` secondary table.
- Migration: `revision = "021_regulatory_rules"`, `down_revision = "020_ingredient_claims"`. It ends with `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for all five tables. Its docstring explains why, as in `020_ingredient_claims.py`.

- [ ] **Step 1: Write the failing test** `test_regulation_schema.py`
  - `test_rule_round_trip`: create a substance (`name="Titanium dioxide"`, `e_number="E171"`), an alias, an `IngredientSubstance` link to a new `Ingredient`, one published rule (`place="EU"`, `status="not_authorised"`, `applies_to="food_additive"`, `source_url="https://eur-lex.europa.eu/eli/reg/2022/63/oj"`, `last_checked_at=now`) and one `RuleCheck`. Reload them; assert `ingredient.substances[0].rules[0].status == "not_authorised"`.
  - `test_rule_check_unique`: inserting the same (`substance_id`, `place`, `applies_to`) twice raises `IntegrityError`.
  - Add `regulatory_rules, rule_checks, ingredient_substances, regulated_substance_aliases, regulated_substances` to the front of `_TABLES` in `tests/integration/conftest.py`.
- [ ] **Step 2: Run to verify it fails.** Run: `cd backend-nourai && alembic upgrade head && pytest tests/integration/test_regulation_schema.py -v` (with the disposable DB env from `tests/integration/conftest.py`). Expected: FAIL, `ImportError: app.models.regulation`.
- [ ] **Step 3: Implement the models and the migration** as specified in Interfaces.
- [ ] **Step 4: Run to verify it passes.** Same command. Expected: 2 passed. Also run `alembic downgrade -1 && alembic upgrade head`, which must succeed.
- [ ] **Step 5: Commit**

```bash
git add backend-nourai/app/models/regulation.py backend-nourai/app/models/__init__.py backend-nourai/alembic/versions/021_regulatory_rules.py backend-nourai/tests/integration/conftest.py backend-nourai/tests/integration/test_regulation_schema.py
git commit -m "feat(rules): substances, rules and checked places"
```

### Task 2: Vocabularies, places and country resolution

**Files:**
- Create: `backend-nourai/app/core/regulation.py`
- Test: `backend-nourai/tests/test_regulation_core.py`

**Interfaces:**
- Produces:
  - `LAW_STATUSES: tuple[str, ...]`, exactly the Global Constraints order.
  - `FLAG_STATUSES: tuple[str, ...] = ("banned", "not_authorised", "prescription_only", "warning_label")`. This order is the severity order.
  - `SCOPES: tuple[str, ...]`.
  - `CATEGORY_SCOPES: dict[str, tuple[str, ...]]`, exactly the Global Constraints mapping.
  - `PLACES: tuple[str, ...] = ("EU","FR","DE","IT","GB","CA","US","US-CA","AU","NZ","WADA")`.
  - `EXPERT_BODIES = ("IARC","JECFA","EFSA")`.
  - `EU_MEMBERS: frozenset[str]` (the 27 ISO codes).
  - `PLACE_NAMES: dict[str, str]`: display names for every place, expert body and EU member. For example "European Union", "France", "California", "Sport (WADA)", "Spain".
  - `PLACE_PHRASES: dict[str, str]`: in-sentence forms, e.g. `EU → "the EU"`, `US → "the US"`, `GB → "the UK"`, `WADA → "sport (WADA)"`. Any other place → its name.
  - `STATUS_LABELS: dict[str, str]`:
    - `banned`: "Banned"
    - `not_authorised`: "Not authorised"
    - `prescription_only`: "Prescription only"
    - `approval_required`: "Approval required"
    - `warning_label`: "Warning label required"
    - `allowed_with_limits`: "Allowed with limits"
    - `allowed`: "Allowed"
    - `listed`: "Listed"
  - `SCOPE_PHRASES: dict[str, str]`: `food_additive → "as a food additive"`, `food → "in food"`, `supplement → "in supplements"`, `cosmetic → "in cosmetics"`, `medicine → "as a medicine"`, `sport → "in sport"`.
  - `def normalize_country(raw: str | None) -> str`: uppercase two letters; anything else → `"CA"`.
  - `def own_places(country: str) -> tuple[str, ...]`, which places count as "where you live":
    - `FR → ("FR","EU")`
    - `ES → ("ES","EU")`
    - `US → ("US","US-CA")`
    - `CA → ("CA",)`
    - `GB → ("GB",)`
    - `JP → ()`

- [ ] **Step 1: Write the failing tests**
  - `test_category_scopes_exact`: assert the four mappings verbatim.
  - `test_country_resolution_edge_cases`:
    - `normalize_country("fr") == "FR"`
    - `normalize_country("") == "CA"`
    - `normalize_country("zzz") == "CA"`
    - `normalize_country(None) == "CA"`
    - `own_places("ES") == ("ES","EU")`
    - `own_places("JP") == ()`
    - `own_places("US") == ("US","US-CA")`
    - `own_places("GB") == ("GB",)`
- [ ] **Step 2: Run to verify it fails.** `pytest tests/test_regulation_core.py -v`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `app/core/regulation.py` with the values above.
- [ ] **Step 4: Run to verify it passes.** Expected: 2 passed.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): places, statuses and scopes"`

### Task 3: Identifiers and matching

**Files:**
- Create: `backend-nourai/app/services/regulation/__init__.py`, `identifiers.py`, `matching.py`
- Test: `backend-nourai/tests/test_regulation_identifiers.py`, `backend-nourai/tests/integration/test_regulation_matching.py`

**Interfaces:**
- Consumes: Task 1 models; `normalize_ingredient_alias` from `app/services/ingestion/normalization.py`.
- Produces:
  - `def normalize_e_number(raw: str) -> str | None`: strip an `en:` prefix, spaces, dots and parentheses; uppercase; must match `^(E|INS)\d{3,4}[A-Z]*$` (INS stored as `E`). Examples:
    - `"en:e171" → "E171"`
    - `"E 150a" → "E150A"`
    - `"e322(i)" → "E322I"`
    - `"INS 102" → "E102"`
    - `"sugar" → None`
  - `def alias_key(alias: str, alias_type: str) -> str`: `e_number` aliases use `normalize_e_number`. `name` aliases first strip a leading function prefix, then use `normalize_ingredient_alias`. Prefixes, case-insensitive, with optional space before the colon: `colour`, `color`, `colorant`, `colorants`, `colourant`, `emulsifier`, `émulsifiant`, `preservative`, `conservateur`, `antioxidant`, `antioxydant`, `sweetener`, `édulcorant`, `stabiliser`, `stabilizer`, `thickener`, `épaississant`, `acidity regulator`, `correcteur d'acidité`, `farbstoff`, `colorante`. Other types use `normalize_ingredient_alias`.
  - `@dataclass(frozen=True) class SubstanceMatch: substance_id: uuid.UUID; via: str  # "name" | "e_number"`.
  - `async def match_substances(session, names: list[str], e_numbers: list[str]) -> tuple[dict[str, SubstanceMatch], dict[str, SubstanceMatch]]`
    - Returns `(by_name, by_e_number)`. Keys are the caller's original strings.
    - Approved aliases only, exact key match.
    - A key claimed by more than one substance is omitted.

- [ ] **Step 1: Write the failing unit tests**
  - `test_normalize_e_number_examples`: assert the five examples above.
  - `test_function_prefix_stripped`:
    - `alias_key("Colour: titanium dioxide", "name") == alias_key("titanium dioxide", "name")`
    - `alias_key("émulsifiant : lécithine de soja", "name") == alias_key("lécithine de soja", "name")`
    - `alias_key("Colourless water", "name") != alias_key("less water", "name")` (only a prefix followed by a colon is stripped)
- [ ] **Step 2: Write the failing integration tests**
  - `test_name_and_e_number_match`: the substance "Titanium dioxide" has aliases "titanium dioxide" (name, en), "dioxyde de titane" (name, fr) and "E171" (e_number).
    - `match_substances(s, ["Dioxyde de titane"], ["en:e171"])` returns both, with `via` set to `name` and `e_number` respectively.
  - `test_ambiguous_alias_stays_unmatched`: two substances both have the alias "vitamin e" → `by_name` lacks "Vitamin E".
  - `test_unapproved_alias_ignored`.
- [ ] **Step 3: Run to verify they fail.** `pytest tests/test_regulation_identifiers.py tests/integration/test_regulation_matching.py -v`. Expected: FAIL, import errors.
- [ ] **Step 4: Implement** `identifiers.py` and `matching.py` (one query over `regulated_substance_aliases` filtered by `normalized_alias IN (...)` and `approved`; group like `resolve_ingredients`).
- [ ] **Step 5: Run to verify they pass.** Expected: 5 passed.
- [ ] **Step 6: Commit.** `git commit -m "feat(rules): match label names and E-numbers to substances"`

### Task 4: Pure rule logic — place rows, summary, notes, glance

**Files:**
- Create: `backend-nourai/app/services/regulation/rules.py`
- Test: `backend-nourai/tests/test_regulation_rules.py`

**Interfaces:**
- Consumes: Task 2 constants.
- Produces these dataclasses (frozen). The DB layer in Task 5 builds them.
  - `RuleFact`: `id: str`, `substance_id: str`, `place: str`, `authority: str`, `kind: str`, `status: str`, `classification: str | None`, `applies_to: str`, `sub_scope: str | None`, `condition: str | None`, `effective_from: date | None`, `effective_until: date | None`, `legal_reference: str | None`, `source_url: str`, `last_checked_at: datetime`, `why: str | None`.
  - `CheckFact`: `place: str`, `applies_to: str`, `checked_at: datetime`.
  - `PlaceRowView`: `place: str`, `place_name: str`, `is_yours: bool`, `via_place: str | None`, `rules: list[RuleFact]`, `checked_no_rule: bool`.
  - `NoteView`: `text: str`, `status: str`, `place: str`, `more: int`, `substance_id: str`.
- Functions, all with `today: date` injected for testability:
  - `def live(rules, today) -> list[RuleFact]`: drops rules whose `effective_until < today`.
  - `def place_rows(rules, checks, country, today) -> list[PlaceRowView]`:
    - Laws only, live only.
    - Rows ordered: the person's own place first, then `PLACES` order.
    - Only places that have rules or checks.
    - For an EU-member `country` with no national rules but EU rules, the own row carries `via_place="EU"`. The member name comes from `PLACE_NAMES`, e.g. "Spain".
    - `checked_no_rule` is True when the place has checks and no rules.
  - `def expert_views(rules, today) -> list[RuleFact]`: `kind == "expert_view"`, ordered by `EXPERT_BODIES`.
  - `def summary_line(rules, today) -> str | None`:
    - Laws only.
    - Pick the scope of the most severe live rule (severity = `FLAG_STATUSES` order, then `approval_required`, `listed`, `allowed_with_limits`, `allowed`). Ties break by `SCOPES` order.
    - Group places in that scope by status, most severe first. One sentence per status.
    - The first sentence carries `SCOPE_PHRASES[scope]`; later sentences don't.
    - Places are joined with `PLACE_PHRASES` ("the EU", "the US and Canada", "France, Italy and the UK").
    - Never mentions expert bodies.
  - `def note_for(rules, scopes, country, today) -> NoteView | None`:
    - Candidates: live laws with `applies_to in scopes` and `status in FLAG_STATUSES`.
    - Order: own places first, then severity, then `EU` first, then `PLACES` order.
    - Text: `STATUS_LABELS[status]`, plus `" " + SCOPE_PHRASES[applies_to]` only when the status is `not_authorised`, plus `" in " + PLACE_PHRASES[place]`, plus `f" from {d.day} {d:%b %Y}"` when `effective_from > today`.
    - `more` = the number of other distinct places that also flag.
  - `def glance(notes: list[NoteView], country: str) -> tuple[int, int]`, returning (where_you_live, elsewhere). `where_you_live` counts notes whose `place in own_places(country)`; `elsewhere` counts the rest. This works because `note_for` already prefers own places.

- [ ] **Step 1: Write the failing tests.** Use builders `law(place, status, scope, **kw)` and `expert(body, classification)` local to the test file, with `today=date(2026, 11, 4)`.
  - `test_summary_e171`: EU `not_authorised`/food_additive, US `allowed_with_limits`/food_additive, CA `allowed_with_limits`/food_additive → `"Not authorised as a food additive in the EU. Allowed with limits in the US and Canada."`
  - `test_note_e171_candy`: same rules, `scopes=CATEGORY_SCOPES["food"]`, country `CA` → text `"Not authorised as a food additive in the EU"`, `more == 0`.
  - `test_note_tartrazine`: EU `warning_label`/food_additive → `"Warning label required in the EU"`.
  - `test_future_ban_flags_with_date`: US `banned`/food_additive with `effective_from=date(2027,1,15)`, plus US-CA `banned` `effective_from=date(2027,1,1)`; country `US`. Assert:
    - text `"Banned in the US from 15 Jan 2027"`
    - `more == 1`
  - `test_note_melatonin_uk`: GB `prescription_only`/supplement, supplement scopes → `"Prescription only in the UK"`.
  - `test_routine_limits_never_flag`: EU `allowed_with_limits`/cosmetic (phenoxyethanol) → `note_for(...) is None`.
  - `test_wada_flags_supplements_only`: WADA `banned`/sport → a note under supplement scopes (`"Banned in sport (WADA)"`), `None` under food scopes.
  - `test_own_place_first`: EU `warning_label` and US `banned`, both food_additive.
    - Country `FR`: the EU note wins (own place beats severity), with `more == 1`.
    - Country `CA`: `"Banned in the US"` wins on severity.
  - `test_expired_rule_not_served`: `effective_until=date(2025,1,1)` → absent from `place_rows`, `summary_line`, `note_for`.
  - `test_eu_member_row_via_eu`: an EU rule only, country `ES` → the first row has `place_name == "Spain"`, `via_place == "EU"`, `is_yours`.
  - `test_checked_no_rule_vs_hidden`: a check for CA and no CA rule → a CA row with `checked_no_rule`. US has neither → no US row.
  - `test_expert_views_never_in_summary`: IARC `Group 2B` only → `summary_line(...) is None`, `expert_views` has 1.
- [ ] **Step 2: Run to verify they fail.** `pytest tests/test_regulation_rules.py -v`. Expected: FAIL, import error.
- [ ] **Step 3: Implement** `rules.py`. Bodies are left to the implementer; the tests pin the behaviour.
- [ ] **Step 4: Run to verify they pass.** Expected: 12 passed.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): place rows, summary line and product notes"`

### Task 5: Ingredient and substance API

**Files:**
- Create: `backend-nourai/app/services/regulation/store.py`, `backend-nourai/app/schemas/regulation.py`, `backend-nourai/app/api/v1/substances.py`
- Modify: `backend-nourai/app/api/v1/ingredients.py` (`IngredientDetail` + handler), `backend-nourai/app/api/v1/router.py`
- Test: `backend-nourai/tests/integration/test_rules_api.py`

**Interfaces:**
- Consumes: Task 1 models, Task 2 `normalize_country`, Task 4 functions/dataclasses.
- Produces:
  - `store.py`:
    - `async def load_rule_facts(session, substance_ids: list[uuid.UUID]) -> dict[str, tuple[list[RuleFact], list[CheckFact]]]`. Published rules only. Also enforces non-null `source_url` and `last_checked_at`.
    - `async def substances_for_ingredient(session, ingredient_id) -> list[tuple[RegulatedSubstance, str | None]]`, returning (substance, scope_label).
  - `schemas/regulation.py` (Pydantic):
    - `RuleSourceOut`: `authority`, `legal_reference`, `url`, `last_checked_at`.
    - `PlaceRuleOut`: `id`, `status`, `status_label`, `applies_to`, `sub_scope`, `condition`, `effective_from`, `effective_until`, `why`, `source: RuleSourceOut`.
    - `PlaceRowOut`: `place`, `place_name`, `is_yours`, `via_place`, `checked_no_rule`, `rules: list[PlaceRuleOut]`.
    - `ExpertViewOut`: `id`, `body`, `body_name`, `classification`, `explainer: str | None` (the fixed IARC copy when `body == "IARC"`), `effective_from`, `source`.
    - `SubstanceRulesOut`: `substance_id`, `name`, `scope_label`, `summary`, `places`, `expert_views`.
    - `RulesBlock`: `country`, `substances: list[SubstanceRulesOut]`, `last_checked_at: datetime | None` (the oldest `last_checked_at` among served rules).
    - `SubstanceDetail`: `id`, `name`, `e_number`, `inci`, `ingredient_ids: list[str]`, `rules: RulesBlock`.
    - `def build_rules_block(substances: list[tuple[RegulatedSubstance, str | None]], facts, country: str, today: date) -> RulesBlock`.
  - `IngredientDetail.rules: RulesBlock | None = None`. `GET /ingredients/{id}` gains `country: str | None = Query(None)`. `rules` is `None` when no substance is linked.
  - `GET /api/v1/substances/{substance_id}?country=` → `SubstanceDetail`, 404 when missing. Registered at `prefix="/substances"`.

- [ ] **Step 1: Write the failing integration tests** `test_rules_api.py`. Use a fixture that seeds "Titanium dioxide" (ingredient) linked to two substances, E171 (`scope_label="As a food additive (E171)"`) and CI 77891 (`"As a cosmetic colour (CI 77891)"`):
  - EU `not_authorised`/food_additive (published)
  - US `allowed_with_limits`/food_additive (published, `condition="Up to 1% by weight"`, `legal_reference="21 CFR 73.575"`)
  - one EU `draft` rule
  - a CI 77891 EU `allowed_with_limits`/cosmetic (published)

  Tests:
  - `test_ingredient_rules_grouped_by_substance`: `GET /api/v1/ingredients/{id}?country=CA` → `rules.substances` has two entries. The E171 summary equals `"Not authorised as a food additive in the EU. Allowed with limits in the US."` No draft appears anywhere.
  - `test_legacy_fields_still_present`: the response still has the `us_regulatory_status` and `wada_status` keys.
  - `test_bad_country_falls_back`: `?country=zzz` → `rules.country == "CA"`, status 200.
  - `test_substance_endpoint`: `GET /api/v1/substances/{e171_id}?country=FR` → the first place row is France, `via_place == "EU"`.
  - `test_unknown_substance_404`.
- [ ] **Step 2: Run to verify they fail.** `pytest tests/integration/test_rules_api.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `store.py`, `schemas/regulation.py` and `substances.py`. In the ingredient handler, call `substances_for_ingredient` and `load_rule_facts` after the ingredient loads, then `build_rules_block` with `normalize_country(country)` and `date.today()`.
- [ ] **Step 4: Run to verify they pass**, plus the existing `tests/integration/test_ingredient_claims_api.py`. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): rules on the ingredient page API and a substance endpoint"`

### Task 6: Product API — additives tags, row notes, extras, glance

**Files:**
- Modify: `backend-nourai/app/services/ingestion/connectors/openfoodfacts.py` (`normalized_payload` adds `"additives_tags": self.product.get("additives_tags") or []`)
- Modify: `backend-nourai/app/services/ingestion/product_pipeline.py:366-374` (`extra_data["additives_tags"]`)
- Modify: `backend-nourai/app/schemas/product.py`:
  - `MobileIngredient` gains `rule_note: RuleNoteOut | None = None`, `rule_substance_id: str | None = None`.
  - `ProductWithDetails` gains `rule_extras: list[RuleNoteOut] = []` and `rules_glance: RulesGlanceOut | None = None`.
- Modify: `backend-nourai/app/schemas/regulation.py`: add `RuleNoteOut` (`text`, `status`, `place`, `more`, `substance_id`, `substance_name`) and `RulesGlanceOut` (`where_you_live`, `elsewhere`).
- Create: `backend-nourai/app/services/regulation/product_rules.py`
- Modify: `backend-nourai/app/api/v1/products.py`: `get_product`, `_open_catalog_entry` and `get_product_by_barcode` accept `country: str | None = Query(None)` and call `attach_rules`.
- Test: `backend-nourai/tests/integration/test_product_rules_api.py`, `backend-nourai/tests/test_openfoodfacts_connector.py` (extend)

**Interfaces:**
- Consumes: Task 3 `match_substances`, Task 4 `note_for`, `glance`, Task 5 `load_rule_facts`.
- Produces: `async def attach_rules(session, product: Product, response: ProductWithDetails, country: str | None, today: date | None = None) -> ProductWithDetails`.
  - Match the names of non-nutrient rows, plus `product.extra_data.get("additives_tags", [])`.
  - Set `rule_note` and `rule_substance_id` on matched rows. `rule_substance_id` is set on any direct match, even with no note, so the row can open the rules-only screen.
  - E-number matches whose substance is not already on a row become `rule_extras` (only when they have a note).
  - `rules_glance` is set only when either count > 0.
  - Scopes come from `CATEGORY_SCOPES[product.category]`.

- [ ] **Step 1: Write the failing tests**
  - Connector test `test_normalized_payload_keeps_additives_tags`: a payload with `"additives_tags": ["en:e171"]` round-trips.
  - Integration fixture: a food product with rows "Sugar" and "Colour: titanium dioxide", `extra_data={"additives_tags": ["en:e171", "en:e102"]}`. Substances:
    - E171: aliases "titanium dioxide", "E171"; EU `not_authorised`/food_additive.
    - E102: alias "E102" only; EU `warning_label`/food_additive.
  - `test_row_note_from_label_name`: the "Colour: titanium dioxide" row (matched through `alias_key`'s prefix stripping from Task 3) has `rule_note.text == "Not authorised as a food additive in the EU"`, and "Sugar" has no note.
  - `test_tag_only_match_becomes_rule_extra`: E102 → `rule_extras[0].text == "Warning label required in the EU"`, `substance_name` set.
  - `test_glance_counts`: country `FR` → `rules_glance == {"where_you_live": 2, "elsewhere": 0}`. Country `CA` → `{"where_you_live": 0, "elsewhere": 2}`.
  - `test_canonical_link_never_used_for_notes`: a row matched only through `ingredient_id` to a canonical ingredient linked to E100, with no alias match ("Turmeric") → no note.
  - `test_cosmetic_ignores_food_additive_rules`: the same TiO2 substance on a cosmetic product → no note.
- [ ] **Step 2: Run to verify they fail.** `pytest tests/test_openfoodfacts_connector.py tests/integration/test_product_rules_api.py -v`.
- [ ] **Step 3: Implement** the connector and pipeline lines, `product_rules.attach_rules`, the schema fields, and the three endpoint call sites.
- [ ] **Step 4: Run to verify they pass**, plus `pytest tests/test_product_measures_response.py tests/integration/test_catalog_api.py`. Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): rule notes on product rows, tag-only extras and the glance line"`

---

## Part B — Bulk importers

### Task 7: Bulk import framework, versioning and positive-list derivation

**Files:**
- Create: `backend-nourai/app/services/regulation/importer.py`, `backend-nourai/scripts/import_regulatory_list.py`
- Modify: `backend-nourai/Makefile` (target `import-rules: $(PYTHON) -m scripts.import_regulatory_list $(SOURCE) $(if $(FILE),--file $(FILE),)`; add it to `.PHONY` and help)
- Modify: `backend-nourai/requirements.txt` (`beautifulsoup4==4.12.3`, `pypdf==5.1.0`, `openpyxl==3.1.5`)
- Test: `backend-nourai/tests/integration/test_regulation_importer.py`

**Interfaces:**
- Produces:
  - `@dataclass class ParsedSubstance`: `key: str` (stable within the source: E-number, CAS or a normalised name), `name: str`, `e_number`, `cas`, `inci`, `aliases: list[tuple[str, str, str]]` (alias, alias_type, language).
  - `@dataclass class ParsedRule`: `substance_key`, `place`, `authority`, `kind`, `status`, `classification`, `applies_to`, `sub_scope`, `condition`, `limit_value`, `limit_unit`, `limit_basis`, `effective_from`, `effective_until`, `legal_reference`, `source_url`, `row_ref: str` (where in the source this came from).
  - `@dataclass class ParsedList`: `place: str`, `applies_to: str`, `semantics: Literal["positive", "negative", "listing"]`, `substances`, `rules`, `checked_keys: list[str]` (substances checked in this list with no rule).
  - `class BulkSource(Protocol)`: `slug: str`, `name: str`, `licence_name: str`, `licence_url: str`, `default_url: str`, `def parse(self, raw: bytes) -> ParsedList`.
  - `SOURCES: dict[str, BulkSource]`, the registry that Tasks 8–13 add to.
  - `async def import_list(session, source: BulkSource, raw: bytes, fetched_url: str, now: datetime) -> ImportResult`. `ImportResult` has `created`, `retired`, `unchanged`, `substances_created`, `checks`.
    - Upserts the `data_sources` row (slug, licence).
    - Writes one `source_records` row (hash of `raw`) and skips everything when that hash was already imported for the source (it only bumps `last_checked_at` on that source's published rules).
    - Upserts substances by `e_number`, then `cas`, then an exact alias match. Adds aliases (approved).
    - Rules are published with `origin="bulk"`. They're compared on the tuple (`substance`, `place`, `applies_to`, `sub_scope`, `status`, `condition`, `limit_*`, `effective_*`, `legal_reference`). A changed row retires the old rule (`review_status="retired"`) and inserts a new one with `supersedes_id`.
    - Rules of this source no longer present are retired.
    - Upserts `rule_checks` for `checked_keys` (`origin="bulk"`).
  - `async def derive_not_authorised(session, place: str, source_slug: str, now: datetime) -> int`. For positive lists:
    - Takes substances with an `e_number`, or with any `food_additive` rule in another place, that have no rule from `source_slug` in `place`.
    - Inserts a published `not_authorised`/`food_additive` rule (`origin="derived"`, `legal_reference` from `ParsedList`, `source_url` = the list URL, `source_quote` = the list's legal-basis sentence passed by the source).
    - Retires derived rules that the list now covers.
    - Returns the count.
  - CLI `python -m scripts.import_regulatory_list <slug> [--file path] [--derive]` fetches `default_url` with httpx unless `--file` is given, then prints `ImportResult` as JSON.

- [ ] **Step 1: Write the failing integration tests**, using a fake `BulkSource` defined in the test (two substances, one rule each, `semantics="positive"`):
  - `test_first_import_publishes`
  - `test_reimport_unchanged_is_noop`: same bytes → `created == 0`, `retired == 0`, rule count unchanged.
  - `test_changed_row_retires_old_rule`: the limit changes → the old rule is `retired`, the new one has `supersedes_id` set.
  - `test_missing_row_is_retired`
  - `test_derive_not_authorised_only_for_additives`: substances "Potassium bromate" (US `allowed_with_limits`/food_additive from another source), "Sugar" (no E-number, no additive rule) and "E171" (on the list). Running `derive_not_authorised` for EU → only potassium bromate gets `not_authorised`.
- [ ] **Step 2: Run to verify they fail.** `pytest tests/integration/test_regulation_importer.py -v`.
- [ ] **Step 3: Implement** `importer.py`, the CLI, the Makefile target and the requirements.
- [ ] **Step 4: Run to verify they pass.** Expected: 5 passed.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): bulk import with versioning and not-authorised derivation"`

### Tasks 8–13: One parser per Phase 1 official list

Every source task follows the same shape. Each is its own commit and its own reviewer gate.

1. **Verify the source.** Fetch the URL below and confirm its current format, URL and reuse terms. Write them in the module docstring (URL, format, licence, update cadence, retrieval date).
   - If there is no bulk format, stop. Mark the task "moved to curated" in this plan, and add the source's substances to the curation manifests (Milestone M3).
   - If the terms forbid commercial reuse of bare facts, stop and ask the owner.
2. **Save a small real excerpt** (≤ 40 rows, including the edge rows named below) as `tests/fixtures/regulation/<slug>.<ext>`.
3. **Write the failing parser test** `tests/test_regulation_source_<slug>.py`, asserting the named rows below exactly.
4. **Run it and see it fail.**
5. **Implement** `app/services/regulation/sources/<slug>.py`: one class implementing `BulkSource` and registered in `SOURCES`.
6. **Run it and see it pass.**
7. **Import the full file** into the disposable DB with `make import-rules SOURCE=<slug>`. Paste the `ImportResult` counts into the commit message.
8. **Commit:** `feat(rules): <source name> importer`.

| Task | slug | Start from | Semantics → status mapping | Rows the test must pin |
|---|---|---|---|---|
| 8 | `eu-cosing` | CosIng on the European Commission single-market site (cosmetic ingredient database, annexes download). Delete `scripts/fetch_cosing_data.py` and the `fetch-cosing` Makefile target in this task. | `place="EU"`, `applies_to="cosmetic"`. Annex II → `banned` (negative list). Annex III → `allowed_with_limits` with max concentration, sub-scope and warning wording in `condition`. Annexes IV/V/VI → `allowed_with_limits`. | Butylphenyl methylpropional (Lilial) → `banned`. A paraben ester in Annex V with its max %. One Annex III fragrance allergen (e.g. linalool) → `allowed_with_limits` with its labelling condition. `legal_reference` = "Regulation (EC) No 1223/2009, Annex …". |
| 9 | `eu-food-additives` | The EU food additives database (food.ec.europa.eu, food improvement agents) or the consolidated Annex II of Regulation (EC) 1333/2008 on EUR-Lex | `place="EU"`, `applies_to="food_additive"`, positive list. Listed → `allowed_with_limits` (permitted with category/maximum conditions summarised by template "Permitted in {n} food categories" plus the official text link). Annex V colours additionally → `warning_label` with the official warning text. Legal basis sentence for derivation: Article 4(1). Run `--derive` after. | E102 → two rules (`allowed_with_limits` and `warning_label`). E127 → `allowed_with_limits`. E171 absent → derived `not_authorised` after `--derive`. |
| 10 | `us-fda-colour-additives` + `us-fda-cosmetics` + `us-fda-food-substances` (three classes, one task, one module each) | FDA Color Additive Status List; 21 CFR Part 700 subpart B via the eCFR API; FDA "Substances Added to Food" inventory | Colours: listed for food → `allowed_with_limits` (with CFR section and limit). Revoked with future date → `banned` with `effective_from`. Cosmetics 21 CFR 700.11–700.35 → `banned` or `allowed_with_limits` (`applies_to="cosmetic"`). Food substances → `allowed_with_limits` when a CFR reference exists, else `listed`. | Titanium dioxide 21 CFR 73.575 → `allowed_with_limits`, `condition` "Up to 1% by weight". FD&C Red No. 3 → `banned` from 2027-01-15 for food. One 21 CFR 700 entry (e.g. mercury compounds 700.13) → `banned` with sub-scope. |
| 11 | `ca-cosmetic-hotlist` | Health Canada Cosmetic Ingredient Hotlist (canada.ca) | `place="CA"`, `applies_to="cosmetic"`, negative list. Prohibited → `banned`. Restricted → `allowed_with_limits` with conditions. | One prohibited row, one restricted row with a % limit, `legal_reference` "Cosmetic Ingredient Hotlist (Health Canada)". |
| 12 | `ca-permitted-food-additives` | Health Canada Lists of Permitted Food Additives (15 lists, canada.ca) | `place="CA"`, `applies_to="food_additive"`, positive list. Listed → `allowed_with_limits`. Run `--derive` after. | Titanium dioxide permitted (colouring agents list). Potassium bromate → derived `not_authorised` after `--derive`, unless present in a list. |
| 13 | `iarc-classifications` | IARC Monographs "List of Classifications" (monographs.iarc.who.int) | `place="IARC"`, `kind="expert_view"`, `status="classification"`, `classification` ∈ {`Group 1`, `Group 2A`, `Group 2B`, `Group 3`}, `applies_to=None`, semantics `listing`. **Licence gate (Global Constraints)** applies. | Aspartame → `Group 2B`, `effective_from` 2023 volume date. Processed meat → `Group 1`. |

For California AB 418 (four substances, from 2027-01-01), WADA, French national rules, UK, Australia, Germany and Italy, see the curated path (Part C).

---

## Part C — Curated path, review and legacy

### Task 14: Document fetching, extraction and quote verification

**Files:**
- Create: `backend-nourai/app/services/regulation/documents.py`, `backend-nourai/app/services/regulation/curation.py`, `backend-nourai/scripts/curate_rules.py`
- Modify: `backend-nourai/Makefile` (`curate-rules: $(PYTHON) -m scripts.curate_rules $(MANIFEST)`)
- Test: `backend-nourai/tests/test_regulation_curation.py`, `backend-nourai/tests/integration/test_regulation_curation_db.py`

**Interfaces:**
- Consumes: `ResearchLLM.extract(stage, system, prompt, output, effort)` from `app/services/research/llm.py`; Task 1 models; Task 2 vocabularies.
- Produces:
  - `@dataclass class DocumentText`: `url`, `title`, `text`, `content_hash`, `fetched_at`.
  - `async def fetch_document(url: str, client: httpx.AsyncClient) -> DocumentText`. HTML goes through BeautifulSoup `get_text("\n")`; PDF goes through pypdf, page texts joined with `\n`.
  - `def normalize_for_quote(text: str) -> str`: NFKC, collapse all whitespace to single spaces, unify curly quotes and apostrophes, strip soft hyphens.
  - `def quote_in_document(quote: str, document: DocumentText) -> bool`: the substring test after `normalize_for_quote` on both. Quotes under 20 characters are rejected (too weak to prove anything).
  - `class CuratedRuleDraft(BaseModel)`. Fields mirror `ParsedRule`, plus `source_quote: str` (verbatim, original language), `quote_location: str`, `condition_en: str | None` and `why: str | None`. `place`, `status` and `applies_to` are constrained to the Task 2 vocabularies through `Literal` types. `applies_to` may be `None` only when `kind == "expert_view"`, enforced by a model validator.
  - `class CuratedRuleSet(BaseModel)`: `rules: list[CuratedRuleDraft]`, `checked_places: list[tuple[str, str]]` (place, applies_to the document fully covers with no rule).
  - `CURATION_SYSTEM: str`, the system prompt. It must say:
    - extract only what this document states
    - quote verbatim
    - use only the given vocabularies
    - translate the condition to plain English in `condition_en`
    - return no rule if the document is silent
    - expert bodies are `expert_view` with no `applies_to`
    - the spec's cross-category encodings:
      - a substance classed as a prescription-only medicine in this place, but sold as a supplement elsewhere, is `applies_to="supplement"`, `status="prescription_only"`, condition "Classed as a medicine; not sold as a supplement" (melatonin in the UK)
      - a prescription-only rule on a skin product is emitted twice, once for `cosmetic` and once for `medicine` (hydroquinone in the US)
      - WADA entries are `place="WADA"`, `applies_to="sport"`, with the list section and "at all times" / "in-competition" in `sub_scope`
  - `async def draft_rules(llm, substance_name: str, places: list[str], documents: list[DocumentText]) -> tuple[list[CuratedRuleDraft], list[CuratedRuleDraft]]`, returning (kept, dropped_for_quote). A draft is kept only when its quote is found in one of `documents`, and its `source_url` is set to that document's URL.
  - `async def store_drafts(session, substance_id, drafts, documents, now) -> int`. It writes `regulatory_rules` with `origin="curated"`, `review_status="draft"`, `condition=condition_en`, `last_checked_at=now`, and `source_record` rows per document (hash). `checked_places` are **not** written as `rule_checks`; they go into the draft's metadata for the reviewer to confirm (Task 15).
  - Manifest format, `data/regulation/curation/<slug>.json`:
    `{"substance": {"name": str, "e_number": str|null, "cas": str|null, "aliases": [[alias, type, lang]], "ingredient": canonical_name|null, "scope_label": str|null}, "places": [str], "documents": [{"url": str, "place": str}]}`.
  - CLI `python -m scripts.curate_rules <manifest>... [--dry-run]`. It upserts the substance and aliases, links `ingredient_substances` when `ingredient` is given, fetches the documents, drafts, stores, and prints kept/dropped counts.

- [ ] **Step 1: Write the failing unit tests**
  - `test_quote_found_across_whitespace_and_quotes`: document text `"Titanium  dioxide\n(E 171) shall not be used"` and quote `"Titanium dioxide (E 171) shall not be used"` → True.
  - `test_short_quote_rejected`.
  - `test_absent_quote_dropped`: a fake LLM returning two drafts, one with an absent quote → `kept == 1`, `dropped == 1`.
  - `test_vocabulary_enforced`: `CuratedRuleDraft(status="forbidden", ...)` raises `ValidationError`.
- [ ] **Step 2: Write the failing integration test** `test_drafts_stored_unserved`: stored drafts exist with `review_status="draft"`, and `GET /ingredients/{id}` shows no rules for them.
- [ ] **Step 3: Run to verify they fail.** `pytest tests/test_regulation_curation.py tests/integration/test_regulation_curation_db.py -v`.
- [ ] **Step 4: Implement** `documents.py`, `curation.py`, the CLI and the Makefile target. Use a fake LLM object exposing `extract` in the tests; never call Claude in tests.
- [ ] **Step 5: Run to verify they pass.** Expected: 5 passed.
- [ ] **Step 6: Commit.** `git commit -m "feat(rules): curated extraction with verbatim-quote check"`

### Task 15: Owner review CLI

**Files:**
- Create: `backend-nourai/app/services/regulation/review.py`, `backend-nourai/scripts/review_rules.py`
- Modify: `backend-nourai/Makefile` (`review-rules: $(PYTHON) -m scripts.review_rules $(ARGS)`)
- Test: `backend-nourai/tests/integration/test_regulation_review.py`

**Interfaces:**
- Produces:
  - `async def pending_by_substance(session, limit_substances: int | None = None) -> list[tuple[RegulatedSubstance, list[RegulatoryRule]]]`: drafts grouped by substance, in substance-name order.
  - `async def apply_decision(session, rule_id, decision: Literal["approve", "reject"], reviewer: str, note: str | None, now) -> None`.
    - Approve → `published`, stamping `reviewed_by` and `reviewed_at`. It also retires an older published curated rule with the same (`substance`, `place`, `applies_to`, `sub_scope`), setting `supersedes_id`.
    - Reject → `retired` with `review_note` required (raises `ValueError` without it).
  - `async def confirm_checked(session, substance_id, place, applies_to, documents: list[str], reviewer, now) -> None`: upserts `rule_checks` with `origin="curated"`.
  - `async def progress(session) -> dict[str, int]`: counts `draft`, `published`, `retired` for `origin="curated"`.
  - CLI `python -m scripts.review_rules [--reviewer NAME] [--status] [--substance NAME]`:
    - For each pending substance it prints, per rule: place, status label, scope, condition (English), `source_quote` (original language) and source URL.
    - Keys: `a` approve, `r` reject (prompts for a reason), `s` skip, `q` quit.
    - It then lists the draft's `checked_places` for `y`/`n` confirmation.
    - Decisions commit one by one, so quitting and re-running resumes where it left off.
    - `--status` prints `progress`.

- [ ] **Step 1: Write the failing integration tests**
  - `test_approve_publishes_and_supersedes`
  - `test_reject_requires_reason`
  - `test_confirm_checked_creates_rule_check`
  - `test_progress_counts`
  - `test_resume`: after approving 1 of 3, `pending_by_substance` returns the other 2.
- [ ] **Step 2: Run to verify they fail.** `pytest tests/integration/test_regulation_review.py -v`.
- [ ] **Step 3: Implement** `review.py` and the CLI. The CLI loop is a thin wrapper and is not unit-tested.
- [ ] **Step 4: Run to verify they pass.** Expected: 5 passed.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): resumable owner review of curated rules"`

### Task 16: Golden set and acceptance check

**Files:**
- Create: `backend-nourai/data/regulation/golden_set.json`, `backend-nourai/scripts/check_rules_golden_set.py`
- Create: curation manifests for the golden-set substances in `backend-nourai/data/regulation/curation/`
- Test: `backend-nourai/tests/test_rules_golden_set_format.py`

**Interfaces:**
- Golden-set format: a list of entries `{"substance": str, "e_number": str|null, "expect": [{"place": str, "applies_to": str, "status": str, "effective_from": "YYYY-MM-DD"|null, "source_url": str, "quote": str}], "product_note": {"category": str, "country": str, "text": str}|null, "approved_by": str|null}`.
- Substances (from the spec; the builder confirms each against its source):
  - titanium dioxide (E171), tartrazine (E102), erythrosine (E127)
  - potassium bromate, brominated vegetable oil, propylparaben
  - aspartame, red yeast rice / monacolin K, melatonin
  - BHA, butylphenyl methylpropional, triclosan, hydroquinone
  - methylparaben, propylparaben (cosmetic), retinol
  - phenoxyethanol, linalool, carrageenan, BPC-157 (WADA)
- `python -m scripts.check_rules_golden_set [--country CA]`:
  - Loads published rules through `store.load_rule_facts` and compares every `expect` item: place, applies_to and status must exist, and so must `effective_from` when given.
  - Checks each `product_note` with `rules.note_for`.
  - Skips entries with `approved_by == null`, printing them as "awaiting approval".
  - Exits 1 on any mismatch.

- [ ] **Step 1: Write the failing format test**: every entry has a non-empty `expect`; every `status`, `place` and `applies_to` is in the Task 2 vocabularies; every `source_url` starts with `https://`.
- [ ] **Step 2: Draft `golden_set.json`** from official sources (fetch each, copy the exact quote), with `approved_by: null`. Write the matching curation manifests.
- [ ] **Step 3: Run the format test.** It passes once the file is drafted.
- [ ] **Step 4: Implement** `check_rules_golden_set.py`.
- [ ] **Step 5: Commit.** `git commit -m "feat(rules): golden set and acceptance check (awaiting owner approval)"`

### Task 17: Peptide statuses through the curated path; legacy sync

**Files:**
- Create: `backend-nourai/app/services/regulation/legacy.py`
- Modify: `backend-nourai/scripts/seed_peptides.py` (remove the `us_regulatory_status` and `wada_status` values; leave `None`, with a comment that statuses come from curated rules)
- Create: `backend-nourai/data/regulation/curation/peptide-*.json` (one manifest per seeded peptide; documents are the current WADA Prohibited List and the relevant FDA page)
- Modify: `backend-nourai/scripts/review_rules.py` (after a session with approvals, call `sync_legacy_peptide_fields`)
- Test: `backend-nourai/tests/integration/test_regulation_legacy.py`

**Interfaces:**
- `async def sync_legacy_peptide_fields(session) -> int`: for ingredients linked to substances with published rules, set the fields below and return the count updated.
  - `wada_status`:
    - `prohibited_all` when a WADA `banned`/sport rule has no sub-scope
    - `prohibited_in_competition` when its sub-scope contains "in-competition"
    - `not_prohibited` only when a WADA `rule_checks` row exists and no WADA rule does
    - else `None`
  - `us_regulatory_status`, from the US rule status:
    - `allowed`/`allowed_with_limits` for `medicine` → `fda_approved`
    - `prescription_only` → `fda_approved`
    - `banned`/`not_authorised` → `unapproved_drug`
    - none → `None`
  - The values `compounded` and `research_chemical` come only from a curated rule with `classification` set to that value (status `listed`, US).

- [ ] **Step 1: Write the failing tests**
  - `test_bpc157_prohibited_from_rule`: a WADA `banned`/sport rule for BPC-157 (sub-scope "S0 Non-approved substances; at all times") → `wada_status == "prohibited_all"`.
  - `test_no_check_no_status`: no WADA rule or check → `None` (not `not_prohibited`).
- [ ] **Step 2: Run to verify they fail.** `pytest tests/integration/test_regulation_legacy.py -v`.
- [ ] **Step 3: Implement** `legacy.py`, the seed change and the review-hook call. Write the peptide manifests.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit.** `git commit -m "fix(peptides): statuses come from sourced rules; BPC-157 is WADA-prohibited"`

---

## Part D — App

### Task 18: Types, API calls and pure helpers

**Files:**
- Modify: `nourai/services/api.ts`
  - Types: `RulesBlock`, `SubstanceRules`, `PlaceRow`, `PlaceRule`, `ExpertView`, `RuleNote`, `RulesGlance`, `SubstanceDetail`, mirroring Task 5/6 field names exactly.
  - `IngredientDetail.rules?: RulesBlock | null`.
  - `Ingredient.rule_note?: RuleNote | null` and `Ingredient.rule_substance_id?: string | null`.
  - `Product.rule_extras?: RuleNote[]` and `Product.rules_glance?: RulesGlance | null`.
  - `getIngredient(id, country?)`, `getIngredientWithFallback(id, country?)` and `openProduct(id, country?)` append `?country=`. New `getSubstance(id, country?)`.
- Create: `nourai/utils/rules.ts`, `nourai/tests/rules.test.cjs`

**Interfaces:**
- `export function userCountry(region?: string): string`: an uppercase 2-letter code, else `'CA'`. Callers pass `deviceRegion()`.
- `export function statusTone(status: string): 'weak' | 'moderate' | 'neutral' | 'strong'`: `banned`/`not_authorised` → weak; `prescription_only`/`warning_label`/`approval_required` → moderate; `allowed_with_limits`/`listed` → neutral; `allowed` → strong.
- `export function effectiveText(from: string | null, until: string | null, today: Date): string | null`, giving "Since 2022" for a past date, "From 15 Jan 2027" for a future one, or null.
- `export function glanceText(g: { where_you_live: number; elsewhere: number } | null | undefined): string | null`, e.g. "1 ingredient restricted where you live · 2 elsewhere". Singular/plural: "1 ingredient", "2 ingredients". A zero side is omitted. Both zero → null.
- `export const RULES_FOOTER = (date: string) => \`Rules change. Last checked ${date}. Not legal advice.\``.
- `export const IARC_EXPLAINER = 'This rates whether it can cause cancer, not how likely it is at normal amounts.'`.

- [ ] **Step 1: Write the failing tests** `tests/rules.test.cjs`, loading `utils/rules.ts` the same way `tests/evidence.test.cjs` does:
  - `userCountry('fr') === 'FR'`, `userCountry(undefined) === 'CA'`, `userCountry('zzz') === 'CA'`
  - `statusTone('not_authorised') === 'weak'`
  - `effectiveText('2027-01-15', null, new Date('2026-11-04')) === 'From 15 Jan 2027'`
  - `glanceText({ where_you_live: 1, elsewhere: 2 }) === '1 ingredient restricted where you live · 2 elsewhere'`
  - `glanceText({ where_you_live: 0, elsewhere: 0 }) === null`
  - `RULES_FOOTER('4 Nov 2026')` exact copy
- [ ] **Step 2: Run to verify they fail.** `cd nourai && node --test tests/rules.test.cjs`.
- [ ] **Step 3: Implement** `utils/rules.ts` and the `api.ts` changes.
- [ ] **Step 4: Run to verify they pass.** Also run `./node_modules/.bin/tsc --noEmit`, which must be clean.
- [ ] **Step 5: Commit.** `git commit -m "feat(app): rules types, API country and helpers"`

### Task 19: Rules section on the ingredient page

**Files:**
- Create: `nourai/components/rules/RulesSection.tsx`
- Modify: `nourai/app/ingredient/[id].tsx` (pass `userCountry(deviceRegion())` to `getIngredientWithFallback`; render `<RulesSection rules={data.rules} />` directly after the `BeliefReality` block; delete the old "Regulatory status" section at lines 247–255 — routes move into "How it works" as a plain row if present)

**Interfaces:**
- `export function RulesSection({ rules }: { rules?: RulesBlock | null }): JSX.Element | null`. Returns null when `!rules` or when no substance has places or expert views.
- Layout, using `Section`, `ListGroup`, `ListRow`, `Pill`, `Txt` and `Sheet` from `components/ui`:
  - The section is titled "Rules".
  - Per substance (with a `scope_label` subheading when there is more than one): the summary line in body text.
  - Place rows: `title=place_name`. The subtitle shows the status label(s), plus scope, plus `effectiveText`, plus "EU rule" when `via_place === 'EU'`.
  - The own row is highlighted: a "Where you live" overline and an accent border.
  - A `checked_no_rule` row shows the subtitle "No specific rule".
  - Tapping a row opens a `Sheet` with, per rule: the condition, the legal reference, an "Official source" link (`Linking.openURL`), "Last checked {date}" and the `why` line.
  - An "Expert views" group sits below in a sunken card. Rows show `body_name` and `classification`, and IARC rows show `IARC_EXPLAINER`. It never uses `statusTone` colours.
  - The footer is `RULES_FOOTER(formatted rules.last_checked_at)` in a footnote.

- [ ] **Step 1: Implement the component and the screen change.**
- [ ] **Step 2: Verify the types.** Run `./node_modules/.bin/tsc --noEmit`. Expected: clean.
- [ ] **Step 3: Verify in the simulator** (use the `run` skill or `npx expo start`, iOS), against a local backend seeded with the Task 5 fixture data through the curation manifests for titanium dioxide.
  - Expected: "Rules" sits directly under "What the evidence shows", with two substance groups. The first row is "Canada" or the device region. Tapping a row opens the sheet with a working source link, and the footer copy is exact.
  - Take a screenshot and save it to `docs/superpowers/plans/assets/rules-ingredient.png`.
- [ ] **Step 4: Commit.** `git commit -m "feat(app): rules section on the ingredient page"`

### Task 20: Rules-only screen and product page notes

**Files:**
- Create: `nourai/app/substance/[id].tsx`
- Modify: `nourai/app/product/[id].tsx`:
  - pass the country to `openProduct`
  - `describe()` prefers `ing.rule_note` for the subtitle and `Palette.weak` / `Palette.moderate` for the dot, via `statusTone`
  - `openIngredient` routes to `/substance/{rule_substance_id}` when there is no `ingredient_id` and `rule_substance_id` is set
  - the "At a glance" card shows `glanceText(product.rules_glance)` under the stats when non-null
- Modify: `nourai/components/product/ProductSections.tsx` (`IngredientsCard` renders `rule_extras` as rows after the label list; the title is `substance_name`, the subtitle is `note.text`, and tapping goes to `/substance/{substance_id}`)

**Interfaces:**
- `SubstanceScreen`: loads `api.getSubstance(id, userCountry(deviceRegion()))`. It renders `Screen` with `title=name`, then a "Not researched yet" pill, then `<RulesSection rules={data.rules} />`. When `ingredient_ids[0]` exists, a "See the research" button goes to `/ingredient/{id}`. It has loading, empty and error states (`EmptyState` with retry).

- [ ] **Step 1: Implement the screen, the product page changes and the card change.**
- [ ] **Step 2: Verify the types.** Run `./node_modules/.bin/tsc --noEmit`. Expected: clean.
- [ ] **Step 3: Verify in the simulator** with the Task 6 fixture product, and the device region set to France, then Canada (Simulator → Settings → General → Language & Region).
  - France: the TiO2 row reads "Not authorised as a food additive in the EU". E102 appears as an extra row. At a glance reads "2 ingredients restricted where you live".
  - Canada: "2 ingredients restricted elsewhere".
  - Tapping the E102 extra opens the rules-only screen.
  - Take screenshots and save them to `docs/superpowers/plans/assets/`.
- [ ] **Step 4: Commit.** `git commit -m "feat(app): rule notes on product rows and a rules-only screen"`

---

## Part E — Data milestones (builder prepares, owner approves)

Code work does not wait for these. Each milestone has a verification that must pass before it is called done.

### M1: Bulk lists in production

- [ ] Once the owner merges the branch to `main`, Railway auto-deploys and runs `alembic upgrade head`. Merging and pushing are the owner's call. Then check that RLS is enabled:
  `select relname, relrowsecurity from pg_class where relname in ('regulated_substances','regulated_substance_aliases','ingredient_substances','regulatory_rules','rule_checks');`
  All must be `true`.
- [ ] From the owner's Mac, against production, run `make import-rules SOURCE=<slug>` for each Task 8–13 source, then `--derive` for `eu-food-additives` and `ca-permitted-food-additives`. Record each `ImportResult` in `docs/superpowers/plans/2026-11-04-ingredient-rules-data-log.md`.
- [ ] Link the 100 researched ingredients to their substances: each curation manifest's `ingredient` field links on run, and bulk-only substances are linked through a one-off manifest listing `ingredient` + `e_number`/`cas`.

### M2: Golden set approved (first, because Task 16's check depends on it)

- [ ] Run `make curate-rules MANIFEST="data/regulation/curation/golden-*.json"`. Record the kept/dropped counts.
- [ ] Owner: `make review-rules ARGS="--reviewer <owner>"` until `--status` shows 0 golden drafts. The owner also sets `approved_by` in `golden_set.json` for each entry they confirm.
- [ ] Run `python -m scripts.check_rules_golden_set --country CA` and `--country FR` against production. Expected: exit 0, nothing "awaiting approval".

### M3: Full curated fill

- [ ] Write manifests for:
  - each of the 100 researched ingredients (`backend-nourai/data/top_ingredients.json`), listing places EU, FR, CA, US, plus GB, AU, DE and IT where the ingredient is a supplement or botanical, with official documents per place
  - California AB 418 (the four substances, effective 2027-01-01)
  - French national rules (ANSES / DGCCRF documents per substance)
  - the WADA Prohibited List current year for sport-relevant ingredients
  - the peptides (Task 17)

  Where a place has nothing on a substance, the reviewer confirms it as checked only after reading the documents.
- [ ] Run `make curate-rules` in batches of about 10 manifests. Keep a running log of kept/dropped counts in the data log.
- [ ] Owner reviews in sessions (`make review-rules`). Expected total: roughly 300–600 drafts. Progress comes from `--status`.
- [ ] After review: `sync_legacy_peptide_fields` has run (Task 17 hook), and `GET /api/v1/peptides` shows sourced statuses.
- [ ] Done when `--status` shows 0 drafts and the golden-set check still exits 0.

---

## Final verification

- [ ] Backend: `cd backend-nourai && pytest tests -q` (unit), then the integration suite with the disposable DB. Expected: all pass.
- [ ] App: `cd nourai && ./node_modules/.bin/tsc --noEmit && node --test tests/*.test.cjs`. Expected: clean and all pass.
- [ ] Simulator: run through ingredient page, product page and rules-only screen as in Tasks 19–20, against production data after M1–M3.
- [ ] Review: whole-branch review against the spec's anti-goals, especially no drafts served, no "allowed" from absence, and expert views never in law wording.
