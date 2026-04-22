# Peptides Intelligence Layer — Design Spec

## Goal

Add a dedicated, premium-gated Peptides section to Elory that gives biohackers and longevity-focused users research-grade evidence dossiers for 20+ core peptides — including regulatory status (US + WADA), administration route guidance, and cycle protocol data. This is Sub-project 1 of a three-part peptides roadmap.

## Architecture

Peptides are added as a new `category` value (`peptide`) in the existing `ingredients` table. Seven nullable columns are added to `ingredients` for peptide-specific structured data. No new tables are needed — the existing `ingredient_evidence`, `ingredient_interactions`, `ingredient_biodomain_score`, and `user_stack_entries` tables all work without change. The existing research agent pipeline populates `common_belief`, `evidence_reality`, and `ingredient_evidence` rows for all 20 peptides. A new `GET /api/v1/peptides` endpoint serves the browse screen. The ingredient deep-dive screen gains three conditional sections that render only when `category = 'peptide'`.

## Tech Stack

- **Backend:** FastAPI + SQLAlchemy + Alembic — existing patterns
- **Frontend:** React Native / Expo Router — new screen at `app/(premium)/peptides.tsx`, extensions to `app/ingredient/[id].tsx`
- **Auth gating:** Existing premium middleware (same as `/atelier/*` routes)
- **Data seeding:** New `scripts/seed_peptides.py` with hand-curated regulatory + admin route + cycle data

---

## Data Model

### Migration

One Alembic migration (`013_peptide_fields.py`):

```sql
-- Add peptide to category enum
ALTER TYPE ingredient_category ADD VALUE 'peptide';

-- Add 7 nullable peptide-specific columns
ALTER TABLE ingredients
  ADD COLUMN us_regulatory_status  VARCHAR(30),
  ADD COLUMN wada_status           VARCHAR(30),
  ADD COLUMN admin_routes          JSONB,
  ADD COLUMN admin_route_notes     TEXT,
  ADD COLUMN cycle_length_weeks    INTEGER,
  ADD COLUMN washout_weeks         INTEGER,
  ADD COLUMN cycling_notes         TEXT;
```

### Column Values

**`us_regulatory_status`**
| Value | Meaning |
|-------|---------|
| `fda_approved` | FDA-approved drug (e.g. Semaglutide, Tirzepatide) |
| `compounded` | Available via compounding pharmacy with prescription |
| `research_chemical` | Not approved for human use; sold for research only |
| `unapproved_drug` | Marketed for human use but lacks FDA approval |

**`wada_status`**
| Value | Meaning |
|-------|---------|
| `not_prohibited` | Not on WADA prohibited list |
| `prohibited_in_competition` | Banned during competition only |
| `prohibited_all` | Banned in and out of competition |
| `monitored` | On WADA monitoring program, not yet prohibited |

**`admin_routes`** — JSONB array of strings
Allowed values: `subcutaneous`, `intramuscular`, `intravenous`, `oral`, `intranasal`, `topical`

### SQLAlchemy Model Changes

`backend-nourai/app/models/ingredient.py` — add seven `mapped_column` fields, all `nullable=True`.

### Pydantic Schema Changes

`backend-nourai/app/schemas/ingredient.py` — add the seven fields to `IngredientDetail` with `Optional[...]` typing. The existing `GET /ingredients/{id}` endpoint returns them automatically.

---

## Seed Data

**Script:** `scripts/seed_peptides.py`

Inserts 20 peptide rows into `ingredients`. Regulatory, admin route, and cycle data is hand-curated from published literature, FDA records, and the WADA 2024 prohibited list. The `common_belief`, `evidence_reality`, and `ingredient_evidence` rows are **not** seeded — they are populated by running `research_agent.py` after seeding.

### Initial 20 Peptides

| Peptide | US Status | WADA Status | Primary Route |
|---------|-----------|-------------|---------------|
| BPC-157 | research_chemical | not_prohibited | subcutaneous, oral |
| TB-500 (Thymosin Beta-4) | research_chemical | prohibited_all | subcutaneous |
| GHK-Cu | research_chemical | not_prohibited | subcutaneous, topical |
| Epitalon | research_chemical | not_prohibited | subcutaneous |
| Selank | research_chemical | not_prohibited | intranasal |
| Semax | research_chemical | not_prohibited | intranasal |
| Thymosin Alpha-1 | research_chemical | not_prohibited | subcutaneous |
| CJC-1295 | research_chemical | prohibited_all | subcutaneous |
| Ipamorelin | research_chemical | prohibited_all | subcutaneous |
| GHRP-2 | research_chemical | prohibited_all | subcutaneous |
| GHRP-6 | research_chemical | prohibited_all | subcutaneous |
| Hexarelin | research_chemical | prohibited_all | subcutaneous |
| AOD-9604 | research_chemical | not_prohibited | subcutaneous, oral |
| PT-141 (Bremelanotide) | fda_approved | not_prohibited | subcutaneous, intranasal |
| Melanotan II | research_chemical | not_prohibited | subcutaneous |
| SS-31 (Elamipretide) | research_chemical | not_prohibited | subcutaneous |
| Humanin | research_chemical | not_prohibited | subcutaneous |
| MOTS-c | research_chemical | not_prohibited | subcutaneous |
| KPV | research_chemical | not_prohibited | oral, topical |
| Semaglutide | fda_approved | not_prohibited | subcutaneous, oral |

