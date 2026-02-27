/**
 * Client-side personalization engine
 *
 * Maps user onboarding concerns and goals to ingredient keyword patterns.
 * This is a local approximation — when the backend ships Option A, the server
 * will return pre-flagged ingredients and this utility becomes supplemental.
 */

import type { Ingredient, OnboardingProfile } from '@/services/api';

// ─── Concern → ingredient keyword patterns ────────────────────────────────────

type FlagEntry = { pattern: string; label: string };

const CONCERN_FLAGS: Record<string, FlagEntry[]> = {
  fertility: [
    { pattern: 'paraben', label: 'Endocrine disruptor — fertility risk' },
    { pattern: 'phthalate', label: 'Endocrine disruptor — fertility risk' },
    { pattern: 'fragrance', label: 'May contain hidden phthalates' },
    { pattern: 'bpa', label: 'Endocrine disruptor — fertility risk' },
    { pattern: 'triclosan', label: 'Hormonal disruption risk' },
    { pattern: 'oxybenzone', label: 'Systemic absorption — fertility concern' },
    { pattern: 'benzophenone', label: 'Possible endocrine disruptor' },
    { pattern: 'phenoxyethanol', label: 'Reproductive toxicant at high doses' },
  ],
  thyroid: [
    { pattern: 'soy', label: 'May interfere with thyroid hormone absorption' },
    { pattern: 'isoflavone', label: 'Phytoestrogen — thyroid caution' },
    { pattern: 'iodine', label: 'Excess iodine may affect thyroid' },
    { pattern: 'kelp', label: 'High iodine — thyroid caution' },
    { pattern: 'selenium', label: 'Excess selenium affects thyroid' },
    { pattern: 'bromide', label: 'Displaces iodine — thyroid concern' },
  ],
  hormonal_condition: [
    { pattern: 'paraben', label: 'Estrogenic activity' },
    { pattern: 'phthalate', label: 'Endocrine disruption risk' },
    { pattern: 'fragrance', label: 'May contain estrogenic compounds' },
    { pattern: 'lavender', label: 'Weak phytoestrogenic activity reported' },
    { pattern: 'tea tree', label: 'Weak hormonal activity in vitro' },
    { pattern: 'progesterone', label: 'Exogenous hormone — review with doctor' },
    { pattern: 'estrogen', label: 'Exogenous hormone — review with doctor' },
    { pattern: 'bpa', label: 'Strong estrogenic activity' },
  ],
  medications: [
    { pattern: "st. john's wort", label: 'Strong CYP3A4 inducer — drug interaction' },
    { pattern: 'ginkgo', label: 'Antiplatelet — blood thinner interaction' },
    { pattern: 'coenzyme q', label: 'May affect blood pressure medications' },
    { pattern: 'grapefruit', label: 'CYP3A4 inhibitor — medication interaction' },
    { pattern: 'valerian', label: 'CNS depressant — sedative interaction' },
    { pattern: 'garlic extract', label: 'Antiplatelet — blood thinner interaction' },
    { pattern: 'vitamin k', label: 'Interferes with warfarin' },
  ],
  infant_proximity: [
    { pattern: 'salicylic', label: 'Avoid skin contact with infants' },
    { pattern: 'retinol', label: 'Toxic to infants via skin contact' },
    { pattern: 'retinoic', label: 'Retinoic acid — infant skin risk' },
    { pattern: 'fragrance', label: 'Sensitizing — keep away from infants' },
    { pattern: 'glycolic', label: 'Strong acid — infant skin risk' },
    { pattern: 'lactic acid', label: 'AHA — infant skin caution' },
    { pattern: 'benzoyl peroxide', label: 'Not for infant proximity' },
    { pattern: 'essential oil', label: 'Many are sensitizing for infants' },
    { pattern: 'menthol', label: 'Can cause apnea in infants' },
  ],
};

// ─── Goal → ingredient keyword patterns ──────────────────────────────────────

