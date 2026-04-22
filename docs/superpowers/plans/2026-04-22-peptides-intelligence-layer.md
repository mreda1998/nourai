# Peptides Intelligence Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a premium-gated Peptides section with research-grade evidence dossiers for 20 core peptides, including regulatory status, admin routes, and cycle protocols.

**Architecture:** Extend the existing `ingredients` table with a `peptide` enum value and 7 nullable columns. A new `GET /api/v1/peptides` endpoint serves the browse screen. The ingredient deep-dive screen gains three conditional sections rendered only when `category = 'peptide'`. A new browse screen at `app/(premium)/peptides.tsx` and an entry card in the Atelier screen complete the frontend.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (backend); React Native / Expo Router (frontend); PostgreSQL JSONB for `admin_routes`; existing premium middleware pattern from `app/api/v1/atelier.py`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend-nourai/alembic/versions/013_peptide_fields.py` | Create | Migration: add `peptide` to category enum + 7 columns |
| `backend-nourai/app/models/ingredient.py` | Modify | Add `PEPTIDE` to `IngredientCategory` enum + 7 mapped_column fields |
| `backend-nourai/app/schemas/ingredient.py` | Modify | Add `IngredientDetail` schema with 7 optional peptide fields; add `PeptideListItem` + `PeptidesResponse` |
| `backend-nourai/app/api/v1/peptides.py` | Create | `GET /api/v1/peptides` endpoint with search/filter params |
| `backend-nourai/app/api/v1/router.py` | Modify | Register peptides router |
| `scripts/seed_peptides.py` | Create | Seed 20 curated peptide rows |
| `nourai/services/api.ts` | Modify | Add `PeptideListItem`, `PeptidesResponse` interfaces; add `getPeptides()` method; extend `IngredientDetail` with 7 peptide fields |
| `nourai/app/(premium)/peptides.tsx` | Create | Browse screen: search + filter chips + alphabetical list |
| `nourai/app/ingredient/[id].tsx` | Modify | Add 3 conditional sections: RegulatoryStatus, AdminRoutes, CycleProtocol |
| `nourai/app/(premium)/atelier.tsx` | Modify | Add Peptides entry card to FEATURES array |

---

## Task 1: Alembic Migration — Peptide Fields

**Files:**
- Create: `backend-nourai/alembic/versions/013_peptide_fields.py`

- [ ] **Step 1: Create the migration file**

```python
"""Add peptide category and peptide-specific fields to ingredients.

Revision ID: 013
Revises: 012
Create Date: 2026-04-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 'peptide' to the ingredient_category enum.
    # PostgreSQL requires this outside a transaction for ALTER TYPE ADD VALUE.
    op.execute("ALTER TYPE ingredient_category ADD VALUE IF NOT EXISTS 'peptide'")

    op.add_column("ingredients", sa.Column("us_regulatory_status", sa.String(30), nullable=True))
    op.add_column("ingredients", sa.Column("wada_status", sa.String(30), nullable=True))
    op.add_column("ingredients", sa.Column("admin_routes", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column("ingredients", sa.Column("admin_route_notes", sa.Text(), nullable=True))
    op.add_column("ingredients", sa.Column("cycle_length_weeks", sa.Integer(), nullable=True))
    op.add_column("ingredients", sa.Column("washout_weeks", sa.Integer(), nullable=True))
    op.add_column("ingredients", sa.Column("cycling_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ingredients", "cycling_notes")
    op.drop_column("ingredients", "washout_weeks")
    op.drop_column("ingredients", "cycle_length_weeks")
    op.drop_column("ingredients", "admin_route_notes")
    op.drop_column("ingredients", "admin_routes")
    op.drop_column("ingredients", "wada_status")
    op.drop_column("ingredients", "us_regulatory_status")
    # Note: PostgreSQL does not support removing enum values; downgrade leaves 'peptide' in the type.
```

- [ ] **Step 2: Run the migration**

```bash
cd backend-nourai
alembic upgrade head
```

Expected: `Running upgrade 012 -> 013, Add peptide category and peptide-specific fields to ingredients`

- [ ] **Step 3: Verify the columns exist**

```bash
cd backend-nourai
python -c "
import asyncio
from app.db.session import get_async_session
from sqlalchemy import text

async def check():
    async for db in get_async_session():
        result = await db.execute(text(\"SELECT column_name FROM information_schema.columns WHERE table_name='ingredients' AND column_name LIKE '%status%' OR column_name='admin_routes'\"))
        print(result.fetchall())

asyncio.run(check())
"
```

Expected: rows for `us_regulatory_status`, `wada_status`, `admin_routes`

- [ ] **Step 4: Commit**

```bash
git add backend-nourai/alembic/versions/013_peptide_fields.py
git commit -m "feat: migration 013 — peptide category enum value + 7 nullable columns"
```

---

## Task 2: SQLAlchemy Model — IngredientCategory + Ingredient Fields

**Files:**
- Modify: `backend-nourai/app/models/ingredient.py`

- [ ] **Step 1: Add `PEPTIDE` to the enum and 7 mapped_column fields**

In `backend-nourai/app/models/ingredient.py`:

Add `PEPTIDE = "peptide"` to `IngredientCategory` after `ADDITIVE`:

```python
class IngredientCategory(str, Enum):
    """Ingredient category for classification."""

    VITAMIN = "vitamin"
    MINERAL = "mineral"
    AMINO_ACID = "amino_acid"
    HERB = "herb"
    PROBIOTIC = "probiotic"
    ENZYME = "enzyme"
    FATTY_ACID = "fatty_acid"
    ANTIOXIDANT = "antioxidant"
    PRESERVATIVE = "preservative"
    SWEETENER = "sweetener"
    ADDITIVE = "additive"
    PEPTIDE = "peptide"
    OTHER = "other"
```

Add the 7 peptide-specific columns to the `Ingredient` model after the `circadian_notes` field (before `# Research pipeline tracking`):

```python
    # Peptide-specific fields — null for all non-peptide ingredients
    us_regulatory_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    wada_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    admin_routes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    admin_route_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cycle_length_weeks: Mapped[int | None] = mapped_column(nullable=True)
    washout_weeks: Mapped[int | None] = mapped_column(nullable=True)
    cycling_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
```

Add `Integer` to the SQLAlchemy import at the top:

```python
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
```

- [ ] **Step 2: Verify the model imports cleanly**

```bash
cd backend-nourai
python -c "from app.models.ingredient import Ingredient, IngredientCategory; print(IngredientCategory.PEPTIDE)"
```

Expected: `IngredientCategory.PEPTIDE`

- [ ] **Step 3: Commit**

```bash
git add backend-nourai/app/models/ingredient.py
git commit -m "feat: add PEPTIDE enum value and 7 nullable peptide columns to Ingredient model"
```

---

## Task 3: Pydantic Schemas — Peptide Fields + New Response Types

**Files:**
- Modify: `backend-nourai/app/schemas/ingredient.py`

- [ ] **Step 1: Extend `IngredientResponse` and add `PeptideListItem` + `PeptidesResponse`**

Replace `backend-nourai/app/schemas/ingredient.py` with:

```python
"""Ingredient Pydantic schemas."""
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.ingredient import IngredientCategory


class IngredientResponse(BaseModel):
    """Full ingredient response from master database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    canonical_name: str
    category: IngredientCategory
    synonyms: list[str] = []
    description: str | None = None
    mechanism_summary: str | None = None
    typical_dose_range: str | None = None
    recommended_daily: str | None = None
    upper_limit: str | None = None
    side_effects: list[str] = []
    contraindications: list[str] = []
    drug_interactions: list[str] = []
    evidence_level: str | None = None
    # Peptide-specific fields (null for non-peptide ingredients)
    us_regulatory_status: Optional[str] = None
    wada_status: Optional[str] = None
    admin_routes: Optional[list[str]] = None
    admin_route_notes: Optional[str] = None
    cycle_length_weeks: Optional[int] = None
    washout_weeks: Optional[int] = None
    cycling_notes: Optional[str] = None


