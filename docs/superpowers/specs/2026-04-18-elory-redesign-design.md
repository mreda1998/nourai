# Elory Redesign — Design Spec

_Date: 2026-04-18_

## Overview

Full visual redesign of the NourAI app to the "Elory" design system. New brand palette, typography, and layout language applied across all screens. Five new premium screens added as dark-register shells with lock overlays.

Source of truth: exported Elory design bundle (chat transcript + HTML prototypes in `elory/` archive).

---

## 1. Design System

### File: `nourai/constants/theme.ts`

Replace all existing tokens with the Elory token set.

**Palette (teal — canonical):**

| Token | Value | Usage |
|-------|-------|-------|
| `surface` | `#F1EDE4` | App background |
| `surfaceAlt` | `#E8E3D7` | Slightly deeper bone for layering |
| `surfaceCard` | `#FAF7F0` | Card backgrounds |
| `ink` | `#0F2928` | Primary text, near-black teal |
| `inkSecondary` | `rgba(15,41,40,0.62)` | Secondary text |
| `inkTertiary` | `rgba(15,41,40,0.38)` | Placeholder / muted |
| `border` | `rgba(15,41,40,0.12)` | Default hairline |
| `borderStrong` | `rgba(15,41,40,0.85)` | Section heads |
| `accent` | `#1A5C5A` | CTA, scan button, hero card bg |
| `accentInk` | `#F1EDE4` | Text on accent bg |
| `sand` | `#E8D5B0` | Secondary accent, avatar bg |
| `sage` | `#7BAE8E` | Positive / synergy indicators |
| `alert` | `#C4654A` | Terracotta — left-border flags only, never fill |
| `darkSurface` | `#0F3E3D` | Premium screen bg |
| `darkInk` | `#F1EDE4` | Text on dark bg |

**Typography:**

- Serif: `Cormorant Garamond` — display titles, hero copy, product names, ingredient names
- Sans: `DM Sans` — all UI labels, eyebrows, body text, buttons
- Load via `expo-font` / Google Fonts in `_layout.tsx`
- Eyebrow style: 10px DM Sans, uppercase, 0.14em letter-spacing, weight 600
- Serif title: Cormorant Garamond, weight 400, tight line-height 1.05

**Radii:**

| Token | Value | Usage |
|-------|-------|-------|
| `radiusCard` | 20 | Cards, list items |
| `radiusChip` | 999 | Pills, tags, buttons |
| `radiusSheet` | 28 | Bottom sheets |
| `radiusArch` | 120 | Top-only rounded arch thumbnails (top: 120, bottom: 6) |

---

## 2. Navigation

### File: `nourai/app/(tabs)/_layout.tsx`

Replace current 4-tab nav with 5-tab Elory nav:

| Position | Tab | Route | Icon |
|----------|-----|--------|------|
| 1 | Home | `(tabs)/index` | House |
| 2 | Stack | `(tabs)/stack` | Layers |
| 3 | Scan *(center)* | `(tabs)/scan` | Barcode scanner — 56px teal circle, shadow, floats -24px up |
| 4 | Chat | `(tabs)/chat` → `premium/chat` | Chat bubble |
| 5 | Profile | `(tabs)/profile` | Person circle |

Bottom nav style: gradient fade from surface, 5-column grid, 28px bottom padding for home indicator. Active tab uses `ink` color; inactive uses `inkTertiary`. Center scan button: `accent` bg, `accentInk` icon, `boxShadow: 0 8px 24px rgba(15,41,40,0.28)`.

Current Search tab: removed from bottom nav. `app/(tabs)/search.tsx` keeps its route but is no longer a tab — accessible via a search bar row at the top of the Home screen that navigates to `/search`.

---

## 3. Core Screens

### 3.1 Onboarding — `app/onboarding.tsx`

3-step flow with progress bar (3 hairline segments).

**Step 1 — Welcome:**
- Serif hero: *"A knowledgeable friend, in your pocket."*
- Italic serif subtext
- Card: "What Elory is not" — 3 italic dashes (no scores, no alarmism, no diagnosis)
- CTA: full-width pill button "Begin"

