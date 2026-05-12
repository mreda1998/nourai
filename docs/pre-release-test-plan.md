# NourAI — Pre-Release Testing Plan
**Week of May 11–17, 2026**

Each day has a specific set of products to add and a checklist of features to verify. By Day 7 the full stack will stress-test every screen in the app.

---

## Product Legend

| Abbrev | Product | Category | Expected Grade | Key Ingredients |
|--------|---------|----------|---------------|-----------------|
| **P1** | Thorne Creatine Monohydrate | Supplement | A | Creatine Monohydrate |
| **P2** | Nature Made Magnesium Glycinate | Supplement | A | Magnesium Glycinate |
| **P3** | Garden of Life Raw Probiotics | Supplement | A | Lactobacillus acidophilus, Bifidobacterium |
| **P4** | Nordic Naturals Omega-3 DHA | Supplement | A | Omega-3 DHA, EPA |
| **P5** | Jarrow Ashwagandha (KSM-66) | Supplement | A | Ashwagandha Extract |
| **P6** | Life Extension L-Theanine | Supplement | B | L-Theanine |
| **P7** | Vital Proteins Collagen Peptides | Supplement | B | Collagen Peptides, Vitamin C |
| **P8** | Melatonin 1mg (any brand) | OTC | A | Melatonin |
| **P9** | Advil Ibuprofen 200mg | OTC | C | Ibuprofen |
| **P10** | CeraVe Moisturizing Cream | Cosmetic | A | Ceramides, Hyaluronic Acid, Niacinamide |
| **P11** | The Ordinary Ascorbic Acid 8% + AHA | Cosmetic | A | Vitamin C (L-ascorbic acid), AHAs |
| **P12** | Neutrogena Ultra Sheer SPF 50 | Cosmetic | B | Homosalate, Avobenzone, Octocrylene |
| **P13** | La Roche-Posay Retinol B3 Serum | Cosmetic | A | Retinol, Niacinamide |
| **P14** | AXE Dark Temptation Body Wash | Cosmetic | D | Synthetic Fragrance, SLS, Parabens |
| **P15** | Chobani Plain Greek Yogurt | Food | A | Live Active Cultures, Protein |
| **P16** | Monster Energy Original (Green) | Food | D | Caffeine (160mg), Taurine, High Fructose Corn Syrup, Seed Oils |
| **P17** | Kind Bar Almond & Coconut | Food | B | Almonds, Coconut, Chicory Root Fiber |
| **P18** | Krave Beef Jerky | Food | C | Sodium Nitrate, Sugar, Seed Oils (Soybean) |

---

## Day 1 — Monday May 11
**Theme: Build the sleep + gut foundation**

### Add these products
1. **P3** Garden of Life Raw Probiotics (Supplement)
2. **P2** Nature Made Magnesium Glycinate (Supplement)
3. **P8** Melatonin 1mg (OTC)
4. **P15** Chobani Plain Greek Yogurt (Food)

### How to add
- Search tab → type each product name → tap → "Add to Stack"
- Or Scan tab → scan barcode if you have the physical product

### Features to verify today

**Stack tab**
- [ ] All 4 products appear in the correct slot groups: Supplements / Nutrition / Treatment
- [ ] Health Domains card is visible — check that **Gut & Digestive** and **Sleep & Recovery** show "Supporting" (both have high-grade products now)
- [ ] **Inflammation & Immune** should read "Clean" (no bad products yet)
- [ ] Synergy card (conflict map preview) is visible
- [ ] Filter chips work: All / Supplements / Food / Meds each filters correctly
- [ ] Swipe left on a product → "Remove" appears; tap to remove, then re-add it