class IngredientDetailResponse(BaseModel):
    """Ingredient as it appears in a product (simplified)."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    status: str | None = None
    note: str | None = None


class PeptideListItem(BaseModel):
    """Peptide row returned by GET /api/v1/peptides browse endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    canonical_name: str
    mechanism_summary: str | None = None
    evidence_level: str | None = None
    us_regulatory_status: str | None = None
    wada_status: str | None = None


class PeptidesResponse(BaseModel):
    """Paginated peptide browse response."""

    peptides: list[PeptideListItem]
    total: int
```

- [ ] **Step 2: Verify schemas import cleanly**

```bash
cd backend-nourai
python -c "from app.schemas.ingredient import PeptidesResponse, PeptideListItem, IngredientResponse; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend-nourai/app/schemas/ingredient.py
git commit -m "feat: add peptide fields to IngredientResponse; add PeptideListItem + PeptidesResponse schemas"
```

---

## Task 4: Backend API — `GET /api/v1/peptides` Endpoint

**Files:**
- Create: `backend-nourai/app/api/v1/peptides.py`
- Modify: `backend-nourai/app/api/v1/router.py`

- [ ] **Step 1: Create the peptides router**

Create `backend-nourai/app/api/v1/peptides.py`:

```python
"""
Peptides intelligence endpoints.

GET /peptides — browse all peptides (premium-gated)
  ?search=     case-insensitive name match (min 2 chars)
  ?us_status=  filter by us_regulatory_status value
  ?wada_safe=  true → exclude prohibited_in_competition and prohibited_all
"""
from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.ingredient import Ingredient, IngredientCategory
from app.schemas.ingredient import PeptidesResponse

router = APIRouter()

WADA_PROHIBITED = {"prohibited_in_competition", "prohibited_all"}


@router.get("", response_model=PeptidesResponse)
async def list_peptides(
    db: DBSession,
    current_user: CurrentUser,
    search: str | None = Query(default=None, min_length=2),
    us_status: str | None = Query(default=None),
    wada_safe: bool = Query(default=False),
) -> PeptidesResponse:
    """Return all peptides with optional search and filter params."""
    stmt = select(Ingredient).where(Ingredient.category == IngredientCategory.PEPTIDE)

    if search:
        stmt = stmt.where(Ingredient.canonical_name.ilike(f"%{search}%"))

    if us_status:
        stmt = stmt.where(Ingredient.us_regulatory_status == us_status)

    if wada_safe:
        stmt = stmt.where(Ingredient.wada_status.notin_(WADA_PROHIBITED))

    stmt = stmt.order_by(Ingredient.canonical_name)

    result = await db.execute(stmt)
    peptides = result.scalars().all()

    return PeptidesResponse(peptides=list(peptides), total=len(peptides))
