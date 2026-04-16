# Three-Tier Ingredient Data Pipeline — Design Spec
**Date:** 2026-04-15  
**Status:** Approved  
**Scope:** Backend only — no frontend changes required

---

## Problem Statement

The Clinical Intelligence Report (product detail page) is incomplete for most products:

- **Whole foods** (egg, salmon, broccoli): empty page — no nutrients, no biodomain bars
- **Packaged foods**: partial ingredient list, most items have no deep-dive link, biodomain bars empty
- **Supplements** (creatine, whey): fully working — used as the reference target

Root causes:
1. The biodomain scorer only activates when `product_ingredients` rows link to canonical `Ingredient` records that have `ingredient_biodomain_scores`. USDA virtual products never go through the DB, so bars are always empty.
2. The canonical ingredient table has ~40 hand-curated entries — far below the coverage needed.
3. Standard USDA nutrients (Protein, Vitamin C, etc.) have no biodomain mapping at all.

---

## Goals

1. **Complete Clinical Intelligence Report for any product** — nutrition panel + biodomain bars populated regardless of whether the product came from the local DB, Open Food Facts, or USDA.
2. **2,500-ingredient golden set** — canonical ingredients covering common cosmetics, supplements, food bioactives, OTC actives, and food additives, each with full PubMed-backed deep dives.
3. **Automatic Tier-3 logging** — unrecognized ingredients are counted so future golden set batches can be prioritised by frequency.

---

## Architecture: Three-Tier System

Every ingredient a user encounters is slotted into exactly one tier.

### Tier 1 — Golden Set (~2,500 ingredients)
Full deep dive: PubMed evidence (tiered: meta-analysis → RCT → observational), biodomain scores, mechanism image (gpt-image-1), belief vs. reality summary, dose guidance.

- Stored as `Ingredient` rows with `research_status = COMPLETE` after research agent runs.
- Biodomain scores in `ingredient_biodomain_scores` table.
- Sources: curated seed CSV compiled from CosIng INCI actives, supplement/food actives, USDA nutrients (as rich Tier-1 entries), OTC actives, food additives.

### Tier 2 — Standard Nutrients (30 entries)
Nutrition panel rows + biodomain bars via static weight matrix. No PubMed per-nutrient — these are consensus-level nutritional science facts.

- Defined in `app/core/nutrient_biodomains.py` as a Python dict.
- Used at scoring time when a product has USDA nutrient rows but no Tier-1 ingredient links.
- Nutrients that are also in the golden set (e.g. Vitamin C, Magnesium) will eventually be Tier-1; until research agent runs on them, the weight matrix acts as the fallback.

### Tier 3 — Unrecognised Ingredients
Displayed in the ingredient list (name only), no deep-dive link. Appended to `unmatched_ingredient_log` table for frequency tracking.

---

## Nutrient-to-Biodomain Weight Matrix

File: `app/core/nutrient_biodomains.py`

Maps each of the 30 USDA standard nutrients to one or more biodomain impacts. Structure per entry:

```python
{
    "biodomain": str,       # one of the 10 BIODOMAIN_KEYS
    "direction": str,       # "benefit" | "harm"
    "magnitude": float,     # 0.0 – 1.0 (consensus-level strength)
    "confidence": str,      # "high" | "moderate" | "low"
}
```

Selected entries (full matrix in implementation):

| Nutrient | Biodomain | Direction | Magnitude | Confidence |
|---|---|---|---|---|
| Protein | body_composition | benefit | 0.90 | high |
| Protein | energy_metabolism | benefit | 0.55 | high |
| Omega-3 | cardiovascular | benefit | 0.85 | high |
| Omega-3 | inflammation_immune | benefit | 0.80 | high |
| Omega-3 | cognitive_mental | benefit | 0.65 | moderate |
| Vitamin D | bone_joint | benefit | 0.90 | high |
| Vitamin D | inflammation_immune | benefit | 0.65 | moderate |
| Vitamin D | hormonal_endocrine | benefit | 0.60 | moderate |
| Vitamin B12 | cognitive_mental | benefit | 0.75 | high |
| Vitamin B12 | energy_metabolism | benefit | 0.70 | high |
| Iron | energy_metabolism | benefit | 0.80 | high |
| Iron | cognitive_mental | benefit | 0.55 | moderate |
| Magnesium | sleep_recovery | benefit | 0.75 | moderate |
| Magnesium | cardiovascular | benefit | 0.55 | moderate |
| Magnesium | bone_joint | benefit | 0.60 | moderate |
| Sodium | cardiovascular | harm | 0.70 | high |
| Saturated Fat | cardiovascular | harm | 0.60 | moderate |
| Sugars | energy_metabolism | harm | 0.55 | moderate |
| Sugars | inflammation_immune | harm | 0.50 | moderate |
| Dietary Fiber | gut_digestive | benefit | 0.85 | high |
| Dietary Fiber | cardiovascular | benefit | 0.55 | moderate |
| Calcium | bone_joint | benefit | 0.90 | high |
| Zinc | inflammation_immune | benefit | 0.65 | moderate |
| Zinc | hormonal_endocrine | benefit | 0.55 | moderate |
| Vitamin C | inflammation_immune | benefit | 0.70 | high |
| Vitamin C | skin_appearance | benefit | 0.65 | moderate |
| Potassium | cardiovascular | benefit | 0.75 | high |
| Selenium | inflammation_immune | benefit | 0.55 | moderate |
| Vitamin A | skin_appearance | benefit | 0.75 | high |
| Vitamin E | skin_appearance | benefit | 0.60 | moderate |
| Vitamin E | inflammation_immune | benefit | 0.55 | moderate |
| Folate | cognitive_mental | benefit | 0.55 | moderate |
| Thiamine | energy_metabolism | benefit | 0.70 | high |
| Niacin | energy_metabolism | benefit | 0.65 | high |
| Riboflavin | energy_metabolism | benefit | 0.65 | high |

