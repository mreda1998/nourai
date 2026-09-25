import type { RouteLink } from '@/services/api';

export const EVIDENCE_LABEL: Record<NonNullable<RouteLink['evidence_type']>, string> = {
  meta_analysis: 'Meta-analysis',
  human_rct: 'Randomised trial',
  human_observational: 'Observational study',
  preclinical: 'Lab or animal study',
  established_biochemistry: 'Established biochemistry',
  proposed: 'Proposed mechanism',
};

export const STRENGTH_LABEL: Record<string, string> = {
  strong: 'strong',
  moderate: 'moderate',
  limited: 'limited',
  insufficient: 'insufficient',
};

export const CERTAINTY_LABEL: Record<string, string> = {
  high: 'High certainty',
  moderate: 'Moderate certainty',
  low: 'Low certainty',
  very_low: 'Very low certainty',
};

export const DOMAIN_LABEL: Record<string, string> = {
  inflammation_immune: 'Inflammation',
  skin_appearance: 'Skin',
  energy_metabolism: 'Metabolism',
  gut_digestive: 'Gut',
  cognitive_mental: 'Mind',
  cardiovascular: 'Heart',
  bone_joint: 'Bones',
  hormonal_endocrine: 'Hormones',
  body_composition: 'Body',
  sleep_recovery: 'Sleep',
};

export const ROLE_OVERLINE = {
  input: 'You take',
  mechanism: 'In the body',
  outcome: 'Measured in people',
  boundary: 'Not shown',
} as const;

const MINUS = '−';

export function signed(n: number): string {
  const text = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n > 0 ? `+${text}` : n < 0 ? `${MINUS}${text}` : text;
}

export function plain(n: number): string {
  const text = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n < 0 ? `${MINUS}${text}` : text;
}

/** "+1.37" + "kg"; percentages keep a long unit as a caption: "−34.02%" + "perceived sleep…". */
export function effectParts(estimate: number, unit?: string | null): { value: string; unit: string; caption?: string } {
  const u = (unit ?? '').trim();
  if (u.startsWith('%')) return { value: `${signed(estimate)}%`, unit: '', caption: u.slice(1).trim() || undefined };
  return { value: signed(estimate), unit: u };
}

export function doseText(low?: number | null, high?: number | null, unit?: string | null): string | null {
  if (low == null || high == null || !unit) return null;
  return low === high ? `${plain(low)} ${unit}` : `${plain(low)}–${plain(high)} ${unit}`;
}

export function citationUrl(c: { pmid?: string; doi?: string; url?: string }): string | null {
  if (c.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`;
  if (c.doi) return `https://doi.org/${c.doi}`;
  return c.url ?? null;
}

export function citationLabel(c: { pmid?: string; doi?: string; url?: string }): string {
  if (c.pmid) return `PubMed ${c.pmid}`;
  if (c.doi) return `DOI ${c.doi}`;
  return 'Source';
}

/** Routes imported before anyone has reviewed them carry reviewer "pending". */
export function isPendingReview(route: { reviewed_by?: string | null }): boolean {
  return !route.reviewed_by || route.reviewed_by.toLowerCase() === 'pending';
}
