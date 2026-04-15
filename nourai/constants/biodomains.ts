/**
 * Canonical biodomain definitions — mirrors backend/app/core/biodomains.py
 *
 * Keep keys in sync with the DB. Never rename without a migration.
 */

export interface BioDomainDef {
  key: string;
  name: string;
  description: string;
  /** Accent color for bars / icons */
  color: string;
  /** Negative domains (e.g. high hormonal disruption) render differently */
  isNegativeDefault?: boolean;
}

export const BIODOMAINS: BioDomainDef[] = [
  {
    key: 'inflammation_immune',
    name: 'Inflammation & Immune',
    description: 'Systemic inflammation, immune modulation, oxidative stress',
    color: '#C17B4E',
  },
  {
    key: 'skin_appearance',
    name: 'Skin & Appearance',
    description: 'Hydration, elasticity, pigmentation, acne, barrier function',
    color: '#9B7BB8',
  },
  {
    key: 'energy_metabolism',
    name: 'Energy & Metabolism',
    description: 'Cellular energy, mitochondrial function, metabolic rate',
    color: '#4E8FB8',
  },
  {
    key: 'gut_digestive',
    name: 'Gut & Digestive',
    description: 'Microbiome diversity, intestinal permeability, comfort',
    color: '#6AAF6A',
  },
  {
    key: 'cognitive_mental',
    name: 'Cognitive & Mental',
    description: 'Focus, memory, anxiety, mood, neurotransmitter support',
    color: '#7B9EC4',
  },
  {
    key: 'cardiovascular',
    name: 'Cardiovascular',
    description: 'Blood pressure, lipids, endothelial function',
    color: '#C45C5C',
  },
  {
    key: 'bone_joint',
    name: 'Bone & Joint',
    description: 'Bone density, cartilage integrity, joint mobility',
    color: '#B8A56A',
  },
  {
    key: 'hormonal_endocrine',
    name: 'Hormonal & Endocrine',
    description: 'Sex hormones, thyroid, cortisol, insulin sensitivity',
    color: '#B87BAF',
  },
  {
    key: 'body_composition',
    name: 'Body Composition',
    description: 'Muscle synthesis, fat oxidation, lean mass',
    color: '#5B9E7B',
  },
  {
    key: 'sleep_recovery',
    name: 'Sleep & Recovery',
    description: 'Sleep onset, quality, exercise recovery, HRV',
    color: '#6B7BB8',
  },
];

export const BIODOMAIN_BY_KEY: Record<string, BioDomainDef> = Object.fromEntries(
  BIODOMAINS.map((d) => [d.key, d])
);

/** Score shape returned from the API */
export interface BioDomainScore {
  biodomain: string;
  direction: 'benefit' | 'harm' | 'neutral' | 'mixed';
  magnitude: number;         // 0.0 – 1.0
  confidence: 'high' | 'moderate' | 'low';
  dose_dependent: boolean;
  effective_dose_low: number | null;
  effective_dose_high: number | null;
  dose_unit: string | null;
  evidence_count: number;
  notes: string | null;
}

/**
 * Compute the signed display value for a domain score.
 * benefit → positive, harm → negative, mixed/neutral → slightly positive.
 */
export function scoredValue(score: BioDomainScore): number {
  const sign = score.direction === 'harm' ? -1 : score.direction === 'neutral' ? 0 : 1;
  return sign * score.magnitude;
}
