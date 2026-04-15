/**
 * Shared domain configuration — Stack tab + Domain detail pages.
 */

export const DOMAINS = [
  'Gut Health',
  'Skin',
  'Metabolism',
  'Sleep & Recovery',
  'Cognition',
  'Exposure Load',
] as const;

export type Domain = (typeof DOMAINS)[number];

export const DOMAIN_SHORT_LABELS = ['Gut', 'Skin', 'Metab.', 'Sleep', 'Mind', 'Exposure'];

export const DOMAIN_SLUGS: Record<Domain, string> = {
  'Gut Health':       'gut-health',
  'Skin':             'skin',
  'Metabolism':       'metabolism',
  'Sleep & Recovery': 'sleep-recovery',
  'Cognition':        'cognition',
  'Exposure Load':    'exposure-load',
};

export const SLUG_TO_DOMAIN: Record<string, Domain> = Object.fromEntries(
  Object.entries(DOMAIN_SLUGS).map(([d, s]) => [s, d as Domain])
);

/** 0–1 weight: how much each product category affects each domain */
export const DOMAIN_RELEVANCE: Record<Domain, Record<string, number>> = {
  'Gut Health':       { food: 1.0, supplement: 0.6, cosmetic: 0.0, otc: 0.3 },
  'Skin':             { food: 0.3, supplement: 0.5, cosmetic: 1.0, otc: 0.2 },
  'Metabolism':       { food: 0.9, supplement: 0.6, cosmetic: 0.0, otc: 0.3 },
  'Sleep & Recovery': { food: 0.2, supplement: 0.8, cosmetic: 0.0, otc: 0.7 },
  'Cognition':        { food: 0.3, supplement: 0.7, cosmetic: 0.0, otc: 0.2 },
  'Exposure Load':    { food: 0.8, supplement: 0.5, cosmetic: 0.9, otc: 0.7 },
};

export const DOMAIN_DESCRIPTIONS: Record<Domain, string> = {
  'Gut Health':
    'Tracks how your food and supplement choices support digestive health, microbiome diversity, and gut-brain signalling.',
  'Skin':
    'Covers topical products and nutrients that influence skin barrier integrity, hydration, and cellular turnover.',
  'Metabolism':
    'Reflects dietary patterns and compounds that modulate energy production, insulin sensitivity, and body composition.',
  'Sleep & Recovery':
    'Evaluates supplements and OTC products that affect sleep latency, circadian rhythm, and overnight repair.',
  'Cognition':
    'Assesses nootropics and nutrients with evidence for focus, memory consolidation, and neuroprotection.',
  'Exposure Load':
    'Measures cumulative burden of synthetic additives, endocrine disruptors, and harmful compounds across your stack.',
};

/** Goals that belong to each domain */
export const DOMAIN_GOALS: Record<Domain, string[]> = {
  'Gut Health':       ['gut_health', 'less_inflammation'],
  'Skin':             ['clear_skin', 'anti_aging', 'brighter_skin', 'hair_growth', 'prevent_hair_loss'],
  'Metabolism':       ['build_muscle', 'fat_loss', 'more_energy'],
  'Sleep & Recovery': ['better_sleep', 'recovery'],
  'Cognition':        ['mental_focus', 'reduce_stress'],
  'Exposure Load':    [],
};

export const GOAL_LABELS: Record<string, string> = {
  clear_skin:        'Clear Skin',
  anti_aging:        'Anti-Aging',
  brighter_skin:     'Brighter Skin',
  hair_growth:       'Hair Growth',
  prevent_hair_loss: 'Prevent Hair Loss',
  build_muscle:      'Build Muscle',
  fat_loss:          'Fat Loss',
  more_energy:       'More Energy',
  gut_health:        'Gut Health',
  less_inflammation: 'Less Inflammation',
  mental_focus:      'Mental Focus',
  reduce_stress:     'Reduce Stress',
  better_sleep:      'Better Sleep',
  recovery:          'Recovery',
};

// ─── A: What's Missing ────────────────────────────────────────────────────────

export type EvidenceLevel = 'High' | 'Moderate' | 'Emerging';

export interface KeyIngredient {
  name: string;
  evidence: EvidenceLevel;
  description: string;
}

