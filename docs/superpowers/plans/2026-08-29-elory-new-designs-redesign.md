# Elory New Designs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every screen in `nourai/app/` in line with the mockups in `/Users/redar/Desktop/nourai/new_designs/` (5 composite PNGs, ~16 distinct screens), fixing the concrete visual gaps identified against the current implementation.

**Architecture:** This is a visual-fidelity pass, not a rewrite. Existing data-fetching (`api.ts` calls), state (`useAppState`, `useAuth`), and navigation structure are correct and must be preserved — only JSX/styling changes, *except* where a mockup implies a genuinely different information architecture (Peptides screen, Search "recent searches", Journal tab labels), where structural changes are approved. Reuse existing shared components in `nourai/components/elory/` wherever the mockup pattern already has one; extend a shared component (not duplicate it) when multiple screens need the same new pattern.

**Tech Stack:** React Native, Expo Router, `nourai/constants/theme.ts` design tokens (`Colors`, `Fonts`, `Radius`, `FontSizes`, `scale`/`verticalScale`), `react-native-svg` for custom graphics, `expo-image` for photos.

**Spec:** `/Users/redar/Desktop/nourai/new_designs/{home_stack_history,journal_health_domains_settings,premium_features,product_search,research_evidence}.png` — five 3-panel composite mockups. Each task below names the exact file and panel (left/middle/right) it targets.

## Global Constraints

- Do not change `nourai/services/api.ts` request/response shapes — if a mockup needs a field the API doesn't return, derive it client-side from existing fields or hide that sub-element; never invent a fake network call.
- Reuse design tokens from `nourai/constants/theme.ts` exclusively — no new hardcoded hex colors. If a mockup color has no token, pick the nearest existing token (`Colors.accent`, `Colors.sand`, `Colors.sage`, `Colors.alert`) rather than adding one, unless a task explicitly says to add a token.
- Any screen still using the legacy color aliases (`Colors.bone`, `Colors.boneCard`, `Colors.accentHill`, `Colors.accentAlert`, etc. — see `theme.ts` "Legacy aliases" block) must be migrated to the canonical tokens (`Colors.surface`, `Colors.surfaceCard`, `Colors.accent`, `Colors.alert`) as part of touching that file.
- Verification for every task is manual: run the app (`cd nourai && npx expo start`), navigate to the screen, and visually compare against the named mockup panel side-by-side. There is no automated visual-regression suite in this repo — do not invent one.
- Run `cd nourai && npx tsc --noEmit` after each task and fix any new type errors before committing.
- One task = one commit. Do not bundle unrelated screens into one commit.

---

## File Structure

| File | Change |
|------|--------|
| `nourai/components/elory/ProductThumb.tsx` | Add `variant` prop (`'arch'` list thumb vs `'panel'` plain hero image) |
| `nourai/components/elory/SpectrumBar.tsx` | Add tri-color gradient fill mode |
| `nourai/app/product/[id].tsx` | Header image, pill tabs, big-number score card, "what this supports" tags, ingredient row icon avatars |
| `nourai/app/ingredient/[id].tsx` | Use gradient `SpectrumBar` for Evidence Spectrum, fix label order/wording |
| `nourai/app/(tabs)/stack.tsx` | Replace hand-rolled score badge with `ScoreListRow` |
| `nourai/app/(tabs)/history.tsx` | Replace hand-rolled score badge with `ScoreListRow`, add filter icon to search bar |
| `nourai/app/(tabs)/search.tsx` | Add "Recent searches" horizontal row |
| `nourai/app/(tabs)/journal.tsx` | Fix category pill labels, add row thumbnails |
| `nourai/app/research/[id].tsx` | Confidence badge → dot-evidence row |
| `nourai/app/(premium)/pulse.tsx` | Add sparkline chart to weekly digest header |
| `nourai/app/(premium)/peptides.tsx` | Rework card content model + migrate legacy color aliases |
| `nourai/app/(premium)/ask-elory.tsx` | User message bubble styling |
| `nourai/app/onboarding.tsx`, `nourai/app/auth.tsx`, `nourai/app/health/edit-profile.tsx` | Diff against mockup panels, fix gaps found |
| `nourai/app/(tabs)/index.tsx` | Header icon fix (bell + bar-chart, not bell + dot) |