```

- [ ] **Step 2: Register the router in `router.py`**

In `backend-nourai/app/api/v1/router.py`, add:

```python
from app.api.v1 import atelier, chat, domains, foods, ingredients, meals, peptides, products, stack, users
```

And add:

```python
api_router.include_router(peptides.router, prefix="/peptides", tags=["peptides"])
```

(Add it after the `atelier` line.)

- [ ] **Step 3: Start dev server and verify the endpoint**

```bash
cd backend-nourai
uvicorn app.main:app --reload
```

In another terminal:

```bash
curl -s "http://localhost:8000/api/v1/peptides" | python -m json.tool
```

Expected: `{"peptides": [], "total": 0}` (empty until seeded)

- [ ] **Step 4: Commit**

```bash
git add backend-nourai/app/api/v1/peptides.py backend-nourai/app/api/v1/router.py
git commit -m "feat: GET /api/v1/peptides browse endpoint with search and filter params"
```

---

## Task 5: Seed Script — 20 Curated Peptides

**Files:**
- Create: `scripts/seed_peptides.py`

- [ ] **Step 1: Create the seed script**

Create `scripts/seed_peptides.py`:

```python
"""Seed 20 curated peptide rows into the ingredients table.

Run from the backend-nourai directory:
    python ../scripts/seed_peptides.py

After seeding, run the research agent:
    python scripts/research_agent.py --category peptide
"""
import asyncio
import sys
from pathlib import Path

# Ensure the backend package is importable
sys.path.insert(0, str(Path(__file__).parent.parent / "backend-nourai"))

from sqlalchemy import select
from app.db.session import get_async_session
from app.models.ingredient import Ingredient, IngredientCategory, ResearchStatus

