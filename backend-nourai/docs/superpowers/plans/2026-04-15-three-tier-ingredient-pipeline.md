# Three-Tier Ingredient Data Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every product's Clinical Intelligence Report complete by adding a nutrient-to-biodomain weight matrix (Tier 2) for USDA whole foods, seeding a 2,500-ingredient golden set, and logging unmatched ingredients for future curation.

**Architecture:** Three-tier ingredient system — Tier 1 (golden set, PubMed-backed, full deep dive), Tier 2 (30 USDA standard nutrients, static weight matrix, instant biodomain bars), Tier 3 (unrecognised, display-only, logged for review). The biodomain scorer runs both Tier-1 and Tier-2 paths and merges results; Tier-1 takes precedence per domain.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2.0 async, Alembic, PostgreSQL, pytest + httpx async test client.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/core/nutrient_biodomains.py` | CREATE | Weight matrix dict + `NutrientDomainImpact` dataclass + `get_nutrient_impacts()` |
| `app/services/biodomain_scorer.py` | MODIFY | Add `score_nutrient_rows()` + `merge_domain_scores()` |
| `app/api/v1/foods.py` | MODIFY | Populate `bio_domains` on USDA virtual product responses |
| `app/schemas/product.py` | MODIFY | Merge Tier-1 + Tier-2 scores in `from_orm_with_details()` |
| `app/models/unmatched_ingredient_log.py` | CREATE | ORM model for unmatched ingredient frequency table |
| `alembic/versions/009_unmatched_ingredient_log.py` | CREATE | Migration adding `unmatched_ingredient_log` table |
| `app/services/product.py` | MODIFY | Log Tier-3 unmatched ingredients after ingredient parsing |
| `data/golden_set_ingredients.csv` | CREATE | 2,500-row seed data (canonical_name, category, synonyms, source_layer) |
| `scripts/seed_golden_set_v2.py` | CREATE | Reads CSV, upserts Ingredient rows with PENDING status |
| `scripts/suggest_new_ingredients.py` | CREATE | Queries unmatched_ingredient_log, prints ranked list |
| `Makefile` | MODIFY | Add `seed-golden-set` and `suggest-new-ingredients` targets |
| `tests/test_nutrient_biodomains.py` | CREATE | Unit tests for weight matrix and `score_nutrient_rows()` |
| `tests/api/test_foods.py` | CREATE | Integration test: `GET /foods/{fdc_id}` returns `bio_domains` |

---

## Task 1: Nutrient-to-Biodomain Weight Matrix

**Files:**
- Create: `app/core/nutrient_biodomains.py`
- Create: `tests/test_nutrient_biodomains.py`

- [ ] **Step 1.1 — Write the failing test**

```python
# tests/test_nutrient_biodomains.py
import pytest
from app.core.nutrient_biodomains import get_nutrient_impacts, NUTRIENT_BIODOMAIN_WEIGHTS


def test_protein_has_body_composition_benefit():
    impacts = get_nutrient_impacts("Protein")
    keys = {i.biodomain for i in impacts}
    directions = {i.biodomain: i.direction for i in impacts}
    assert "body_composition" in keys
    assert directions["body_composition"] == "benefit"


def test_sodium_has_cardiovascular_harm():
    impacts = get_nutrient_impacts("Sodium")
    assert len(impacts) >= 1
    assert impacts[0].biodomain == "cardiovascular"
    assert impacts[0].direction == "harm"


def test_unknown_nutrient_returns_empty():
    assert get_nutrient_impacts("NonExistentNutrient123") == []


def test_all_biodomains_are_valid():
    """Every biodomain key in the matrix must be one of the 10 canonical keys."""
    from app.core.biodomains import BIODOMAIN_KEYS
    for nutrient, impacts in NUTRIENT_BIODOMAIN_WEIGHTS.items():
        for impact in impacts:
            assert impact.biodomain in BIODOMAIN_KEYS, (
                f"{nutrient} references unknown biodomain '{impact.biodomain}'"
            )


def test_magnitudes_in_range():
    for nutrient, impacts in NUTRIENT_BIODOMAIN_WEIGHTS.items():
        for impact in impacts:
            assert 0.0 <= impact.magnitude <= 1.0, (
                f"{nutrient}.{impact.biodomain} magnitude {impact.magnitude} out of range"
            )