---

### Task 1: `ProductThumb` panel variant

**Files:**
- Modify: `nourai/components/elory/ProductThumb.tsx`

**Interfaces:**
- Produces: `ProductThumb` now accepts `variant?: 'arch' | 'panel'` (default `'arch'`, preserving all current callers' behavior unchanged).

- [ ] **Step 1: Add the `variant` prop**

Open `nourai/components/elory/ProductThumb.tsx`. Replace the `Props` interface and the outer `View`'s shape styles:

```tsx
interface Props {
  color?: ThumbColor;
  letter?: string;
  size?: number;
  imageUri?: string | null;
  variant?: 'arch' | 'panel';
}

export function ProductThumb({ color = 'default', letter, size = 64, imageUri, variant = 'arch' }: Props) {
  const bg =
    color === 'sand' ? Colors.sand
    : color === 'sage' ? 'rgba(123,174,142,0.25)'
    : color === 'dark' ? Colors.ink
    : '#D6D3CC';

  const textColor = color === 'dark' ? Colors.surface : Colors.ink;

  const shapeStyle = variant === 'panel'
    ? {
        width: size,
        height: size * 1.35,
        borderRadius: Radius.md,
      }
    : {
        width: size,
        height: size * 1.25,
        borderTopLeftRadius: 999,
        borderTopRightRadius: 999,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
      };

  return (
    <View
      style={{
        ...shapeStyle,
        backgroundColor: imageUri ? Colors.surfaceCard : bg,
        borderWidth: 1,
        borderColor: Colors.borderHairline,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
```

Leave everything from the `{imageUri ? (` line onward unchanged, and add `Radius` to the existing `import { Colors, Fonts } from '@/constants/theme';` line (`import { Colors, Fonts, Radius } from '@/constants/theme';`).

- [ ] **Step 2: Typecheck**

Run: `cd nourai && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Verify no visual regression on existing arch usages**

Run the app, open Home and Stack screens — list-row thumbnails must look unchanged (still arch-shaped, since `variant` defaults to `'arch'`).

- [ ] **Step 4: Commit**

```bash
git add nourai/components/elory/ProductThumb.tsx
git commit -m "feat: add panel variant to ProductThumb for non-list hero images"
```

---

### Task 2: `SpectrumBar` gradient fill mode

**Files:**
- Modify: `nourai/components/elory/SpectrumBar.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `SpectrumBar` accepts `gradient?: boolean` (default `false`). When `true`, the track renders as a left-to-right `Colors.accent → Colors.sand → Colors.alert` gradient (matching `research_evidence.png` middle panel's "Evidence Spectrum" bar: teal "Strong established" → tan "Preliminary emerging" → rust "Weak/Contested") instead of the current flat fill, and the position dot still marks the current value.

- [ ] **Step 1: Read the current implementation**

Open `nourai/components/elory/SpectrumBar.tsx` and note its current props (value/position prop name, dot-marker rendering) so the gradient addition doesn't change its existing call sites' behavior when `gradient` is omitted.

- [ ] **Step 2: Add gradient rendering**

Add `import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';` (merge with any existing `react-native-svg` import). When `gradient` is `true`, replace the flat-color track `View` with:

```tsx
<Svg width="100%" height={trackHeight} style={{ borderRadius: trackHeight / 2 }}>
  <Defs>
    <LinearGradient id="spectrumGradient" x1="0" y1="0" x2="1" y2="0">
      <Stop offset="0" stopColor={Colors.accent} />
      <Stop offset="0.5" stopColor={Colors.sand} />
      <Stop offset="1" stopColor={Colors.alert} />
    </LinearGradient>
  </Defs>
  <Rect x="0" y="0" width="100%" height={trackHeight} rx={trackHeight / 2} fill="url(#spectrumGradient)" />
</Svg>
```

Use whatever the component's existing track-height variable/constant is named for `trackHeight` (read the file to find it — do not invent a new one). Keep the existing position-dot marker `View`/element rendered as an absolutely-positioned overlay on top of this, using the same position-calculation logic already in the file.

- [ ] **Step 3: Typecheck**

Run: `cd nourai && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add nourai/components/elory/SpectrumBar.tsx
git commit -m "feat: add gradient fill mode to SpectrumBar for Evidence Spectrum"
```

---

### Task 3: Product detail screen — header image, pill tabs, score card, support tags

**Depends on:** Task 1 (ProductThumb `panel` variant)

**Files:**
- Modify: `nourai/app/product/[id].tsx`

**Mockup:** `new_designs/product_search.png`, middle panel.

- [ ] **Step 1: Fix the hero product image**

In the header block (`styles.headerBlock` / the `<ProductThumb ... />` call around line 345 of the current file), change:

```tsx
<ProductThumb
  color={thumbColor}
  letter={thumbLetter}
  size={72}
  imageUri={product.image_url}
/>
```

to:

```tsx
<ProductThumb
  color={thumbColor}
  letter={thumbLetter}
  size={96}
  imageUri={product.image_url}
  variant="panel"
/>
```

This stops the bottle photo being crushed into an arch crop (the bug the user reported) and matches the plain rounded-rect product shot in the mockup.

- [ ] **Step 2: Convert the segmented tabs from underline style to pill style**

Replace the `styles.segmentedTabs` / `styles.segmentedTab*` block (both the JSX loop rendering `['Overview', 'Ingredients', 'Nutrition', 'About']` and its styles) so the active tab is a solid `Colors.ink`-background pill with `Colors.surface` text, and inactive tabs are hairline-outlined pills — matching the mockup's tab row exactly (dark filled "Overview" pill, outlined "Ingredients (12)" / "Nutrition" / "About" pills). Wrap the row in a horizontal `ScrollView` (`horizontal showsHorizontalScrollIndicator={false}`) since pill widths vary with label length:

```tsx
segmentedTabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
segmentedTab: {
  paddingHorizontal: 16,
  paddingVertical: 9,
  borderRadius: Radius.pill,
  borderWidth: 1,
  borderColor: Colors.borderHairline,
},
segmentedTabActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
segmentedTabText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.inkSecondary },
segmentedTabTextActive: { color: Colors.surface },
```

Also update the "Ingredients" tab label to include the count, matching the mockup (`Ingredients (${regularIngredients.length})`).

- [ ] **Step 3: Replace the `ScoreRing` verdict card with a big-number score card**

The mockup does not use a circular ring on the product detail page — it shows a large serif number (`85`) with `/100` beside it, an "Ingredient Intelligence Score ⓘ" label beneath, a "High" qualifier + 5-dot evidence-strength row to the right, and a caption "Evidence quality across all ingredients" below. Replace the `<ScoreRing .../>` usage inside `styles.verdictCard` with:

```tsx
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
    <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 52, color: Colors.ink, lineHeight: 52 }}>
      {overallScore}
    </Text>
    <Text style={{ fontFamily: Fonts.sans, fontSize: 14, color: Colors.inkSecondary, marginBottom: 6 }}>/100</Text>
  </View>
  <View style={{ alignItems: 'flex-end' }}>
    <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 16, color: Colors.ink, marginBottom: 6 }}>
      {overallScore >= 80 ? 'High' : overallScore >= 60 ? 'Good' : overallScore >= 40 ? 'Moderate' : 'Low'}
    </Text>
    <EvidenceSpectrum strength={Math.round(overallScore / 20)} />
  </View>
</View>
<Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: Colors.inkSecondary, marginBottom: 6 }}>
  Ingredient Intelligence Score
</Text>
```

Keep the existing `Eyebrow`/"The short version" verdict-text block below it as-is (mockup doesn't show it on this panel, but it's useful content the current design already has room for beneath the tag pills — do not delete it, just move it to sit after the score block).

Move `Evidence quality across all ingredients` caption (new `Text`, `styles.metaText`-like) directly under the score row.

- [ ] **Step 4: Add "What this product supports" tag row**

Below the verdict card, before the "Ingredient highlights" stat row, add a new section. Derive the 1–3 support tags from `product.bio_domains` (already fetched — use the top domains by `value`, filtering out any with `is_negative: true`), each rendered as a pill with a leading icon. Reuse the existing `Tag` component in an icon+label composite (Tag doesn't support icons today, so build this inline, not by modifying `Tag`):

```tsx
{bioDomains.length > 0 && (
  <View style={{ marginBottom: 24 }}>
    <SectionHead label="What this product supports" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {bioDomains.slice(0, 3).map((domain) => (
        <View key={domain.name} style={styles.supportPill}>
          <Text style={styles.supportPillText}>{domain.name}</Text>
        </View>
      ))}
    </View>
  </View>
)}
```

with styles:

```tsx
supportPill: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: Radius.pill,
  borderWidth: 1,
  borderColor: Colors.borderHairline,
},
supportPillText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.ink },
```

(No icon library is wired up for these in the current codebase — an icon-free pill matching the mockup's typography/spacing is the correct scope here; do not add a new icon dependency for this task.)

- [ ] **Step 5: Rework the "Ingredient highlights" stat row into 3 columns with dot rows**

The mockup's `statRow` (already present, currently 3 columns: Strong evidence / Flagged / Category) should instead read "Strong evidence" / "Emerging evidence" / "Limited / Uncertain", each with a big serif count number and its own `EvidenceSpectrum` dot row underneath (5 dots, filled count = evidence tier), matching the mockup's "Ingredient highlights" card exactly. Rename the section (add a `SectionHead label="Ingredient highlights"` above it, matching the mockup), and compute the three counts from `regularIngredients` using existing evidence classification (reuse whatever `isFlagged`/`strongCount` logic already exists in the file — do not invent a new evidence taxonomy; if there's no "emerging" tier in current data, split flagged ingredients into "Limited / Uncertain" and keep strong vs. everything-else as the two working buckets, with the middle "Emerging" column showing `0` rather than fabricating data).

- [ ] **Step 6: Add icon-avatar circles to the ingredient list rows**

The mockup shows each ingredient row with a small circular icon avatar on the left (leaf icon for supplements, generic circle for vitamins) before the name. Add a small circular `View` (28px, `borderRadius: 14`, `Colors.surfaceAlt` background, hairline border) to the left of each ingredient row in the `regularIngredients.map(...)` block, with the ingredient's first-letter or a simple existing SVG (reuse whatever leaf/circle glyph already exists in `CategoryIcon.tsx` if it exports one generic enough; otherwise a plain colored dot is acceptable — do not build a new icon set for this task).

- [ ] **Step 7: Typecheck and manual verification**

Run: `cd nourai && npx tsc --noEmit` — fix any errors.
Run the app, open a product detail screen, and compare side-by-side against `new_designs/product_search.png` middle panel: header image should be a plain rounded-rect photo (not arch-cropped), tabs should be pills, score should be a big number (not a ring), support tags and ingredient-highlights columns should be present.

- [ ] **Step 8: Commit**

```bash
git add nourai/app/product/[id].tsx
git commit -m "redesign: product detail screen to match new_designs product_search.png"
```

---

### Task 4: Ingredient detail screen — gradient Evidence Spectrum

**Depends on:** Task 2 (`SpectrumBar` gradient mode)

**Files:**
- Modify: `nourai/app/ingredient/[id].tsx`

**Mockup:** `new_designs/product_search.png`, right-hand "Niacinamide" panel (Evidence Spectrum widget) — also `new_designs/research_evidence.png` middle panel shows the same widget.

- [ ] **Step 1: Replace the inline gradient View pair with `SpectrumBar`**

Find the `styles.gradient` / `styles.gradientFill` inline implementation in the Overview render function. Replace it with `<SpectrumBar value={...} gradient />`, passing whatever value (0–1 or 0–100, match the component's existing prop contract from Task 2) the file currently computes for spectrum position.

- [ ] **Step 2: Fix the label order and wording**

The mockup's labels under the bar read, left to right: "Strong established", "Preliminary emerging", "Weak / Contested". Update the three caption `Text` elements to this exact wording and order if they currently differ.

- [ ] **Step 3: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open an ingredient detail screen, compare the Evidence Spectrum bar against the mockup — it should show a teal→tan→rust gradient track with a position dot, and the three labels below in the order above.

- [ ] **Step 4: Commit**

```bash
git add nourai/app/ingredient/[id].tsx
git commit -m "redesign: gradient Evidence Spectrum bar on ingredient detail"
```

---

### Task 5: Stack screen — use `ScoreListRow`

**Files:**
- Modify: `nourai/app/(tabs)/stack.tsx`

**Mockup:** `new_designs/home_stack_history.png`, middle panel.

- [ ] **Step 1: Read `ScoreListRow`'s props**

Open `nourai/components/elory/ScoreListRow.tsx` and note its exact prop names (score, qualifier, evidence-strength) — it already renders the serif big-number + `/100` + qualifier + `EvidenceSpectrum` dot row exactly as the mockup shows (e.g. "85 / High / ●●●●○").

- [ ] **Step 2: Replace the hand-rolled score badge in `stack.tsx`**

Find the `StackRow` component's small circular score badge (currently a 34px ring showing just the number). Replace it with `<ScoreListRow score={...} .../>`, passing the same score/grade data currently fed to the circular badge. Remove the now-unused circular-badge styles.

- [ ] **Step 3: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open Stack tab, compare each row's score badge against the mockup's chip style.

- [ ] **Step 4: Commit**

```bash
git add nourai/app/(tabs)/stack.tsx
git commit -m "redesign: use ScoreListRow for stack row score badges"
```

---

### Task 6: History screen — use `ScoreListRow` + search bar filter icon

**Files:**
- Modify: `nourai/app/(tabs)/history.tsx`

**Mockup:** `new_designs/home_stack_history.png`, right-hand panel.

- [ ] **Step 1: Replace the hand-rolled score badge**

Same change as Task 5, applied to the row renderer in `history.tsx`: swap the small circular badge for `<ScoreListRow .../>`.

- [ ] **Step 2: Add a trailing filter icon to the search bar**

The mockup's "Search your history..." bar has a funnel/filter icon on the right edge. Add a small `Pressable` with a simple SVG funnel icon (reuse the same `react-native-svg` `Path`/`Svg` pattern used elsewhere in this codebase, e.g. in `(tabs)/_layout.tsx`'s icon components) inside the search bar's `View`, right-aligned. Wire it to toggle the existing `FilterPills` row's visibility if that's how filters are currently exposed, or leave it a no-op `Pressable` with a `// TODO: wire filter sheet` only if no filter-sheet concept exists yet in this file — check the file first and use whatever filter-toggling mechanism already exists rather than adding new state if one exists.

- [ ] **Step 3: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open History tab, compare against the mockup.

- [ ] **Step 4: Commit**

```bash
git add nourai/app/(tabs)/history.tsx
git commit -m "redesign: use ScoreListRow and add filter icon to history search bar"
```

---

### Task 7: Search screen — "Recent searches" row

**Files:**
- Modify: `nourai/app/(tabs)/search.tsx`

**Mockup:** `new_designs/product_search.png`, right-hand panel, "Recent searches" section (horizontal row of 3 thumbnail cards: product image/icon, name, category).

- [ ] **Step 1: Check for existing recent-search storage**

Grep `nourai/` for any existing recent-search persistence (e.g. AsyncStorage key, `useAppState` field). If one exists, use it. If none exists, add a simple local list capped at the last 5 distinct queries/products tapped from this screen, persisted via `@react-native-async-storage/async-storage` (already a project dependency — confirm via `nourai/package.json`) under a key like `elory.recentSearches`.

- [ ] **Step 2: Render the "Recent searches" row**

Above the "Popular ingredient searches" section (or wherever the mockup places it — directly under the search bar / mode tabs), add a horizontal `ScrollView` of cards, each ~110px wide, showing a `ProductThumb` (or `CategoryIcon` for ingredient-only entries) at `variant="arch"` small size, the name (1 line, truncated), and category caption — matching the mockup's "Momentous Omega-3 Essential / Supplement" card style. Include a "See all" link on the section header per the mockup, using `SectionHead`.

- [ ] **Step 3: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open Search/Explore tab, search for and tap a product, go back — confirm it appears in "Recent searches".

- [ ] **Step 4: Commit**

```bash
git add nourai/app/(tabs)/search.tsx
git commit -m "feat: add recent searches row to search screen"
```

---

### Task 8: Journal screen — pill labels + row thumbnails

**Files:**
- Modify: `nourai/app/(tabs)/journal.tsx`

**Mockup:** `new_designs/journal_health_domains_settings.png`, top-left panel.

- [ ] **Step 1: Fix the category pill labels**

Find the `FilterPills` (or equivalent) options array currently reading `['All', 'Longevity', 'Nutrition', 'Research']`. Replace with the mockup's exact set: `['Latest', 'Longevity', 'Nutrition', 'Supplements', 'Mind']`.

- [ ] **Step 2: Adjust article filtering to the new categories**

If article data is tagged with categories that no longer match the renamed pills (e.g. an article tagged `'Research'` with no `'Supplements'`/`'Mind'` equivalent), check how articles are tagged (likely a `category` field on the article/newsletter data) and update the tag values or the pill-to-category mapping so filtering still works — do not leave a pill that filters to an empty list silently.

- [ ] **Step 3: Add row thumbnails**

Replace the numbered serif index badge on each "Latest articles" row with a small square/rounded thumbnail image (`expo-image`, ~48×48, `Radius.sm`), using the article's existing image field if one exists in the data (check the newsletter/article type in `services/api.ts` or wherever journal data comes from) — if no image field exists on the data model, keep the numbered badge rather than fabricating an image URL.

- [ ] **Step 4: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open Journal tab, compare pill labels and row style against the mockup.

- [ ] **Step 5: Commit**

```bash
git add nourai/app/(tabs)/journal.tsx
git commit -m "redesign: journal pill labels and article row thumbnails"
```

---

### Task 9: Research evidence screen — dot-evidence confidence

**Files:**
- Modify: `nourai/app/research/[id].tsx`

**Mockup:** `new_designs/research_evidence.png`, right-hand panel.

- [ ] **Step 1: Replace the confidence pill badge with a dot row**

Each study card currently shows confidence (Strong/Moderate/Preliminary) as a colored pill badge on the right. Replace it with the `EvidenceSpectrum` dot-row component (already imported elsewhere in the codebase, e.g. in `product/[id].tsx`) sized to match the mockup — label word above, 5-dot row below, right-aligned in the card.

- [ ] **Step 2: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open a research evidence screen, compare against the mockup.

- [ ] **Step 3: Commit**

```bash
git add nourai/app/research/[id].tsx
git commit -m "redesign: dot-evidence confidence indicator on research cards"
```

---

### Task 10: Evidence Pulse — weekly digest sparkline

**Files:**
- Modify: `nourai/app/(premium)/pulse.tsx`

**Mockup:** `new_designs/premium_features.png`, middle-bottom "Evidence Pulse" panel.

- [ ] **Step 1: Add a small sparkline chart to the digest header card**

The mockup's "This week's digest" card has a small wave/sparkline chart in the top-right corner. Add a compact `react-native-svg` `Path` sparkline (a simple smoothed line through 6–8 points) inside the header card, to the right of the "8 new studies on 6 ingredients in your stack" text. If the underlying data has no real per-day metric to chart, use the count of studies-per-day-this-week (derivable from whatever digest data the screen already fetches) rather than fabricating random data — check what `pulse.tsx` currently fetches before deciding the data source.

- [ ] **Step 2: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open Evidence Pulse (premium), compare the digest header against the mockup.

- [ ] **Step 3: Commit**

```bash
git add nourai/app/(premium)/pulse.tsx
git commit -m "feat: add sparkline chart to Evidence Pulse weekly digest"
```

---

### Task 11: Peptides screen — content model rework

**Files:**
- Modify: `nourai/app/(premium)/peptides.tsx`

**Mockup:** `new_designs/premium_features.png`, right-hand "Peptides" panel.

This is the largest content-model gap found: current screen shows US-regulatory/WADA badges and a mechanism blurb; the mockup shows category pills (`All / Recovery / Longevity / Fat Loss / Cognitive / Immune`), and per-peptide cards with a tag row (e.g. "Recovery · Gut Health"), "Research phase", "Admin: Oral / Injectable", "Cycle: 250-500 mcg/day" fields, plus a decorative peptide-chain illustration.

- [ ] **Step 1: Check what data is available**

Read `nourai/app/(premium)/peptides.tsx` fully and check `services/api.ts` for whatever peptide data source it currently uses. Determine whether fields for category tags, admin route, and cycle dosage already exist on that data (even under different names) before writing new UI — map existing fields to the new layout rather than inventing data. If a field genuinely does not exist anywhere (e.g. no "admin route" data at all), it's acceptable to hardcode it directly on the local peptide list if this screen already uses a local/static data array (check first) — but never hardcode over a value that should come from the API.

- [ ] **Step 2: Add category filter pills**

Add a `FilterPills` row at the top with options `['All', 'Recovery', 'Longevity', 'Fat Loss', 'Cognitive', 'Immune']`, filtering the peptide list by category tag.

- [ ] **Step 3: Rework each peptide card**

Replace the current regulatory-badge card layout with: category/tag row (small pills, e.g. "Recovery · Gut Health"), peptide name (serif), "Research phase" label, "Admin: {route}" and "Cycle: {dose}" as two-column caption rows — matching `BPC-157` / `TB-500 (Thymosin Beta-4)` / `CJC-1295 + Ipamorelin` cards in the mockup exactly in field order and typography weight.

- [ ] **Step 4: Migrate legacy color tokens**

While touching this file, replace every use of `Colors.bone`, `Colors.boneCard`, `Colors.accentHill`, `Colors.accentAlert` (and any other legacy alias from the "Legacy aliases" block in `theme.ts`) with the canonical equivalents: `Colors.surface`, `Colors.surfaceCard`, `Colors.accent`, `Colors.alert`.

- [ ] **Step 5: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open Peptides (premium), compare against the mockup.

- [ ] **Step 6: Commit**

```bash
git add nourai/app/(premium)/peptides.tsx
git commit -m "redesign: rework Peptides screen content model to match new_designs"
```

---

### Task 12: Ask Elory — chat bubble styling

**Files:**
- Modify: `nourai/app/(premium)/ask-elory.tsx`

**Mockup:** `new_designs/premium_features.png`, left-hand "Ask Elory" panel.

- [ ] **Step 1: Add a solid bubble to user messages**

The mockup shows the user's message ("Is it okay to take magnesium bisglycinate and zinc picolinate together at night?") right-aligned in a solid `Colors.ink`-background pill/rounded-rect bubble with `Colors.surface` text. Find the current user-message render (a plain underlined text block per the inventory) and wrap it in a `View` styled as: `backgroundColor: Colors.ink, borderRadius: Radius.lg, paddingHorizontal: 16, paddingVertical: 12, alignSelf: 'flex-end', maxWidth: '85%'`, with the text in `Colors.surface`.

- [ ] **Step 2: Leave the assistant message style as-is**

The mockup's assistant reply is plain text with a small leaf-icon avatar, which the current implementation already has (per inventory, "small 'E' circle" is close enough) — no change needed there.

- [ ] **Step 3: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open Ask Elory (premium), send a message, confirm the user bubble matches the mockup.

- [ ] **Step 4: Commit**

```bash
git add nourai/app/(premium)/ask-elory.tsx
git commit -m "redesign: solid bubble styling for user messages in Ask Elory"
```

---

### Task 13: Home screen header icon

**Files:**
- Modify: `nourai/app/(tabs)/index.tsx`

**Mockup:** `new_designs/home_stack_history.png`, left-hand panel — header has a bell icon and a small bar-chart icon, not a bell with a notification dot.

- [ ] **Step 1: Find the current header icon row**

In the `ReturningHome` (or top-level) header, locate the bell icon and whatever second icon/dot is currently rendered.

- [ ] **Step 2: Swap the dot for a bar-chart icon**

Replace it with a simple `react-native-svg` bar-chart glyph (three vertical bars of increasing height, matching the mockup), same size/color treatment as the bell icon next to it, linking to wherever a stats/insights view exists in the app (e.g. the daily score detail, if one exists — otherwise leave it as a static icon with no new navigation added, since inventing a destination screen is out of scope for this task).

- [ ] **Step 3: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app, open Home tab, compare header icons against the mockup.

- [ ] **Step 4: Commit**

```bash
git add nourai/app/(tabs)/index.tsx
git commit -m "redesign: bar-chart header icon on home screen"
```

---

### Task 14: Onboarding, auth, and edit-profile — diff and fix

**Files:**
- Modify: `nourai/app/onboarding.tsx`
- Modify: `nourai/app/auth.tsx`
- Modify: `nourai/app/health/edit-profile.tsx`

**Mockup:** `new_designs/journal_health_domains_settings.png`, bottom-right three panels: "ELORY" splash ("Evidence over opinions." + palm/arch photo), "Create your account" (numbered step-dots, goal-oriented copy), "Edit Health Profile" (Age/Biological sex/Height/Weight fields, goal pills including "Improve sleep" selected, medical-conditions dropdown, Save button).

This task was not fully diffed against current code during planning (both files are large — 1136 and 438 lines respectively) — the executor must do a full read-and-compare, not rely on assumptions from this plan.

- [ ] **Step 1: Read all three current files in full**

Read `nourai/app/onboarding.tsx`, `nourai/app/auth.tsx`, and `nourai/app/health/edit-profile.tsx` completely.

- [ ] **Step 2: Diff each against its mockup panel**

For each of the three mockup panels named above, list every concrete visual difference from the corresponding current screen (copy text, field set, layout, button style, step-indicator style). Do not fix anything yet — produce the diff list first.

- [ ] **Step 3: Apply fixes**

Apply each diffed fix using existing design tokens and components (`Colors`, `Fonts`, `Radius`, existing pill/button styles already used elsewhere in these files). Preserve all existing form state, validation, and submission logic (`useAuth`, onboarding profile fields) exactly — this is a visual-only pass per the Global Constraints, unless a mockup implies a field is missing entirely (e.g. if "Biological sex" or a goal pill shown in the mockup has no corresponding state field today), in which case add the minimal state needed to support it, consistent with the existing `OnboardingProfile`/profile type shape in `services/api.ts`.

- [ ] **Step 4: Typecheck and verify**

Run: `cd nourai && npx tsc --noEmit`
Run the app through the full onboarding → auth → edit-profile flow and compare each screen against its mockup panel.

- [ ] **Step 5: Commit**

```bash
git add nourai/app/onboarding.tsx nourai/app/auth.tsx nourai/app/health/edit-profile.tsx
git commit -m "redesign: align onboarding, auth, and edit-profile screens with new_designs"
```

---

## Notes for the executor on tasks already at parity

The research pass behind this plan found these screens already match their mockup panels closely enough that **no task is defined for them** — skip unless a later visual check finds a real gap:

- `(tabs)/index.tsx` `ReturningHome`/`NewUserHome` body (Daily Longevity Score card, quick actions, journal card) — matches `home_stack_history.png` panel 1 and `product_search.png` panel 1.
- `(tabs)/stack.tsx` and `(tabs)/history.tsx` overall structure (filter pills, day/section grouping) — only the score badge and (history) filter icon needed fixing, per Tasks 5–6.
- `domains.tsx` / `HealthDomainScreen.tsx` (Skin Health, Sleep Quality, etc.) — already matches `journal_health_domains_settings.png` domain panels.
- `(premium)/circadian.tsx`, `(premium)/conflict-map.tsx`, `(premium)/exposure.tsx` — already at or above the mockup's visual sophistication (real dual-curve timeline, radial force-graph, stacked chart); no task needed.
- `settings/subscription.tsx` — already matches the paywall mockup panel.
- `research/[id].tsx` tab/card structure — only the confidence indicator needed fixing, per Task 9.
