import { Palette } from '@/constants/theme';

/**
 * One mapping from the backend's letter grade to everything the UI shows.
 * Screens previously each invented their own numbers (A = 86, 90, or 91) —
 * always go through here instead.
 */

export type Tone = 'strong' | 'moderate' | 'weak' | 'neutral';

const GRADE_SCORE: Record<string, number> = { A: 90, B: 74, C: 55, D: 32 };

export function gradeToScore(grade?: string | null): number | null {
  if (!grade) return null;
  return GRADE_SCORE[grade.toUpperCase()] ?? null;
}

export function scoreTone(score: number | null | undefined): Tone {
  if (score == null) return 'neutral';
  if (score >= 70) return 'strong';
  if (score >= 45) return 'moderate';
  return 'weak';
}

export function scoreQualifier(score: number | null | undefined): string {
  if (score == null) return 'Unrated';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 45) return 'Fair';
  return 'Poor';
}

export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'strong': return Palette.strong;
    case 'moderate': return Palette.moderate;
    case 'weak': return Palette.weak;
    default: return Palette.ink3;
  }
}

export function toneSoft(tone: Tone): string {
  switch (tone) {
    case 'strong': return Palette.strongSoft;
    case 'moderate': return Palette.moderateSoft;
    case 'weak': return Palette.weakSoft;
    default: return Palette.sunken;
  }
}

/** Evidence level strings from the research agent → 1–5 strength. */
export function evidenceStrength(level?: string | null): number {
  const l = (level ?? '').toLowerCase();
  if (!l) return 0;
  if (l.includes('strong') || l.includes('established') || l.includes('high')) return 5;
  if (l.includes('moderate') || l.includes('good')) return 4;
  if (l.includes('emerging') || l.includes('limited') || l.includes('preliminary')) return 2;
  if (l.includes('weak') || l.includes('insufficient') || l.includes('contested')) return 1;
  return 3;
}

export function strengthTone(strength: number): Tone {
  if (strength >= 4) return 'strong';
  if (strength >= 2) return 'moderate';
  if (strength >= 1) return 'weak';
  return 'neutral';
}

export function strengthLabel(strength: number): string {
  if (strength >= 5) return 'Strong evidence';
  if (strength === 4) return 'Good evidence';
  if (strength === 3) return 'Mixed evidence';
  if (strength === 2) return 'Emerging evidence';
  if (strength === 1) return 'Weak evidence';
  return 'Not yet reviewed';
}

export function categoryLabel(category?: string | null): string {
  switch (category) {
    case 'supplement': return 'Supplement';
    case 'cosmetic': return 'Skincare';
    case 'food': return 'Food';
    case 'otc': return 'Over the counter';
    default: return category ? category[0].toUpperCase() + category.slice(1) : 'Product';
  }
}
