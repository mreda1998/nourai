# Ingredient identity: clean names from open taxonomies and a local model

Status: approved in conversation.

## Problem

Only 4.4% of product-ingredient occurrences link to the library. Label names are multilingual ("Sucre", "Kakaomasse", "Калциев казеинат"), use E-numbers and INCI Latin, include class words ("Émulsifiant", "Arôme") and parsing junk ("Dont Acides Gras 7.0G Saturés", "_Lait_" markup).

Measured on current data: exact lookup against Open Food Facts (ingredients + additives), CosIng and our library resolves **69%** of occurrences (cosmetics 82%, food 67%, supplements 60%). 17,751 distinct names remain.

## Goal

Every label name resolves to a canonical substance (or is honestly labelled a class, mixture or junk), shown to users under a clean English name, with identifiers that connect to the molecule and mechanism layers — without a model ever inventing a substance.

## Data model (migration 019)

- `substances`: `key` (unique: `off:en:sugar`, `offadd:en:e330`, `cosing:89078`, `lib:<ingredient uuid>`), `name_en`, `type` (`substance | class | mixture`), `e_number`, `inci_name`, `cas`, `wikidata`, `source`, `license`, `ingredient_id` (nullable FK to the curated library).
- `substance_aliases`: `substance_id`, `alias`, `normalized_alias`, `language`, `source`, `method` (`taxonomy | ai | review`), `confidence`. Trigram index on `normalized_alias`.
- `name_resolutions`: one row per distinct normalised label name — `normalized_name` (unique), `status` (`resolved | class | mixture | junk | review | unresolved`), `substance_id`, `method` (`exact | plural | ai`), `confidence`, `model`, `candidates` (JSONB, for review).
- `product_ingredients`: + `substance_id` (nullable FK), + `display_name` (clean English name).

Source priority when two sources claim the same alias: library > OFF ingredients > OFF additives > CosIng.

## Pipeline

1. **Clean** (`app/services/identity/clean.py`): strip `_` allergen markup, leading `E330 –`, trailing punctuation; normalise whitespace/case; detect junk (nutrition fragments with quantities like "7.0G", headings like "Ingredients", bare percentages).
2. **Exact** (`lookup.py`): alias table, then singular fallback, then E-number regex.
3. **Candidates** (`candidates.py`): top 10 substances by trigram similarity on aliases.
4. **Local model** (`llm.py`): Ollama `gpt-oss:20b`, JSON output, batches of ~10 names per call. For each name it returns `{index, choice: candidate number | null, type, english_name, confidence}`. Candidates may themselves be classes. A choice outside the candidate list is discarded. Temperature 0.
5. **Accept or queue**: confidence ≥ 0.85 and a valid choice → `resolved` (method `ai`) plus an `ai` alias; class/mixture/junk verdicts at ≥ 0.85 are recorded as such; everything else → `review` with its candidates, ranked by product occurrences (existing `review_tasks`).

Product rows get `substance_id` and `display_name`; `ingredient_id` is set only when the substance maps to a library ingredient.

## Display

`MobileIngredient.name` becomes `display_name` when present (original label text kept as `label_name`). Junk rows are omitted from ingredient lists; class words are shown with a "Class" tag.

## Scripts

- `scripts/import_taxonomies.py`: download OFF ingredients/additives JSON and the CosIng CSV into `backend-nourai/data/taxonomies/` (git-ignored), upsert substances and aliases, link library ingredients.
- `scripts/resolve_names.py [--limit N] [--no-llm] [--dry-run]`: resolve distinct label names, update product rows, print coverage.
- `scripts/eval_name_model.py --n 200`: hold out 200 names that resolve exactly, hide their exact alias from retrieval, and report how often the model picks the right substance.

## Licensing

Open Food Facts data is ODbL: attribution required and the derived substance/alias tables are share-alike. CosIng is EU open data (reuse with acknowledgement). Recorded per row in `substances.license`.

## Testing

Unit tests for cleaning and exact lookup using this session's real names; the model step with a fake client (valid choice, out-of-range choice rejected, low confidence → review); a live accuracy check before the full run; a first live run on the top 500 unresolved names.
