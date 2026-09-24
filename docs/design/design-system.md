# Elory design system — "Clinical calm"

This is a reference for building screens. The tokens live in `nourai/constants/theme.ts`,
and the primitives live in `nourai/components/ui/`.

## References

| App | What we took |
|---|---|
| **Oura** | Atmospheric hero with a serif headline, open-arc score gauge, a "Contributors" list with thin bars, a night register for premium |
| **Bevel** | Floating pill tab bar with a separate primary action, raised white cards on a warm canvas, conversational AI with suggestion cards |
| **Alma** | Warm cream palette and serif titles, product on a tinted plate, bottom-sheet flows, playful single-question onboarding |
| **MacroFactor** | Full-screen scanner, dense but legible data rows, time-of-day timeline |

## Principles

1. **Evidence has a color.** Strong is green `#2E8567`, moderate is amber `#C38A26`, and weak is clay `#BE5B3B`. Every score, meter and pill uses this one scale, through `utils/grade.ts`.
2. **Never fake data.** When the API has nothing, show an `EmptyState` that explains how to get data. Don't show a plausible-looking number.
3. **Nothing readable below 12pt.** Use the `Txt` variants and never hand-set a `fontSize`.
4. **One primary action per screen.** Use it in the footer or the hero card, with the `primary` Button variant.
5. **Belief vs. reality is the product.** On ingredient pages it takes the hero slot.

## Type (`<Txt variant>`)

| Variant | Font | Size/Line | Use |
|---|---|---|---|
| `hero` | Instrument Serif | 52/54 | Welcome |
| `display` | Instrument Serif | 40/44 | Hero headlines |
| `largeTitle` | Instrument Serif | 34/38 | Screen titles |
| `title1` | Instrument Serif | 28/32 | Card headlines |
| `title2` | Instrument Serif | 24/28 | Sub-headlines, card titles |
| `title3` | Inter SemiBold | 20/25 | Section headers |
| `headline` | Inter SemiBold | 17/22 | Row titles, buttons |
| `body` | Inter | 17/24 | Reading |
| `callout` | Inter | 16/22 | Card body |
| `subhead` | Inter | 15/20 | Secondary copy |
| `footnote` | Inter | 13/18 | Metadata |
| `caption` | Inter Medium | 12/16 | Labels |
| `overline` | Inter SemiBold | 11, +1.1 tracking, caps | Eyebrows |
| `metric` / `gauge` | Inter, tabular | 28 / 64 | Numbers |

## Surfaces

- **Canvas** `#F3F0E9` is the page background.
- **Card** `#FCFBF8` is a raised card with a soft shadow, radius 26, continuous corners.
- **Sunken** `#EAE6DC` is for secondary or inset panels.
- **Night** `#0A1D1C` / `#123230` is for premium, paywall, scanner and "did you know" moments.

## Primitives

`Screen` provides the collapsing large title, blur nav bar, optional hero, sticky footer and pull-to-refresh.

Everything else, grouped:

- **Containers:** `Card`, `ListGroup`/`ListRow` (iOS inset-grouped), `Section`, `Sheet` (bottom sheet)
- **Controls:** `Button`, `IconButton`, `SegmentedControl`, `Chip`/`ChipRow`, `SearchField`
- **Data display:** `ScoreGauge`, `ScoreBadge`, `ContributorBar`, `EvidenceMeter`, `Pill`, `ProductImage`
- **States:** `EmptyState`, `Skeleton`

## Motion

- Presses use a spring scale of 0.97 for cards and 0.96 for buttons, with a light haptic.
- Lists enter with `FadeInDown`, staggered 40–90ms.
- Gauges and bars fill over about 1s with ease-out-expo.
- The segmented control and tab indicator slide with a spring.

## Libraries

| Need | Library | Why |
|---|---|---|
| Animation | `react-native-reanimated` 4 | UI-thread animation, used by Shopify, Discord and Coinbase |
| Gestures | `react-native-gesture-handler` | Native gestures |
| Sheets | `@gorhom/bottom-sheet` 5 | De-facto standard; JS-only on top of Reanimated |
| Icons | `lucide-react-native` | Consistent 1.75px stroke family; tree-shaken SVG |
| Images | `expo-image` | Caching and transitions |
| Blur / gradient | `expo-blur`, `expo-linear-gradient` | Native materials |
| Haptics | `expo-haptics` | Tactile feedback on every press |

We deliberately skipped these for now:

- **Tamagui / gluestack:** they would mean a second styling system alongside `StyleSheet` for little gain at this size.
- **Skia:** SVG with Reanimated covers the gauges.
- **expo-symbols:** it needs a native rebuild.

Revisit Skia if we add animated charts or shader backgrounds.
