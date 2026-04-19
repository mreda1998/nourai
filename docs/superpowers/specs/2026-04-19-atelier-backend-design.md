# Atelier Backend — Implementation Spec

**Date:** 2026-04-19  
**Status:** Approved  
**Scope:** Backend + frontend wiring for 3 of the 5 Atelier premium screens. Exposure Ledger deferred (Coming Soon). No subscription gating during development.

---

## Goal

Wire the Ask Elory, Circadian Protocol, Conflict Map, and Evidence Pulse screens to real backend data. Replace all hardcoded mock data with API-driven content. Extend the research agent pipeline to generate ingredient timing and interaction data automatically.

## Architecture

FastAPI + SQLAlchemy async + PostgreSQL (Supabase). All new endpoints live under `/api/v1/atelier/` with a shared `require_premium` dependency (currently a no-op, activated when subscriptions go live). Three new DB migrations. Research agent gets two new Sonnet output fields. Frontend swaps mock arrays for API calls via `services/api.ts`.

---

## Milestones

### Milestone 1 — Ask Elory (chat persistence)

**What changes:** The existing `POST /api/v1/chat/message` endpoint is stateless. We persist each turn to a new `chat_messages` table and expose history + clear endpoints.

#### Migration 010 — `chat_messages`

```sql
chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)

CREATE INDEX ix_chat_messages_user_created ON chat_messages (user_id, created_at);
```

#### New endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/chat/history` | Required | Paginated message history (`limit`, `offset`). Returns `{messages: [...], total: int}` |
| POST | `/api/v1/chat/message` | Optional | Existing endpoint — now also writes user + assistant turns to `chat_messages` |
| DELETE | `/api/v1/chat/history` | Required | Hard-delete all messages for user (fresh start) |

**Message response shape:**
```json
{
  "id": "uuid",
  "role": "user" | "assistant",
  "content": "string",
  "created_at": "ISO8601"
}
```

**POST /message behaviour change:** After receiving Claude's reply, write both turns atomically. If the write fails, the API still returns the reply — persistence is best-effort and never blocks the user.

#### Frontend changes (`app/(premium)/ask-elory.tsx`)

- On mount: `GET /chat/history?limit=50` → populate message list
- On send: `POST /chat/message` → append both turns to local state (no re-fetch)
- Add "New conversation" press → `DELETE /chat/history` → clear local state
- Add `useChat` hook in `services/api.ts` managing the rolling message array

---

### Milestone 2 — Circadian Protocol + Conflict Map

Both features require ingredient metadata that doesn't exist yet. The research agent generates it in one extended pipeline run.

#### Research Agent Extension

File: `scripts/research_agent.py` — extend the existing Step 4 (Claude Sonnet summary) to output two additional fields alongside `common_belief` / `evidence_reality`.

**New Sonnet output fields:**

```python
# Timing
optimal_times: list[dict]   # [{"window": "morning|afternoon|evening|night",
                             #   "reason": str, "with_food": bool}]
avoid_near_sleep: bool
circadian_notes: str         # free text for nuanced timing

# Interactions (with other ingredients in the knowledge base)
interactions: list[dict]    # [{"partner_name": str,
                             #   "type": "synergy|compete|caution",
                             #   "mechanism": str,
                             #   "confidence": "high|moderate|low"}]
```

After the Sonnet call, the agent:
1. Writes `optimal_times`, `avoid_near_sleep`, `circadian_notes` to the `ingredients` row
2. For each interaction: looks up `partner_name` in `ingredients`; if found, upserts into `ingredient_interactions` with the lower UUID always in `ingredient_id_a` (canonical ordering prevents duplicate pairs)

**New Makefile target:**
```bash
make research-atelier
# Runs agent with --atelier flag
# Processes all ingredients with research_status = 'complete'
# Works from existing ingredient_evidence rows — no new PubMed fetch
# Idempotent: safe to re-run
```

#### Migration 011 — Ingredient timing fields (on existing `ingredients` table)

```sql
ALTER TABLE ingredients
  ADD COLUMN optimal_times      JSONB,
  ADD COLUMN avoid_near_sleep   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN circadian_notes    TEXT;
```

#### Migration 012 — `ingredient_interactions`

```sql
ingredient_interactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id_a   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  ingredient_id_b   UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  interaction_type  VARCHAR(20) NOT NULL CHECK (interaction_type IN ('synergy', 'compete', 'caution')),
  mechanism         TEXT NOT NULL,
  confidence        VARCHAR(10) NOT NULL CHECK (confidence IN ('high', 'moderate', 'low')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_interaction_pair UNIQUE (ingredient_id_a, ingredient_id_b)
)

CREATE INDEX ix_interactions_a ON ingredient_interactions (ingredient_id_a);
CREATE INDEX ix_interactions_b ON ingredient_interactions (ingredient_id_b);
```

#### New endpoints

**Circadian Protocol**

```
GET /api/v1/atelier/circadian
Auth: Required
```

1. Fetch user's current stack (`user_stack_entries` for today)
2. Join `product_ingredients → ingredients`
3. Build time-ordered schedule from `ingredient.optimal_times`
4. Derive chronotype label from `user_profile.sleep_quality`

