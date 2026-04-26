# Health Profiles — Dark Atelier Redesign

## Goal

Replace the 2-column icon grid on the profile hub with Atelier-style dark rows, and re-skin all 6 health domain screens from light mode to the Atelier dark register. No logic or data changes — pure visual redesign.

## Architecture

Two independent changes:

1. **`app/profile-hub.tsx`** — remove the icon grid and its 6 SVG icon components; replace with a single dark card containing 6 tappable rows.
2. **All 6 health screens** — `app/profile.tsx` (Skin Health) and `app/health/gut.tsx`, `fitness.tsx`, `hair.tsx`, `hormonal.tsx`, `sleep.tsx` — re-skin every style from the light `Colors.bone` register to `Colors.darkSurface`.

---

## Section 1 — Profile-hub Health Profiles

### Remove

- 6 SVG icon components: `SkinIcon`, `GutIcon`, `FitnessIcon`, `HairIcon`, `HormonalIcon`, `SleepIcon`
- `HEALTH_PROFILES` data array
- `profileGrid`, `profileCard`, `profileIconBg`, `profileName`, `profileDescription`, `profileArrow` styles
- The `section` wrapper and `sectionHeader` / `sectionSubtitle` for this block

### Replace with

A single dark card `(styles.healthDomainCard)` containing the same 6 destinations as inline rows.

```
┌─────────────────────────────────────────┐  ← darkSurface bg, lg radius
│  ◆ HEALTH PROFILES       (eyebrow)      │
├─────────────────────────────────────────┤  ← hairline rgba(241,237,228,0.1)
│  Skin Health              ›             │
│  Skin type, sensitivity & watchlist     │
├─────────────────────────────────────────┤
│  Gut Health               ›             │
│  Digestive sensitivities & diet prefs   │
├─────────────────────────────────────────┤
│  Fitness & Recovery       ›             │
│  Activity level & recovery goals        │
├─────────────────────────────────────────┤
│  Hair & Scalp             ›             │
│  Hair type & ingredient sensitivities   │
├─────────────────────────────────────────┤
│  Hormonal Balance         ›             │
│  Hormonal concerns & sensitivities      │
├─────────────────────────────────────────┤
│  Sleep & Recovery         ›             │
│  Sleep quality & aid preferences        │
└─────────────────────────────────────────┘
```

**Row anatomy:**
- Left: domain name in `Fonts.sansMedium`, `FontSizes.subtitle`, `Colors.darkInk`
- Below name: description in `FontSizes.caption`, `rgba(241,237,228,0.45)`
- Right: `›` chevron in `rgba(241,237,228,0.3)`, `FontSizes.heading`
- Padding: 16px horizontal, 14px vertical
- Separator: `borderTopWidth: StyleSheet.hairlineWidth`, `borderTopColor: rgba(241,237,228,0.1)` (skipped on first row)

**Eyebrow header inside card:**
- `"◆ HEALTH PROFILES"` in `Fonts.sansSemiBold`, 10px, uppercase, 1.8 letter-spacing, `Colors.sand`
- Padding: 16px, `borderBottomWidth: hairline`, `rgba(241,237,228,0.1)`

**Card container styles:**
```
marginHorizontal: Layout.screenPaddingHorizontal
marginBottom: Spacing.xl
backgroundColor: Colors.darkSurface
borderRadius: Radius.lg
overflow: 'hidden'
```

**Routes (unchanged):**
| Domain | Route |
|--------|-------|
| Skin Health | `/profile` |
| Gut Health | `/health/gut` |
| Fitness & Recovery | `/health/fitness` |
| Hair & Scalp | `/health/hair` |
| Hormonal Balance | `/health/hormonal` |
| Sleep & Recovery | `/health/sleep` |

---

## Section 2 — Health Domain Screens (all 6)

All 6 screens receive identical dark-register token replacements. The component tree, form logic, AsyncStorage keys, and API calls are unchanged.

### Screen-level tokens