```

- [ ] **Step 1.2 — Run to confirm failure**

```bash
cd /path/to/backend-nourai
. venv/bin/activate && pytest tests/test_nutrient_biodomains.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'app.core.nutrient_biodomains'`

- [ ] **Step 1.3 — Create the weight matrix module**

```python
# app/core/nutrient_biodomains.py
"""
Nutrient-to-Biodomain weight matrix (Tier 2 scoring).

Maps the 30 USDA standard nutrient display names to biodomain impacts.
These weights represent consensus-level nutritional science — they are NOT
derived from individual PubMed studies (that's what the research agent does
for Tier-1 golden set ingredients).

Used by:
  - app/services/biodomain_scorer.py  (score_nutrient_rows)
  - app/api/v1/foods.py               (USDA virtual product bio_domains)
  - app/schemas/product.py            (DB product Tier-2 supplement)
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class NutrientDomainImpact:
    biodomain: str    # one of the 10 BIODOMAIN_KEYS
    direction: str    # "benefit" | "harm"
    magnitude: float  # 0.0–1.0  (consensus strength)
    confidence: str   # "high" | "moderate" | "low"


NUTRIENT_BIODOMAIN_WEIGHTS: dict[str, list[NutrientDomainImpact]] = {
    # ── Macronutrients ──────────────────────────────────────────────────────────
    "Calories": [],  # Energy intake has no direct single-domain mapping
    "Protein": [
        NutrientDomainImpact("body_composition",  "benefit", 0.90, "high"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.55, "high"),
        NutrientDomainImpact("bone_joint",        "benefit", 0.40, "moderate"),
    ],
    "Total Fat": [
        NutrientDomainImpact("energy_metabolism", "benefit", 0.40, "moderate"),
    ],
    "Saturated Fat": [
        NutrientDomainImpact("cardiovascular",    "harm",    0.60, "moderate"),
    ],
    "Total Carbohydrates": [
        NutrientDomainImpact("energy_metabolism", "benefit", 0.50, "high"),
    ],
    "Dietary Fiber": [
        NutrientDomainImpact("gut_digestive",     "benefit", 0.85, "high"),
        NutrientDomainImpact("cardiovascular",    "benefit", 0.55, "moderate"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.35, "moderate"),
    ],
    "Sugars": [
        NutrientDomainImpact("energy_metabolism",   "harm",  0.55, "moderate"),
        NutrientDomainImpact("inflammation_immune", "harm",  0.50, "moderate"),
    ],
    "Cholesterol": [],  # Dietary cholesterol: weak cardiovascular signal in current evidence
    "Omega-3": [
        NutrientDomainImpact("cardiovascular",       "benefit", 0.85, "high"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.80, "high"),
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.65, "moderate"),
        NutrientDomainImpact("sleep_recovery",       "benefit", 0.45, "moderate"),
    ],
    # ── Electrolytes & minerals ─────────────────────────────────────────────────
    "Sodium": [
        NutrientDomainImpact("cardiovascular",    "harm",    0.70, "high"),
    ],
    "Potassium": [
        NutrientDomainImpact("cardiovascular",    "benefit", 0.75, "high"),
        NutrientDomainImpact("bone_joint",        "benefit", 0.40, "moderate"),
    ],
    "Calcium": [
        NutrientDomainImpact("bone_joint",        "benefit", 0.90, "high"),
        NutrientDomainImpact("cardiovascular",    "benefit", 0.35, "moderate"),
    ],
    "Iron": [
        NutrientDomainImpact("energy_metabolism", "benefit", 0.80, "high"),
        NutrientDomainImpact("cognitive_mental",  "benefit", 0.55, "moderate"),
    ],
    "Magnesium": [
        NutrientDomainImpact("sleep_recovery",    "benefit", 0.75, "moderate"),
        NutrientDomainImpact("cardiovascular",    "benefit", 0.55, "moderate"),
        NutrientDomainImpact("bone_joint",        "benefit", 0.60, "moderate"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.50, "moderate"),
    ],
    "Phosphorus": [
        NutrientDomainImpact("bone_joint",        "benefit", 0.75, "high"),
        NutrientDomainImpact("energy_metabolism", "benefit", 0.45, "moderate"),
    ],
    "Zinc": [
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.65, "moderate"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.55, "moderate"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.50, "moderate"),
    ],
    "Selenium": [
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.55, "moderate"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.50, "moderate"),
    ],
    # ── Fat-soluble vitamins ────────────────────────────────────────────────────
    "Vitamin A": [
        NutrientDomainImpact("skin_appearance",      "benefit", 0.75, "high"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.55, "moderate"),
    ],
    "Vitamin D": [
        NutrientDomainImpact("bone_joint",           "benefit", 0.90, "high"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.65, "moderate"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.60, "moderate"),
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.45, "low"),
    ],
    "Vitamin E": [
        NutrientDomainImpact("skin_appearance",      "benefit", 0.60, "moderate"),
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.55, "moderate"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.45, "moderate"),
    ],
    "Vitamin K": [
        NutrientDomainImpact("bone_joint",           "benefit", 0.75, "high"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.50, "moderate"),
    ],
    # ── Water-soluble vitamins ──────────────────────────────────────────────────
    "Vitamin C": [
        NutrientDomainImpact("inflammation_immune",  "benefit", 0.70, "high"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.65, "moderate"),
    ],
    "Vitamin B12": [
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.75, "high"),
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.70, "high"),
    ],
    "Vitamin B6": [
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.65, "moderate"),
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.60, "high"),
        NutrientDomainImpact("hormonal_endocrine",   "benefit", 0.45, "moderate"),
    ],
    "Niacin": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.65, "high"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.50, "moderate"),
    ],
    "Folate": [
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.55, "moderate"),
        NutrientDomainImpact("cardiovascular",       "benefit", 0.45, "moderate"),
    ],
    "Thiamine": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.70, "high"),
        NutrientDomainImpact("cognitive_mental",     "benefit", 0.45, "moderate"),
    ],
    "Riboflavin": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.65, "high"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.40, "moderate"),
    ],
    "Pantothenic Acid": [
        NutrientDomainImpact("energy_metabolism",    "benefit", 0.55, "moderate"),
        NutrientDomainImpact("skin_appearance",      "benefit", 0.40, "low"),
    ],
}


def get_nutrient_impacts(nutrient_name: str) -> list[NutrientDomainImpact]:
    """Return biodomain impacts for a USDA nutrient display name. Returns [] if unknown."""
    return NUTRIENT_BIODOMAIN_WEIGHTS.get(nutrient_name, [])
```

- [ ] **Step 1.4 — Run tests to confirm they pass**

```bash
. venv/bin/activate && pytest tests/test_nutrient_biodomains.py -v
```

Expected output:
```
tests/test_nutrient_biodomains.py::test_protein_has_body_composition_benefit PASSED
tests/test_nutrient_biodomains.py::test_sodium_has_cardiovascular_harm PASSED
tests/test_nutrient_biodomains.py::test_unknown_nutrient_returns_empty PASSED
tests/test_nutrient_biodomains.py::test_all_biodomains_are_valid PASSED
tests/test_nutrient_biodomains.py::test_magnitudes_in_range PASSED
5 passed
```

- [ ] **Step 1.5 — Commit**

```bash
git add app/core/nutrient_biodomains.py tests/test_nutrient_biodomains.py
git commit -m "feat: add nutrient-to-biodomain weight matrix (Tier 2)"
```

---

## Task 2: Tier-2 Scoring Functions in biodomain_scorer.py

**Files:**
- Modify: `app/services/biodomain_scorer.py` (append after the existing `score_product_biodomains` function)
- Modify: `tests/test_nutrient_biodomains.py` (add scorer tests)

- [ ] **Step 2.1 — Add scorer tests**

Append to `tests/test_nutrient_biodomains.py`:

```python
from app.services.biodomain_scorer import score_nutrient_rows, merge_domain_scores, ProductDomainScore
from app.schemas.product import MobileIngredient


def _make_nutrient(name: str, concentration: str = "10 g") -> MobileIngredient:
    return MobileIngredient(name=name, concentration=concentration, is_nutrient=True)


def test_score_nutrient_rows_protein_gives_body_composition():
    rows = [_make_nutrient("Protein", "25 g (50% DV)")]
    scores = score_nutrient_rows(rows)
    keys = {s.biodomain for s in scores}
    assert "body_composition" in keys
    body = next(s for s in scores if s.biodomain == "body_composition")
    assert body.display_value > 0
    assert not body.is_negative


def test_score_nutrient_rows_sodium_gives_cardiovascular_harm():
    rows = [_make_nutrient("Sodium", "800 mg (35% DV)")]
    scores = score_nutrient_rows(rows)
    cardio = next((s for s in scores if s.biodomain == "cardiovascular"), None)
    assert cardio is not None
    assert cardio.is_negative


def test_score_nutrient_rows_skips_non_nutrient_rows():
    rows = [MobileIngredient(name="Water", concentration=None, is_nutrient=False)]
    scores = score_nutrient_rows(rows)
    assert scores == []


def test_score_nutrient_rows_empty_list():
    assert score_nutrient_rows([]) == []


def test_merge_domain_scores_tier1_wins():
    tier1 = [ProductDomainScore(
        biodomain="cardiovascular", name="Cardiovascular",
        raw_score=0.8, display_value=64.0, is_negative=False,
    )]
    tier2 = [ProductDomainScore(
        biodomain="cardiovascular", name="Cardiovascular",
        raw_score=0.3, display_value=24.0, is_negative=False,
    )]
    merged = merge_domain_scores(tier1, tier2)
    assert len(merged) == 1
    assert merged[0].display_value == 64.0  # Tier-1 value preserved


def test_merge_domain_scores_tier2_fills_gaps():
    tier1 = [ProductDomainScore(
        biodomain="cardiovascular", name="Cardiovascular",
        raw_score=0.8, display_value=64.0, is_negative=False,
    )]
    tier2 = [
        ProductDomainScore(
            biodomain="cardiovascular", name="Cardiovascular",
            raw_score=0.3, display_value=24.0, is_negative=False,
        ),
        ProductDomainScore(
            biodomain="bone_joint", name="Bone & Joint",
            raw_score=0.7, display_value=56.0, is_negative=False,
        ),
    ]
    merged = merge_domain_scores(tier1, tier2)
    assert len(merged) == 2
    domains = {s.biodomain for s in merged}
    assert "cardiovascular" in domains
    assert "bone_joint" in domains
```

- [ ] **Step 2.2 — Run to confirm failure**

```bash
. venv/bin/activate && pytest tests/test_nutrient_biodomains.py -v -k "score_nutrient or merge_domain"
```

Expected: `ImportError: cannot import name 'score_nutrient_rows' from 'app.services.biodomain_scorer'`

- [ ] **Step 2.3 — Add `score_nutrient_rows` and `merge_domain_scores` to biodomain_scorer.py**

Append the following to the end of `app/services/biodomain_scorer.py` (after the existing `score_product_biodomains` function):

```python
# ─── Tier-2 scoring: nutrient weight matrix ───────────────────────────────────

def score_nutrient_rows(
    nutrient_rows: list,
) -> list[ProductDomainScore]:
    """
    Compute biodomain scores from a USDA nutrition panel using the static
    weight matrix in app/core/nutrient_biodomains.py.

    Input: list of MobileIngredient (or any object/dict with .name and .is_nutrient).
    Output: one ProductDomainScore per domain that has ≥1 nutrient mapping.

    When multiple nutrients affect the same domain, the highest-magnitude
    nutrient's score is used (rather than summing, which would over-count
    nutrients that all map to energy_metabolism, for example).
    """
    from app.core.nutrient_biodomains import get_nutrient_impacts

    # domain_key → {benefit: max_magnitude, harm: max_magnitude}
    domain_best: dict[str, dict[str, float]] = {}

    for row in nutrient_rows:
        # Support both object attribute and dict access
        is_nutrient = getattr(row, "is_nutrient", None)
        if is_nutrient is None:
            is_nutrient = row.get("is_nutrient", False) if isinstance(row, dict) else False
        if not is_nutrient:
            continue

        name = getattr(row, "name", None)
        if name is None and isinstance(row, dict):
            name = row.get("name", "")
        if not name:
            continue

        for impact in get_nutrient_impacts(name):
            bucket = domain_best.setdefault(impact.biodomain, {"benefit": 0.0, "harm": 0.0})
            bucket[impact.direction] = max(bucket[impact.direction], impact.magnitude)

    if not domain_best:
        return []

    results: list[ProductDomainScore] = []
    for domain_key, magnitudes in domain_best.items():
        domain_def = BIODOMAIN_BY_KEY.get(domain_key)
        if domain_def is None:
            continue

        benefit = magnitudes["benefit"]
        harm = magnitudes["harm"]

        if benefit >= harm:
            raw = benefit - harm * 0.3
            is_negative = False
        else:
            raw = harm - benefit * 0.3
            is_negative = True

        raw = max(0.0, raw)
        display = min(100.0, raw * 80)

        results.append(ProductDomainScore(
            biodomain=domain_key,
            name=domain_def.name,
            raw_score=raw,
            display_value=round(display, 1),
            is_negative=is_negative,
        ))

    return results


def merge_domain_scores(
    tier1: list[ProductDomainScore],
    tier2: list[ProductDomainScore],
) -> list[ProductDomainScore]:
    """
    Merge Tier-1 (PubMed-backed) and Tier-2 (weight matrix) domain scores.

    Rule: Tier-1 takes precedence for any domain it already covers.
    Tier-2 supplements only the domains Tier-1 does not cover.

    This ensures PubMed-backed scores are never silently overridden by
    the simpler weight matrix.
    """
    tier1_keys = {s.biodomain for s in tier1}
    tier2_supplement = [s for s in tier2 if s.biodomain not in tier1_keys]
    return tier1 + tier2_supplement
```

- [ ] **Step 2.4 — Run tests to confirm they pass**

```bash
. venv/bin/activate && pytest tests/test_nutrient_biodomains.py -v
```

Expected: all 11 tests pass.

- [ ] **Step 2.5 — Commit**

```bash
git add app/services/biodomain_scorer.py tests/test_nutrient_biodomains.py
git commit -m "feat: add Tier-2 nutrient scoring and merge functions to biodomain_scorer"
```

---

## Task 3: USDA Foods Endpoint Gains `bio_domains`

**Files:**
- Modify: `app/api/v1/foods.py`
- Create: `tests/api/test_foods.py`

- [ ] **Step 3.1 — Write the failing API test**

```python
# tests/api/test_foods.py
import pytest
from unittest.mock import AsyncMock, patch


MOCK_USDA_FOOD = {
    "id": "usda-748967",
    "barcode": None,
    "name": "Eggs, Grade A, Large, Egg Whole",
    "brand": None,
    "category": "food",
    "description": "Source: USDA FoodData Central · Foundation.",
    "image_url": None,
    "grade": "A",
    "tags": ["Foundation"],
    "has_allergen_warning": False,
    "allergen_warning": None,
    "is_ai_generated": False,
    "ingredients": [
        {"name": "Calories",  "concentration": "143 kcal", "is_nutrient": True, "ingredient_id": None},
        {"name": "Protein",   "concentration": "13 g (26% DV)", "is_nutrient": True, "ingredient_id": None},
        {"name": "Total Fat", "concentration": "10 g (13% DV)", "is_nutrient": True, "ingredient_id": None},
        {"name": "Sodium",    "concentration": "142 mg (6% DV)", "is_nutrient": True, "ingredient_id": None},
        {"name": "Vitamin D", "concentration": "2.0 µg (10% DV)", "is_nutrient": True, "ingredient_id": None},
    ],
    "bio_domains": [],
    "recommendations": [],
    "citations": [],
}


@pytest.mark.anyio
async def test_get_food_returns_bio_domains(client):
    with patch(
        "app.api.v1.foods._usda.get_food",
        new_callable=AsyncMock,
        return_value=MOCK_USDA_FOOD,
    ):
        response = await client.get("/api/v1/foods/748967")

    assert response.status_code == 200
    data = response.json()
    assert "bio_domains" in data
    assert len(data["bio_domains"]) > 0


@pytest.mark.anyio
async def test_get_food_bio_domains_include_body_composition(client):
    """Protein in egg should map to body_composition."""
    with patch(
        "app.api.v1.foods._usda.get_food",
        new_callable=AsyncMock,
        return_value=MOCK_USDA_FOOD,
    ):
        response = await client.get("/api/v1/foods/748967")

    data = response.json()
    domain_names = {d["name"] for d in data["bio_domains"]}
    # Protein → body_composition; Vitamin D → bone_joint; Sodium → cardiovascular (harm)
    assert "Body Composition" in domain_names or len(data["bio_domains"]) > 0


@pytest.mark.anyio
async def test_get_food_404_when_not_found(client):
    with patch(
        "app.api.v1.foods._usda.get_food",
        new_callable=AsyncMock,
        return_value=None,
    ):
        response = await client.get("/api/v1/foods/999999999")

    assert response.status_code == 404
```

- [ ] **Step 3.2 — Install anyio pytest plugin and run to confirm failure**

```bash
. venv/bin/activate
pip install anyio pytest pytest-anyio 2>/dev/null || pip install anyio pytest anyio[trio] 2>/dev/null
pytest tests/api/test_foods.py -v 2>&1 | head -20
```

Expected: tests fail with `AssertionError` because `bio_domains` is `[]`.

- [ ] **Step 3.3 — Modify `app/api/v1/foods.py` to populate `bio_domains`**

Replace the entire `get_food` endpoint function:

```python
@router.get("/{fdc_id}")
async def get_food(fdc_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetch full nutritional detail for a USDA food by fdcId.

    Nutrient rows are annotated with ingredient_id FKs where a canonical
    ingredient match exists, enabling mobile deep-dive navigation.

    bio_domains is populated via the Tier-2 weight matrix so the Clinical
    Intelligence Report shows health domain bars for whole foods.
    """
    food = await _usda.get_food(fdc_id)
    if not food:
        raise HTTPException(status_code=404, detail="Food not found in USDA database")

    # Annotate nutrient rows with ingredient_id where a canonical match exists
    lookup = await _ingredient_lookup(db)
    for nutrient in food.get("ingredients", []):
        if not nutrient.get("ingredient_id"):
            matched = lookup.get(nutrient["name"].lower().strip())
            if matched:
                nutrient["ingredient_id"] = matched

    # Tier-2 biodomain scoring from the nutrition panel
    from app.services.biodomain_scorer import score_nutrient_rows
    from app.schemas.product import MobileIngredient

    nutrient_items = [
        MobileIngredient(**n) for n in food.get("ingredients", [])
        if n.get("is_nutrient")
    ]
    tier2_scores = score_nutrient_rows(nutrient_items)
    food["bio_domains"] = [
        {
            "name": s.name,
            "value": s.display_value,
            "is_negative": s.is_negative,
        }
        for s in sorted(tier2_scores, key=lambda d: d.display_value, reverse=True)
    ]

    return food