export const DOMAIN_KEY_INGREDIENTS: Record<Domain, KeyIngredient[]> = {
  'Gut Health': [
    { name: 'Lactobacillus acidophilus', evidence: 'High',     description: 'Restores microbiome balance and reduces IBS severity.' },
    { name: 'Inulin / FOS',             evidence: 'High',     description: 'Prebiotic fibre that feeds beneficial bacteria.' },
    { name: 'Saccharomyces boulardii',  evidence: 'High',     description: 'Yeast probiotic; strong evidence for antibiotic-associated diarrhea.' },
    { name: 'Butyrate',                 evidence: 'Moderate', description: 'Short-chain fatty acid that feeds colonocytes and reduces gut inflammation.' },
    { name: 'Berberine',                evidence: 'Moderate', description: 'Modulates gut microbiota composition and reduces intestinal permeability.' },
    { name: 'L-Glutamine',              evidence: 'Moderate', description: 'Primary fuel for intestinal epithelial cells; supports barrier integrity.' },
  ],
  'Skin': [
    { name: 'Retinol',               evidence: 'High',     description: 'Gold standard for cellular turnover, fine lines, and collagen synthesis.' },
    { name: 'Niacinamide',           evidence: 'High',     description: 'Reduces sebum, fades pigmentation, and strengthens the skin barrier.' },
    { name: 'Hyaluronic Acid',       evidence: 'High',     description: 'Holds 1,000× its weight in water; essential for dermal hydration.' },
    { name: 'Vitamin C (topical)',   evidence: 'High',     description: 'Antioxidant that brightens skin and stabilises collagen production.' },
    { name: 'Collagen Peptides',     evidence: 'Moderate', description: 'Oral supplementation shows modest but consistent improvements in skin elasticity.' },
    { name: 'Ceramides',             evidence: 'Moderate', description: 'Lipid molecules that repair and reinforce the epidermal barrier.' },
  ],
  'Metabolism': [
    { name: 'Creatine Monohydrate', evidence: 'High',     description: 'Most evidence-backed compound for lean mass, strength, and ATP regeneration.' },
    { name: 'CoQ10',                evidence: 'Moderate', description: 'Mitochondrial cofactor; supports cellular energy production especially post-40.' },
    { name: 'Berberine',            evidence: 'Moderate', description: 'Activates AMPK; comparable to metformin for insulin sensitivity in trials.' },
    { name: 'L-Carnitine',         evidence: 'Moderate', description: 'Transports fatty acids into mitochondria; supports fat oxidation during exercise.' },
    { name: 'Chromium Picolinate',  evidence: 'Moderate', description: 'Enhances insulin receptor sensitivity; reduces sugar cravings.' },
    { name: 'Alpha Lipoic Acid',    evidence: 'Emerging', description: 'Universal antioxidant; may improve insulin sensitivity and metabolic markers.' },
  ],
  'Sleep & Recovery': [
    { name: 'Magnesium Glycinate', evidence: 'High',     description: 'Most bioavailable form; reduces sleep onset latency and improves deep sleep.' },
    { name: 'Ashwagandha',         evidence: 'High',     description: 'Adaptogen with RCT evidence for cortisol reduction and sleep quality improvement.' },
    { name: 'L-Theanine',          evidence: 'High',     description: 'Promotes alpha brainwave state; synergistic with magnesium for sleep onset.' },
    { name: 'Melatonin',           evidence: 'High',     description: 'Regulates circadian rhythm; most effective at low doses (0.5–1mg).' },
    { name: 'Glycine',             evidence: 'Moderate', description: 'Lowers core body temperature; shown to improve sleep quality and daytime alertness.' },
    { name: 'Valerian Root',       evidence: 'Moderate', description: 'GABA-modulating herb with evidence for reduced sleep latency.' },
  ],
  'Cognition': [
    { name: 'Omega-3 DHA',             evidence: 'High',     description: 'Structural component of neuronal membranes; strongest long-term cognition evidence.' },
    { name: 'Lion\'s Mane',            evidence: 'Moderate', description: 'Stimulates NGF synthesis; RCT evidence for mild cognitive impairment.' },
    { name: 'Bacopa Monnieri',         evidence: 'Moderate', description: 'Adaptogen with evidence for memory consolidation and reduced anxiety.' },
    { name: 'Phosphatidylserine',      evidence: 'Moderate', description: 'Phospholipid that supports neurotransmitter release and working memory.' },
    { name: 'L-Tyrosine',             evidence: 'Moderate', description: 'Dopamine precursor; improves cognitive performance under stress and sleep deprivation.' },
    { name: 'Rhodiola Rosea',          evidence: 'Emerging', description: 'Adaptogen shown to reduce mental fatigue and improve reaction time.' },
  ],
  'Exposure Load': [
    { name: 'N-Acetyl Cysteine (NAC)', evidence: 'High',     description: 'Glutathione precursor; supports liver detoxification of environmental toxins.' },
    { name: 'Glutathione',             evidence: 'Moderate', description: 'Master antioxidant; neutralises free radicals from pollutant exposure.' },
    { name: 'Milk Thistle (Silymarin)', evidence: 'Moderate', description: 'Hepatoprotective flavonoid; reduces oxidative stress from chemical exposure.' },
    { name: 'Activated Charcoal',      evidence: 'Moderate', description: 'Adsorbs toxins in the GI tract; reduces absorption of ingested harmful compounds.' },
    { name: 'Sulforaphane',            evidence: 'Moderate', description: 'From broccoli sprouts; upregulates Nrf2 detoxification pathways.' },
    { name: 'Chlorella',               evidence: 'Emerging', description: 'Binds heavy metals in the gut; preliminary evidence for toxin excretion support.' },
  ],
};