After seeding, run:
```bash
make research-all  # or: python scripts/research_agent.py --category peptide
```

---

## Backend API

### New Endpoint: `GET /api/v1/peptides`

**Auth:** Premium required (401 if unauthenticated, 403 if not premium)

**Query params:**
- `?search=` — case-insensitive name match (min 2 chars)
- `?us_status=` — filter by `us_regulatory_status` value
- `?wada_safe=true` — exclude `prohibited_in_competition` and `prohibited_all`; `not_prohibited` and `monitored` are included

**Response:**
```json
{
  "peptides": [
    {
      "id": "uuid",
      "canonical_name": "BPC-157",
      "mechanism_summary": "...",
      "evidence_level": "limited",
      "us_regulatory_status": "research_chemical",
      "wada_status": "not_prohibited"
    }
  ],
  "total": 20
}
```

**Implementation:** `backend-nourai/app/api/v1/peptides.py` — new router registered in `main.py`. Query: `SELECT ... FROM ingredients WHERE category = 'peptide'` with optional filters.

---

## Frontend

### 1. Atelier Tab Entry Point

**File:** `nourai/app/(tabs)/atelier.tsx` (or wherever the Atelier tab renders its feature cards)

Add a `PeptidesCard` component — matches the visual style of existing Atelier feature cards:
- Serif title: "Peptides"
- Subtext: "Research dossiers for the gray zone"
- On press: `router.push('/(premium)/peptides')`

### 2. Peptides Browse Screen

**File:** `nourai/app/(premium)/peptides.tsx` (new)

```
┌─────────────────────────────────┐
│  Peptides                       │  ← serif 32px
│  Research-grade evidence for    │
│  the gray zone.                 │  ← sans secondary
├─────────────────────────────────┤
│  🔍 Search peptides...          │  ← TextInput
├─────────────────────────────────┤
│  [All] [FDA Approved]           │
│  [Research Chemical] [WADA Safe]│  ← filter chips
├─────────────────────────────────┤
│  AOD-9604                       │
│  [Research Chemical] [WADA ✓]   │
│  Promotes fat metabolism...     │  •• limited
├─────────────────────────────────┤
│  BPC-157                        │
│  [Research Chemical] [WADA ✓]   │
│  Accelerates tissue healing...  │  •• limited
└─────────────────────────────────┘
```

**Behaviour:**
- On mount: fetches `GET /api/v1/peptides` once, stores full list in local state
- Search and filter chips operate client-side on the loaded list (no re-fetch)
- Alphabetical sort by `canonical_name`
- Each card taps to `router.push('/ingredient/${id}')`

**Badge colours** (matching existing design system):
- `FDA Approved` — green (`Colors.accentHill`)
- `Research Chemical` — amber (`Colors.accentAlert`)
- `Compounded` — blue-neutral (`Colors.inkSecondary`)
- `WADA ✓ (Not Prohibited)` — green, small
- `WADA ✗ (Prohibited)` — red (`Colors.accentAlert`)

### 3. Ingredient Deep-Dive Screen Extensions

**File:** `nourai/app/ingredient/[id].tsx` (modify)

Three new sections inserted between the existing **Dosage** section and the **Evidence Snapshot** section. Each section only renders when `ingredient.category === 'peptide'` AND the relevant fields are non-null.

**Section A — Regulatory Status**
```
┌─────────────────────────────────┐
│  REGULATORY STATUS              │  ← overline
│  ┌──────────────┐ ┌──────────┐  │
│  │ 🇺🇸 Research  │ │ WADA    │  │
│  │ Chemical     │ │ Safe ✓   │  │
│  └──────────────┘ └──────────┘  │
│  Not approved for human use in  │
│  the US. Sold legally as a      │
│  research compound.             │
└─────────────────────────────────┘
```

**Section B — Administration Routes**
```
┌─────────────────────────────────┐
│  ADMINISTRATION ROUTES          │
│  Subcutaneous injection         │
│  Well-studied. Preferred route  │
│  for systemic effect.           │
│                                 │
│  Oral                           │
│  Poor bioavailability due to    │
│  gastric degradation. Limited   │
│  evidence in humans.            │
└─────────────────────────────────┘
```
Routes rendered from `admin_routes` JSONB array. Notes from `admin_route_notes`.

**Section C — Cycle Protocol**
```
┌─────────────────────────────────┐
│  CYCLE PROTOCOL                 │
│  Typical cycle    12 weeks      │
│  Washout period   4 weeks       │
│                                 │
│  Long-term continuous use has   │
│  not been studied. Standard     │
│  practice is to cycle...        │
└─────────────────────────────────┘
```
Renders only if `cycle_length_weeks` or `cycling_notes` is non-null.

---

## Out of Scope

- Injection Protocol Tracker (Sub-project 2)
- Source Verification / COA parsing (Sub-project 3)
- Practitioner Export (Sub-project 3)
- Evidence Pulse / push notifications for peptide research updates
- WADA regional breakdown (US-only for v1)
- Personalized peptide recommendations based on user profile
- Dynamic evidence updates (research agent re-runs are manual via Makefile)