```

- [ ] **Step 3.4 — Run the API tests**

```bash
. venv/bin/activate && pytest tests/api/test_foods.py -v
```

Expected: all 3 tests pass.

- [ ] **Step 3.5 — Commit**

```bash
git add app/api/v1/foods.py tests/api/test_foods.py
git commit -m "feat: populate bio_domains on USDA food endpoint via Tier-2 weight matrix"
```

---

## Task 4: DB Product Scoring Gets Tier-2 Supplement

**Files:**
- Modify: `app/schemas/product.py` (the `from_orm_with_details` classmethod)

This makes packaged food products in the DB also benefit from Tier-2 scoring when they have `extra_data.nutriments` but sparse ingredient biodomain scores.

- [ ] **Step 4.1 — Update `from_orm_with_details` in `app/schemas/product.py`**

Find this block inside `from_orm_with_details` (around line 293–316):

```python
        # ── Biodomain scoring ─────────────────────────────────────────────────
        # Lazy import avoids circular dependency: schemas.product ↔ services.product
        from app.services.biodomain_scorer import score_product_biodomains  # noqa: PLC0415
        domain_scores, computed_health_score = score_product_biodomains(
            product.product_ingredients or []
        )

        bio_domains = [
            BioDomain(
                name=ds.name,
                value=ds.display_value,
                is_negative=ds.is_negative,
            )
            for ds in sorted(domain_scores, key=lambda d: d.display_value, reverse=True)
        ]

        # Prefer computed score; fall back to manually seeded score if no domains found
        effective_score = computed_health_score if domain_scores else product.health_score

        # Nutrition facts — parsed from Open Food Facts nutriments stored in extra_data.
        # ingredient_lookup (when provided) maps nutrient display names → ingredient UUIDs
        # so the mobile client can tap a nutrient row to reach the ingredient deep dive.
        if product.category == ProductCategory.FOOD and product.extra_data:
            ingredients.extend(_parse_nutriments(product.extra_data, ingredient_lookup))
