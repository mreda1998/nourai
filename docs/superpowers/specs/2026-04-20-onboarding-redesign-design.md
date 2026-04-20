# Onboarding Redesign — 13-Step Value-First Flow

## Goal

Replace the current 3-step onboarding with a 13-step value-first flow that builds a rich user profile, delivers three ingredient myth-buster moments as engagement rewards, and converts users to signed-in accounts at the end when they are maximally invested.

## Architecture

The onboarding is a single-file wizard (`app/onboarding.tsx`) with a `step` state integer driving which component renders. All profile data collected during onboarding is held in local component state and flushed to the backend in one call at step 13 (sign-up). A new Alembic migration adds three columns to `user_profiles`. No new API routes are needed — the existing `completeOnboarding()` auth-context call is extended to POST the full profile payload.

## Tech Stack

- React Native / Expo Router — existing patterns in `app/onboarding.tsx`
- Supabase auth — existing `signUp()` / `signIn()` in `auth-context.tsx`
- FastAPI + Alembic — one new migration for `age_range`, `biological_sex`, `activity_level`
- Midjourney-generated assets placed in `assets/onboarding/`

---

## Step Structure

### Phase 1 — Brand Promise (Steps 1–2)

**Step 1: Welcome**
- Full-screen layout with hero image (`assets/onboarding/welcome.png`)
- Headline: *"A knowledgeable friend, in your pocket."*
- Subtext: *"Elory reads ingredient lists the way a trained biochemist would — and tells you what actually matters for your body."*
- "What Elory is not" card (existing 3-point list)
- CTA: "Begin →"
- Collects: nothing

**Step 2: The noise problem**
- Dark background with `assets/onboarding/noise.png` behind text
- Headline: *"Most wellness apps sell you certainty."*
- Body: *"Elory sells you evidence. Every insight is sourced from peer-reviewed studies. We show you what the science actually says — not what a brand wants you to believe."*
- CTA: "Continue →"
- Collects: nothing

---

### Phase 2 — Goals + AHA #1 (Steps 3–4)

**Step 3: Your goals**
- Headline: *"What matters to you?"*
- Subtext: *"Select all that apply. Your analysis will be tuned to these domains."*
- Multi-select cards (existing 6 options): Gut health / Sleep / Longevity / Dermal care / Metabolic / Cognitive
- CTA: "Continue · N selected" (disabled at 0)
- Collects: `goals: string[]`

**Step 4: AHA #1 — The dose myth**
- Full-bleed image: `assets/onboarding/vitamin_c.png`
- Eyebrow: "◆ Evidence Brief"
- Headline: *"Most supplements contain 5× the dose your body can absorb."*
- Body: *"Vitamin C absorption drops sharply above 200mg — yet most supplements contain 500–1000mg. The excess is excreted within hours. Dose timing and form matter more than the number on the label."*
- Source line: "Levine et al., NEJM 1996 · Padayatty et al., Annals of Internal Medicine 2004"
- CTA: "Interesting →"
- Collects: nothing

---

### Phase 3 — About You + AHA #2 (Steps 5–8)

**Step 5: Your name**
- Headline: *"What should we call you?"*
- Single `TextInput`, auto-capitalised
- Subtext: *"Used to personalise your experience. Stored only on this device until you create an account."*
- CTA: "Continue" (disabled when empty)
- Collects: `name: string`

**Step 6: Your age range**
- Headline: *"How old are you?"*
- Subtext: *"Age affects absorption rates, hormone context, and recommended dose ranges."*
- 4-pill selector: 18–25 / 26–35 / 36–50 / 51+
- CTA: "Continue"
- Collects: `age_range: '18-25' | '26-35' | '36-50' | '51+'`

**Step 7: Biological sex**
- Headline: *"Biological sex"*
- Subtext: *"Affects hormone-related ingredient flags and certain safety thresholds."*
- 3-option selector: Male / Female / Prefer not to say
- Privacy note: *"Never shared. Used only for ingredient safety context."*
- CTA: "Continue"
- Collects: `biological_sex: 'male' | 'female' | 'not_specified'`

**Step 8: AHA #2 — The timing myth**
- Full-bleed image: `assets/onboarding/fish_oil.png`
- Eyebrow: "◆ Evidence Brief"
- Headline: *"Omega-3 taken without fat shows 300% lower absorption."*
- Body: *"EPA and DHA are fat-soluble. Taken on an empty stomach, bioavailability drops dramatically. The dose on the label assumes you took it with a meal — most people don't."*
- Source line: "Lawson & Hughes, JLRM 1988 · Schuchardt & Hahn, Nutrients 2013"
- CTA: "Got it →"
- Collects: nothing

---

### Phase 4 — Lifestyle (Steps 9–10)