Response:
```json
{
  "chronotype": "moderate_morning",
  "wake_time": "06:15",
  "schedule": [
    {
      "time": "06:30",
      "ingredient_name": "Vitamin D3 + K2",
      "product_name": "AG1",
      "note": "With first fats of the day",
      "with_food": true,
      "synergy": false,
      "evidence_dots": 4
    }
  ]
}
```

Ingredients without `optimal_times` are omitted from the schedule. If the schedule is empty, return `{"schedule": [], "empty_reason": "timing_data_pending"}` — the frontend shows a "Being researched" state.

**Conflict Map**

```
GET /api/v1/atelier/conflict-map
Auth: Required
```

1. Collect all `ingredient_id`s from user's current stack
2. Query `ingredient_interactions` where both `ingredient_id_a` AND `ingredient_id_b` are in that set (both directions)
3. Build nodes + edges + human-readable notes

Response:
```json
{
  "nodes": [
    { "id": "uuid", "label": "Magnesium", "tone": "accent" }
  ],
  "edges": [
    {
      "ingredient_a_id": "uuid",
      "ingredient_b_id": "uuid",
      "type": "synergy",
      "mechanism": "Both activate GABAergic pathways.",
      "confidence": "high"
    }
  ],
  "notes": [
    {
      "type": "synergy",
      "pair": "Magnesium + L-theanine",
      "note": "Both activate GABAergic pathways. Taken together: deeper slow-wave sleep."
    }
  ]
}
```

`tone` per node: ingredients in a synergy → `accent` (sage), in a competition → `sand`, flagged caution → `alert`, default → `sand`.

#### Frontend changes

**`app/(premium)/circadian.tsx`:** On mount call `GET /atelier/circadian`. If `schedule` is empty and `empty_reason === "timing_data_pending"`, show italic serif "Timing data is being researched — check back soon." state.

**`app/(premium)/conflict-map.tsx`:** On mount call `GET /atelier/conflict-map`. Node x/y positions are frontend-only layout — assign them deterministically from the node array index (no positions stored in DB). If `edges` is empty, show "No interactions found between your current stack ingredients." state.

---

### Milestone 3 — Evidence Pulse

Uses existing `ingredient_evidence` data — no new migrations.

#### New endpoint

```
GET /api/v1/atelier/evidence-pulse?limit=10
Auth: Required
```

1. Get user's current stack ingredient IDs
2. Query `ingredient_evidence` where `ingredient_id` IN that set
3. Order by `year DESC`, `confidence DESC`
4. Map `direction` → `tone`: benefit → `sage`, risk → `alert`, neutral/mixed → `ink`
5. Map `confidence` + `study_type` → `dots` (1–4) using existing study tier weight matrix

Response:
```json
{
  "articles": [
    {
      "ingredient": "Creatine monohydrate",
      "tone": "sage",
      "dots": 4,
      "headline": "New meta-analysis: cognitive benefits in sleep-deprived adults.",
      "excerpt": "34 studies, n=2,847...",
      "journal": "Nutrients · Oct 2026"
    }
  ]
}
```

**Phase 2 (later):** A background job (`scripts/refresh_evidence.py`) runs weekly, re-queries PubMed for new studies on all researched ingredients, runs abstracts through Haiku, appends new `ingredient_evidence` rows. The endpoint above automatically picks them up — no endpoint change needed.

#### Frontend changes (`app/(premium)/pulse.tsx`)

On mount: `GET /atelier/evidence-pulse?limit=10` → replace `ARTICLES` array. If empty (stack has no researched ingredients), show "Scan products to build your stack and unlock your evidence feed." state.

---

### Exposure Ledger — Deferred

`app/(premium)/exposure.tsx` shows a "Coming Soon" screen. No backend work. Will be designed separately once the ingredient contaminant taxonomy is defined.

---

## Shared Infrastructure

### `/api/v1/atelier/` router

New file: `backend-nourai/app/routers/atelier.py`

```python
router = APIRouter(prefix="/api/v1/atelier", tags=["atelier"])

# require_premium dependency — currently a no-op, activated when subscriptions go live
async def require_premium(current_user = Depends(get_current_user)):
    # TODO: check current_user.subscription.is_premium
    return current_user
```

All 3 atelier endpoints (`/circadian`, `/conflict-map`, `/evidence-pulse`) use this dependency. One line change to enforce gating later.

### API client (`nourai/services/api.ts`)

New methods:
```typescript
getChatHistory(token, limit, offset): Promise<ChatHistoryResponse>
deleteChatHistory(token): Promise<void>
getCircadian(token): Promise<CircadianResponse>
getConflictMap(token): Promise<ConflictMapResponse>
getEvidencePulse(token, limit): Promise<EvidencePulseResponse>
```

---

## What is NOT in scope

- Subscription enforcement (require_premium is a no-op until billing is wired)
- Push notifications for Evidence Pulse updates
- User-configurable wake/sleep times (chronotype derived from existing `sleep_quality` field only)
- Exposure Ledger backend (Coming Soon screen only)
- Multi-conversation chat (single rolling thread only)