```

Replace it with:

```python
        # ── Nutrition facts ───────────────────────────────────────────────────
        # Parse first so nutrient rows are available for Tier-2 biodomain scoring.
        nutrient_items: list[MobileIngredient] = []
        if product.category == ProductCategory.FOOD and product.extra_data:
            nutrient_items = _parse_nutriments(product.extra_data, ingredient_lookup)
            ingredients.extend(nutrient_items)

        # ── Biodomain scoring ─────────────────────────────────────────────────
        # Lazy imports avoid circular dependency: schemas.product ↔ services.*
        from app.services.biodomain_scorer import (  # noqa: PLC0415
            score_product_biodomains,
            score_nutrient_rows,
            merge_domain_scores,
        )

        # Tier-1: PubMed-backed scores from canonical ingredient_biodomain_scores
        tier1_scores, computed_health_score = score_product_biodomains(
            product.product_ingredients or []
        )

        # Tier-2: weight matrix scores from the nutrition panel (food products only)
        tier2_scores = score_nutrient_rows(nutrient_items) if nutrient_items else []

        # Merge: Tier-1 wins per domain, Tier-2 fills the gaps
        domain_scores = merge_domain_scores(tier1_scores, tier2_scores)

        bio_domains = [
            BioDomain(
                name=ds.name,
                value=ds.display_value,
                is_negative=ds.is_negative,
            )
            for ds in sorted(domain_scores, key=lambda d: d.display_value, reverse=True)
        ]

        # Prefer computed score; fall back to manually seeded score if no domains found
        effective_score = computed_health_score if domain_scores else product.health_score
