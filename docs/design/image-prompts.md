# Elory — image generation prompts

Every editorial image in the app lives in one registry:
`nourai/constants/imagery.ts`. All slots currently point at
`assets/images/elory-architecture-hero.png`. To swap one in:

1. Generate the image with the prompt below.
2. Save it to `nourai/assets/images/<filename>` (JPG, ~80% quality, under 600 KB).
3. Change that slot's `require()` in `constants/imagery.ts`.

## The world: Dakhla

Every image lives in the same place, the Dakhla peninsula on the Atlantic
edge of the Sahara:

- pale gold dunes running straight into a shallow turquoise lagoon
- wide tidal flats that mirror the sky
- wind-carved sand ridges
- a thin white line of Atlantic surf
- enormous, empty horizons

The mood is epic and quiet: large-format cinema, a single human-scale
subject lost in vast space, natural light only. No buildings, no
architecture, no culture props — just sand, water, sky and light.

## Shared style block

Append this to **every** prompt so the set reads as one family:

> Shot on 65mm IMAX large-format film, epic cinematic landscape, natural
> light only, vast negative space, minimal composition, pale gold and bone
> sand, shallow turquoise-to-deep-teal lagoon water, soft atmospheric haze
> over the horizon, fine organic film grain, restrained color grade, no
> people, no animals, no boats, no kites, no buildings, no text, no logos.

**Negative prompt** (if your tool supports one): people, figures,
kitesurfers, boats, vehicles, buildings, architecture, arches, palm trees,
camels, text, watermark, logo, oversaturated, HDR, neon, cartoon,
illustration, 3D render look, lens flare.

## Composition rule

Text overlays the **top-left** of every hero, and a white card overlaps the
**bottom third**. Keep the top-left 45% of the frame quiet (sky, haze or
smooth sand) and put the interest (dune ridge, lagoon edge, light) on the
right and in the middle. The bottom third fades into the page, so detail
there is lost.

---

## 1. `today-morning.jpg` → `Imagery.todayMorning`
**Aspect** 3:4 portrait · **Size** 1536×2048

> Dawn over the Dakhla lagoon, the sun just below the horizon, a pale
> cream-to-soft-blue sky filling the upper left, low mist lying on glassy
> turquoise water, a single long dune ridge entering from the right with
> its crest catching the first pink-gold light, perfectly still
> reflections, cool and hushed.

## 2. `today-afternoon.jpg` → `Imagery.todayAfternoon`
**Aspect** 3:4 portrait · **Size** 1536×2048

> High sun over wide tidal flats where white-gold dunes meet vivid shallow
> turquoise water, bright hazy sky upper left, crisp wind ripples across
> the sand in the middle distance, braided channels of lagoon water
> snaking toward the horizon, clean and luminous, heat shimmer on the far
> edge.

## 3. `today-evening.jpg` → `Imagery.todayEvening`
**Aspect** 3:4 portrait · **Size** 1536×2048

> Golden hour sliding into dusk at the edge of the Sahara where the dunes
> meet the Atlantic, amber-to-dusty-rose sky upper left, long raking
> shadows carving the dune faces on the right, the lagoon turning deep teal
> and mirroring the glowing sky, a thin line of distant surf, calm and
> winding down.

## 4. `welcome.jpg` → `Imagery.welcome` (onboarding first screen)
**Aspect** 9:19.5 portrait · **Size** 1290×2796

> An immense sweep of pale dunes descending toward a sliver of turquoise
> lagoon at the very bottom of the frame, vast soft sky and haze taking up
> the upper 60%, a single sharp dune crest curving up from the lower right
> like a brushstroke, morning light. A sense of arrival at the edge of the
> world.

*(The bottom 45% sits under a cream gradient with the headline and
buttons, so any detail there will be hidden.)*

## 5. `journal-cover.jpg` → `Imagery.journalCover`
**Aspect** 4:5 portrait · **Size** 1600×2000

> Aerial top-down view of the Dakhla lagoon at low tide, abstract braided
> patterns where turquoise channels cut through bone-white sand banks,
> gradients from pale aqua to deep teal, like a scientific map or a
> microscope image of a living system. Graphic, calm and precise.

*(The bottom 40% sits under a dark gradient with a white serif headline.)*

## 6. `atelier-night.jpg` → `Imagery.atelier` (premium + paywall)
**Aspect** 3:4 portrait · **Size** 1536×2048

> Night in the open Sahara beside the lagoon, a deep teal-black sky dense
> with stars and a faint Milky Way arc, moonlight silvering the dune crests
> on the right, the still lagoon holding a perfect reflection of the stars,
> the last ember of warm gold light on the horizon. Low-key exposure,
> rich shadow detail, intimate and awe-struck.

*(This slot carries white and gold text, so keep it dark overall.)*

---

## Optional: app icon refresh

**Aspect** 1:1 · **Size** 1024×1024

> A minimal app icon: a single elegant lowercase serif letter "e" in warm
> sand-cream, centered on a deep teal (#0F5652) background with a very
> subtle soft gradient suggesting lagoon water, flat letter, no border, no
> text other than the letter.

Save as `nourai/assets/icon.png` and `adaptive-icon.png`.
