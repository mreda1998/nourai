# Elory New-Design Rework

Status: approved by user, pending implementation plan.
Source mockups: `new_designs/home_stack_history.png`, `new_designs/product_search.png`, `new_designs/research_evidence.png`, `new_designs/premium_features.png`, `new_designs/journal_health_domains_settings.png`.

## Goal

Rework the Elory (repo dir: `nourai`) frontend to match the new mockup set: new navigation, new visual language (forest-green accent, serif display headlines, ring/pill/dot components), and restyled screens for everything the mockups cover. Auth, onboarding, and the subscription paywall screen are explicitly **out of scope** — keep the current implementation even though the mockup batch includes alternate versions of them.

## Resolved ambiguities

The mockups were internally inconsistent across batches (different tab bars, two Home concepts, two conflicting "Journal" meanings, a mislabeled Sleep Quality screen). These were resolved with the user:

1. **Final tab bar: Home / Scan / Stack / Explore / Profile.** ("Journal" as a 4th tab, and "Journal absorbs Stack" were both earlier ideas that got superseded once the `journal_health_domains_settings.png` batch arrived showing Stack as its own persistent tab.)
2. **Home has two states**: a "Good morning" greeting + Daily Longevity Score ring for returning users with an active stack, and an "Understand. Don't guess." hero + search + recently-scanned for new/empty-stack users.
3. **Stack tab absorbs**: the routine/as-needed supplement list (today's Stack screen, restyled), a History sub-view (Scans/Searches log), and a Premium hub section linking to the 6 Atelier features. No separate "Journal" or "History" tab exists in the final nav.
4. **Explore tab absorbs**: Products/Ingredients search (today's Search tab) and the Journal/editorial newsletter section (Latest/Longevity/Nutrition/Supplements/Mind).
5. **Belief vs. reality** (current ingredient deep-dive's core framing) is folded into the new Evidence Spectrum / "What's established / emerging / uncertain" structure rather than kept as a separate section or dropped.
6. **Domain pages, Health profile screens, Settings** keep their current entry points (`profile-hub.tsx` for Settings/Health; Stack and Ask Elory for Domain pages) — restyled visually but not moved in the IA, since nothing in the codebase links to them except those two places.
7. **Newsletter** currently has no live entry point in the app (dead route). The new Home's "FROM THE ELORY JOURNAL" card plus the Explore tab's Journal section give it one for the first time.
8. **Assumption, flagged for user correction if wrong**: the second "Sleep Quality" screen in `journal_health_domains_settings.png` (metrics: Diversity, Digestive Comfort, Inflammation, Barrier Integrity) is a mislabeled **Gut Health** screen — those are gut-biome metrics, not sleep metrics. Building it as Gut Health.
9. **No dedicated Gut Health mockup exists** as its own screen (only referenced as a Domain-page card) — build it from the same template as the other five health screens (`ScoreRing` + `FactorBar` "Top factors" + Recommendations), backed by the existing `gut_digestive` biodomain.

## Architecture

### Design tokens (`nourai/constants/theme.ts`)

- Add a forest-green accent role (rings, primary CTAs, active tab icon) alongside the existing bone/cream palette — do not replace the palette, extend it.
- Add the serif display sizes used for hero headlines (e.g. "Understand. Don't guess.", "Good morning, Salung") distinct from the existing Cormorant Garamond title sizes already in use.

### Shared components (`nourai/components/elory/`)

Each is a self-contained, presentational unit — no screen-specific logic inside them:

- **`ScoreRing`** — circular SVG progress ring, big number, label, optional qualitative tag ("High"/"Good"/"Moderate"). Props: `score: number`, `label: string`, `qualifier?: string`, `size?: number`.
- **`EvidenceDots`** — 5-dot strength indicator with a text label (Strong/Moderate/Preliminary/Limited). Props: `strength: 'strong'|'moderate'|'preliminary'|'limited'`.
- **`FilterPills`** — horizontal scrollable pill/tab row with single active selection. Props: `options: {label, value, count?}[]`, `value`, `onChange`.
- **`ScoreListRow`** — list row: leading thumbnail/icon, title, subtitle, trailing score chip (number + qualifier + dot-bar). Props: `image?, title, subtitle, score, qualifier`.
- **`FactorBar`** — labeled horizontal progress bar with a "x/100" trailing value. Props: `label, value` (0–100).

Each component: what it does, how it's used (props above), what it depends on (theme tokens only, no data fetching) — should be understandable and testable in isolation.

### Backend changes

1. **`GET /users/me/daily-score`** (new, `app/api/v1/users.py`)
   Aggregates the user's current-day stack into 5 display categories (Nutrition Quality, Inflammation Balance, Metabolic Support, Hormonal & Stress, Gut & Microbiome) by reusing `app/services/biodomain_scorer.py` and mapping the underlying 10 biodomain keys down to 5:
   - Nutrition Quality ← `energy_metabolism` + `body_composition` (new mapping, no existing 1:1 biodomain)
   - Inflammation Balance ← `inflammation_immune`
   - Metabolic Support ← `energy_metabolism` (shared weight with Nutrition Quality is acceptable — same underlying signal viewed two ways, consistent with how the mockup treats them as related-but-distinct)
   - Hormonal & Stress ← `hormonal_endocrine` + `sleep_recovery`
   - Gut & Microbiome ← `gut_digestive`
   Returns overall score (weighted average, same formula shape as existing `score_product_biodomains`) + the 5 sub-scores.

2. **`SearchHistoryEntry` model + endpoints** (new, `app/models/user.py` + `app/api/v1/users.py`)
   Mirrors the existing `ScanHistoryEntry` shape: `id, user_id, query, result_type, created_at`. New migration. `POST /users/me/search-history` logs a search; `GET /users/me/search-history` powers the Stack tab's History/Searches sub-view and Explore's "Recent searches".

Everything else (Circadian, Conflict Map, Evidence Pulse, Exposure Ledger, Peptides, ingredient evidence with `study_type`/`direction`, biodomain scores) already exists and is reused as-is.

### Frontend routing changes

- `nourai/app/(tabs)/_layout.tsx`: tab set becomes Home / Scan / Stack / Explore / Profile. Remove the Atelier tab icon/route; `(premium)` screens become reachable via links from the Stack tab's Premium section instead of a tab.
- `app/(tabs)/search.tsx` → repurposed into the new Explore screen (search + Journal editorial section).
- `app/(tabs)/history.tsx` → folded into `app/(tabs)/stack.tsx` as a sub-view/tab within the Stack screen; the standalone History route can be removed once Stack absorbs it.
- `app/newsletter/[id].tsx` → kept, gains real entry points (Home card, Explore Journal section).
- `app/domain/[name].tsx`, `app/health/*.tsx` → kept at current routes, restyled, entry points unchanged (`stack.tsx`/`ask-elory.tsx` → domain; `profile-hub.tsx` → health + settings).
- `app/auth.tsx`, `app/onboarding.tsx`, `app/settings/subscription.tsx` → **no changes**.

## Testing

- Shared components: snapshot/unit tests confirming they render correctly across the score/strength/qualifier value ranges they'll actually receive (e.g. `ScoreRing` at 0, 50, 100; `EvidenceDots` for each strength enum value).
- New backend endpoints: standard FastAPI test pattern already used in the repo (check `backend-nourai/tests/` for the existing style) — daily-score aggregation correctness against a seeded stack, search-history CRUD.
- Manual pass per the `run` skill after each phase in the sequencing plan below, screenshotting each restyled screen against its source mockup.

## Sequencing

1. Design tokens + shared components (no screens touched)
2. Backend: `daily-score` endpoint + `SearchHistoryEntry` model/endpoints
3. Nav shell (5-tab bar) + Home (both states)
4. Scan, Product detail, Ingredient deep-dive, Research evidence
5. Stack (+ History sub-view, + Premium hub links)
6. Explore (search + Journal editorial)
7. Domain pages + 6 Health profile screens (Skin, Sleep, Hormonal, Hair, Fitness, Gut)
8. 6 Premium Atelier screens restyle (Ask Elory, Circadian, Conflict Map, Exposure Ledger, Evidence Pulse, Peptides)
9. Auth/onboarding/settings/subscription: explicitly untouched