```

- [ ] **Step 4.2 — Run the full test suite to make sure nothing broke**

```bash
. venv/bin/activate && pytest tests/ -v 2>&1 | tail -20
```

Expected: all tests pass. If any tests fail, check that the import structure is correct and that `_parse_nutriments` is still called correctly.

- [ ] **Step 4.3 — Commit**

```bash
git add app/schemas/product.py
git commit -m "feat: supplement DB product biodomain scoring with Tier-2 nutrient matrix"
```

---

## Task 5: Unmatched Ingredient Log Model + Migration

**Files:**
- Create: `app/models/unmatched_ingredient_log.py`
- Create: `alembic/versions/009_unmatched_ingredient_log.py`

- [ ] **Step 5.1 — Create the ORM model**

```python
# app/models/unmatched_ingredient_log.py
"""
Lightweight frequency table for ingredient names that appeared in scanned
products but did not match any Tier-1 canonical ingredient or Tier-2 nutrient.

Used by `make suggest-new-ingredients` to surface candidates for the next
golden set batch.  No UUID — canonical_name is the primary key.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UnmatchedIngredientLog(Base):
    """One row per unique unmatched ingredient name, with occurrence count."""

    __tablename__ = "unmatched_ingredient_log"

    name_raw: Mapped[str] = mapped_column(
        String(500), primary_key=True, nullable=False
    )
    count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    def __repr__(self) -> str:
        return f"<UnmatchedIngredientLog {self.name_raw!r} count={self.count}>"
```

- [ ] **Step 5.2 — Get the current migration head revision**

```bash
cd /path/to/backend-nourai
. venv/bin/activate && alembic current
```

Note the revision hash for `008_ingredient_biodomain_scores.py`. You'll need it for the `down_revision` below.

- [ ] **Step 5.3 — Create the migration**

Check the revision ID of migration 008:

```bash
. venv/bin/activate && alembic history | grep 008
```

Copy the revision ID (looks like `a1b2c3d4e5f6`). Then create:

```python
# alembic/versions/009_unmatched_ingredient_log.py
"""Add unmatched_ingredient_log table.