| Element | Before | After |
|---------|--------|-------|
| Screen background | `Colors.bone` | `Colors.darkSurface` |
| ScrollView content bg | `Colors.bone` | `Colors.darkSurface` |
| All body text | `Colors.ink` | `Colors.darkInk` |
| Secondary text | `Colors.inkSecondary` | `rgba(241,237,228,0.65)` |
| Tertiary / labels | `Colors.inkTertiary` | `rgba(241,237,228,0.45)` |
| Borders / hairlines | `Colors.borderHairline` | `rgba(241,237,228,0.1)` |
| Card backgrounds | `Colors.boneCard` | `rgba(241,237,228,0.06)` |

### Header (shared pattern across all 6)

```
◆ HEALTH PROFILE          ← sand eyebrow, 10px, uppercase, 1.8 tracking
Skin Health                ← Fonts.serifItalic, 32px, Colors.darkInk
```

Back button: `‹ Back` text link in `rgba(241,237,228,0.55)`, `Fonts.sans`, `FontSizes.body`, `alignSelf: 'flex-start'`, `marginBottom: 12`.

### InsightCard (replaces amber clay card)

```
┌──────────────────────────────────────┐
│ ◆ HIDDEN INSIGHT    (sand, 10px)     │  ← borderLeftWidth: 2, borderLeftColor: Colors.sand
│ The truth about your skin barrier.  │  ← serifItalic, 16px, Colors.darkInk
│ Most sensitivity reactions are...   │  ← sans, caption, rgba(241,237,228,0.55)
└──────────────────────────────────────┘
```

Styles:
```
backgroundColor: rgba(241,237,228,0.06)
borderLeftWidth: 2
borderLeftColor: Colors.sand
borderRadius: Radius.md
padding: scale(16)
marginBottom: Spacing.xl
```

Remove the emoji `🔬` — replace label with `"◆ HIDDEN INSIGHT"` in `Colors.sand`.

### Selection option cards

Normal state:
```
backgroundColor: rgba(241,237,228,0.06)
borderWidth: 1
borderColor: rgba(241,237,228,0.1)
borderRadius: Radius.md
```

Selected state:
```
backgroundColor: rgba(241,237,228,0.14)
borderColor: Colors.sand
```

Option name: `Fonts.sansMedium`, `FontSizes.subtitle`, `Colors.darkInk`
Option description: `Fonts.sans`, `FontSizes.caption`, `rgba(241,237,228,0.55)`

### Section labels (overline text)

```
fontFamily: Fonts.sansSemiBold
fontSize: 10
textTransform: 'uppercase'
letterSpacing: 1.8
color: rgba(241,237,228,0.45)
marginBottom: scale(12)
```

### Watchlist / tag pills (Skin Health, Gut Health)

Tag pill:
```
backgroundColor: rgba(232,213,176,0.15)   ← sand tint
borderColor: rgba(232,213,176,0.3)
borderWidth: 1
borderRadius: Radius.pill
```
Tag text: `Colors.sand`, `Fonts.sans`, `FontSizes.caption`

Remove button on tag: `rgba(241,237,228,0.4)`

"Add ingredient" dashed button:
```
borderWidth: 1
borderStyle: 'dashed'
borderColor: rgba(241,237,228,0.25)
borderRadius: Radius.pill
```
Add text: `rgba(241,237,228,0.4)`

### Toggle switch (where present)

Track (off): `rgba(241,237,228,0.15)`
Track (on): `Colors.sand`
Thumb: `Colors.darkSurface`

### Save button

```
backgroundColor: Colors.darkInk        ← cream
borderRadius: Radius.pill
paddingVertical: verticalScale(16)
alignItems: 'center'
marginTop: Spacing.xl
```
Text: `Fonts.sansSemiBold`, `FontSizes.body`, `Colors.darkSurface`, uppercase, 1.2 letter-spacing

### Loading / ActivityIndicator

`color: Colors.darkInk`

---

## Out of Scope

- Any logic, API, or AsyncStorage changes
- Adding new sections or fields to any health screen
- The `health/edit-profile.tsx` screen (not linked from health profiles grid)
- Animations beyond what already exists in each screen
