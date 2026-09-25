/**
 * Every editorial image slot in the app, in one place. The visual world is
 * Dakhla — Saharan dunes meeting a turquoise lagoon (see
 * docs/design/image-prompts.md). To replace an image, drop the file into
 * assets/images/ and change its require() here.
 */
export const Imagery = {
  /** Today hero — morning (5am–12pm). */
  todayMorning: require('@/assets/images/today-morning.jpg'),
  /** Today hero — afternoon (12pm–6pm). */
  todayAfternoon: require('@/assets/images/today-afternoon.jpg'),
  /** Today hero — evening (6pm–5am). */
  todayEvening: require('@/assets/images/today-evening.jpg'),
  /** Onboarding welcome. */
  welcome: require('@/assets/images/welcome.jpg'),
  /** Journal cover story. */
  journalCover: require('@/assets/images/journal-cover.jpg'),
  /** Premium / Atelier / paywall night hero. */
  atelier: require('@/assets/images/atelier-night.jpg'),
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
