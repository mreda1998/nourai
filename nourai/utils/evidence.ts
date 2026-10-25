/**
 * Plain-language labels for claim verdicts and study strength. Pure, so it can be
 * tested with node (tests/evidence.test.cjs) — type-only imports only.
 */
import type { Tone } from './grade';
import type { IngredientClaim, IngredientEvidenceRecord } from '@/services/api';

type ClaimKind = 'benefit' | 'safety';
type Answer = { label: string; tone: Tone };

const NOT_ENOUGH: Answer = { label: 'Not enough research', tone: 'neutral' };

// The verdict says whether the claim *statement* holds; its certainty sets the
// wording, as in Cochrane plain language ("works" / "probably works" / "may work").
// Safety claims state a risk, so a supported safety claim is bad news.
const HOLDS: Record<ClaimKind, Record<string, Answer>> = {
  benefit: {
    high: { label: 'Works', tone: 'strong' },
    moderate: { label: 'Probably works', tone: 'strong' },
    low: { label: 'May work', tone: 'moderate' },
    very_low: { label: 'Too early to tell', tone: 'neutral' },
  },
  safety: {
    high: { label: 'Known risk', tone: 'weak' },
    moderate: { label: 'Likely risk', tone: 'weak' },
    low: { label: 'Possible risk', tone: 'moderate' },
    very_low: { label: 'Too early to tell', tone: 'neutral' },
  },
};
const DOES_NOT_HOLD: Record<ClaimKind, { sure: Answer; unsure: Answer }> = {
  benefit: {
    sure: { label: 'Probably doesn’t work', tone: 'weak' },
    unsure: { label: 'May not work', tone: 'weak' },
  },
  safety: {
    sure: { label: 'No sign of this risk', tone: 'strong' },
    unsure: { label: 'No clear sign of this risk', tone: 'neutral' },
  },
};
const MIXED: Record<ClaimKind, Answer> = {
  benefit: { label: 'Mixed results', tone: 'moderate' },
  safety: { label: 'Mixed reports', tone: 'moderate' },
};

function answer(kind: ClaimKind, verdict: string | null, certainty: string | null): Answer {
  if (verdict === 'strong' || verdict === 'moderate' || verdict === 'limited') {
    return HOLDS[kind]?.[certainty ?? 'very_low'] ?? NOT_ENOUGH;
  }
  if (verdict === 'unlikely') {
    const sure = certainty === 'high' || certainty === 'moderate';
    return DOES_NOT_HOLD[kind]?.[sure ? 'sure' : 'unsure'] ?? NOT_ENOUGH;
  }
  if (verdict === 'mixed') return MIXED[kind] ?? NOT_ENOUGH;
  return NOT_ENOUGH;
}

export function verdictLabel(kind: ClaimKind, verdict: string | null, certainty: string | null): string {
  return answer(kind, verdict, certainty).label;
}

export function verdictTone(kind: ClaimKind, verdict: string | null, certainty: string | null): Tone {
  return answer(kind, verdict, certainty).tone;
}

export function certaintyLabel(certainty: string | null): string {
  const words: Record<string, string> = { high: 'High', moderate: 'Moderate', low: 'Low', very_low: 'Very low' };
  return `${words[certainty ?? ''] ?? 'Unknown'} certainty`;
}

const TIERS: Record<string, { label: string; tone: Tone }> = {
  high: { label: 'Strong study', tone: 'strong' },
  moderate: { label: 'Solid study', tone: 'moderate' },
  low: { label: 'Weak study', tone: 'weak' },
  very_low: { label: 'Very weak study', tone: 'weak' },
};
const CONFIDENCE: Record<string, { label: string; tone: Tone }> = {
  high: { label: 'High confidence', tone: 'strong' },
  moderate: { label: 'Moderate confidence', tone: 'moderate' },
  low: { label: 'Low confidence', tone: 'weak' },
};

/** Strength of one study: its appraisal tier, or the older confidence label. */
export function studyStrength(study: Pick<IngredientEvidenceRecord, 'confidence'> & { quality_tier?: string | null }) {
  return (study.quality_tier && TIERS[study.quality_tier]) || CONFIDENCE[study.confidence] || CONFIDENCE.low;
}

const DESIGNS: Record<string, string> = {
  meta_analysis: 'Meta-analysis',
  systematic_review: 'Systematic review',
  rct: 'Randomised trial',
  crossover_rct: 'Crossover trial',
  non_randomized_trial: 'Non-randomised trial',
  cohort: 'Cohort study',
  case_control: 'Case-control study',
  cross_sectional: 'Survey study',
  case_series: 'Case series',
  case_report: 'Case report',
  animal: 'Animal study',
  in_vitro: 'Lab study',
  narrative_review: 'Review',
  review: 'Review',
};

/** "Randomised trial · 140 people · 12 weeks · 2020" */
export function studyMeta(study: {
  study_type: string | null;
  sample_size: number | null;
  duration_weeks?: number | null;
  year: number | null;
}): string {
  const parts: string[] = [DESIGNS[study.study_type ?? ''] ?? 'Study'];
  if (study.sample_size) parts.push(`${study.sample_size.toLocaleString()} ${study.sample_size === 1 ? 'person' : 'people'}`);
  if (study.duration_weeks) parts.push(duration(study.duration_weeks));
  if (study.year) parts.push(String(study.year));
  return parts.join(' · ');
}

/** The claim's studies in its order (strongest first), with each study's stance on the claim. */
export function studiesForClaim<T extends Pick<IngredientEvidenceRecord, 'id'>>(
  claim: Pick<IngredientClaim, 'studies'>,
  evidence: T[],
): { study: T; stance: string }[] {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  return claim.studies.flatMap((link) => {
    const study = byId.get(link.evidence_id);
    return study ? [{ study, stance: link.stance }] : [];
  });
}

function duration(weeks: number): string {
  if (weeks < 1) {
    const days = Math.max(1, Math.round(weeks * 7));
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const whole = Math.round(weeks);
  return `${whole} week${whole === 1 ? '' : 's'}`;
}