**Step 2 — Focus (goals):**
- 6 goal option cards (gut, sleep, longevity, dermal, metabolic, cognitive)
- Selected state: ink background, bone text
- CTA: "Continue · N selected" (disabled-looking at 0 selections)

**Step 3 — Context (profile flags):**
- 5 checkbox options (pregnant, plant-based, sensitive skin, on rx meds, none)
- AlertNote: privacy notice
- CTA: "Enter Elory"

### 3.2 Home — `app/(tabs)/index.tsx`

- Header: eyebrow "Good morning, [name]" + serif italic "Elory." + avatar circle (sand bg, serif initial)
- Hero card: accent teal arch shape (borderRadius top 120px, bottom 20px), italic serif insight copy, evidence attribution line
- Active Stack section: 5-column arch-thumbnail grid + synergy/flag summary line
- Recent Scans: 3-item list with arch thumb, serif product name, EvidenceSpectrum dots, tag
- Known Today: ingredient chip cloud — terracotta left-border for flagged, default border for others

Remove: current daily composite score card, calendar, newsletter card (replaced by hero card).

### 3.3 Scanner — `app/(tabs)/scan.tsx`

- Dark background (#0A0A0A), camera backdrop with gradient overlay
- Corner bracket frame (4 L-shaped corners, 32px each) — white when aligning, sage when detected
- Top bar: close button (frosted circle) + status pill (dot + label) + expand button
- Scanning state: horizontal sweep line animation
- Detected state: bottom sheet slides up with product name, brand, confidence %, ingredient chips, "Analyze →" CTA

### 3.4 Product Detail — `app/product/[id].tsx`

Reframed as "Clinical Intelligence Report".

- Back button + "Clinical intelligence report" eyebrow
- Product header: arch thumb + brand/name/size + tag pills
- Verdict card (surfaceCard bg): serif summary sentence, evidence row (EvidenceSpectrum + Fit + Domain)
- AlertNote for profile-specific flag
- "Ingredients of note" section: rows with serif name, amount, EvidenceSpectrum, role tag, flag left-border, description
- Bio-domain impact: SpectrumBar rows (label + bar + right label)
- "How to use it": 2-column grid (context / recommendation)
- Action row: "Add to stack" pill + bookmark icon button

Remove: current health score circle, radar chart, green/red pill grades.

### 3.5 Ingredient Detail — `app/ingredient/[id].tsx`

- Back button + category eyebrow
- Serif name (40px) + italic INCI name
- Tag row: role, concentration, approval status
- "What the evidence says": 2×2 grid (Evidence base, Study count, Consensus, Confidence) — no numeric scores
- AlertNote: profile-specific note
- Bio-domain impact: SpectrumBar rows with sub-notes
- Primary research: citation list (serif title, italic journal, sample size)
- "Found in your stack": product row

Remove: current belief vs. reality columns (replaced by the evidence grid + AlertNote pattern), radar chart.

### 3.6 Stack — `app/(tabs)/stack.tsx`

- Header: "My Stack" + italic subtitle (N active · N synergies · N flags)
- Synergy card: SVG mini-graph (force-directed static) + description → taps to Conflict Map premium screen
- Filter chips: all / supplements / topical / food / meds (pill shape, ink bg when active)
- Time-grouped list: "Morning · 08:00" section head + products, "Evening · 21:30" section head + products
- Product row: arch thumb + brand eyebrow + serif name + EvidenceSpectrum + tags
- "Add to stack" ghost button at bottom

### 3.7 Profile — `app/profile.tsx`

- Serif name (40px) at top
- Membership card: tier badge, member-since, feature list, tag row
- Health focus tags (strong tone)
- Dietary flags: toggle rows (ink track when on)
- Ingredient watchlist: alert-tone tags + dashed "+ Add"
- Data & export: list rows with chevron
- "Atelier" section at bottom: links to 5 premium screens

---

## 4. Premium Screens

### Location: `app/(premium)/` (new directory)

5 new files: `chat.tsx`, `circadian.tsx`, `conflict-map.tsx`, `exposure.tsx`, `pulse.tsx`

### Lock overlay behavior

Check subscription tier: `isPremium(tier)` from `profile-hub.tsx` pattern (tier !== 'free'). If not premium:
- Show the full designed screen at 60% opacity underneath
- Frosted overlay with "◆ Atelier" badge, serif unlock message, and "Unlock Atelier" CTA button

If premium: render screen fully, no overlay.

### 4.1 Chat — `app/(premium)/chat.tsx`

Dark register (darkSurface bg, darkInk text). Serif italic header "Ask Elory."

- Suggested prompt cards (3 italic serif questions)
- Conversation: user message + Elory response with sand-underline ingredient links
- Sand left-border blockquote for key findings
- Citation footer (journals, uppercase, muted)
- Fixed input bar at bottom: frosted pill input + sand send button

### 4.2 Circadian — `app/(premium)/circadian.tsx`

Dark register. "Your circadian protocol."

- Chronotype intro line
- 24h SVG timeline (cortisol curve in sand, melatonin curve dashed sage, dose markers)
- Hour labels (00/06/12/18/24) + biological phase annotations
- Dose list: time column (serif 20px) + name + note, with synergy star for paired items
- EvidenceSpectrum dots in sand

### 4.3 Conflict Map — `app/(premium)/conflict-map.tsx`

Dark register. "Biochemical conflict map."

- Compound count + synergy/competition summary
- Legend: solid line = synergy, dashed = competes
- SVG force graph: nodes (circle + dot center + serif italic label below) + edges (sand solid / alert dashed)
- Dot-grid background pattern
- "What this means" list: left-border notes (sand for synergy, alert for compete)

### 4.4 Exposure Ledger — `app/(premium)/exposure.tsx`

Dark register. "Exposure ledger."

- 14-day stacked bar chart (3-layer columns: alert/sand/muted)
- Category list: serif name + delta (alert color if +, sage if improvement) + 2px bar
- Load bar: alert fill for high-load categories, sand otherwise

### 4.5 Evidence Pulse — `app/(premium)/pulse.tsx`

Dark register. "Evidence pulse."

- Subtitle: "N new signals this week across ingredients in your stack"
- Feed articles: ingredient eyebrow (tone-colored) + EvidenceSpectrum + serif headline + italic excerpt with left border + journal + "Read brief →"

---

## 5. Shared Components

New file: `nourai/components/elory/` directory with:

| Component | Description |
|-----------|-------------|
| `Eyebrow.tsx` | 10px uppercase DM Sans label |
| `SerifH.tsx` | Cormorant Garamond heading, configurable size |
| `EvidenceSpectrum.tsx` | 4 dots (filled/outline) for evidence strength |
| `SpectrumBar.tsx` | Horizontal bar with positioned notch, no numeric value |
| `Tag.tsx` | Pill tag, tones: default/strong/accent/sand/sage/alert/dark |
| `AlertNote.tsx` | Left-border (2px) note block, serif italic body |
| `ProductThumb.tsx` | Arch-top thumbnail (999px top radius, 6px bottom) |
| `SectionHead.tsx` | Eyebrow label + strong border-bottom |
| `PremiumLock.tsx` | Frosted overlay with Atelier badge + unlock CTA |

---

## 6. What's Removed

- `health/` screens (fitness, gut, hair, hormonal, sleep) — replaced by domain spectrum bars on ingredient/product screens. Keep files intact; remove tab references from `_layout.tsx` only.
- `domain/[name].tsx` — domain deep-dives are replaced by spectrum bars inline
- `components/CategoryIcon.tsx` — replaced by `ProductThumb` arch thumbnails
- `components/ProductListItem.tsx` — replaced by new arch-thumb row pattern
- Newsletter screen — removed from bottom nav; keep file if needed for deep-links
- Health score circle / radar chart — replaced by evidence spectrum + spectrum bars

---

## 7. Out of Scope

- Backend changes: no new API routes needed for core screens. Premium screens use placeholder data.
- Dark mode: light only per design brief.
- Animations: keep existing Reanimated calls; add scan sweep animation for scanner.
- i18n, accessibility: not in scope for this pass.