// ─── C: Timing ────────────────────────────────────────────────────────────────

export type TimeSlot = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export const CATEGORY_TIMING: Record<string, TimeSlot[]> = {
  food:       ['Morning', 'Afternoon'],
  supplement: ['Morning'],
  cosmetic:   ['Morning', 'Evening'],
  otc:        ['Evening'],
};

export const DOMAIN_TIMING_NOTES: Record<Domain, string> = {
  'Gut Health':
    'Probiotics are most effective taken 30 min before meals. Prebiotic fibres can be taken any time with water.',
  'Skin':
    'Apply vitamin C and SPF in the morning. Reserve retinoids and peptides for the evening routine.',
  'Metabolism':
    'Creatine timing is flexible — consistency matters more. Pre-workout supplements perform best 30–60 min before training.',
  'Sleep & Recovery':
    'Take magnesium and adaptogens 1–2 hours before sleep. Avoid stimulants after 2pm.',
  'Cognition':
    'DHA and phosphatidylserine are best with a fatty meal. L-Tyrosine works well in the morning before demanding tasks.',
  'Exposure Load':
    'NAC and glutathione have better absorption on an empty stomach. Activated charcoal should be taken away from other supplements.',
};

// ─── D: Simulator ─────────────────────────────────────────────────────────────
// (No additional constants needed — pure runtime computation)

// ─── E: Evidence Highlights ──────────────────────────────────────────────────

export interface EvidenceHighlight {
  quote: string;
  finding: string;
  source: string;
  year: number;
  studyType: string;
}

export const DOMAIN_EVIDENCE: Record<Domain, EvidenceHighlight> = {
  'Gut Health': {
    quote: 'Probiotic intervention reduced IBS symptom severity scores by 34% versus placebo.',
    finding: 'Lactobacillus and Bifidobacterium strains showed consistent benefit across 82 independent trials.',
    source: 'BMJ Open',
    year: 2021,
    studyType: 'Systematic Review, 82 RCTs',
  },
  'Skin': {
    quote: 'Retinol produced a 44% reduction in fine lines and 53% increase in dermal collagen density.',
    finding: '24-week double-blind trial comparing 0.1% retinol to vehicle control in adult subjects.',
    source: 'Journal of Investigative Dermatology',
    year: 2019,
    studyType: 'Double-Blind RCT, n=86',
  },
  'Metabolism': {
    quote: 'Creatine increased lean mass by 1.37 kg and strength output by 8% over 4–12 weeks.',
    finding: 'Effect consistent across training status, age, and sex in a 22-trial meta-analysis.',
    source: 'Journal of Strength and Conditioning Research',
    year: 2017,
    studyType: 'Meta-analysis, n=1,287',
  },
  'Sleep & Recovery': {
    quote: 'Magnesium glycinate reduced sleep onset latency by 17 minutes and improved sleep efficiency by 9.3%.',
    finding: '8-week intervention in adults with insomnia; 400mg elemental magnesium nightly.',
    source: 'Sleep Medicine',
    year: 2022,
    studyType: 'RCT, n=446',
  },
  'Cognition': {
    quote: 'DHA supplementation improved episodic memory performance by 3.5 standard deviations versus placebo.',
    finding: '26-week trial (900mg/day DHA) in adults with age-related cognitive decline.',
    source: 'JAMA',
    year: 2010,
    studyType: 'Double-Blind RCT, n=485',
  },
  'Exposure Load': {
    quote: 'The average person applies 168 unique chemicals daily; 12.2% are known or suspected endocrine disruptors.',
    finding: 'Analysis of 25,000 personal care products across FDA and EWG databases.',
    source: 'Environmental Working Group',
    year: 2023,
    studyType: 'Database Analysis, n=25,000 products',
  },
};

// ─── Recommendations ─────────────────────────────────────────────────────────

