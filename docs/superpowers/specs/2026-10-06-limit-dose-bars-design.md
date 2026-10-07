# Limit & dose bars + stacked summary cards — design

Date: 2026-10-06 · Status: implemented on `claude/ask-elory-competitor-analysis-cda6e4`

## Why

Competitor review of Ask Baseline (57 screens, `competitiors/ask-baseline/`) and Oasis. What users liked:
each nutrient shown *against a daily limit* on a bar whose colour at the marker is the verdict, and a
product page made of stacked summary cards that read as verdicts before anything is opened.

Where Baseline is weak, and what we do differently:
- Their score contradicts their bars (Larabar "Try this instead" at 76% of the sugar limit). Ours: every
  bar is a server-computed `Measure`, so the score can consume the same numbers later.
- Their references are vague ("general daily reference") and wrong (AHA added-sugar limit applied to
  total sugar). Ours: every number is cited behind the (i).
- They have no supplement dose view despite selling "underdosed". Ours: the same component does doses.

## Decisions (agreed in conversation)

1. **One component for nutrients and supplement doses** (plus lab contaminants, whose thresholds already exist).
2. **General, cited references** — not personalised.
   - Nutrients: FDA Daily Values. Total sugars: EU Reference Intake 90 g (FDA has no total-sugar DV).
     Added sugars: FDA 50 g, when the label lists them.
   - Verdict bands: FDA 5%/20% rule (limits: ≤5% low, ≥20% high; goals: ≥10% good source, ≥20% high).
   - Vitamins & minerals: FDA DV with the NIH ODS upper limit as the ceiling.
   - Other actives: the studied range from the research library ("studied", not "effective").
   - IU converts only for vitamin D (40 IU = 1 mcg). Vitamin A/E IU get no bar — form-dependent.
3. **Stacked summary cards** replace the Ingredients / Nutrition / Details tabs.
4. Scope adds **additive tiers** (Avoid / Watch, library-matched ingredients only) and a **processing bar** (NOVA).
   Out of scope: score-hero restyle, category percentile, better-alternative swap.

## Architecture

- `backend-nourai/app/core/references.py` — cited reference table (nutrients, micronutrient DV/UL, NOVA labels).
- `backend-nourai/app/services/measures.py` — pure functions: parsing, unit conversion, nutrition panel,
  dose, contaminant, processing, additive tiers. Tested in `tests/test_measures.py`.
- `backend-nourai/app/schemas/measure.py` — `Measure` (value, unit, percent, position, band, tone, verdict,
  sentence, panel label, scale with ticks/zones, sources).
- Product detail response gains `nutrition`, `doses`, `additives`, `processing`; lab observations gain
  `measure`. Legacy `ingredients` nutrient rows stay for older builds.
- App: `MeasureBar` (ramp revealed up to the value, stops anchored to the FDA bands; zones for doses and
  contaminants), `MeasureRow` (collapsed verdict row → expanded bar + cited sentence), `SummaryCard`;
  sections in `components/product/ProductSections.tsx`.

## Visual language — an instrument, not a slider (revision, same day)

The first build copied Baseline's look (gradient track, black pill thumb, 0/half/max labels, grey panel,
uppercase overline + ⓘ, value dot). After a Mobbin review (Superpower, Visible, Tempo, Bevel, Noom/Me+
rulers; no app shows a supplement dose against DV/UL), the measures were redrawn in Elory's own idiom:

- **Nutrients: twenty 5% cells** filled in the verdict colour; the FDA 5%/20% cut-offs fall on cell edges
  and are notched. A serif reading ("68% of daily limit") sits over the end of the fill; legend
  "Low ≤5% · high ≥20%" and "100% = 2,300 mg".
- **No thumb** — nothing looks draggable.
- **Servings to the reference** (server `servings_note`): "1½ servings reach the daily sodium limit",
  set in serif italic. Per-serving foods only; skipped for neutral references.
- **Doses and contaminants: a ruler** with fine ticks, the good range bracketed ├──┤, the upper limit
  ruled in clay, an ink needle with a serif reading; reference values coloured by meaning; a legend
  names the bracket and the rule (server `scale.band_label` / `scale.limit_label`).
- **Footnotes instead of the grey panel and ⓘ**: the expanded row keeps the card surface with a margin
  rule in the verdict colour; the sentence carries ¹,² markers and the sources are listed and tappable.
- **Collapsed rows** show the share as a small tinted tag ("68%") instead of a dot.
- **Processing**: four NOVA cells in the same cell language.

### Trimmed (same day, after review)

Too much was said at once ("68%" appeared three times). Expanded rows now show only the instrument, the
servings line (foods) and one source line that opens the full citation sheet; the long sentence is the
bar's accessibility label. Rulers drop the serif reading and legend — the limit is named on its own
label ("4,000 IU limit") and "0" is never labelled. Processing drops the scale entirely: one plain
sentence on what the NOVA group means, with the source.

## Deviation from the agreed design

Dose references were going to be new numeric columns on `ingredients` (migration). The shared local
database is at migration 019 from an unmerged branch, so a new migration from this branch would collide.
References live in `app/core/references.py` instead and studied ranges are parsed from the existing
`typical_dose_range` text at request time. Move them to columns once the identity branch lands.

## Data reality (found while building)

- Supplements: 11 of 25,034 supplement ingredient rows have an amount → dose bars show on ~2 products.
- Food: nutrients came from a name-matched USDA backfill, per 100 g, no serving size, no NOVA.
  `scripts/backfill_off_details.py` pulls NOVA, serving and label values from Open Food Facts.
- Unmatched ingredients default to `watch` at ingestion, which inflated "Flagged" to every unmatched
  ingredient. The screen now counts only library matches.
- The USDA backfill overwrote `extra_data.source`, so OFF-sourced products lost their ODbL attribution card.

## Follow-ups

- Spec B: catalog coverage (NIH DSLD for supplements with per-serving amounts, USDA Branded Foods, bulk OFF
  import, synchronous first scan).
- Let the score consume measures (Ritual scores 90 while its omega-3 is a third of the studied range).
- Restore OFF attribution on products the USDA backfill touched.
