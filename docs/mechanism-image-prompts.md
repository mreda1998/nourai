# Elory — Research Board Illustration Prompts

Prompts for generating ingredient **research board** illustrations.
Each image is a multi-panel composition showing how an ingredient affects
its 3–4 most relevant bio-domains side-by-side — like a pinned research board
or atlas plate, not a single pathway diagram.

In the future, these will be integrated directly into the research agent:
`scripts/research_agent.py` will call the image generation API after synthesizing
each ingredient's `domain_effects`, selecting the top domains by evidence count
and calling `build_research_board_prompt(canonical_name, top_domain_effects)`.

---

## App Color Palette Reference

```
Background:  #E9E6DF  — warm bone/parchment (primary surface)
Card:        #F2F0EB  — lighter cream (elevated surface)
Ink:         #1C1C1C  — near-black (primary lines and text)
Ink muted:   #585754  — warm medium gray (secondary detail lines)
Forest:      #2F362F  — deep forest green (benefit / positive signal)
Sage:        #5C6E5C  — muted sage green (secondary positive)
Clay:        #8C6A54  — warm terracotta (moderate / caution)
Alert:       #A34E4E  — muted dusty red (risk / warning)
Bone dark:   #D6D3CC  — warm mid-tone gray (neutral / inactive)
```

---

## Research Board Concept

The image is a **single square illustration divided into 3–4 panels**, each
panel representing one bio-domain. Think of it as a page from a scientific
atlas or a cork board with small study plates pinned next to each other.

**Layout rules:**
- Each panel occupies roughly equal space (2×2 grid for 4 domains, or 3+1 row for 3)
- Panels are separated by a thin hairline or a small margin, not heavy borders
- Each panel contains a minimal diagram of the ingredient's effect in that domain
- No text labels inside any panel — pure iconographic/diagrammatic language
- A single color signal per panel: forest green for benefit, dusty red for risk,
  clay for neutral/mixed