**Home tab**
- [ ] Composite Score ring is non-zero (reflects today's scans)
- [ ] Ingredient cloud shows: *probiotics, magnesium glycinate, melatonin, live cultures*

**Product detail** (tap any product from Stack)
- [ ] Product detail screen loads with ingredient list
- [ ] Tapping an ingredient with `ingredient_id` navigates to Ingredient deep dive
- [ ] Ingredient deep dive shows belief vs. reality section

**Domain pages** (tap each domain row in Stack)
- [ ] **Gut & Digestive** — shows "Supporting"; key ingredients section lists Lactobacillus, Inulin/FOS
- [ ] **Sleep & Recovery** — shows "Supporting"; recommendation about magnesium timing
- [ ] **Inflammation & Immune** — shows "Clean"

---

## Day 2 — Tuesday May 12
**Theme: Skin stack + first cosmetic coverage**

### Add these products
5. **P10** CeraVe Moisturizing Cream (Cosmetic)
6. **P11** The Ordinary Vitamin C serum (Cosmetic)
7. **P12** Neutrogena SPF 50 (Cosmetic)
8. **P7** Vital Proteins Collagen Peptides (Supplement)

### Features to verify today

**Stack tab**
- [ ] "Topical" slot group appears with the 3 cosmetics
- [ ] **Skin & Appearance** domain score rises toward "Supporting"
- [ ] **Supplement** slot now shows both Magnesium + Collagen Peptides

**Domain pages**
- [ ] **Skin & Appearance** — opens correctly; key ingredients show Retinol, Niacinamide, Hyaluronic Acid, Vitamin C
- [ ] Timing note reads: *"Apply vitamin C and SPF in the morning…"*
- [ ] Evidence highlight card is shown (Retinol RCT quote)

**Search tab**
- [ ] Search "ceramide" → ingredient or product results appear
- [ ] Search "vitamin c" → returns multiple relevant products
- [ ] Category filter chips (Food / Cosmetics / Supplements / OTC) filter discovery list correctly

**History tab**
- [ ] All 8 products scanned so far appear in scan history
- [ ] Calendar strip shows dots/marks on Day 1 and Day 2

---

## Day 3 — Wednesday May 13
**Theme: Energy + cognitive stack, first caffeine exposure**

### Add these products
9. **P1** Thorne Creatine Monohydrate (Supplement)
10. **P4** Nordic Naturals Omega-3 DHA (Supplement)
11. **P6** Life Extension L-Theanine (Supplement)
12. **P17** Kind Bar Almond & Coconut (Food)

### Features to verify today

**Stack tab**
- [ ] **Energy & Metabolism** domain rises — Creatine is grade A, high relevance
- [ ] **Cognitive & Mental** domain rises — Omega-3 DHA is grade A
- [ ] 3 domains should now read "Supporting": Gut, Sleep, Energy, Skin
- [ ] Radar/domain bars look visually balanced

**Circadian Protocol** (Atelier → Circadian Protocol)
- [ ] Screen loads without crash
- [ ] If backend has timing data: schedule rows show for Magnesium (22:00), Creatine (flexible), Omega-3 (morning with fat), L-Theanine (morning)
- [ ] 24h Timeline SVG renders with cortisol + melatonin curves
- [ ] Phase markers visible (Cortisol peak 06:00, Temp peak 18:00, Melatonin onset 22:00)
- [ ] Evidence dots display next to each ingredient row
- [ ] Stack synergy tag (✦) shown where applicable
- [ ] If empty_reason = "timing_data_pending": pending state message shows correctly

**Evidence Pulse** (Atelier → Evidence Pulse)
- [ ] Loads and shows article count: "X signals across ingredients in your stack"
- [ ] Article cards show: ingredient label with icon, headline, pull quote excerpt, journal + "Read brief →"
- [ ] Evidence dots correct per article
- [ ] Tone colors: sage (green), sand (warm), alert (red) used appropriately

**Ask Elory** (Atelier → Ask Elory)
- [ ] Chat opens correctly
- [ ] Ask: *"What time should I take my creatine and L-Theanine?"*
- [ ] Ask: *"Are there any conflicts in my current stack?"*
- [ ] Response is coherent and references actual stack contents

---

## Day 4 — Thursday May 14
**Theme: Introduce flag products — test alert states**

### Add these products
13. **P14** AXE Body Wash (Cosmetic) ← **Grade D — triggers Inflammation flag**
14. **P9** Advil Ibuprofen (OTC) ← **Grade C**
15. **P5** Jarrow Ashwagandha KSM-66 (Supplement)

### Features to verify today

**Stack tab — Flag states**
- [ ] AXE Body Wash shows a **red "Flag"** tag in the product row
- [ ] Header subtitle updates: "X active · X synergies · **1 flag**"
- [ ] **Inflammation & Immune** domain score drops from "Clean" → "Some flags"
- [ ] SpectrumBar for Inflammation turns to alert tone (red indicator)

**Conflict Map** (Atelier → Conflict Map, or tap Synergy Card in Stack)
- [ ] Screen loads without crash
- [ ] If nodes are populated: ForceGraph SVG renders with circular node layout
- [ ] Synergy edges (solid line) visible — e.g. L-Theanine ↔ Creatine, Ashwagandha ↔ Melatonin
- [ ] Competition edges (dashed line) visible — e.g. Ibuprofen ↔ Magnesium absorption
- [ ] Node dot colors: sage = accent, red = alert, sand = neutral
- [ ] "What this means" section: note rows show synergy/compete tags, pair names, explanatory text
- [ ] Legend (Synergy / Competes) renders correctly

**Domain deep dive — Inflammation**
- [ ] **Inflammation & Immune** page shows "Some flags" score
- [ ] Key ingredients listed: NAC, Glutathione, Milk Thistle
- [ ] Recommendation: "Switch to fragrance-free formulas…"

---

## Day 5 — Friday May 15
**Theme: Ingredient overlap + heavy exposure load**

### Add these products
16. **P16** Monster Energy Original (Food) ← **Grade D — heavy exposure**
17. **P13** La Roche-Posay Retinol B3 Serum (Cosmetic)
18. **P18** Krave Beef Jerky (Food) ← **Grade C**

### Features to verify today

**Overlap detection** (Stack tab)
> Monster Energy contains **Caffeine**. If any other product in your stack (e.g., a pre-workout or supplement) also contains caffeine, the overlap card will appear.
> 
> ⚠️ If no overlap triggers: edit this day to also add a **Caffeine supplement or pre-workout** that shares an ingredient with Monster.

- [ ] **"Overlap Detected"** section appears above product list
- [ ] Overlapping ingredient tags (red) shown — should include *caffeine*, *niacinamide* (between P10, P13, P7), *vitamin c*
- [ ] Count of overlapping sources is correct

**Exposure Ledger** (Atelier → Exposure Ledger)
- [ ] Screen loads without crash
- [ ] 14-day stacked bar chart renders — bars colored: alert/sand/muted
- [ ] Chart legend shows: High load / Moderate / Low
- [ ] **"By category · today"** section shows all 6 categories:
  - Microplastics (from Monster / Beef Jerky packaging/ingredients)
  - Synthetic fragrance (from AXE)
  - Added caffeine (from Monster — should be high load + alert)
  - Seed oils (from Monster, Beef Jerky)
  - Emulsifiers
  - Added sugars (from Monster — should show delta improvement pending)
- [ ] Load bars fill correctly (alert bars red, others sand/muted)
- [ ] Delta values (+8%, -12% etc.) display in alert/sage colors

**Skin domain with Retinol**
- [ ] Skin domain rises with P13 addition (grade A retinol serum)
- [ ] Tap **Skin & Appearance** domain → opens domain detail
- [ ] P13 (Retinol) matches key ingredient "Retinol" in domain's ingredient list

---

## Day 6 — Saturday May 16
**Theme: Log a meal, test meal input + remaining domain**

### Actions
1. **Log a meal** via Stack tab → "+ Log Meal" button
   - Describe: *"Oatmeal with blueberries, almond butter, and a cup of green tea"*
2. **Add P16** is already in stack — skip if duplicate
3. Navigate through all **Profile Hub** health screens

### Features to verify today

**Meal input sheet**
- [ ] Sheet opens from Stack header "+ Log Meal" button
- [ ] Type a meal description and submit
- [ ] Recognized foods appear (e.g., Oats, Blueberries, Almond Butter, Green Tea)
- [ ] Confirm → foods appear as items in the "Nutrition" slot group
- [ ] Home composite score updates

**Profile Hub** (Profile tab → top section or Profile Hub link)
- [ ] Hub screen loads with 6 domain tiles (Skin, Gut, Fitness, Sleep, Hair, Hormonal)
- [ ] Tap **Skin Health** → `/health/skin` screen loads; Dark Atelier design renders
- [ ] Tap **Gut Health** → `/health/gut` loads
- [ ] Tap **Fitness** → `/health/fitness` loads
- [ ] Tap **Sleep** → `/health/sleep` loads
- [ ] All screens have consistent dark Atelier styling

**Settings screens**
- [ ] Profile → Settings gear → **Account** screen loads
- [ ] **Subscription** screen loads (shows premium status)
- [ ] **Notifications** screen loads
- [ ] **Privacy** screen loads
- [ ] **About** screen loads

**Onboarding profile edit** (if accessible)
- [ ] Edit Health Profile → fields pre-populated with onboarding answers
- [ ] Chronotype selection visible (used by Circadian Protocol)

---

## Day 7 — Sunday May 17
**Final audit — Full feature sweep**

### No new products today. Use the full stack built over the week.

### Complete Feature Checklist

**Home tab**
- [ ] Composite Score ring shows a meaningful value (40–80 range given mixed stack)
- [ ] Newsletter card renders (dark ink bg, serif italic headline, author + arrow)
- [ ] Ingredient cloud shows 8–12 unique ingredients
- [ ] Ingredient cloud: flagged ingredients (from grade D products) appear in alert color

**Stack tab — all states**
- [ ] All 6 domain bars visible with varied scores
- [ ] Energy: "Supporting", Sleep: "Supporting", Skin: "Supporting", Gut: "Supporting"
- [ ] Inflammation: "Some flags" (due to AXE + Monster)
- [ ] Flag count in subtitle = 2 (AXE + Monster)
- [ ] Synergy card always visible above domains
- [ ] Filter chips: each category filters correctly
- [ ] Swipe-to-remove works without crash

**Conflict Map — full stress test**
- [ ] Stack now has 15+ products — ensure graph doesn't crash
- [ ] All active ingredient nodes render in circle layout
- [ ] Synergy edges (solid) and compete edges (dashed) both visible
- [ ] Notes section scrolls and all note rows render

**Circadian Protocol — full schedule**
- [ ] All supplement timing rows display
- [ ] Morning cluster: Omega-3 DHA, Collagen Peptides, Creatine, Vitamin C serum
- [ ] Evening cluster: Magnesium Glycinate, L-Theanine, Ashwagandha, Melatonin
- [ ] Timeline SVG dots placed at correct x-positions for each time
- [ ] Synergy tags (✦) appear on synergistic pairs

**Evidence Pulse — full feed**
- [ ] 8–10 articles shown (from Omega-3, Creatine, Magnesium, Ashwagandha, Retinol)
- [ ] Each article: ingredient label, headline, excerpt quote, journal, "Read brief →"
- [ ] Tone colors varied across articles

**Exposure Ledger — 14-day chart**
- [ ] Bar chart renders all 14 columns with stacked segments
- [ ] Today's column visually distinct (last bar)
- [ ] All 6 exposure categories shown with load bars

**Peptides screen** (Atelier → Peptides)
- [ ] Screen loads, search bar visible
- [ ] Peptide list renders (BPC-157, TB-500, GHK-Cu etc.)
- [ ] Filter chips: All / FDA Approved / Research Chemical / WADA Safe
- [ ] Tap a peptide → detail view loads
- [ ] FDA status badge + WADA badge displayed
- [ ] Regulatory status, admin routes, cycle protocols shown

**Ask Elory — comprehensive**
- [ ] Ask: *"Summarise my full stack and flag any concerns"*
- [ ] Ask: *"What's the optimal timing for all my supplements?"*
- [ ] Ask: *"Is it safe to take ibuprofen while on creatine?"*
- [ ] Responses are accurate and reference your actual stack

**Atelier hub** (Atelier main screen)
- [ ] All 6 feature cards render: Ask Elory, Circadian, Conflict Map, Exposure Ledger, Evidence Pulse, Peptides
- [ ] Each card navigates to correct screen

**Auth & settings**
- [ ] Log out → app clears state → shows auth screen
- [ ] Log back in → stack re-hydrates from server (products persist)
- [ ] All settings screens accessible without crash

---

## Summary: What Each Feature Requires

| Feature | Minimum Products Needed | Day Unlocked |
|---------|------------------------|--------------|
| Health Domains | 2+ products across categories | Day 1 |
| Domain Detail pages | Any product in that domain | Day 1 |
| Circadian Protocol | 3+ supplements with timing | Day 3 |
| Evidence Pulse | Any products with researched ingredients | Day 3 |
| Conflict Map | 4+ supplements with known interactions | Day 4 |
| Exposure Ledger | Products with synthetic additives | Day 4–5 |
| Overlap Detection | 2 products sharing an ingredient | Day 5 |
| Flag State | 1 Grade D product | Day 4 |
| Meal Input | Just press "+ Log Meal" | Day 6 |
| Peptides | No stack needed (static + API) | Any day |
| Ask Elory | Any stack | Any day |

---

## Notes

- **Circadian Protocol empty state**: If backend returns `empty_reason: "timing_data_pending"`, that's expected and the pending message should display — still verify the layout doesn't break.
- **Exposure Ledger**: Currently uses hardcoded chart data for the 14-day bars; the "by category" section will reflect actual stack. Both should render cleanly.
- **Ingredient deep dives**: After Day 1–3, test tapping ingredients on the product detail screen. Only ingredients with a resolved `ingredient_id` FK navigate to the deep dive — others should gracefully do nothing.
- **Grade D products**: AXE Body Wash and Monster Energy are chosen specifically to stress-test the alert + exposure systems. If the app grades them differently than expected, that itself is a finding worth noting.