**Step 9: Sleep quality**
- Headline: *"How would you rate your sleep?"*
- Subtext: *"This unlocks your personalised Circadian Protocol — a time-ordered supplement schedule."*
- 4-option selector: Excellent / Good / Fair / Poor (with one-line descriptors)
- CTA: "Continue"
- Collects: `sleep_quality: 'excellent' | 'good' | 'fair' | 'poor'`

**Step 10: Activity level**
- Headline: *"How active are you?"*
- Subtext: *"Affects protein, electrolyte, and recovery-related ingredient context."*
- 5-option selector: Sedentary / Light / Moderate / Active / Athletic (with one-line descriptors)
- CTA: "Continue"
- Collects: `activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'athletic'`

---

### Phase 5 — Health Context + AHA #3 (Steps 11–12)

**Step 11: Health context**
- Headline: *"Anything we should know?"*
- Subtext: *"These flags unlock the highest-sensitivity ingredient filters."*
- Checkbox list (existing 5 options): Pregnant / nursing · Plant-based · Sensitive skin · On prescription meds · None of the above
- Privacy AlertNote (existing component): *"Context flags are stored only on this device. Never shared or used for advertising."*
- CTA: "Continue"
- Collects: `profile_flags: string[]`

**Step 12: AHA #3 — The probiotic myth**
- Full-bleed image: `assets/onboarding/probiotic.png`
- Eyebrow: "◆ Evidence Brief"
- Headline: *"Most probiotics don't survive your stomach acid."*
- Body: *"The CFU count on the label is measured at manufacturing — not at consumption. Without enteric coating, the majority of bacteria are destroyed before reaching the gut. Strain selection and packaging matter far more than the headline number."*
- Source line: "Govinden et al., Beneficial Microbes 2014 · Corcoran et al., Applied Microbiology 2008"
- CTA: "One last step →"
- Collects: nothing

---

### Phase 6 — Convert (Step 13)

**Step 13: Profile summary + auth**
- Headline: *"Your Elory profile."*
- Visual summary card showing: selected goals as pills, sleep quality, activity level, health flags
- Body: *"Save your profile to sync across devices and unlock your full analysis."*
- Primary CTA: "Create Account" → pushes to `app/auth.tsx` with `name` pre-filled
- Secondary CTA: "Continue as Guest" → calls `completeOnboarding()` and navigates to `/(tabs)` without saving profile to server
- Collects: nothing new — flushes all collected state to auth on sign-up

---

## Data Flow

```
Onboarding state (local)
  └─ name, age_range, biological_sex, sleep_quality,
     activity_level, goals, profile_flags

  → Step 13 "Create Account"
      → auth.tsx (name pre-filled)
      → signUp() → Supabase creates user
      → POST /api/v1/users/profile with full payload
      → completeOnboarding() marks onboarding done

  → Step 13 "Continue as Guest"
      → completeOnboarding() locally
      → profile data held in auth-context (in-memory only)
```

## Backend Changes

**Migration 013** — add three nullable columns to `user_profiles`:

```sql
ALTER TABLE user_profiles
  ADD COLUMN age_range     VARCHAR(10),
  ADD COLUMN biological_sex VARCHAR(20),
  ADD COLUMN activity_level VARCHAR(20);
```

**`app/models/user.py`** — add three `mapped_column` fields with `nullable=True`.

**`app/api/v1/users.py`** — extend the profile PATCH/PUT endpoint to accept and persist the three new fields. `sleep_quality` already exists and is already accepted.

**`app/schemas/user.py`** — add the three fields to `UserProfileUpdate` schema.

No new routes required.

---

## Progress Bar

Progress bar shows steps 1–13 as segments. AHA steps (4, 8, 12) still advance the bar — they are part of the journey, not interruptions.

---

## Assets Required (Midjourney)

| Filename | Step | Mood / Prompt direction |
|----------|------|------------------------|
| `welcome.png` | 1 | Person in warm morning light holding a glass of water, soft focus, no medical props, editorial film grain, portrait orientation |
| `noise.png` | 2 | Cluttered supplement shelf, slightly overexposed, cold clinical fluorescent light — intentional contrast to welcome |
| `vitamin_c.png` | 4 | Vitamin C pills spilling from an amber glass bottle, extreme macro, warm honey tones, dark background |
| `fish_oil.png` | 8 | Single fish oil capsule on a weathered wood surface, single side light source, one water droplet, minimal |
| `probiotic.png` | 12 | Abstract petri dish texture, teal and deep green palette, microscope aesthetic, no text, square crop |

All images should be portrait-oriented (3:4 ratio), minimal text, and consistent with the app's bone/cream/ink palette mood.

---

## Out of Scope

- Notification opt-in (can be added post-launch as a step 14)
- "Scan your first product" tutorial step (explicitly excluded)
- Personalized aha moments (static only — dynamic personalization is a future iteration)
- Subscription upsell during onboarding
