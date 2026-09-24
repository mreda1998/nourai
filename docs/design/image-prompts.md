# Elory — image generation prompts

Every editorial image in the app lives in one registry:
`nourai/constants/imagery.ts`. All slots currently point at
`assets/images/elory-architecture-hero.png`. To swap one in:

1. Generate the image with the prompt below.
2. Save it to `nourai/assets/images/<filename>` (JPG, ~80% quality, under 600 KB).
3. Change that slot's `require()` in `constants/imagery.ts`.

## Shared style block

Append this to **every** prompt so the set reads as one family:

> Editorial architectural photography, warm Moroccan–Mediterranean
> minimalism, lime-washed plaster and travertine in bone, sand and cream
> tones, one restrained accent of deep teal water or glazed tile, soft
> diffused natural light, gentle atmospheric haze, shallow depth, fine film
> grain, calm and unhurried, no people, no text, no logos, no signage.
> Shot on medium format, 35mm lens, f/5.6.

**Negative prompt** (if your tool supports one): people, faces, hands, text,
letters, watermark, logo, signage, clutter, oversaturated, HDR, neon,
plastic, cartoon, illustration, 3D render look, harsh shadows.

## Composition rule

Text overlays the **top-left** of every hero, and a white card overlaps the
**bottom third**. Keep the top-left 45% of the frame quiet (sky, plain
wall, haze) and keep the subject to the right. The bottom third can be
busy, because a gradient fades it into the page.

---

## 1. `today-morning.jpg` → `Imagery.todayMorning`
**Aspect** 3:4 portrait · **Size** 1536×2048

> Early-morning light in a quiet riad courtyard, pale sun just risen,
> cool blue-cream sky filling the upper left, a carved horseshoe arch and
> date palm on the right edge, a still reflecting pool in the lower third
> catching soft pink-gold light, faint mist, the stillness of 6am.

## 2. `today-afternoon.jpg` → `Imagery.todayAfternoon`
**Aspect** 3:4 portrait · **Size** 1536×2048

> High afternoon on a sun-warmed rooftop terrace, bright hazy cream sky
> upper left, crisp geometric shadows from a lattice screen falling across
> a travertine wall on the right, olive tree in a terracotta urn, a sliver
> of teal pool at the bottom, warm and clear.

## 3. `today-evening.jpg` → `Imagery.todayEvening`
**Aspect** 3:4 portrait · **Size** 1536×2048

> Golden hour fading to dusk over an infinity pool, amber-to-dusty-rose sky
> upper left, a silhouetted arched colonnade on the right glowing with warm
> lantern light, calm dark-teal water in the lower third reflecting the
> sky, first hint of evening blue, serene and winding down.

## 4. `welcome.jpg` → `Imagery.welcome` (onboarding first screen)
**Aspect** 9:19.5 portrait · **Size** 1290×2796

> A tall, sunlit lime-plaster corridor opening onto a garden, a single
> carved arch at the far right, a narrow channel of teal water running
> toward the viewer, soft morning haze, generous empty wall in the upper
> 60% of the frame. Airy and welcoming, a threshold.

*(The bottom 45% sits under a cream gradient with the headline and
buttons, so any detail there will be hidden.)*

## 5. `journal-cover.jpg` → `Imagery.journalCover`
**Aspect** 4:5 portrait · **Size** 1600×2000

> Still life on a travertine ledge: an open linen-bound notebook, a
> small glass apothecary jar of white powder, a sprig of dried herb, and a
> ceramic cup, in raking window light with long soft shadows, cream and sand
> palette, a single teal glazed tile in the background. Editorial,
> scientific but warm.

*(The bottom 40% sits under a dark gradient with a white serif headline.)*

## 6. `atelier-night.jpg` → `Imagery.atelier` (premium + paywall)
**Aspect** 3:4 portrait · **Size** 1536×2048

> Night in a private riad courtyard, deep teal-black sky, warm brass
> lanterns casting pools of amber light on carved plaster arches, a still
> dark reflecting pool mirroring the lanterns, a few stars, luxurious,
> intimate and quiet. Low-key exposure with rich shadow detail.

*(This slot carries white and gold text, so keep it dark overall.)*

---

## Optional: app icon refresh

**Aspect** 1:1 · **Size** 1024×1024

> A minimal app icon: a single elegant lowercase serif letter "e" in warm
> cream, centered on a deep teal (#0F5652) background with a very subtle
> radial glow, flat, no gradients on the letter, no border, no text other
> than the letter.

Save as `nourai/assets/icon.png` and `adaptive-icon.png`.