- Overall background is parchment (#E9E6DF); panel backgrounds can be very slightly
  lighter (#F2F0EB) to create separation

**Visual tone:** Feels like four small plates from a scientific monograph laid out
together. Precise, quiet, editorial. Not a busy infographic.

---

## Base System Prompt (include in every call)

```
Multi-panel research board illustration. Warm cream parchment background
(#E9E6DF). Fine ink linework (#1C1C1C) at 1–2pt weight. Controlled flat
color fills limited to: forest green (#2F362F), sage green (#5C6E5C), warm
clay (#8C6A54), dusty red (#A34E4E), mid-gray (#D6D3CC). No photorealism.
No 3D rendering. No gradients. No typography, no text labels, no numbers
within the image. The illustration is divided into 3 or 4 equal panels by
thin hairline dividers. Each panel contains a self-contained minimal
scientific diagram of the ingredient's effect in one bio-domain. Panels
feel like individual atlas plates displayed together. Clean generous
whitespace within each panel. Style reference: high-end medical journal
meets Kinfolk magazine. Botanical-anatomical illustration tradition. 1:1
square format.
```

---

## Panel Iconographic Vocabulary

Use these visual shorthands consistently across ingredients:

| Bio-domain | Panel icon elements |
|---|---|
| **Metabolism** | Mitochondria cross-section, ATP hexagon, muscle fiber parallel lines, flame/energy symbol |
| **Cognition** | Neuron with dendrites, synapse gap, brain outline (top-down), NMDA receptor channel |
| **Sleep & Recovery** | Moon arc, sine wave (sleep stage), muscle repair symbol (two arrows rejoining), adrenal gland |
| **Gut & Microbiome** | Intestinal villus cross-section, bacterial rod shapes, tight-junction protein bridges |
| **Skin & Appearance** | Skin layer cross-section (3 stacked bands), collagen helix, cell nucleus, UV arrow |
| **Exposure Load** | Shield outline (protection), liver silhouette, arrow being deflected/reduced |

Direction signals:
- **Benefit** (forest green #2F362F): upward arrow, thickened/strengthened structure, fuller shape
- **Risk** (dusty red #A34E4E): downward arrow, crossed line, reduced/thinner element
- **Mixed / Neutral** (clay #8C6A54): horizontal double-arrow, partially filled shape

---

## Style Variants

Choose one variant per batch run to ensure visual consistency.

---

### Variant B — Muted Wash (recommended default)

> Scientific multi-panel atlas illustration. Warm cream parchment background.
> Ink linework with controlled flat fills. Forest green for benefit, dusty red
> for risk, clay for mixed. Four panels separated by hairline dividers. Each
> panel shows one bio-domain effect with a minimal two-to-three element diagram.
> Style: vintage anatomy atlas with Scandinavian restraint. No text. 1:1 square.

**Best for:** ingredients with mostly positive bio-domain profile (supplements, nutrients)

---

### Variant A — Pure Line Art (most minimal)

> Minimal ink line research board. Four equal panels on parchment. Hairline
> strokes (#1C1C1C) only. No fill colors — line weight variation communicates
> direction (thicker lines = stronger/positive effect, thinner/dashed = inhibition
> or reduction). Each panel: two or three key shapes connected by a directional
> arrow. Negative space is intentional. Think: four plates from a 1960s
> scientific monograph. No text. No shading. 1:1 square.

**Best for:** ingredients with clear directional signals, clean pathways

---

### Variant C — Botanical Cross-Section

> Vintage botanical atlas style, four panels. Warm parchment background.
> Fine stippling and hatching in near-black for texture. Key structures filled
> with sage (#5C6E5C) or clay (#8C6A54). Panels feel like cross-section plates
> from a 19th-century natural history publication, but the subjects are
> biological processes. Generous margins within each panel. 1:1 square.

**Best for:** ingredients with structural/cellular mechanisms (fatty acids, probiotics)

---

## Example Full Prompts (ready to paste)

These combine the base system prompt + variant + subject. Copy-paste into
Midjourney, DALL-E 3, Ideogram, or similar.

---

### Creatine — 4-Domain Research Board (Variant B)

Top domains: Metabolism · Cognition · Sleep & Recovery · Gut & Microbiome (weak)

```
Multi-panel research board illustration. Warm cream parchment background
(#E9E6DF). Fine ink linework (#1C1C1C). Controlled flat fills: forest green
(#2F362F) for benefit panels, clay (#8C6A54) for neutral. Four equal panels
divided by thin hairlines. No text. Style: vintage anatomy atlas, Scandinavian
restraint. 1:1 square format.

Panel 1 — Metabolism (top left): A creatine phosphate molecule donating a
phosphate group to ADP, regenerating ATP inside a muscle fiber. Muscle fiber
suggested by faint parallel lines. ATP highlighted in forest green.

Panel 2 — Cognition (top right): A neuron with a highlighted synapse gap.
Creatine molecules (simplified hexagonal shapes) present in the synaptic
region, supporting energy availability. Mild forest green accent on the
synaptic terminal.

Panel 3 — Sleep & Recovery (bottom left): Two muscle fiber cross-sections:
one fragmented (pre-recovery), one repaired and rejoined (post-recovery).
Forest green on the repaired fiber. A small circular clock arc suggesting
time-dependent repair.

Panel 4 — Skin & Appearance (bottom right): A simplified skin cross-section
with three horizontal bands. The uppermost band shows faint cell division
arrows. Clay (#8C6A54) coloring — indicating limited/indirect effect.
```

---

### Magnesium — 4-Domain Research Board (Variant B)

Top domains: Cognition · Sleep & Recovery · Metabolism · Gut & Microbiome

```
Multi-panel research board illustration. Warm cream parchment background
(#E9E6DF). Fine ink linework (#1C1C1C). Flat fills: forest green (#2F362F)
for benefit, dusty red (#A34E4E) for inhibitory step shown clearly.
Four equal panels separated by hairline dividers. No text. No gradients. 1:1 square.

Panel 1 — Cognition (top left): Magnesium ion (small circle labeled with
"Mg²⁺" in pure line, no other text) lodged in an NMDA receptor channel
cross-section. Receptor channel spans a lipid bilayer. A glutamate molecule
approaching from outside. Mg²⁺ blocks the channel — the block element
shown with a perpendicular bar (classical inhibition arrow). Forest green on
the controlled-activation outcome arrow.

Panel 2 — Sleep & Recovery (top right): A stylized HPA axis: brain outline
at top, adrenal gland at bottom, connected by a dashed feedback arc.
Magnesium molecule acts on the cortisol output arrow, reducing its weight
visually. Reduced cortisol represented by a smaller, thinner arrow in clay.
Moon arc in the upper corner suggesting night/sleep effect.

Panel 3 — Metabolism (bottom left): Mitochondria cross-section showing
enzyme activation. Magnesium molecule associated with ATP synthase structure.
Forest green highlighting ATP output.

Panel 4 — Gut & Microbiome (bottom right): Intestinal villus cross-section
with tight-junction bridges between enterocytes. Magnesium mineral crystals
passing through the epithelium — transcellular absorption pathway suggested
by directional arrows through cells. Clay coloring — moderate effect.
```

---

### Omega-3 (EPA/DHA) — 4-Domain Research Board (Variant C)

Top domains: Gut & Microbiome · Skin & Appearance · Cognition · Sleep & Recovery

```
Vintage botanical atlas style, four panels. Warm parchment background
(#E9E6DF). Fine stippling and hatching in near-black (#1C1C1C). Key
structures filled with sage (#5C6E5C) for benefit, clay (#8C6A54) for
mixed. Four equal panels, hairline dividers. No text. 1:1 square format.
Style: 19th-century natural history atlas, but molecular subject matter.

Panel 1 — Gut & Microbiome (top left): Cross-section of intestinal
epithelium. EPA/DHA fatty acid chains (elongated sinuous shapes, sage green)
incorporating into the phospholipid bilayer of enterocytes. Tight junctions
strengthened — shown as thicker connector bridges. Reduced inflammatory
signal arrow (thinner, clay colored) leaving the epithelium.

Panel 2 — Skin & Appearance (top right): Skin layer cross-section with
three horizontal bands. EPA/DHA molecules incorporating into the middle
(dermal) layer membrane structures. A sun-ray arrow arriving from above
meets a protective shield shape — reduced UV-induced oxidative signal.
Sage green on reinforced membrane structures.

Panel 3 — Cognition (bottom left): Neuron with prominent dendritic branches.
DHA molecules shown in the membrane of the neuron (sinuous lines along
membrane surface). Synaptic terminal with enhanced vesicle shapes suggesting
improved neurotransmitter dynamics. Forest green on synaptic output.

Panel 4 — Sleep & Recovery (bottom right): A muscle cross-section with
omega-3 molecules incorporated into cell membranes. Reduced prostaglandin
signal (smaller arrow, clay colored) leaving the muscle tissue. Recovery
arc symbol (two curved arrows rejoining). Mild forest green on the
anti-inflammatory outcome.
```

---

### Vitamin D — 4-Domain Research Board (Variant B)

Top domains: Metabolism · Gut & Microbiome · Skin & Appearance · Cognition

```
Multi-panel research board illustration. Warm cream parchment background
(#E9E6DF). Fine ink linework. Controlled flat fills: forest green for
activation/benefit steps, sage for intermediate. Four equal panels, hairline
dividers. No text. Diagrammatic clarity. 1:1 square.

Panel 1 — Metabolism (top left): Simplified cascade: sun-ray shape → liver
silhouette → kidney silhouette → calcitriol molecule → calcium crystal
shapes being absorbed. Each step connected by a directional arrow. Forest
green on final calcium absorption outcome. A small bone outline as the
downstream benefit.

Panel 2 — Gut & Microbiome (top right): Intestinal villus cross-section.
VDR receptor shape on enterocyte surface. Calcium transport protein bridges
(forest green) appearing after VDR activation. Calcium crystals passing
through. Clean directional flow top to bottom.

Panel 3 — Skin & Appearance (bottom left): Skin cross-section. A sun-ray
source at top. Vitamin D3 molecule (hexagonal ring structure simplified)
generated in the epidermal layer. Downward activation arrows reaching
keratinocyte nuclei (small oval shapes) in the dermal layer. Sage green.

Panel 4 — Cognition (bottom right): Brain outline (top-down view).
VDR receptor sites shown as small triangular markers at multiple brain
region positions. A Vitamin D molecule in the center sending activation
lines outward to each marker. Forest green on the receptor activation state.
Clay coloring on the overall panel to indicate moderate/indirect evidence.
```

---

### Ashwagandha — 3-Domain Research Board (Variant A)

Top domains: Sleep & Recovery · Cognition · Metabolism

```
Minimal ink line research board. Three equal vertical panels on parchment
(#E9E6DF). Hairline strokes (#1C1C1C) only. No fill colors — line weight
variation communicates direction. No text. Three plates from a 1960s
scientific monograph. 1:1 square.

Panel 1 — Sleep & Recovery (left): Stylized HPA axis — hypothalamus →
pituitary → adrenal gland (simple silhouettes connected by lines). A
cortisol output arrow at the bottom, drawn thin and reduced, with a
perpendicular inhibition bar. Moon arc above. The feedback loop (dashed
arc returning upward) is thicker — suggesting restored feedback sensitivity.

Panel 2 — Cognition (center): Neuron with dendritic arbor. An anxiety-
related excitatory signal arrow arrives at the cell body and is partially
blocked (crossed reduction mark, hairline weight). GABA receptor shape
on the membrane — shown as more available/open. Clean negative space
around the neuron suggesting calm neural environment.

Panel 3 — Metabolism (right): Adrenal gland silhouette with a cortisol
molecule. A downward-sloping arrow from cortisol to a muscle fiber (parallel
lines). The cortisol-muscle interaction arrow is thin and dashed —
suggesting reduced catabolic breakdown. A small recovery arc (two curves
rejoining) below the muscle fiber.
```

---

### Probiotics (Lactobacillus) — 4-Domain Research Board (Variant C)

Top domains: Gut & Microbiome · Skin & Appearance · Cognition · Metabolism

```
Vintage botanical atlas style, four panels. Warm parchment (#E9E6DF).
Stippling and hatching in near-black. Sage (#5C6E5C) for probiotic
elements, forest green for barrier/benefit outcomes, clay for pathogenic
signals being reduced. No text. 1:1 square.

Panel 1 — Gut & Microbiome (top left): Cross-section of intestinal
epithelium. Lactobacillus rods (elongated oval shapes, sage) adhering
to mucosal surface. Tight-junction connector bridges between enterocytes
shown thick and reinforced (forest green). Pathogenic bacteria shapes
(smaller, clay) being excluded from the epithelial surface.

Panel 2 — Skin & Appearance (top right): Gut-skin axis suggested by a
dotted line from intestinal structure to a skin cross-section. Skin layers
showing reduced inflammatory infiltrate (fewer small round cell shapes,
clay colored). The dermal layer barrier structure (middle band) shown more
intact with sage green fill.

Panel 3 — Cognition (bottom left): Gut-brain axis: small intestinal
outline connected by a dotted vagus nerve line to a brain outline. Serotonin
precursor molecules (simplified shapes, sage green) traveling the pathway
upward. Brain shows a calm, softened outline compared to a faint dashed
stressed state behind it.

Panel 4 — Metabolism (bottom right): Short-chain fatty acid (SCFA) molecules
produced by probiotic fermentation — shown as simple carbon-chain shapes
(sage) exiting the epithelium into the portal vein (simplified vessel).
Liver silhouette receiving the SCFAs. Forest green on the metabolic
activation outcome arrow.
```

---

## Parameters for Different Models

| Model | Format guidance |
|-------|----------------|
| DALL-E 3 | Paste full prompt. Add: "Do not add any text, letters, numbers, or labels inside the image." at the end |
| Midjourney | Append `--style raw --ar 1:1 --v 6 --no text, labels, typography` |
| Ideogram | Use "Design" mode, style "Illustration". Add "no text" to negative |
| Stable Diffusion | Use as positive prompt; add `photorealistic, photo, text, watermark, labels, typography` to negative |
| Flux (via API) | Paste as-is; add system note: "No text or labels in image" |

---

## Naming Convention for Storage

When saving images to Supabase Storage:

```
/ingredient-mechanisms/{ingredient_canonical_name_slug}.png

Examples:
  /ingredient-mechanisms/creatine.png
  /ingredient-mechanisms/magnesium.png
  /ingredient-mechanisms/omega-3-fatty-acids.png
  /ingredient-mechanisms/vitamin-d3.png
  /ingredient-mechanisms/ashwagandha.png
```

Field on the ingredient model: `mechanism_image_url` (nullable text)
Set after generation: `UPDATE ingredients SET mechanism_image_url = '...' WHERE canonical_name = '...'`

---

## Research Agent Integration (future Step 6)

In `scripts/research_agent.py`, after `domain_effects` are computed (current Step 5):

```python
# Step 6 (future): Generate research board illustration
TOP_DOMAINS_COUNT = 4

if ingredient.domain_effects and not ingredient.mechanism_image_url:
    # Pick top domains by evidence count
    ranked_domains = sorted(
        [(slug, data) for slug, data in ingredient.domain_effects.items()
         if data['evidence_count'] > 0],
        key=lambda x: x[1]['evidence_count'],
        reverse=True
    )[:TOP_DOMAINS_COUNT]

    if ranked_domains:
        prompt = build_research_board_prompt(
            ingredient.canonical_name,
            ranked_domains,          # [(slug, {direction, confidence, top_finding}), ...]
            ingredient.mechanism,    # mechanism text for additional context
        )
        image_url = await generate_and_upload_image(prompt)
        ingredient.mechanism_image_url = image_url
```

The `build_research_board_prompt()` function should:
1. Take `canonical_name` + `ranked_domain_effects` (top 3–4) + `mechanism_summary`
2. Start with the Base System Prompt above
3. Generate one panel description per top domain using the iconographic vocabulary table
4. Color-code each panel by domain direction (forest green / dusty red / clay)
5. Use `top_finding` from each domain effect as subject matter context
6. Return the full prompt string ready for the image API

The number of panels (3 or 4) should be determined by how many domains have
`evidence_count >= 2`. Domains with only 1 study use clay coloring only.
