/** Wording and colour for ingredient rules (what the law says, place by place). */

export type RuleTone = 'weak' | 'moderate' | 'neutral' | 'strong';

export const RULES_FOOTER = (date: string) => `Rules change. Last checked ${date}. Not legal advice.`;
export const IARC_EXPLAINER = 'This rates whether it can cause cancer, not how likely it is at normal amounts.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The person's country (ISO code) from the device region; Canada is the launch market. */
export function userCountry(region?: string): string {
  const code = (region ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : 'CA';
}

/** Banned or not authorised reads as a restriction; limits stay neutral, never alarming. */
export function statusTone(status: string): RuleTone {
  if (status === 'banned' || status === 'not_authorised') return 'weak';
  if (status === 'prescription_only' || status === 'warning_label' || status === 'approval_required') return 'moderate';
  if (status === 'allowed') return 'strong';
  return 'neutral';
}

export function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Since 2022" for a rule in force, "From 15 Jan 2027" for one that hasn't started yet. */
export function effectiveText(from: string | null | undefined, until: string | null | undefined, today: Date = new Date()): string | null {
  if (from) {
    const start = new Date(`${from.slice(0, 10)}T00:00:00Z`);
    return start > today ? `From ${formatDay(from)}` : `Since ${from.slice(0, 4)}`;
  }
  if (until) return `Until ${formatDay(until)}`;
  return null;
}

const ingredients = (n: number) => `${n} ingredient${n === 1 ? '' : 's'}`;

/** "1 ingredient restricted where you live · 2 elsewhere"; null when nothing is restricted. */
export function glanceText(glance: { where_you_live: number; elsewhere: number } | null | undefined): string | null {
  if (!glance) return null;
  const { where_you_live: here, elsewhere } = glance;
  if (here && elsewhere) return `${ingredients(here)} restricted where you live · ${elsewhere} elsewhere`;
  if (here) return `${ingredients(here)} restricted where you live`;
  if (elsewhere) return `${ingredients(elsewhere)} restricted elsewhere`;
  return null;
}