PEPTIDES = [
    {
        "canonical_name": "BPC-157",
        "description": "Body Protection Compound-157 is a synthetic peptide derived from a protective protein found in gastric juice.",
        "synonyms": ["Body Protection Compound", "BPC157"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "oral"],
        "admin_route_notes": "Subcutaneous injection is the most studied route for systemic effects. Oral administration shows activity in gastrointestinal models but poor systemic bioavailability.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Standard practice is to cycle to avoid receptor desensitisation. Long-term continuous use has not been studied in humans.",
    },
    {
        "canonical_name": "TB-500 (Thymosin Beta-4)",
        "description": "A synthetic fragment of the naturally occurring protein Thymosin Beta-4, involved in actin regulation and tissue repair.",
        "synonyms": ["Thymosin Beta-4", "TB500"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Administered subcutaneously. Intramuscular is used in veterinary contexts.",
        "cycle_length_weeks": 8,
        "washout_weeks": 4,
        "cycling_notes": "Typically cycled 8–12 weeks on, 4 weeks off based on animal and anecdotal data.",
    },
    {
        "canonical_name": "GHK-Cu",
        "description": "Copper peptide complex (glycyl-L-histidyl-L-lysine-Cu²⁺) naturally found in human plasma. Known for skin remodelling and wound healing activity.",
        "synonyms": ["Copper peptide", "GHK-copper", "glycyl-L-histidyl-L-lysine"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "topical"],
        "admin_route_notes": "Topical is the most common route for cosmetic applications. Subcutaneous used in research settings.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "Topical use is generally continuous. No established cycling protocol for injectable use.",
    },
    {
        "canonical_name": "Epitalon",
        "description": "Tetrapeptide (Ala-Glu-Asp-Gly) based on epithalamin, a natural polypeptide produced by the pineal gland. Studied for telomerase activation.",
        "synonyms": ["Epithalon", "Epithalone"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Administered subcutaneously. Intranasal used in some protocols.",
        "cycle_length_weeks": 3,
        "washout_weeks": 24,
        "cycling_notes": "Typically run in short 10-day to 3-week courses, 1–2 times per year, based on Russian research protocols.",
    },
    {
        "canonical_name": "Selank",
        "description": "Synthetic analogue of the immunomodulatory peptide tuftsin. Studied for anxiolytic and nootropic effects.",
        "synonyms": ["TP-7"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["intranasal"],
        "admin_route_notes": "Intranasal is the standard route, providing rapid CNS delivery. Licensed as nasal drops in Russia.",
        "cycle_length_weeks": 4,
        "washout_weeks": 2,
        "cycling_notes": "Used in 2–4 week courses in Russian clinical practice, with breaks to assess response.",
    },
    {
        "canonical_name": "Semax",
        "description": "Synthetic analogue of ACTH(4-7) with neuroprotective and nootropic properties. Used clinically in Russia.",
        "synonyms": [],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["intranasal"],
        "admin_route_notes": "Administered intranasally. Rapid CNS uptake via olfactory pathway.",
        "cycle_length_weeks": 4,
        "washout_weeks": 2,
        "cycling_notes": "Cycled in 2–4 week courses based on Russian clinical data.",
    },
    {
        "canonical_name": "Thymosin Alpha-1",
        "description": "Naturally occurring thymic peptide with immunomodulatory activity. FDA-approved (Zadaxin) in some countries for hepatitis and immune deficiency.",
        "synonyms": ["Tα1", "Thymalfasin", "Zadaxin"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection is the established route used in all clinical trials.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Dosing protocols vary widely by indication. Self-administration protocols typically run 8–12 weeks.",
    },
    {
        "canonical_name": "CJC-1295",
        "description": "Synthetic analogue of growth hormone-releasing hormone (GHRH). Extends GH pulse duration.",
        "synonyms": ["CJC1295", "DAC:GRF"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Often combined with a GHRP.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Standard cycle 8–16 weeks. Longer periods risk pituitary receptor downregulation.",
    },
    {
        "canonical_name": "Ipamorelin",
        "description": "Selective growth hormone secretagogue (GHS). Among the most selective GHRP peptides with minimal cortisol or prolactin elevation.",
        "synonyms": [],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection, typically 2–3× daily due to short half-life (~2h).",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Cycle 8–16 weeks with off periods to maintain receptor sensitivity.",
    },
    {
        "canonical_name": "GHRP-2",
        "description": "Second-generation growth hormone releasing peptide. More potent GH release than GHRP-6 with less ghrelin-mediated hunger.",
        "synonyms": ["Growth Hormone Releasing Peptide-2", "Pralmorelin"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Short half-life requires multiple daily dosing.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Cycle 8–16 weeks.",
    },
    {
        "canonical_name": "GHRP-6",
        "description": "First-generation growth hormone releasing peptide. Potent GH secretagogue; known to significantly stimulate appetite via ghrelin pathways.",
        "synonyms": ["Growth Hormone Releasing Peptide-6"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Administer fasted for maximum GH pulse.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Cycle 8–16 weeks.",
    },
    {
        "canonical_name": "Hexarelin",
        "description": "Potent synthetic growth hormone secretagogue. Most potent GHRP; also has cardioprotective properties independent of GH release.",
        "synonyms": ["Examorelin"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "prohibited_all",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Desensitises faster than other GHRPs, limiting cycle length.",
        "cycle_length_weeks": 4,
        "washout_weeks": 4,
        "cycling_notes": "Shorter cycles (4 weeks) recommended due to rapid receptor desensitisation.",
    },
    {
        "canonical_name": "AOD-9604",
        "description": "C-terminal fragment of human growth hormone (hGH176-191). Studied for fat metabolism without the growth-promoting effects of full hGH.",
        "synonyms": ["Advanced Obesity Drug 9604", "hGH 176-191"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "oral"],
        "admin_route_notes": "Subcutaneous is more studied. Oral form was tested in clinical trials (Metabolicon) with limited efficacy.",
        "cycle_length_weeks": 12,
        "washout_weeks": 4,
        "cycling_notes": "Typical protocol 8–12 weeks. Limited long-term human data.",
    },
    {
        "canonical_name": "PT-141 (Bremelanotide)",
        "description": "Melanocortin receptor agonist approved by the FDA (Vyleesi) for hypoactive sexual desire disorder (HSDD) in premenopausal women.",
        "synonyms": ["Bremelanotide", "Vyleesi", "PT141"],
        "us_regulatory_status": "fda_approved",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "intranasal"],
        "admin_route_notes": "FDA-approved as subcutaneous auto-injector (Vyleesi). Earlier intranasal formulations showed blood pressure concerns and are not approved.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "As-needed dosing per FDA approval. No cycling protocol — use no more than once per 24 hours.",
    },
    {
        "canonical_name": "Melanotan II",
        "description": "Synthetic analogue of alpha-MSH (alpha-melanocyte-stimulating hormone). Studied for tanning, sexual function, and appetite suppression.",
        "synonyms": ["MTII", "MT-2"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection. Intranasal nasal sprays are sold online but are not pharmaceutical grade.",
        "cycle_length_weeks": 8,
        "washout_weeks": 8,
        "cycling_notes": "Cycle to avoid receptor overstimulation and monitor for nausea and mole changes.",
    },
    {
        "canonical_name": "SS-31 (Elamipretide)",
        "description": "Mitochondria-targeting tetrapeptide that binds cardiolipin in the inner mitochondrial membrane. In Phase III trials for mitochondrial myopathy.",
        "synonyms": ["Elamipretide", "MTP-131", "Bendavia"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection used in all clinical trials. No oral bioavailability.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established cycling protocol. Trial data uses continuous daily administration.",
    },
    {
        "canonical_name": "Humanin",
        "description": "Endogenous mitochondria-derived peptide with cytoprotective and anti-apoptotic activity. Levels decline with age.",
        "synonyms": ["HN"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection used in animal and early human studies.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established human cycling protocol.",
    },
    {
        "canonical_name": "MOTS-c",
        "description": "Mitochondria-derived peptide encoded in the mitochondrial 12S rRNA. Regulates metabolic homeostasis and exercise adaptations.",
        "synonyms": ["Mitochondrial Open Reading Frame of the 12S rRNA-c"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous"],
        "admin_route_notes": "Subcutaneous injection in all research studies.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established human cycling protocol. Early-stage research.",
    },
    {
        "canonical_name": "KPV",
        "description": "C-terminal tripeptide fragment of alpha-MSH (Lys-Pro-Val). Anti-inflammatory properties studied in IBD models.",
        "synonyms": ["Lys-Pro-Val"],
        "us_regulatory_status": "research_chemical",
        "wada_status": "not_prohibited",
        "admin_routes": ["oral", "topical"],
        "admin_route_notes": "Oral for gut-targeted delivery; topical for dermatological applications. Resistant to gastric acid — preserves activity orally.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "No established cycling protocol. Mostly preclinical data.",
    },
    {
        "canonical_name": "Semaglutide",
        "description": "GLP-1 receptor agonist approved by the FDA for type 2 diabetes (Ozempic) and chronic weight management (Wegovy).",
        "synonyms": ["Ozempic", "Wegovy", "Rybelsus"],
        "us_regulatory_status": "fda_approved",
        "wada_status": "not_prohibited",
        "admin_routes": ["subcutaneous", "oral"],
        "admin_route_notes": "Weekly subcutaneous injection (Ozempic/Wegovy). Daily oral tablet (Rybelsus) for diabetes only — taken fasted with a small amount of water.",
        "cycle_length_weeks": None,
        "washout_weeks": None,
        "cycling_notes": "Long-term continuous use as prescribed. Discontinuation leads to weight regain within weeks.",
    },
]


async def seed() -> None:
    async for db in get_async_session():
        inserted = 0
        skipped = 0
        for data in PEPTIDES:
            existing = await db.execute(
                select(Ingredient).where(Ingredient.canonical_name == data["canonical_name"])
            )
            if existing.scalar_one_or_none() is not None:
                skipped += 1
                continue

            ingredient = Ingredient(
                category=IngredientCategory.PEPTIDE,
                research_status=ResearchStatus.PENDING,
                synonyms=data.get("synonyms", []),
                side_effects=[],
                contraindications=[],
                drug_interactions=[],
                **{k: v for k, v in data.items() if k != "synonyms"},
            )
            db.add(ingredient)
            inserted += 1

        await db.commit()
        print(f"Seeded {inserted} peptides ({skipped} already existed).")
        break


if __name__ == "__main__":
    asyncio.run(seed())
```

- [ ] **Step 2: Run the seed script**

```bash
cd /path/to/project
python scripts/seed_peptides.py
```

Expected: `Seeded 20 peptides (0 already existed).`

- [ ] **Step 3: Verify peptides are in the database**

```bash
curl -s "http://localhost:8000/api/v1/peptides" | python -m json.tool | grep canonical_name
```

Expected: 20 `canonical_name` entries including `"BPC-157"`, `"Semaglutide"`, etc.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed_peptides.py
git commit -m "feat: seed script for 20 curated peptides with regulatory + admin route + cycle data"
```

---

## Task 6: Frontend API Types — `api.ts` Peptide Additions

**Files:**
- Modify: `nourai/services/api.ts`

- [ ] **Step 1: Add `PeptideListItem` and `PeptidesResponse` interfaces**

After the `IngredientSearchResponse` interface in `nourai/services/api.ts`, add:

```typescript
export interface PeptideListItem {
  id: string;
  canonical_name: string;
  mechanism_summary: string | null;
  evidence_level: string | null;
  us_regulatory_status: string | null;
  wada_status: string | null;
}

export interface PeptidesResponse {
  peptides: PeptideListItem[];
  total: number;
}
```

- [ ] **Step 2: Extend `IngredientDetail` with 7 peptide fields**

In the `IngredientDetail` interface, after `found_in: IngredientFoundInProduct[];` add:

```typescript
  // Peptide-specific fields (null for non-peptide ingredients)
  us_regulatory_status: string | null;
  wada_status: string | null;
  admin_routes: string[] | null;
  admin_route_notes: string | null;
  cycle_length_weeks: number | null;
  washout_weeks: number | null;
  cycling_notes: string | null;
```

- [ ] **Step 3: Add `getPeptides()` method to the `api` object**

In `nourai/services/api.ts`, find the `getIngredient` method and add after it:

```typescript
  /**
   * Browse peptides with optional search and filter params.
   * Premium-gated on the backend.
   */
  async getPeptides(params?: {
    search?: string;
    us_status?: string;
    wada_safe?: boolean;
  }): Promise<PeptidesResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.us_status) query.set('us_status', params.us_status);
    if (params?.wada_safe) query.set('wada_safe', 'true');
    const qs = query.toString();
    return this.fetch<PeptidesResponse>(`/peptides${qs ? `?${qs}` : ''}`);
  },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd nourai
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add nourai/services/api.ts
git commit -m "feat: add PeptideListItem, PeptidesResponse types and getPeptides() method to api.ts"
```

---

## Task 7: Peptides Browse Screen

**Files:**
- Create: `nourai/app/(premium)/peptides.tsx`

- [ ] **Step 1: Create the browse screen**

Create `nourai/app/(premium)/peptides.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { Colors, Fonts, FontSizes, Radius, scale, Spacing } from '@/constants/theme';
import { api, PeptideListItem } from '@/services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'fda_approved' | 'research_chemical' | 'wada_safe';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fda_approved', label: 'FDA Approved' },
  { key: 'research_chemical', label: 'Research Chemical' },
  { key: 'wada_safe', label: 'WADA Safe' },
];

const US_STATUS_LABEL: Record<string, string> = {
  fda_approved: 'FDA Approved',
  compounded: 'Compounded',
  research_chemical: 'Research Chemical',
  unapproved_drug: 'Unapproved Drug',
};

const WADA_PROHIBITED = new Set(['prohibited_in_competition', 'prohibited_all']);

// ─── Badge Components ─────────────────────────────────────────────────────────

function USStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const label = US_STATUS_LABEL[status] ?? status;
  const color =
    status === 'fda_approved'
      ? Colors.accentHill
      : status === 'compounded'
      ? Colors.inkSecondary
      : Colors.accentAlert;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function WADABadge({ status }: { status: string | null }) {
  if (!status) return null;
  const prohibited = WADA_PROHIBITED.has(status);
  const color = prohibited ? Colors.accentAlert : Colors.accentHill;
  const label = prohibited ? 'WADA ✗' : 'WADA ✓';
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Peptide Card ─────────────────────────────────────────────────────────────

function PeptideCard({ item, onPress }: { item: PeptideListItem; onPress: () => void }) {
  const levelLabel =
    item.evidence_level
      ? item.evidence_level.charAt(0).toUpperCase() + item.evidence_level.slice(1)
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{item.canonical_name}</Text>
        {levelLabel && <Text style={styles.cardLevel}>{levelLabel}</Text>}
      </View>
      <View style={styles.badgeRow}>
        <USStatusBadge status={item.us_regulatory_status} />
        <WADABadge status={item.wada_status} />
      </View>
      {item.mechanism_summary && (
        <Text style={styles.cardMechanism} numberOfLines={2}>
          {item.mechanism_summary}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PeptidesScreen() {
  const router = useRouter();

  const [allPeptides, setAllPeptides] = useState<PeptideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getPeptides();
        setAllPeptides(data.peptides);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load peptides.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = allPeptides;

    if (search.trim().length >= 2) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.canonical_name.toLowerCase().includes(q));
    }

    if (activeFilter === 'fda_approved') {
      list = list.filter((p) => p.us_regulatory_status === 'fda_approved');
    } else if (activeFilter === 'research_chemical') {
      list = list.filter((p) => p.us_regulatory_status === 'research_chemical');
    } else if (activeFilter === 'wada_safe') {
      list = list.filter((p) => !WADA_PROHIBITED.has(p.wada_status ?? ''));
    }

    return list;
  }, [allPeptides, search, activeFilter]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <Text style={styles.title}>Peptides</Text>
          <Text style={styles.subtitle}>Research-grade evidence for the gray zone.</Text>
        </Animated.View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search peptides..."
            placeholderTextColor={Colors.inkTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
        >
          {FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              selected={activeFilter === f.key}
              onPress={() => setActiveFilter(f.key)}
            />
          ))}
        </ScrollView>

        {/* Content */}
        {loading ? (
          <ActivityIndicator style={styles.loader} color={Colors.ink} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>No peptides match your search.</Text>
        ) : (
          <View style={styles.list}>
            {filtered.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInUp.delay(i * 30).duration(250)}>
                <PeptideCard
                  item={item}
                  onPress={() => router.push(`/ingredient/${item.id}` as any)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  scroll: {
    paddingHorizontal: scale(24),
    paddingTop: scale(20),
    paddingBottom: scale(48),
  },
  header: {
    marginBottom: scale(20),
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: scale(32),
    color: Colors.ink,
    marginBottom: scale(6),
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  searchContainer: {
    marginBottom: scale(12),
  },
  searchInput: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  filterRow: {
    marginBottom: scale(20),
  },
  filterRowContent: {
    gap: scale(8),
  },
  filterChip: {
    paddingHorizontal: scale(14),
    paddingVertical: scale(7),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.boneCard,
  },
  filterChipSelected: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  filterChipText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    letterSpacing: 0.4,
  },
  filterChipTextSelected: {
    color: Colors.bone,
  },
  list: {
    gap: scale(12),
  },
  card: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.lg,
    padding: scale(16),
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: scale(8),
  },
  cardName: {
    fontFamily: Fonts.serif,
    fontSize: scale(18),
    color: Colors.ink,
    flex: 1,
    marginRight: scale(8),
  },
  cardLevel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: scale(6),
    marginBottom: scale(8),
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  cardMechanism: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.5,
  },
  loader: {
    marginTop: scale(48),
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
    textAlign: 'center',
    marginTop: scale(48),
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
    textAlign: 'center',
    marginTop: scale(48),
  },
});
```

- [ ] **Step 2: Verify the screen compiles**

```bash
cd nourai
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add nourai/app/(premium)/peptides.tsx
git commit -m "feat: Peptides browse screen — search, filter chips, alphabetical list"
```

---

## Task 8: Ingredient Deep-Dive Screen — 3 Peptide Sections

**Files:**
- Modify: `nourai/app/ingredient/[id].tsx`

The spec requires three sections inserted **between the Dosage section and the Evidence Snapshot section**, only when `ingredient.category === 'peptide'` AND relevant fields are non-null.

- [ ] **Step 1: Add peptide-specific helper functions and sub-components**

After the `categoryLabel` helper in `nourai/app/ingredient/[id].tsx` (around line 103), add:

```tsx
// ─── Peptide Helpers ──────────────────────────────────────────────────────────

const US_STATUS_LABEL: Record<string, string> = {
  fda_approved: 'FDA Approved',
  compounded: 'Compounded',
  research_chemical: 'Research Chemical',
  unapproved_drug: 'Unapproved Drug',
};

const US_STATUS_DESCRIPTION: Record<string, string> = {
  fda_approved: 'FDA-approved drug for human use.',
  compounded: 'Available via compounding pharmacy with a prescription.',
  research_chemical: 'Not approved for human use in the US. Sold legally as a research compound.',
  unapproved_drug: 'Marketed for human use but lacks FDA approval.',
};

const WADA_STATUS_LABEL: Record<string, string> = {
  not_prohibited: 'Not Prohibited',
  prohibited_in_competition: 'Prohibited In-Competition',
  prohibited_all: 'Prohibited At All Times',
  monitored: 'Monitored Programme',
};

const ADMIN_ROUTE_LABEL: Record<string, string> = {
  subcutaneous: 'Subcutaneous Injection',
  intramuscular: 'Intramuscular Injection',
  intravenous: 'Intravenous',
  oral: 'Oral',
  intranasal: 'Intranasal',
  topical: 'Topical',
};

const WADA_PROHIBITED = new Set(['prohibited_in_competition', 'prohibited_all']);

function PeptideRegulatorySection({
  usStatus,
  wadaStatus,
}: {
  usStatus: string | null;
  wadaStatus: string | null;
}) {
  if (!usStatus && !wadaStatus) return null;

  const wadaSafe = wadaStatus ? !WADA_PROHIBITED.has(wadaStatus) : null;
  const wadaColor = wadaSafe === true ? Colors.sage : wadaSafe === false ? Colors.alert : Colors.inkTertiary;

  return (
    <Animated.View entering={FadeInUp.duration(300)} style={styles.peptideSection}>
      <Eyebrow style={{ marginBottom: scale(12) }}>Regulatory Status</Eyebrow>
      <View style={styles.peptideStatusRow}>
        {usStatus && (
          <View style={[styles.peptideStatusCard, { flex: 1 }]}>
            <Text style={styles.peptideStatusFlag}>🇺🇸</Text>
            <Text style={styles.peptideStatusLabel}>
              {US_STATUS_LABEL[usStatus] ?? usStatus}
            </Text>
          </View>
        )}
        {wadaStatus && (
          <View style={[styles.peptideStatusCard, { flex: 1, borderColor: wadaColor }]}>
            <Text style={styles.peptideStatusFlag}>WADA</Text>
            <Text style={[styles.peptideStatusLabel, { color: wadaColor }]}>
              {wadaSafe ? 'Safe ✓' : 'Prohibited ✗'}
            </Text>
          </View>
        )}
      </View>
      {usStatus && US_STATUS_DESCRIPTION[usStatus] && (
        <Text style={styles.peptideNote}>{US_STATUS_DESCRIPTION[usStatus]}</Text>
      )}
      {wadaStatus && (
        <Text style={styles.peptideNote}>{WADA_STATUS_LABEL[wadaStatus] ?? wadaStatus}</Text>
      )}
    </Animated.View>
  );
}

function PeptideAdminRoutesSection({
  routes,
  notes,
}: {
  routes: string[] | null;
  notes: string | null;
}) {
  if (!routes?.length && !notes) return null;

  return (
    <Animated.View entering={FadeInUp.duration(300)} style={styles.peptideSection}>
      <Eyebrow style={{ marginBottom: scale(12) }}>Administration Routes</Eyebrow>
      {(routes ?? []).map((route) => (
        <View key={route} style={styles.peptideRouteRow}>
          <Text style={styles.peptideRouteLabel}>
            {ADMIN_ROUTE_LABEL[route] ?? route}
          </Text>
        </View>
      ))}
      {notes && <Text style={styles.peptideNote}>{notes}</Text>}
    </Animated.View>
  );
}

function PeptideCycleSection({
  cycleLengthWeeks,
  washoutWeeks,
  cyclingNotes,
}: {
  cycleLengthWeeks: number | null;
  washoutWeeks: number | null;
  cyclingNotes: string | null;
}) {
  if (!cycleLengthWeeks && !cyclingNotes) return null;

  return (
    <Animated.View entering={FadeInUp.duration(300)} style={styles.peptideSection}>
      <Eyebrow style={{ marginBottom: scale(12) }}>Cycle Protocol</Eyebrow>
      {cycleLengthWeeks != null && (
        <View style={styles.peptideCycleRow}>
          <Text style={styles.peptideCycleLabel}>Typical cycle</Text>
          <Text style={styles.peptideCycleValue}>{cycleLengthWeeks} weeks</Text>
        </View>
      )}
      {washoutWeeks != null && (
        <View style={styles.peptideCycleRow}>
          <Text style={styles.peptideCycleLabel}>Washout period</Text>
          <Text style={styles.peptideCycleValue}>{washoutWeeks} weeks</Text>
        </View>
      )}
      {cyclingNotes && <Text style={styles.peptideNote}>{cyclingNotes}</Text>}
    </Animated.View>
  );
}
```

- [ ] **Step 2: Insert the three sections into the main render**

Find the JSX render in `IngredientScreen` (the main export). Locate the `<DosageSection>` and `<EvidenceGrid>` renders and insert the three peptide sections between them:

```tsx
{/* ── Peptide Sections (rendered only when category === 'peptide') ── */}
{ingredient.category === 'peptide' && (
  <>
    <PeptideRegulatorySection
      usStatus={ingredient.us_regulatory_status ?? null}
      wadaStatus={ingredient.wada_status ?? null}
    />
    <PeptideAdminRoutesSection
      routes={ingredient.admin_routes ?? null}
      notes={ingredient.admin_route_notes ?? null}
    />
    <PeptideCycleSection
      cycleLengthWeeks={ingredient.cycle_length_weeks ?? null}
      washoutWeeks={ingredient.washout_weeks ?? null}
      cyclingNotes={ingredient.cycling_notes ?? null}
    />
  </>
)}
```

- [ ] **Step 3: Add peptide styles to the stylesheet**

In the `StyleSheet.create({...})` block at the bottom of `nourai/app/ingredient/[id].tsx`, add:

```tsx
  // ── Peptide sections ──────────────────────────────────────────────────────
  peptideSection: {
    marginVertical: scale(12),
    padding: scale(16),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.lg,
  },
  peptideStatusRow: {
    flexDirection: 'row',
    gap: scale(10),
    marginBottom: scale(10),
  },
  peptideStatusCard: {
    padding: scale(12),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    alignItems: 'center',
    gap: scale(4),
  },
  peptideStatusFlag: {
    fontSize: scale(20),
  },
  peptideStatusLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.ink,
    textAlign: 'center',
  },
  peptideNote: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.55,
    marginTop: scale(8),
  },
  peptideRouteRow: {
    paddingVertical: scale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
  },
  peptideRouteLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  peptideCycleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: scale(8),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
  },
  peptideCycleLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  peptideCycleValue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
```

- [ ] **Step 4: Add `peptide` to the `categoryLabel` helper**

In the `categoryLabel` function, add `peptide` to the map:

```tsx
function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    vitamin:     'Vitamin',
    mineral:     'Mineral',
    amino_acid:  'Amino Acid',
    herb:        'Herb / Botanical',
    probiotic:   'Probiotic',
    enzyme:      'Enzyme',
    fatty_acid:  'Fatty Acid',
    antioxidant: 'Antioxidant',
    preservative:'Preservative',
    sweetener:   'Sweetener',
    additive:    'Additive',
    peptide:     'Peptide',
    other:       'Active Ingredient',
  };
  return map[cat] ?? cat;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd nourai
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add nourai/app/ingredient/[id].tsx
git commit -m "feat: peptide sections in ingredient deep-dive — regulatory, admin routes, cycle protocol"
```

---

## Task 9: Atelier Screen — Peptides Entry Card

**Files:**
- Modify: `nourai/app/(premium)/atelier.tsx`

- [ ] **Step 1: Add Peptides to the FEATURES array**

In `nourai/app/(premium)/atelier.tsx`, add the Peptides entry to the `FEATURES` array:

```tsx
const FEATURES = [
  {
    eyebrow: 'Conversational AI',
    title: 'Ask Elory.',
    description: 'Chat with your stack. Ask about timing, interactions, and evidence.',
    route: '/ask-elory',
  },
  {
    eyebrow: 'Chronobiology',
    title: 'Circadian Protocol.',
    description: 'Your personalised dosing sequence aligned to your biological clock.',
    route: '/circadian',
  },
  {
    eyebrow: 'Interactions',
    title: 'Conflict Map.',
    description: 'Visualise synergies and competitions across your active compounds.',
    route: '/conflict-map',
  },
  {
    eyebrow: 'Cumulative Exposure',
    title: 'Exposure Ledger.',
    description: 'Track synthetic loads across food, supplements, and cosmetics over time.',
    route: '/exposure',
  },
  {
    eyebrow: 'Science Brief',
    title: 'Evidence Pulse.',
    description: 'Weekly digest of new research relevant to your stack.',
    route: '/pulse',
  },
  {
    eyebrow: 'Gray Zone Research',
    title: 'Peptides.',
    description: 'Research dossiers for 20+ peptides — regulatory status, admin routes, and cycle protocols.',
    route: '/peptides',
  },
];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd nourai
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add nourai/app/(premium)/atelier.tsx
git commit -m "feat: add Peptides entry card to Atelier screen"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec requirement | Task |
|-----------------|------|
| `peptide` enum value added | Task 1 (migration) + Task 2 (model) |
| 7 nullable peptide columns | Task 1 (migration) + Task 2 (model) |
| `IngredientResponse` schema extended | Task 3 |
| `GET /api/v1/peptides` with `?search`, `?us_status`, `?wada_safe` | Task 4 |
| Premium gating via `CurrentUser` dep | Task 4 (authenticated endpoint — premium check is a no-op until subscriptions go live, matching existing atelier.py pattern) |
| Seed script with 20 curated peptides | Task 5 |
| All 20 peptides seeded with correct data | Task 5 |
| `PeptideListItem` + `getPeptides()` in api.ts | Task 6 |
| `IngredientDetail` extended with 7 peptide fields | Task 6 |
| Browse screen: search + filters + alphabetical | Task 7 |
| Card taps to `/ingredient/{id}` | Task 7 |
| Badge colours: FDA=green, Research=amber, WADA✓=green, WADA✗=red | Task 7 |
| Deep-dive: Section A — Regulatory Status | Task 8 |
| Deep-dive: Section B — Admin Routes | Task 8 |
| Deep-dive: Section C — Cycle Protocol | Task 8 |
| Sections render only when `category === 'peptide'` | Task 8 |
| Atelier entry card | Task 9 |
| `peptide` label in `categoryLabel` | Task 8 |

### Notes

- Premium check: `GET /api/v1/peptides` requires auth (`CurrentUser` dep) but the actual premium subscription check is commented out in the existing `require_premium` helper in `atelier.py`. This plan follows the same pattern — auth is enforced, premium subscription enforcement is a separate future step.
- Research agent: After seeding, run `python scripts/research_agent.py --category peptide` (or `make research-all`) to populate `common_belief`, `evidence_reality`, and `ingredient_evidence` rows. This is a manual step, not part of this implementation.
- `ALTER TYPE ADD VALUE` in PostgreSQL cannot run inside a transaction. The `upgrade()` function uses `op.execute(...)` which runs outside the implicit transaction — this is correct for Alembic.