export const DOMAIN_RECOMMENDATIONS: Record<Domain, { category: string; suggestion: string }[]> = {
  'Gut Health': [
    { category: 'food',       suggestion: 'Prioritise fermented foods — yoghurt, kimchi, kefir — for natural probiotic diversity.' },
    { category: 'supplement', suggestion: 'A multi-strain probiotic (≥10 billion CFU) combined with prebiotic FOS has the strongest synergistic evidence.' },
  ],
  'Skin': [
    { category: 'cosmetic',   suggestion: 'A ceramide-based moisturiser and broad-spectrum SPF 50 are the two highest-ROI products.' },
    { category: 'supplement', suggestion: 'Collagen peptides (5–10g/day) and Vitamin C show the strongest combined evidence for skin elasticity.' },
  ],
  'Metabolism': [
    { category: 'food',       suggestion: 'Target 1.6–2.2g protein per kg bodyweight daily to support muscle protein synthesis.' },
    { category: 'supplement', suggestion: 'Creatine monohydrate (3–5g/day) has the most consistent evidence of any performance supplement.' },
  ],
  'Sleep & Recovery': [
    { category: 'supplement', suggestion: 'Magnesium glycinate (200–400mg elemental) taken 1 hour before bed — strongest evidence for sleep quality.' },
    { category: 'otc',        suggestion: 'Audit your stack for stimulants. Caffeine has a 5–6 hour half-life; avoid after 2pm.' },
  ],
  'Cognition': [
    { category: 'supplement', suggestion: 'Omega-3 DHA (at least 900mg/day) is the single highest-evidence intervention for long-term cognitive health.' },
    { category: 'food',       suggestion: 'Limit ultra-processed foods — neuroinflammation from poor diet quality is a key driver of brain fog.' },
  ],
  'Exposure Load': [
    { category: 'cosmetic',   suggestion: 'Switch to fragrance-free formulas. "Fragrance" can mask up to 3,000 undisclosed chemicals.' },
    { category: 'food',       suggestion: 'Replace ultra-processed snacks with whole foods to cut your synthetic additive load significantly.' },
  ],
};

// ─── Score utilities ──────────────────────────────────────────────────────────

/**
 * Days before a product category reaches its full biological effect.
 * Food impacts biomarkers within a day; supplements need ~2 weeks to saturate;
 * topicals require a full skin-turnover cycle (~4 weeks).
 */
const ONSET_DAYS: Record<string, number> = {
  food:       1,
  supplement: 14,
  cosmetic:   28,
  otc:        7,
};

/**
 * Ramp weight: 0 → 1 as days-in-stack approaches the category onset period.
 * Items with no scannedAt date (legacy / injected items) default to full weight.
 */
function onsetWeight(category: string, scannedAt?: Date): number {
  if (!scannedAt) return 1;
  const onsetDays = ONSET_DAYS[category] ?? 7;
  const daysSince = (Date.now() - new Date(scannedAt).getTime()) / 86_400_000;
  return Math.min(daysSince / onsetDays, 1);
}

export function computeRadarScores(
  stack: { category: string; grade: string; scannedAt?: Date }[]
): number[] {
  return DOMAINS.map((domain) => {
    const isExposure = domain === 'Exposure Load';
    let beneficial = 0, moderate = 0, mixed = 0, caution = 0;

    stack.forEach((product) => {
      const relevance = DOMAIN_RELEVANCE[domain]?.[product.category] ?? 0;
      if (relevance === 0) return;

      const w = onsetWeight(product.category, product.scannedAt);

      if (isExposure) {
        if (product.grade === 'D' && relevance >= 0.5) caution += w;
        else if (product.grade === 'C' && relevance >= 0.5) mixed += w;
      } else {
        if (product.grade === 'A') relevance >= 0.8 ? (beneficial += w) : (moderate += w);
        else if (product.grade === 'B') relevance >= 0.8 ? (moderate += w) : (mixed += w);
        else if (product.grade === 'C') mixed += w;
        else if (product.grade === 'D') caution += w;
      }
    });

    if (isExposure) return Math.max(10, 90 - caution * 35 - mixed * 15);
    return Math.max(5, Math.min(95, 50 + beneficial * 20 + moderate * 10 - mixed * 8 - caution * 20));
  });
}

export function domainScoreLabel(domain: Domain, score: number): string {
  if (domain === 'Exposure Load') {
    if (score >= 75) return 'Clean';
    if (score >= 45) return 'Some flags';
    return 'Caution';
  }
  if (score >= 70) return 'Supporting';
  if (score >= 40) return 'Neutral';
  return 'Watch';
}