const GOAL_SUPPORT: Record<string, FlagEntry[]> = {
  clear_skin: [
    { pattern: 'salicylic', label: 'BHA — unclogs pores' },
    { pattern: 'niacinamide', label: 'Reduces sebum, minimizes pores' },
    { pattern: 'zinc', label: 'Anti-seborrheic, anti-inflammatory' },
    { pattern: 'benzoyl', label: 'Kills acne-causing bacteria' },
    { pattern: 'glycolic', label: 'AHA exfoliant — prevents breakouts' },
    { pattern: 'tea tree', label: 'Natural antimicrobial' },
    { pattern: 'sulfur', label: 'Antifungal, reduces sebum' },
    { pattern: 'azelaic', label: 'Kills P. acnes, reduces inflammation' },
  ],
  anti_aging: [
    { pattern: 'retinol', label: 'Increases cell turnover and collagen' },
    { pattern: 'retinyl', label: 'Vitamin A — anti-aging precursor' },
    { pattern: 'vitamin c', label: 'Stimulates collagen synthesis' },
    { pattern: 'ascorbic', label: 'Antioxidant — stimulates collagen' },
    { pattern: 'hyaluronic', label: 'Plumping — reduces fine lines' },
    { pattern: 'peptide', label: 'Cell-signaling — collagen production' },
    { pattern: 'ceramide', label: 'Barrier repair — reduces wrinkle depth' },
    { pattern: 'collagen', label: 'Structural protein support' },
    { pattern: 'resveratrol', label: 'SIRT1 activator — anti-aging' },
    { pattern: 'coenzyme q', label: 'Antioxidant — cellular energy' },
    { pattern: 'niacinamide', label: 'Improves elasticity, fades fine lines' },
  ],
  brighter_skin: [
    { pattern: 'vitamin c', label: 'Inhibits melanin synthesis' },
    { pattern: 'ascorbic', label: 'Brightening antioxidant' },
    { pattern: 'niacinamide', label: 'Reduces dark spots and hyperpigmentation' },
    { pattern: 'arbutin', label: 'Melanin inhibitor' },
    { pattern: 'kojic', label: 'Tyrosinase inhibitor' },
    { pattern: 'tranexamic', label: 'Reduces UV-induced pigmentation' },
    { pattern: 'glycolic', label: 'Exfoliates pigmented cells' },
    { pattern: 'lactic', label: 'Gentle brightening exfoliant' },
    { pattern: 'azelaic', label: 'Fades post-acne dark marks' },
  ],
  hair_growth: [
    { pattern: 'biotin', label: 'Essential for hair follicle metabolism' },
    { pattern: 'keratin', label: 'Hair structural protein' },
    { pattern: 'caffeine', label: 'Stimulates follicle proliferation' },
    { pattern: 'niacin', label: 'Improves scalp microcirculation' },
    { pattern: 'zinc', label: 'Supports hair matrix cells' },
    { pattern: 'rosemary', label: 'Evidence-based follicle stimulant' },
    { pattern: 'vitamin d', label: 'Follicle cycle regulation' },
  ],
  prevent_hair_loss: [
    { pattern: 'biotin', label: 'Supports follicle metabolic health' },
    { pattern: 'caffeine', label: 'Counteracts DHT at follicle level' },
    { pattern: 'saw palmetto', label: '5α-reductase inhibitor' },
    { pattern: 'zinc', label: 'Prevents follicle miniaturization' },
    { pattern: 'rosemary', label: 'Comparable to minoxidil in studies' },
    { pattern: 'pumpkin seed', label: 'DHT-reducing properties' },
  ],
  build_muscle: [
    { pattern: 'creatine', label: 'Increases phosphocreatine stores' },
    { pattern: 'leucine', label: 'mTOR activator — protein synthesis' },
    { pattern: 'bcaa', label: 'Branch-chain amino acids — anabolism' },
    { pattern: 'whey', label: 'Fast-absorbing complete protein' },
    { pattern: 'beta-alanine', label: 'Increases carnosine — endurance' },
    { pattern: 'hmb', label: 'Anti-catabolic — muscle retention' },
    { pattern: 'glutamine', label: 'Prevents muscle breakdown' },
  ],
  fat_loss: [
    { pattern: 'caffeine', label: 'Thermogenic — raises metabolic rate' },
    { pattern: 'l-carnitine', label: 'Shuttles fatty acids to mitochondria' },
    { pattern: 'green tea', label: 'EGCG — thermogenic + caffeine synergy' },
    { pattern: 'cla', label: 'Conjugated linoleic acid — body composition' },
    { pattern: 'capsaicin', label: 'Thermogenic — temporary caloric increase' },
    { pattern: 'chromium', label: 'Reduces carbohydrate cravings' },
  ],
  more_energy: [
    { pattern: 'b12', label: 'Essential for cellular energy production' },
    { pattern: 'cobalamin', label: 'B12 — ATP cycle coenzyme' },
    { pattern: 'riboflavin', label: 'B2 — electron transport chain' },
    { pattern: 'coenzyme q', label: 'Mitochondrial electron carrier' },
    { pattern: 'iron', label: 'Oxygen transport — combats fatigue' },
    { pattern: 'ashwagandha', label: 'Adaptogen — reduces fatigue' },
    { pattern: 'caffeine', label: 'Adenosine antagonist — alertness' },
    { pattern: 'rhodiola', label: 'Adaptogen — reduces mental fatigue' },
    { pattern: 'magnesium', label: 'ATP synthesis cofactor' },
  ],
  gut_health: [
    { pattern: 'lactobacillus', label: 'Probiotic — gut microbiome' },
    { pattern: 'bifidobacterium', label: 'Probiotic — gut barrier support' },
    { pattern: 'saccharomyces', label: 'Probiotic yeast — immune modulation' },
    { pattern: 'inulin', label: 'Prebiotic fiber — feeds beneficial bacteria' },
    { pattern: 'fos', label: 'Fructooligosaccharide — prebiotic' },
    { pattern: 'fiber', label: 'Supports microbiome diversity' },
    { pattern: 'psyllium', label: 'Soluble fiber — gut motility' },
    { pattern: 'glutamine', label: 'Gut epithelium repair' },
    { pattern: 'butyrate', label: 'Short-chain fatty acid — colonocyte fuel' },
  ],
  less_inflammation: [
    { pattern: 'omega-3', label: 'Potent anti-inflammatory (eicosanoids)' },
    { pattern: 'epa', label: 'Omega-3 — reduces inflammatory cytokines' },
    { pattern: 'dha', label: 'Omega-3 — resolves inflammation' },
    { pattern: 'turmeric', label: 'Traditional anti-inflammatory herb' },
    { pattern: 'curcumin', label: 'NF-κB inhibitor — anti-inflammatory' },
    { pattern: 'quercetin', label: 'Flavonoid — inhibits COX enzymes' },
    { pattern: 'vitamin c', label: 'Antioxidant — reduces oxidative stress' },
    { pattern: 'zinc', label: 'Anti-inflammatory mineral' },
    { pattern: 'ginger', label: 'Inhibits inflammatory pathways' },
    { pattern: 'boswellia', label: '5-LOX inhibitor — anti-inflammatory' },
  ],
  mental_focus: [
    { pattern: 'l-theanine', label: 'Promotes calm focus — synergy with caffeine' },
    { pattern: 'bacopa', label: 'Nootropic — memory consolidation' },
    { pattern: "lion's mane", label: 'NGF stimulator — neuroprotective' },
    { pattern: 'ginkgo', label: 'Cerebral circulation — cognitive support' },
    { pattern: 'phosphatidylserine', label: 'Membrane phospholipid — cognition' },
    { pattern: 'omega-3', label: 'Brain structural lipid — cognition' },
    { pattern: 'caffeine', label: 'Adenosine antagonist — focus' },
    { pattern: 'citicoline', label: 'Choline donor — acetylcholine synthesis' },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IngredientPersonalization {
  concernFlags: { concern: string; label: string }[];
  goalSupports: { goal: string; label: string }[];
}

export interface PersonalAnalysis {
  /** Flat list of all concern-flagged ingredients */
  concerns: { ingredientName: string; concern: string; label: string }[];
  /** Flat list of all goal-supporting ingredients */
  goals: { ingredientName: string; goal: string; label: string }[];
  hasConcernFlags: boolean;
  hasGoalSupports: boolean;
}

// ─── Core engine ──────────────────────────────────────────────────────────────

/**
 * Returns a Map<ingredientName, { concernFlags, goalSupports }> for every
 * ingredient that matches at least one user concern or goal.
 */
export function analyzeIngredients(
  ingredients: Ingredient[],
  profile: OnboardingProfile
): Map<string, IngredientPersonalization> {
  const result = new Map<string, IngredientPersonalization>();

  for (const ingredient of ingredients) {
    const nameLower = ingredient.name.toLowerCase();
    const concernFlags: IngredientPersonalization['concernFlags'] = [];
    const goalSupports: IngredientPersonalization['goalSupports'] = [];

    for (const concernId of profile.healthConcerns) {
      const patterns = CONCERN_FLAGS[concernId] ?? [];
      for (const { pattern, label } of patterns) {
        if (nameLower.includes(pattern.toLowerCase())) {
          concernFlags.push({ concern: concernId, label });
          break; // one flag per concern per ingredient
        }
      }
    }

    for (const goalId of profile.goals) {
      const patterns = GOAL_SUPPORT[goalId] ?? [];
      for (const { pattern, label } of patterns) {
        if (nameLower.includes(pattern.toLowerCase())) {
          goalSupports.push({ goal: goalId, label });
          break; // one support per goal per ingredient
        }
      }
    }

    if (concernFlags.length > 0 || goalSupports.length > 0) {
      result.set(ingredient.name, { concernFlags, goalSupports });
    }
  }

  return result;
}

/** Builds a summary object suitable for rendering the "For You" section. */
export function buildPersonalAnalysis(
  ingredients: Ingredient[],
  profile: OnboardingProfile
): PersonalAnalysis {
  const map = analyzeIngredients(ingredients, profile);
  const concerns: PersonalAnalysis['concerns'] = [];
  const goals: PersonalAnalysis['goals'] = [];

  for (const [ingredientName, { concernFlags, goalSupports }] of map) {
    for (const { concern, label } of concernFlags) {
      concerns.push({ ingredientName, concern, label });
    }
    for (const { goal, label } of goalSupports) {
      goals.push({ ingredientName, goal, label });
    }
  }

  return {
    concerns,
    goals,
    hasConcernFlags: concerns.length > 0,
    hasGoalSupports: goals.length > 0,
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const CONCERN_DISPLAY: Record<string, string> = {
  fertility: 'Fertility',
  thyroid: 'Thyroid',
  hormonal_condition: 'Hormones',
  medications: 'Medications',
  infant_proximity: 'Child Safety',
};

const GOAL_DISPLAY: Record<string, string> = {
  clear_skin: 'Clear Skin',
  anti_aging: 'Anti-Aging',
  brighter_skin: 'Brighter Skin',
  hair_growth: 'Hair Growth',
  prevent_hair_loss: 'Hair Loss',
  build_muscle: 'Build Muscle',
  fat_loss: 'Fat Loss',
  more_energy: 'Energy',
  gut_health: 'Gut Health',
  less_inflammation: 'Inflammation',
  mental_focus: 'Mental Focus',
};

export function displayConcern(id: string): string {
  return CONCERN_DISPLAY[id] ?? id;
}

export function displayGoal(id: string): string {
  return GOAL_DISPLAY[id] ?? id;
}