Magnitude values are scaled to reflect real-world dose relevance — a food supplying 100% DV of a nutrient should register as meaningful on the biodomain bar.

---

## Scoring Merge Logic

Updated `app/services/biodomain_scorer.py` gets a second scoring path:

```
score_product_biodomains(product_ingredients)     ← existing Tier-1 path
score_nutrient_biodomains(nutrient_rows)           ← new Tier-2 path (weight matrix)
```

At the product page level, both paths run and their outputs are merged:
- Tier-1 scores dominate (higher weight, evidence-backed).
- Tier-2 fills domains not covered by Tier-1 ingredients.
- Merged list fed into the existing `BioDomain` response shape — no frontend change.

For USDA virtual products specifically, `app/api/v1/foods.py` calls `score_nutrient_biodomains()` on the returned nutrient rows and populates `bio_domains` before returning the response.

---

## Golden Set Data Sources

Seed CSV: `data/golden_set_ingredients.csv`  
Columns: `canonical_name, category, synonyms (pipe-separated), source_layer, inci_name`

| Layer | Target count | Source |
|---|---|---|
| USDA nutrients | 30 | `usda.py _NUTRIENT_META` keys (already in codebase) |
| Supplement & food actives | ~700 | Hand-curated list: amino acids, herbal extracts, probiotics, antioxidants, fatty acids |
| Cosmetic INCI actives | ~1,200 | CosIng Annex II/III + popular actives (retinol, niacinamide, AHAs, UV filters) |
| OTC drug actives | ~150 | FDA OTC monograph drug ingredient list (public domain) |
| Food additives | ~420 | EU E-numbers + FDA GRAS list |
| **Total** | **~2,500** | |

**Filtering rule:** Only include ingredients with a meaningful scientific or common name (not purely technical codes like `CI 77891` or `PEG-40`). The research agent already handles ingredients with zero PubMed results gracefully (stores empty evidence, marks status COMPLETE). No pre-filtering against PubMed is needed.

---

## Seed Script

`scripts/seed_golden_set_v2.py`

Behaviour:
1. Reads `data/golden_set_ingredients.csv`
2. For each row: `INSERT INTO ingredients ... ON CONFLICT (canonical_name) DO NOTHING`
3. Sets `research_status = PENDING` for new rows (existing complete rows untouched)
4. Reports: N created, N skipped (already existed), N total PENDING after run

Makefile target: `make seed-golden-set`  
Cost to enrich full set: ~2,500 × $0.012 = ~$30 via `make research-all`

---

## Unmatched Ingredient Log

New table: `unmatched_ingredient_log`

| Column | Type | Notes |
|---|---|---|
| `name_raw` | String(500) | Exact string from product label |
| `count` | Integer | Times this name has been seen across all products |
| `last_seen_at` | DateTime | Updated on each occurrence |

On each product scan/fetch, any ingredient name that doesn't match Tier 1 or Tier 2 is upserted into this table (increment count). No auto-creation of `Ingredient` rows — human review stays in the loop.

Makefile target: `make suggest-new-ingredients` — queries top 50 unmatched by count, prints a ranked list for manual review.

---

## Migration

`alembic/versions/009_unmatched_ingredient_log.py`

Adds the `unmatched_ingredient_log` table. No changes to existing tables.

---

## Files Changed / Created

| File | Change |
|---|---|
| `app/core/nutrient_biodomains.py` | NEW — weight matrix + `score_nutrient_biodomains()` helper |
| `app/services/biodomain_scorer.py` | MODIFIED — add Tier-2 scoring path, merge function |
| `app/api/v1/foods.py` | MODIFIED — populate `bio_domains` using nutrient scorer |
| `app/models/unmatched_ingredient_log.py` | NEW — ORM model |
| `alembic/versions/009_unmatched_ingredient_log.py` | NEW — migration |
| `scripts/seed_golden_set_v2.py` | NEW — CSV-based seed script |
| `data/golden_set_ingredients.csv` | NEW — 2,500-row seed data (committed to repo) |
| `app/services/product.py` | MODIFIED — log Tier-3 unmatched ingredients |
| `Makefile` | MODIFIED — add `seed-golden-set`, `suggest-new-ingredients` targets |

---

## What Does NOT Change

- Frontend: zero changes required — `bio_domains` and `ingredients` array shapes are identical
- Research agent: runs unchanged on PENDING ingredients; golden set seeding feeds it new work
- Existing product scoring: Tier-1 path in `biodomain_scorer.py` is untouched
- USDA virtual product pattern: still virtual (not stored in DB), just gains `bio_domains` population

---

## Success Criteria

1. `GET /foods/748967` (egg whole) returns `bio_domains` with ≥ 4 populated domains
2. Tapping "Vitamin B12" on an egg's nutrition panel links to ingredient deep-dive (once Vitamin B12 is in golden set and researched)
3. `make seed-golden-set` runs without errors and creates ~2,500 PENDING ingredients
4. `make suggest-new-ingredients` outputs a ranked list of unmatched ingredient names
5. Packaged food product pages show biodomain bars combining Tier-1 and Tier-2 scores