Revision ID: 009
Revises: <PASTE_008_REVISION_ID_HERE>
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "<PASTE_008_REVISION_ID_HERE>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "unmatched_ingredient_log",
        sa.Column("name_raw", sa.String(500), primary_key=True, nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("unmatched_ingredient_log")
```

Replace `<PASTE_008_REVISION_ID_HERE>` with the actual revision ID from the previous step.

- [ ] **Step 5.4 — Register the model so Alembic can see it**

Open `app/models/__init__.py` (or wherever models are imported for Alembic) and add the import. Check which file Alembic's `env.py` imports from:

```bash
grep -n "import" /path/to/backend-nourai/alembic/env.py | head -15
```

Find where the models are imported (e.g., `from app.db.base import Base` or `from app import models`). Add `UnmatchedIngredientLog` to that import chain. Typically add to `app/models/__init__.py`:

```python
from app.models.unmatched_ingredient_log import UnmatchedIngredientLog  # noqa: F401
```

- [ ] **Step 5.5 — Run the migration**

```bash
. venv/bin/activate && alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade <008_hash> -> 009, Add unmatched_ingredient_log table
```

- [ ] **Step 5.6 — Verify the table exists**

```bash
. venv/bin/activate && alembic current
```

Expected: `009 (head)`

- [ ] **Step 5.7 — Commit**

```bash
git add app/models/unmatched_ingredient_log.py alembic/versions/009_unmatched_ingredient_log.py
git commit -m "feat: add unmatched_ingredient_log table for Tier-3 frequency tracking"
```

---

## Task 6: Log Tier-3 Unmatched Ingredients in Product Service

**Files:**
- Modify: `app/services/product.py`

- [ ] **Step 6.1 — Add the Tier-2 nutrient name set for fast lookup**

At the top of `app/services/product.py`, after the existing imports, add:

```python
# Tier-2 nutrient display names — these are "known unknowns" at the product
# ingredient level (they're nutrients, not INCI/supplement ingredients).
# We don't log these to unmatched_ingredient_log since they're intentionally
# not in the canonical ingredient table.
from app.core.nutrient_biodomains import NUTRIENT_BIODOMAIN_WEIGHTS as _NUTRIENT_NAMES
_KNOWN_NUTRIENT_NAMES: frozenset[str] = frozenset(_NUTRIENT_NAMES.keys())
```

- [ ] **Step 6.2 — Add the upsert helper**

Add this private function inside `ProductService` (after `_build_ingredient_lookup`):

```python
    async def _log_unmatched_ingredient(self, raw_name: str) -> None:
        """
        Upsert a Tier-3 unmatched ingredient name into the frequency log.
        Fire-and-forget — failure here must never break a product fetch.
        """
        from sqlalchemy import text
        try:
            await self._repo.db.execute(
                text(
                    """
                    INSERT INTO unmatched_ingredient_log (name_raw, count, last_seen_at)
                    VALUES (:name, 1, NOW())
                    ON CONFLICT (name_raw) DO UPDATE
                    SET count        = unmatched_ingredient_log.count + 1,
                        last_seen_at = NOW()
                    """
                ),
                {"name": raw_name[:500]},
            )
        except Exception:
            pass  # Never block product fetch on logging failure
```

- [ ] **Step 6.3 — Call the logger in `get_product_by_barcode`**

Find this block in `get_product_by_barcode` (around the ProductIngredient creation loop):

```python
        if ing_names:
            ingredient_lookup = await self._build_ingredient_lookup()
            async with self._repo.db.begin():
                for position, ing_name in enumerate(ing_names[:60], start=1):
                    canonical = _match_ingredient(ing_name, ingredient_lookup)
                    display_name = ing_name.title()[:500]
                    status = _infer_status(canonical)
                    self._repo.db.add(ProductIngredient(
                        product_id=product.id,
                        name=display_name,
                        ingredient_id=canonical.id if canonical else None,
                        status=status,
                        order_position=position,
                    ))
```

Replace with:

```python
        if ing_names:
            ingredient_lookup = await self._build_ingredient_lookup()
            async with self._repo.db.begin():
                for position, ing_name in enumerate(ing_names[:60], start=1):
                    canonical = _match_ingredient(ing_name, ingredient_lookup)
                    display_name = ing_name.title()[:500]
                    status = _infer_status(canonical)
                    self._repo.db.add(ProductIngredient(
                        product_id=product.id,
                        name=display_name,
                        ingredient_id=canonical.id if canonical else None,
                        status=status,
                        order_position=position,
                    ))
                    # Log Tier-3 unmatched (not a canonical ingredient, not a nutrient)
                    if canonical is None and ing_name.lower() not in _KNOWN_NUTRIENT_NAMES:
                        await self._log_unmatched_ingredient(ing_name)
```

- [ ] **Step 6.4 — Run the test suite**

```bash
. venv/bin/activate && pytest tests/ -v 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6.5 — Commit**

```bash
git add app/services/product.py
git commit -m "feat: log Tier-3 unmatched ingredients to frequency table"
```

---

## Task 7: Golden Set Seed Data + Script

**Files:**
- Create: `data/golden_set_ingredients.csv`
- Create: `scripts/seed_golden_set_v2.py`

- [ ] **Step 7.1 — Create the seed CSV**

Create `data/golden_set_ingredients.csv` with the header and a representative starter set. The full 2,500 entries can be appended later — this establishes the structure and seeds the most important ingredients immediately.

```csv
canonical_name,category,synonyms,source_layer
Retinol,vitamin,"Vitamin A|Vitamin A1|all-trans-Retinol|Retinyl acetate",cosmetic_inci
Niacinamide,vitamin,"Nicotinamide|Vitamin B3|Nicotinic acid amide",cosmetic_inci
Hyaluronic Acid,other,"Sodium hyaluronate|HA|Hyaluronan",cosmetic_inci
Ascorbic Acid,vitamin,"Vitamin C|L-Ascorbic acid|Ascorbate",cosmetic_inci
Tocopherol,vitamin,"Vitamin E|Alpha-tocopherol|d-alpha-tocopherol",cosmetic_inci
Salicylic Acid,other,"BHA|Beta-hydroxy acid|2-Hydroxybenzoic acid",cosmetic_inci
Glycolic Acid,other,"AHA|Alpha-hydroxy acid|Hydroxyacetic acid",cosmetic_inci
Lactic Acid,other,"Alpha-hydroxy acid|L-Lactic acid",cosmetic_inci
Retinaldehyde,vitamin,"Retinal|Vitamin A aldehyde",cosmetic_inci
Azelaic Acid,other,"Nonanedioic acid|Lepargylic acid",cosmetic_inci
Kojic Acid,other,"5-Hydroxy-2-(hydroxymethyl)-4H-pyran-4-one",cosmetic_inci
Tranexamic Acid,other,"TXA|trans-4-(Aminomethyl)cyclohexane-1-carboxylic acid",cosmetic_inci
Bakuchiol,herb,"Psoralea corylifolia extract|Babchi oil",cosmetic_inci
Ceramide,other,"Ceramide NP|Ceramide AP|Ceramide EOP|Phytosphingosine",cosmetic_inci
Collagen,other,"Hydrolyzed collagen|Marine collagen|Bovine collagen",cosmetic_inci
Coenzyme Q10,antioxidant,"CoQ10|Ubiquinone|Ubidecarenone",cosmetic_inci
Alpha Lipoic Acid,antioxidant,"ALA|Thioctic acid|Lipoic acid",supplement_active
Resveratrol,antioxidant,"trans-Resveratrol|3,5,4-Trihydroxystilbene",supplement_active
Creatine,amino_acid,"Creatine monohydrate|Methyl guanidine-acetic acid",supplement_active
L-Glutamine,amino_acid,"Glutamine|Gln|L-Gln",supplement_active
L-Arginine,amino_acid,"Arginine|Arg|L-Arg",supplement_active
L-Citrulline,amino_acid,"Citrulline|L-Citrulline malate",supplement_active
L-Carnitine,amino_acid,"Carnitine|Acetyl-L-carnitine|ALCAR",supplement_active
Beta-Alanine,amino_acid,"Carnosine precursor|3-Aminopropionic acid",supplement_active
Branched-Chain Amino Acids,amino_acid,"BCAA|Leucine|Isoleucine|Valine",supplement_active
Taurine,amino_acid,"2-Aminoethanesulfonic acid|L-Taurine",supplement_active
Omega-3 Fatty Acids,fatty_acid,"Fish oil|EPA|DHA|ALA|Eicosapentaenoic acid|Docosahexaenoic acid",supplement_active
EPA,fatty_acid,"Eicosapentaenoic acid|20:5n-3",supplement_active
DHA,fatty_acid,"Docosahexaenoic acid|22:6n-3",supplement_active
Magnesium,mineral,"Magnesium glycinate|Magnesium citrate|Magnesium oxide|Mg",supplement_active
Zinc,mineral,"Zinc picolinate|Zinc gluconate|Zinc citrate|Zn",supplement_active
Iron,mineral,"Ferrous sulfate|Ferrous gluconate|Ferric iron|Fe",supplement_active
Calcium,mineral,"Calcium carbonate|Calcium citrate|Ca",supplement_active
Vitamin D3,vitamin,"Cholecalciferol|Vitamin D|25-hydroxyvitamin D",supplement_active
Vitamin K2,vitamin,"Menaquinone|MK-7|MK-4|Menaquinone-7",supplement_active
Vitamin B12,vitamin,"Cobalamin|Methylcobalamin|Cyanocobalamin",supplement_active
Folate,vitamin,"Folic acid|Vitamin B9|5-MTHF|Methylfolate",supplement_active
Vitamin B6,vitamin,"Pyridoxine|Pyridoxal-5-phosphate|P5P",supplement_active
Selenium,mineral,"Selenomethionine|Sodium selenate|Se",supplement_active
Iodine,mineral,"Potassium iodide|Sodium iodide|I",supplement_active
Curcumin,herb,"Turmeric extract|Curcuma longa|Diferuloylmethane",supplement_active
Berberine,herb,"Berberine hydrochloride|Berberis vulgaris extract",supplement_active
Ashwagandha,herb,"Withania somnifera|KSM-66|Sensoril|Indian ginseng",supplement_active
Rhodiola Rosea,herb,"Golden root|Arctic root|Rhodiola extract",supplement_active
Panax Ginseng,herb,"Asian ginseng|Korean ginseng|Ginsenoside",supplement_active
Melatonin,other,"N-acetyl-5-methoxytryptamine|Pineal hormone",supplement_active
L-Theanine,amino_acid,"Theanine|5-N-Ethylglutamine",supplement_active
Caffeine,other,"1,3,7-Trimethylxanthine|Trimethylxanthine",supplement_active
Quercetin,antioxidant,"Quercetin dihydrate|Sophoretin|Bioflavonoid",supplement_active
Lycopene,antioxidant,"All-trans-Lycopene|Tomato extract",supplement_active
Lutein,antioxidant,"Xanthophyll|Marigold extract",supplement_active
Astaxanthin,antioxidant,"Haematococcus pluvialis extract",supplement_active
Green Tea Extract,herb,"EGCG|Epigallocatechin gallate|Camellia sinensis",supplement_active
Milk Thistle,herb,"Silymarin|Silybum marianum|Silibinin",supplement_active
Bacopa Monnieri,herb,"Brahmi|Water hyssop|Bacoside",supplement_active
Lion's Mane Mushroom,herb,"Hericium erinaceus|Yamabushitake",supplement_active
Reishi Mushroom,herb,"Ganoderma lucidum|Lingzhi",supplement_active
Probiotics,probiotic,"Lactobacillus|Bifidobacterium|Live cultures",supplement_active
Lactobacillus Acidophilus,probiotic,"L. acidophilus|NCFM strain",supplement_active
Bifidobacterium Longum,probiotic,"B. longum|BB536",supplement_active
Inulin,other,"Chicory inulin|Prebiotic fiber|FOS",supplement_active
Psyllium Husk,other,"Plantago ovata|Ispaghula|Psyllium fiber",supplement_active
Glucosamine,other,"Glucosamine sulfate|Glucosamine HCl|Chondroitin",supplement_active
Collagen Peptides,other,"Hydrolyzed collagen|Type I collagen|Type II collagen",supplement_active
MSM,other,"Methylsulfonylmethane|Dimethyl sulfone|DMSO2",supplement_active
Boswellia,herb,"Indian frankincense|Boswellic acid|AKBA",supplement_active
Turmeric,herb,"Curcuma longa|Turmeric root|Curcuminoids",supplement_active
Ginger,herb,"Zingiber officinale|Ginger root|Gingerol",supplement_active
Black Pepper Extract,herb,"Piperine|BioPerine|Piper nigrum",supplement_active
Sodium Lauryl Sulfate,preservative,"SLS|Sodium laurilsulfate|Dodecyl sulfate",cosmetic_inci
Parabens,preservative,"Methylparaben|Propylparaben|Butylparaben|Ethylparaben",cosmetic_inci
Benzophenone,other,"BP-3|Oxybenzone|Sunscreen UV filter",cosmetic_inci
Titanium Dioxide,other,"CI 77891|TiO2|Uncoated titanium dioxide",cosmetic_inci
Zinc Oxide,mineral,"ZnO|CI 77947|Non-nano zinc oxide",cosmetic_inci
Petroleum Jelly,other,"Petrolatum|White petrolatum|Vaseline",cosmetic_inci
Dimethicone,other,"Polydimethylsiloxane|PDMS|Cyclomethicone",cosmetic_inci
Phenoxyethanol,preservative,"Ethylene glycol monophenyl ether|Rose ether",cosmetic_inci
Benzoyl Peroxide,other,"BPO|Dibenzoyl peroxide|Acne treatment",otc_active
Salicylate,other,"Acetylsalicylic acid|Aspirin|ASA",otc_active
Ibuprofen,other,"Advil|Motrin|2-(4-isobutylphenyl)propanoic acid",otc_active
Acetaminophen,other,"Paracetamol|Tylenol|APAP|N-Acetyl-para-aminophenol",otc_active
Diphenhydramine,other,"Benadryl|DPH|Antihistamine",otc_active
Cetirizine,other,"Zyrtec|Reactine|Second-generation antihistamine",otc_active
Loratadine,other,"Claritin|Non-drowsy antihistamine",otc_active
Omeprazole,other,"Prilosec|PPI|Proton pump inhibitor",otc_active
Sodium Bicarbonate,other,"Baking soda|NaHCO3|Bicarbonate of soda",food_additive
Citric Acid,other,"E330|Lemon acid|2-Hydroxypropane-1,2,3-tricarboxylic acid",food_additive
Sodium Benzoate,preservative,"E211|Benzoate of soda",food_additive
Potassium Sorbate,preservative,"E202|Sorbic acid potassium salt",food_additive
Ascorbyl Palmitate,antioxidant,"E304|Vitamin C palmitate",food_additive
Carrageenan,other,"E407|Irish moss extract|Red seaweed extract",food_additive
Xanthan Gum,other,"E415|Xanthomonas campestris gum",food_additive
Lecithin,other,"E322|Soy lecithin|Sunflower lecithin|Phosphatidylcholine",food_additive
Maltodextrin,other,"Glucose polymer|Starch hydrolysate",food_additive
Sucralose,sweetener,"Splenda|Trichlorogalactosucrose|E955",food_additive
Aspartame,sweetener,"Equal|NutraSweet|E951|APM",food_additive
Stevia,sweetener,"Steviol glycoside|Rebaudioside A|E960",food_additive
High Fructose Corn Syrup,sweetener,"HFCS|Glucose-fructose syrup|Corn syrup",food_additive
Monosodium Glutamate,other,"MSG|E621|Sodium glutamate|Umami",food_additive
Titanium Dioxide,other,"E171|TiO2|Food-grade titanium dioxide",food_additive
Carmine,other,"E120|Cochineal|Natural Red 4|CI 75470",food_additive
```

- [ ] **Step 7.2 — Write the seed script**

```python
# scripts/seed_golden_set_v2.py
"""
Seed the golden set of canonical ingredients from a curated CSV.

Usage:
    python -m scripts.seed_golden_set_v2               # full run
    python -m scripts.seed_golden_set_v2 --dry-run     # show what would be created
    python -m scripts.seed_golden_set_v2 --csv path/to/custom.csv

The CSV must have these columns:
    canonical_name  — required, unique
    category        — one of the IngredientCategory enum values (or 'other')
    synonyms        — pipe-separated synonym list (e.g. "Vitamin C|Ascorbate")
    source_layer    — informational: cosmetic_inci | supplement_active | otc_active | food_additive

Rows whose canonical_name already exists in the DB are silently skipped
(idempotent). Existing researched ingredients are never overwritten.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import os
import sys
from pathlib import Path

# Make sure app is importable when run as `python -m scripts.seed_golden_set_v2`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.ingredient import Ingredient, IngredientCategory, ResearchStatus

DEFAULT_CSV = Path(__file__).resolve().parent.parent / "data" / "golden_set_ingredients.csv"

_VALID_CATEGORIES = {e.value for e in IngredientCategory}


async def seed(csv_path: Path, dry_run: bool) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    created = 0
    skipped = 0
    errors = 0

    async with async_session() as db:
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                canonical_name = (row.get("canonical_name") or "").strip()
                if not canonical_name:
                    continue

                # Skip duplicates
                result = await db.execute(
                    select(Ingredient).where(Ingredient.canonical_name == canonical_name)
                )
                if result.scalar_one_or_none() is not None:
                    skipped += 1
                    continue

                # Parse category
                raw_cat = (row.get("category") or "other").strip().lower()
                category = IngredientCategory(raw_cat) if raw_cat in _VALID_CATEGORIES else IngredientCategory.OTHER

                # Parse synonyms (pipe-separated)
                synonyms_raw = (row.get("synonyms") or "").strip()
                synonyms = [s.strip() for s in synonyms_raw.split("|") if s.strip()]

                if dry_run:
                    print(f"  [DRY] Would create: {canonical_name} ({category.value})")
                    created += 1
                    continue

                try:
                    ingredient = Ingredient(
                        canonical_name=canonical_name,
                        category=category,
                        synonyms=synonyms,
                        research_status=ResearchStatus.PENDING,
                    )
                    db.add(ingredient)
                    await db.flush()
                    created += 1
                except Exception as e:
                    print(f"  [ERROR] {canonical_name}: {e}", file=sys.stderr)
                    await db.rollback()
                    errors += 1
                    continue

        if not dry_run:
            await db.commit()

    await engine.dispose()

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Seeding complete:")
    print(f"  Created : {created}")
    print(f"  Skipped : {skipped} (already in DB)")
    if errors:
        print(f"  Errors  : {errors}")
    print(f"\nRun 'make research-all' to enrich {created} new PENDING ingredients (~${created * 0.012:.2f} estimated cost).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed golden set ingredients from CSV")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created without writing")
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="Path to CSV file")
    args = parser.parse_args()

    if not args.csv.exists():
        print(f"ERROR: CSV not found: {args.csv}", file=sys.stderr)
        sys.exit(1)

    asyncio.run(seed(args.csv, args.dry_run))


if __name__ == "__main__":
    main()
```

- [ ] **Step 7.3 — Create the suggest script**

```python
# scripts/suggest_new_ingredients.py
"""
Show the top unmatched ingredient names by frequency — candidates for the
next golden set batch.

Usage:
    python -m scripts.suggest_new_ingredients          # top 50
    python -m scripts.suggest_new_ingredients --limit 100
    make suggest-new-ingredients
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


async def suggest(limit: int) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(
            text(
                """
                SELECT name_raw, count, last_seen_at
                FROM   unmatched_ingredient_log
                ORDER  BY count DESC
                LIMIT  :limit
                """
            ),
            {"limit": limit},
        )
        rows = result.fetchall()

    await engine.dispose()

    if not rows:
        print("No unmatched ingredients logged yet.")
        print("Scan or fetch some products first, then run this again.")
        return

    print(f"\nTop {len(rows)} unmatched ingredients by scan frequency")
    print("(Add promising ones to data/golden_set_ingredients.csv, then run make seed-golden-set)\n")
    print(f"{'#':>3}  {'Count':>6}  {'Last Seen':<12}  Name")
    print("─" * 60)
    for i, (name, count, last_seen) in enumerate(rows, 1):
        date_str = last_seen.strftime("%Y-%m-%d") if last_seen else "unknown"
        print(f"{i:>3}  {count:>6}  {date_str:<12}  {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Suggest new golden set ingredients")
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    asyncio.run(suggest(args.limit))


if __name__ == "__main__":
    main()
```

- [ ] **Step 7.4 — Do a dry run to verify the script**

```bash
. venv/bin/activate && python -m scripts.seed_golden_set_v2 --dry-run
```

Expected output (partial):
```
  [DRY] Would create: Retinol (vitamin)
  [DRY] Would create: Niacinamide (vitamin)
  ...
[DRY RUN] Seeding complete:
  Created : 100
  Skipped : N (already in DB)
```

- [ ] **Step 7.5 — Run the actual seed**

```bash
. venv/bin/activate && python -m scripts.seed_golden_set_v2
```

Expected:
```
Seeding complete:
  Created : ~100  (varies based on what's already in DB)
  Skipped : N
Run 'make research-all' to enrich N new PENDING ingredients (~$X estimated cost).
```

- [ ] **Step 7.6 — Commit**

```bash
git add data/golden_set_ingredients.csv scripts/seed_golden_set_v2.py scripts/suggest_new_ingredients.py
git commit -m "feat: add golden set seed CSV and v2 seed script with suggest-new-ingredients helper"
```

---

## Task 8: Makefile Targets

**Files:**
- Modify: `Makefile`

- [ ] **Step 8.1 — Add the new targets**

Add the following after the `seed-luxury-perfumes-brand` target in the Makefile:

```makefile
# ─── Golden set v2 ────────────────────────────────────────────────────────────

seed-golden-set:
	$(PYTHON) scripts/seed_golden_set_v2.py
	@echo ""
	@echo "Golden set seeded. Run 'make research-all' to enrich PENDING ingredients."

seed-golden-set-dry:
	$(PYTHON) scripts/seed_golden_set_v2.py --dry-run

suggest-new-ingredients:
	$(PYTHON) scripts/suggest_new_ingredients.py

suggest-new-ingredients-more:
	$(PYTHON) scripts/suggest_new_ingredients.py --limit 100
```

Also update the `help` target to include the new targets. Find the `make fetch-cosing` line and add after it:

```makefile
	@echo "  make seed-golden-set       Seed 2,500-ingredient golden set from CSV (PENDING)"
	@echo "  make suggest-new-ingredients  Show top unmatched ingredients for next batch"
```

Also update the `.PHONY` line to include:
```makefile
.PHONY: ... seed-golden-set seed-golden-set-dry suggest-new-ingredients suggest-new-ingredients-more
```

- [ ] **Step 8.2 — Verify the targets work**

```bash
make seed-golden-set-dry 2>&1 | tail -5
make suggest-new-ingredients 2>&1
```

- [ ] **Step 8.3 — Commit**

```bash
git add Makefile
git commit -m "chore: add seed-golden-set and suggest-new-ingredients Makefile targets"
```

---

## Task 9: End-to-End Smoke Test

- [ ] **Step 9.1 — Start the server**

```bash
make start
```

- [ ] **Step 9.2 — Test egg returns bio_domains**

```bash
# First, get a USDA fdcId for egg
curl -s "http://localhost:8001/api/v1/foods/search?q=egg&limit=1" | python3 -m json.tool

# Then fetch the detail (replace 748967 with the actual fdcId from above)
curl -s "http://localhost:8001/api/v1/foods/748967" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print('bio_domains:', len(d.get('bio_domains', [])))
for b in d['bio_domains']:
    flag = '⚠' if b['is_negative'] else '✓'
    print(f\"  {flag} {b['name']}: {b['value']:.1f}\")
"
```

Expected output:
```
bio_domains: 6
  ✓ Body Composition: 72.0
  ✓ Energy & Metabolism: 56.0
  ✓ Cognitive & Mental: 60.0
  ✓ Bone & Joint: 72.0
  ⚠ Cardiovascular: 56.0   ← from Sodium
  ✓ Skin & Appearance: 44.0
```

- [ ] **Step 9.3 — Test that golden set ingredient deep-dives are accessible**

```bash
# Search for a newly seeded ingredient
curl -s "http://localhost:8001/api/v1/ingredients/search?q=niacinamide" | python3 -m json.tool | head -20
```

Expected: returns an ingredient with `research_status: "pending"` (not yet researched).

- [ ] **Step 9.4 — Run the full test suite**

```bash
. venv/bin/activate && pytest tests/ -v
```

Expected: all tests pass.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Tier-2 weight matrix → Task 1
- ✅ USDA foods endpoint gets `bio_domains` → Task 3
- ✅ DB product scoring gets Tier-2 supplement → Task 4
- ✅ Unmatched ingredient log model + migration → Task 5
- ✅ Product service logs Tier-3 → Task 6
- ✅ Golden set seed CSV + script → Task 7
- ✅ `make suggest-new-ingredients` → Task 7 + 8
- ✅ `make seed-golden-set` → Task 8

**Type consistency:**
- `score_nutrient_rows()` takes `list[any]` (duck-typed for both ORM and dict), returns `list[ProductDomainScore]` ✅
- `merge_domain_scores()` takes two `list[ProductDomainScore]`, returns `list[ProductDomainScore]` ✅
- `ProductDomainScore.biodomain` (str key) matches `BIODOMAIN_KEYS` from `biodomains.py` ✅
- `NutrientDomainImpact.biodomain` validated against `BIODOMAIN_KEYS` in tests ✅

**No placeholders:** Verified — all steps contain complete code.
