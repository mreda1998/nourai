/**
 * Every editorial image slot in the app, in one place.
 *
 * Slots currently point at the existing brand hero. To swap in generated
 * artwork, drop the file into assets/images/ and change the require() here —
 * no screen code changes needed. See docs/design/image-prompts.md.
 */
const brandHero = require('@/assets/images/elory-architecture-hero.png');

export const Imagery = {
  /** Today hero — morning (5am–12pm). */
  todayMorning: brandHero,
  /** Today hero — afternoon (12pm–6pm). */
  todayAfternoon: brandHero,
  /** Today hero — evening (6pm–5am). */
  todayEvening: brandHero,
  /** First-run hero on Today when the stack is empty. */
  welcome: brandHero,
  /** Journal cover story. */
  journalCover: brandHero,
  /** Premium / Atelier night hero. */
  atelier: brandHero,
  /** Ingredient mechanism fallback. */
  mechanism: require('@/assets/images/creatine-mechanism.png'),
};

export function todayHero(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return Imagery.todayMorning;
  if (h >= 12 && h < 18) return Imagery.todayAfternoon;
  return Imagery.todayEvening;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}
