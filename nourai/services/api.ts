/**
 * API Service for Elory Backend
 */
import Constants from 'expo-constants';
import { getDeviceId } from '@/lib/device-id';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:8001/api/v1' : 'https://api.elory.app/api/v1');

export interface Ingredient {
  name: string;
  concentration?: string;
  tag?: string;
  tag_type?: string;
  description?: string;
  ingredient_id?: string | null;   // FK to canonical ingredient — present when matched
  is_nutrient?: boolean;           // True for rows from the OFF nutrition panel
  rule_note?: RuleNote | null;     // set only when a covered place bans or flags it
  rule_substance_id?: string | null; // the regulated substance this label row names
  // Where the ingredient stands, from its researched claims (absent on older servers)
  standing?: 'risk' | 'caution' | 'clear' | 'unreviewed' | null;
  standing_label?: string | null;   // "Likely risk", "No known concerns"
  standing_note?: string | null;    // the claim that standing rests on
  benefit_label?: string | null;    // "Probably works"
  benefit_note?: string | null;
  benefit_tone?: MeasureTone | null;
}

export interface VerdictPillar {
  key: 'nutrition' | 'processing' | 'dose' | 'evidence' | 'ingredients';
  label: string;
  tone: MeasureTone;
  verdict: string;
  detail?: string | null;
}

/** The overall read of a product: the worst of a few cited checks, never a score. */
export interface ProductVerdict {
  level: 'good' | 'mixed' | 'poor' | 'unknown';
  tone: MeasureTone;
  headline: string;
  summary: string;
  pillars: VerdictPillar[];
  reviewed_count: number;
  ingredient_count: number;
  basis: string;
}

export interface ReviewFinding {
  ingredient_id: string;
  ingredient: string;
  label: string;
  tone: MeasureTone;
  claim?: string | null;
  products: string[];
}

/** What holds up, what to know and what overlaps across a stack. */
export interface StackReview {
  supported: ReviewFinding[];
  risks: ReviewFinding[];
  overlaps: ReviewFinding[];
  product_count: number;
  ingredient_count: number;
  reviewed_count: number;
}

export interface BioDomain {
  name: string;
  value: number;
  is_negative?: boolean;
}

export interface Recommendation {
  context: string;
  protocol: string;
}

export interface Citation {
  text: string;
  journal?: string;
}

// ─── Measures: a label value against a cited reference (every bar) ────────────

export type MeasureTone = 'neutral' | 'good' | 'moderate' | 'weak';

export interface MeasureSource {
  name: string;
  url?: string | null;
  detail?: string | null;
}

export interface Measure {
  key: string;
  label: string;
  kind: 'limit' | 'goal' | 'reference' | 'dose' | 'contaminant';
  value: number;
  unit: string;
  display_value: string;
  percent?: number | null;
  position: number;          // 0–1 along the scale
  band: string;
  tone: MeasureTone;
  verdict: string;
  sentence: string;
  servings_note?: string | null;  // "1½ servings reach the daily sodium limit"
  panel_label: string;
  scale: {
    max: number;
    ticks: { value: number; label: string }[];
    zones: { start: number; end: number; tone: MeasureTone }[];
    band_label?: string | null;   // names the bracketed range on a ruler
    limit_label?: string | null;  // names the ruled-in limit
  };
  sources: MeasureSource[];
  ingredient_id?: string | null;
}

export interface NutritionPanel {
  basis: 'serving' | '100g';
  serving_label: string;
  measures: Measure[];
}

export interface AdditiveItem {
  name: string;
  ingredient_id?: string | null;
  reason?: string | null;
  note?: string | null;   // the researched claim behind the flag
}

export interface AdditivesSummary {
  avoid: AdditiveItem[];
  watch: AdditiveItem[];
  clean_count: number;
  unreviewed_count: number;
}

export interface ProcessingInfo {
  nova_group: number;
  label: string;
  position: number;
  tone: MeasureTone;
  source: MeasureSource;
}

// ─── Ingredient rules (what the law says, place by place) ───────────────────

export interface RuleSource {
  authority: string;
  legal_reference: string | null;
  url: string;
  last_checked_at: string;
}

export interface PlaceRule {
  id: string;
  status: string;
  status_label: string;
  applies_to: string | null;
  sub_scope: string | null;
  condition: string | null;
  effective_from: string | null;
  effective_until: string | null;
  why: string | null;
  source: RuleSource;
}

export interface PlaceRow {
  place: string;
  place_name: string;
  is_yours: boolean;
  via_place: string | null;
  checked_no_rule: boolean;
  rules: PlaceRule[];
}

export interface ExpertView {
  id: string;
  body: string;
  body_name: string;
  classification: string | null;
  explainer: string | null;
  effective_from: string | null;
  source: RuleSource;
}

export interface SubstanceRules {
  substance_id: string;
  name: string;
  scope_label: string | null;
  summary: string | null;
  places: PlaceRow[];
  expert_views: ExpertView[];
}

export interface RulesBlock {
  country: string;
  substances: SubstanceRules[];
  last_checked_at: string | null;
}

export interface RuleNote {
  text: string;
  status: string;
  place: string;
  more: number;
  substance_id: string;
  substance_name: string | null;
}

export interface RulesGlance {
  where_you_live: number;
  elsewhere: number;
}

export interface SubstanceDetail {
  id: string;
  name: string;
  e_number: string | null;
  inci: string | null;
  ingredient_ids: string[];
  rules: RulesBlock;
}

export interface Product {
  id: string;
  barcode?: string;
  name: string;
  brand?: string;
  category: 'food' | 'supplement' | 'cosmetic' | 'otc';
  subcategory?: string;
  description?: string;
  image_url?: string;
  grade: string;
  tags?: string[];
  has_allergen_warning: boolean;
  allergen_warning?: string;
  is_ai_generated: boolean;
  ingredients: Ingredient[];
  bio_domains: BioDomain[];
  recommendations: Recommendation[];
  citations: Citation[];
  attribution?: {
    source_name: string;
    source_url: string;
    attribution_text: string;
    data_license_name?: string | null;
    data_license_url?: string | null;
    image_license_name?: string | null;
    image_license_url?: string | null;
  } | null;
  nutrition?: NutritionPanel | null;
  doses?: Measure[];
  additives?: AdditivesSummary | null;
  processing?: ProcessingInfo | null;
  /** Substances found only through E-number tags, and the "At a glance" counts. Absent from older backends. */
  rule_extras?: RuleNote[];
  rules_glance?: RulesGlance | null;
  verdict?: ProductVerdict | null;
}

export interface ProductListItem {
  id: string;                 // product UUID, or "catalog:<n>" for a product we haven't loaded yet
  name: string;
  brand?: string;
  category: string;
  grade: string | null;       // null until we hold the full product
  is_ai_generated: boolean;
  image_url?: string;
  in_catalog_only?: boolean;
}

export interface ProductSearchResponse {
  products: ProductListItem[];
  total: number;
  ai_generated: boolean;
}

export type IngestionJobStatus =
  | 'queued'
  | 'running'
  | 'retry'
  | 'complete'
  | 'needs_review'
  | 'dead';

/** What the catalog index knows about a product while its full details load. */
export interface CatalogPreview {
  name: string;
  brand?: string | null;
  image_url?: string | null;
  category: string;
}

export interface BarcodeIngestionResponse {
  job_id: string;
  status: IngestionJobStatus;
  gtin14?: string;
  product_id?: string | null;
  poll_after_ms: number;
  message: string;
  preview?: CatalogPreview | null;
}

export function isBarcodeIngestionResponse(
  value: Product | BarcodeIngestionResponse,
): value is BarcodeIngestionResponse {
  return 'job_id' in value && 'status' in value;
}

export interface LabInterpretation {
  classification: string;
  summary?: string | null;
  jurisdiction?: string | null;
  population_context?: string | null;
  threshold_name?: string | null;
  threshold_source_url?: string | null;
  threshold_version?: string | null;
  threshold_value?: number | null;
  threshold_unit?: string | null;
}

export interface LabObservation {
  observation_id: string;
  analyte_name: string;
  value?: number | null;
  unit: string;
  basis?: string | null;
  qualifier?: string | null;
  raw_value?: string | null;
  detection_status: string;
  lod?: number | null;
  loq?: number | null;
  uncertainty?: number | null;
  uncertainty_unit?: string | null;
  method_name: string;
  laboratory_name?: string | null;
  analyzed_at?: string | null;
  sample_external_id: string;
  sample_name: string;
  lot_number?: string | null;
  dataset_title: string;
  publisher: string;
  source_url: string;
  dataset_version?: string | null;
  license_name?: string | null;
  applicability: string;
  trust_grade: string;
  measure?: Measure | null;
  interpretations: LabInterpretation[];
}

export interface ProductLabResultsResponse {
  product_id: string;
  observations: LabObservation[];
}

// ─── Server-side Personalization ─────────────────────────────────────────────
// Mirrors app/schemas/personalization.py and utils/personalization.ts types.
// The server returns this shape from GET /products/{id}/personalize so the
// client can replace the locally-computed PersonalAnalysis / IngredientPersonalization
// with the richer evidence-backed version without any data transformation.

export interface ServerConcernFlag {
  concern: string;
  label: string;
}

export interface ServerGoalSupport {
  goal: string;
  label: string;
}

export interface ServerIngredientPersonalization {
  concernFlags: ServerConcernFlag[];
  goalSupports: ServerGoalSupport[];
}

export interface ServerPersonalAnalysis {
  concerns: { ingredientName: string; concern: string; label: string }[];
  goals: { ingredientName: string; goal: string; label: string }[];
  hasConcernFlags: boolean;
  hasGoalSupports: boolean;
  /** keyed by ingredient display name */
  perIngredient: Record<string, ServerIngredientPersonalization>;
  /** "evidence" | "keyword" | "hybrid" | "none" */
  source: string;
}

// ─── Ingredient deep dive ─────────────────────────────────────────────────────

export interface IngredientEvidenceRecord {
  id: string;
  pmid: string | null;
  title: string | null;
  journal: string | null;
  year: number | null;
  study_type: string | null;
  population: string | null;
  sample_size: number | null;
  finding: string;
  direction: 'benefit' | 'risk' | 'neutral' | 'mixed';
  effect_size: 'strong' | 'moderate' | 'weak' | null;
  confidence: 'high' | 'moderate' | 'low';
  concern_tags: string[];
  goal_tags: string[];
  // How the study was done — absent for studies from the pre-claims pipeline
  method_summary?: string | null;
  caveat?: string | null;
  quality_score?: number | null;
  quality_tier?: 'high' | 'moderate' | 'low' | 'very_low' | null;
  quality_flags?: { code: string; label: string }[];
  intervention_form?: string | null;
  dose_amount?: number | null;
  dose_unit?: string | null;
  dose_frequency?: string | null;
  duration_weeks?: number | null;
  outcome_type?: string | null;
}

/** Something people believe about an ingredient, judged from the studies that test it. */
export interface IngredientClaim {
  id: string;
  kind: 'benefit' | 'safety';
  claim: string;
  why_people_believe: string | null;
  verdict: 'strong' | 'moderate' | 'limited' | 'mixed' | 'unlikely' | 'insufficient' | null;
  certainty: 'high' | 'moderate' | 'low' | 'very_low' | null;
  certainty_reasons: string[];
  reality: string | null;
  effect_size: string | null;
  applies_to: string | null;
  avoid_if: string | null;
  dose_note: string | null;
  key_pmids: string[];
  study_count: number;
  /** Strongest first */
  studies: { evidence_id: string; stance: 'supports' | 'refutes' | 'inconclusive'; relevance: string }[];
}

export interface IngredientFoundInProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  image_url: string | null;
  amount: string | null;
  status: 'clean' | 'watch' | 'avoid' | null;
}

export interface IngredientBioDomainScore {
  biodomain: string;
  direction: 'benefit' | 'harm' | 'neutral' | 'mixed';
  magnitude: number;          // 0.0 – 1.0
  confidence: 'high' | 'moderate' | 'low';
  dose_dependent: boolean;
  effective_dose_low: number | null;
  effective_dose_high: number | null;
  dose_unit: string | null;
  evidence_count: number;
  notes: string | null;
}

export interface IngredientDetail {
  id: string;
  canonical_name: string;
  category: string;
  description: string | null;
  mechanism_summary: string | null;
  // Belief vs. reality
  common_belief: string | null;
  evidence_reality: string | null;
  // Dosage / safety
  typical_dose_range: string | null;
  recommended_daily: string | null;
  upper_limit: string | null;
  side_effects: string[];
  contraindications: string[];
  drug_interactions: string[];
  // Research
  evidence_level: string | null;
  research_status: string;
  // Biodomain impact scores
  biodomain_scores: IngredientBioDomainScore[];
  // Mechanism image (set by research agent after illustration generation)
  mechanism_image_url: string | null;
  // 2D chemical structure image (from PubChem), null when no single structure exists
  structure_image_url: string | null;
  // Pre-computed per-bio-domain effect signal (JSONB from model)
  domain_effects: Record<string, {
    direction: 'benefit' | 'risk' | 'neutral' | 'mixed';
    confidence: 'high' | 'moderate' | 'low';
    evidence_count: number;
    top_finding: string | null;
  }> | null;
  /** Absent from older backends; empty before claim-based research */
  claims?: IngredientClaim[];
  evidence: IngredientEvidenceRecord[];
  found_in: IngredientFoundInProduct[];
  /** What the law and expert bodies say; absent from older backends, null when no substance is linked */
  rules?: RulesBlock | null;
  // Peptide-specific fields (null for non-peptide ingredients)
  us_regulatory_status: string | null;
  wada_status: string | null;
  admin_routes: string[] | null;
  admin_route_notes: string | null;
  cycle_length_weeks: number | null;
  washout_weeks: number | null;
  cycling_notes: string | null;
}

export interface IngredientListItem {
  id: string;
  canonical_name: string;
  category: string;
  description: string | null;
  evidence_level: string | null;
  research_status: string;
}

export interface IngredientSearchResponse {
  ingredients: IngredientListItem[];
  total: number;
}

export interface PeptideListItem {
  id: string;
  canonical_name: string;
  mechanism_summary: string | null;
  evidence_level: string | null;
  us_regulatory_status: string | null;
  wada_status: string | null;
}

export interface PeptidesResponse {
  peptides: PeptideListItem[];
  total: number;
}

// ─── Domain Analysis ─────────────────────────────────────────────────────────

export interface IngredientImpact {
  ingredient_id: string;
  name: string;
  category: string;
  /** "benefit" | "risk" | "neutral" | "mixed" — from real PubMed evidence */
  direction: 'benefit' | 'risk' | 'neutral' | 'mixed';
  /** "high" | "moderate" | "low" — best confidence across relevant studies */
  confidence: 'high' | 'moderate' | 'low';
  evidence_count: number;
  domain_relevance: number; // 0–1
  top_finding: string | null;
  typical_dose_range: string | null;
}

export interface MissingIngredient {
  ingredient_id: string;
  canonical_name: string;
  category: string;
  evidence_level: string | null;
  description: string | null;
  mechanism_summary: string | null;
  typical_dose_range: string | null;
  top_finding: string | null;
}

export interface DomainEvidenceHighlight {
  ingredient_name: string;
  finding: string;
  journal: string | null;
  year: number | null;
  study_type: string | null;
  sample_size: number | null;
  direction: string;
  confidence: string;
  pmid: string | null;
}

export interface GoalCoverage {
  goal: string;
  /** "covered" | "partial" | "gap" */
  status: 'covered' | 'partial' | 'gap';
  /** canonical ingredient names that have evidence supporting this goal */
  covered_by: string[];
}

export interface DomainAnalysis {
  slug: string;
  ingredient_impacts: IngredientImpact[];
  missing_ingredients: MissingIngredient[];
  evidence_highlight: DomainEvidenceHighlight | null;
  goal_coverage: GoalCoverage[];
}

// ─── Stack Assistant Chat ─────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessageItem[];
  total: number;
}

export interface StackProduct {
  name: string;
  brand?: string;
  category: string;
  grade: string;
  ingredients: string[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  stack_context: {
    products: StackProduct[];
    domain_scores: Record<string, number>;
    goals: string[];
  };
}

// ─── Atelier ─────────────────────────────────────────────────────────────────

export interface CircadianScheduleItem {
  time: string;
  ingredient_name: string;
  note: string;
  with_food: boolean;
  synergy: boolean;
  evidence_dots: number;
}

export interface CircadianResponse {
  chronotype: string;
  schedule: CircadianScheduleItem[];
  empty_reason?: string | null;
}

export interface ConflictNode {
  id: string;
  label: string;
  tone: string;
}

export interface ConflictEdge {
  ingredient_a_id: string;
  ingredient_b_id: string;
  type: string;
  mechanism: string;
  confidence: string;
}

export interface ConflictNote {
  type: string;
  pair: string;
  note: string;
}

export interface ConflictMapResponse {
  nodes: ConflictNode[];
  edges: ConflictEdge[];
  notes: ConflictNote[];
}

export interface EvidenceArticle {
  ingredient: string;
  tone: string;
  dots: number;
  headline: string;
  excerpt: string;
  journal: string;
}

export interface EvidencePulseResponse {
  articles: EvidenceArticle[];
}

export interface ExposureDay {
  date: string;
  high: number;
  moderate: number;
  low: number;
}

export interface ExposureCategory {
  name: string;
  load: number;
  delta: string;
  sources: number;
  alert: boolean;
  note: string;
}

export interface ExposureLedgerResponse {
  summary: string;
  chart: ExposureDay[];
  categories: ExposureCategory[];
  caveat: string;
}

// ─── Meal Analysis ───────────────────────────────────────────────────────────

export interface RecognizedFood {
  name: string;
  estimated_amount?: string;
  confidence: number;
  category: string;
}

export interface MealAnalysisResponse {
  foods: RecognizedFood[];
  meal_summary: string;
  analysis_type: 'image' | 'text';
}

// ─── Onboarding Profile ──────────────────────────────────────────────────────
// Collected during onboarding and sent to PUT /users/me on sign-up.
// Drives the server-side personalization layer (Option A architecture).
export interface OnboardingProfile {
  biologicalSex: 'male' | 'female' | 'not_specified';
  ageRange: 'under_25' | '25_34' | '35_44' | '45_54' | '55_plus' | '';
  isPregnant: boolean;
  isBreastfeeding: boolean;
  sleepQuality: 'excellent' | 'good' | 'fair' | 'poor' | '';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete' | '';
  dietaryPattern: string[];
  environment: 'urban' | 'suburban' | 'rural' | '';
  productCategories: string[];
  // max 2 — determines which bio-domains are prioritized
  focusAreas: string[];
  // triggers personalized safety warnings on product pages
  healthConcerns: string[];
  // max 3 — highlights supporting evidence in product analysis
  goals: string[];
}

// User Profile Types
export interface UserHealthProfile {
  id: string;
  email?: string;
  name?: string;
  biological_sex?: 'male' | 'female' | 'other';
  birth_year?: number;
  allergies: string[];
  conditions: string[];
  medications: string[];
  dietary_preferences: string[];
  health_goals: string[];
  // Onboarding profile fields
  age_range?: string;
  focus_areas: string[];
  health_concerns: string[];
  is_pregnant: boolean;
  is_breastfeeding: boolean;
  onboarding_completed: boolean;
  sleep_quality?: string;
  activity_level?: string;
  dietary_pattern: string[];
  environment?: string;
  product_categories: string[];
}

export interface UserHealthProfileUpdate {
  name?: string;
  biological_sex?: 'male' | 'female' | 'other';
  birth_year?: number;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  dietary_preferences?: string[];
  health_goals?: string[];
  // Onboarding profile fields
  age_range?: string;
  focus_areas?: string[];
  health_concerns?: string[];
  is_pregnant?: boolean;
  is_breastfeeding?: boolean;
  onboarding_completed?: boolean;
  sleep_quality?: string;
  activity_level?: string;
  dietary_pattern?: string[];
  environment?: string;
  product_categories?: string[];
}

// Subscription Types
// Mirrors backend SubscriptionTier / SubscriptionStatus enums in app/models/subscription.py
export interface Subscription {
  tier: 'free' | 'premium';
  status: 'active' | 'expired' | 'canceled' | 'grace_period';
  is_premium: boolean;
  expires_at?: string | null;
}

// Stack Types
// Mirrors backend StackEntryResponse in app/schemas/user.py
export interface StackEntry {
  /** Entry UUID — used as path param for DELETE /users/me/stack/{id} */
  id: string;
  product_id: string;
  product_name: string;
  product_brand?: string | null;
  product_image_url?: string | null;
  product_grade: string;
  product_category: string;
  logged_at: string;
  time_of_day?: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
  created_at: string;
}

// Scan History Types
export interface ScanHistoryItem {
  id: string;
  product_id: string;
  product_name: string;
  product_brand?: string;
  product_grade: string;
  product_category: string;
  product_image_url?: string | null;
  scanned_at: string;
}

export interface ScanHistoryResponse {
  items: ScanHistoryItem[];
  total: number;
}

// Search History Types
export interface SearchHistoryItem {
  id: string;
  query: string;
  result_type: string;
  searched_at: string;
}

export interface SearchHistoryResponse {
  items: SearchHistoryItem[];
  total: number;
}

// Daily Longevity Score Types
export interface DailyScoreCategory {
  key: string;
  label: string;
  value: number;
}

export interface DailyScoreResponse {
  overall: number;
  qualifier: string;
  categories: DailyScoreCategory[];
}

export interface HealthDomainFactor {
  ingredient_name: string;
  strength: string;
  direction: 'benefit' | 'harm' | 'neutral';
}

export interface HealthDomainResponse {
  biodomain: string;
  label: string;
  score: number;
  qualifier: string;
  factors: HealthDomainFactor[];
}

// Tester insights
export type ClientEventType = 'search' | 'product_view' | 'stack_add' | 'feedback';

export interface ClientEventFields {
  product_id?: string;
  barcode?: string;
  query?: string;
  meta?: Record<string, unknown>;
}

export type SubmissionCategory = 'food' | 'supplement' | 'cosmetic' | 'otc' | 'other';

export interface SubmissionPhoto {
  uri: string;
  name: string;
  type: string;
}

export interface ProductSubmissionInput {
  barcode?: string;
  name?: string;
  brand?: string;
  category?: SubmissionCategory;
  note?: string;
  photos: SubmissionPhoto[];
}

const APP_VERSION = Constants.expoConfig?.version ?? 'dev';

// ─── Auth token provider ────────────────────────────────────────────────────
// Set by AuthProvider after Supabase initialises. Avoids a circular import
// between api.ts ↔ lib/supabase.ts.
let _authTokenProvider: (() => Promise<string | null>) | null = null;

export function configureAuthTokenProvider(fn: () => Promise<string | null>) {
  _authTokenProvider = fn;
}

/** `?country=FR` so rules come back with the person's own country first. */
const countryQuery = (country?: string) => (country ? `?country=${encodeURIComponent(country)}` : '');

class APIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`[API] Fetching: ${url}`);

    // Auto-attach Supabase JWT when available (explicit headers override this)
    let sessionHeader: Record<string, string> = {};
    if (_authTokenProvider) {
      const token = await _authTokenProvider();
      if (token) sessionHeader = { Authorization: `Bearer ${token}` };
    }
    // Multipart bodies need fetch to set their own boundary header.
    const isForm = typeof FormData !== 'undefined' && options?.body instanceof FormData;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...(isForm ? {} : { 'Content-Type': 'application/json' }),
          'X-Device-Id': await getDeviceId(),
          'X-App-Version': APP_VERSION,
          ...sessionHeader,
          ...options?.headers, // explicit headers win (e.g. caller passes their own token)
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        const detail = typeof error.detail === 'string' ? error.detail : `HTTP ${response.status}`;
        throw Object.assign(new Error(detail), { status: response.status });
      }

      if (response.status === 204) return undefined as T;
      return response.json();
    } catch (error) {
      // 401s are expected for guests hitting account endpoints — don't raise a dev error toast.
      const log = (error as { status?: number }).status === 401 ? console.log : console.error;
      log(`[API] Error fetching ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Get all products with optional filtering
   */
  async getProducts(params?: {
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<ProductSearchResponse> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.fetch<ProductSearchResponse>(`/products${query}`);
  }

  /**
   * Get product by ID.
   * IDs prefixed with "usda-" are routed to the USDA foods endpoint.
   */
  async getProduct(productId: string): Promise<Product> {
    if (productId.startsWith('usda-')) {
      const fdcId = productId.slice(5); // strip "usda-"
      return this.fetch<Product>(`/foods/${fdcId}`);
    }
    return this.fetch<Product>(`/products/${productId}`);
  }

  /** Open any product id — including "catalog:<n>", which may answer 202 with a preview while it loads. */
  async openProduct(productId: string, country?: string): Promise<Product | BarcodeIngestionResponse> {
    if (productId.startsWith('usda-')) return this.getProduct(productId);
    return this.fetch<Product | BarcodeIngestionResponse>(`/products/${encodeURIComponent(productId)}${countryQuery(country)}`);
  }

  /**
   * Get product by barcode (used by scanner)
   */
  async getProductByBarcode(barcode: string): Promise<Product | BarcodeIngestionResponse> {
    return this.fetch<Product | BarcodeIngestionResponse>(`/products/barcode/${barcode}`);
  }

  /** Poll a product verification job returned by a first-time barcode scan. */
  async getIngestionStatus(jobId: string): Promise<BarcodeIngestionResponse> {
    return this.fetch<BarcodeIngestionResponse>(`/products/ingestion/${jobId}`);
  }

  /** Public, product-linked measurements with dataset and method provenance. */
  async getProductLabResults(productId: string): Promise<ProductLabResultsResponse> {
    return this.fetch<ProductLabResultsResponse>(`/lab-results/products/${productId}`);
  }

  /**
   * Server-side text search: GET /products/search?q=xxx
   * Used by the search screen (debounced, min 2 chars).
   */
  async searchProducts(
    query: string,
    params?: { limit?: number; category?: string; country?: string }
  ): Promise<ProductSearchResponse> {
    const qp = new URLSearchParams({ q: query });
    if (params?.limit) qp.append('limit', params.limit.toString());
    if (params?.category) qp.append('category', params.category);
    if (params?.country) qp.append('country', params.country);
    qp.append('include_catalog', 'true');
    return this.fetch<ProductSearchResponse>(`/products/search?${qp.toString()}`);
  }

  /**
   * Search USDA Foundation + SR Legacy whole foods (salmon, broccoli, eggs, etc.)
   * Returns ProductListItem-compatible results with id = "usda-{fdcId}".
   */
  async searchFoods(query: string, limit = 10): Promise<ProductSearchResponse> {
    const qp = new URLSearchParams({ q: query, limit: String(limit) });
    return this.fetch<ProductSearchResponse>(`/foods/search?${qp.toString()}`);
  }

  // ============================================
  // User Profile Methods
  // ============================================

  /**
   * Get current user's health profile
   */
  async getHealthProfile(authToken: string): Promise<UserHealthProfile> {
    return this.fetch<UserHealthProfile>('/users/me', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  /**
   * Update current user's health profile
   */
  async updateHealthProfile(
    authToken: string,
    data: UserHealthProfileUpdate
  ): Promise<UserHealthProfile> {
    return this.fetch<UserHealthProfile>('/users/me', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(data),
    });
  }

  // ============================================
  // Subscription Methods
  // ============================================

  /**
   * Get current user's subscription status
   */
  async getSubscription(authToken: string): Promise<Subscription> {
    return this.fetch<Subscription>('/users/me/subscription', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  /**
   * Verify subscription status with RevenueCat
   */
  async verifySubscription(authToken: string): Promise<Subscription> {
    return this.fetch('/users/me/subscription/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  // ============================================
  // Scan History Methods
  // ============================================

  /**
   * Get user's scan history (auth token injected automatically)
   */
  async getScanHistory(params?: {
    limit?: number;
    offset?: number;
  }): Promise<ScanHistoryResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.fetch<ScanHistoryResponse>(`/users/me/history${query}`);
  }

  /**
   * Add a product view/scan to history (auth token injected automatically)
   */
  async addToScanHistory(productId: string): Promise<ScanHistoryItem> {
    return this.fetch<ScanHistoryItem>('/users/me/history', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    });
  }

  // ============================================
  // Search History Methods
  // ============================================

  /**
   * Get user's search history (auth token injected automatically)
   */
  async getSearchHistory(params?: {
    limit?: number;
    offset?: number;
  }): Promise<SearchHistoryResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.fetch<SearchHistoryResponse>(`/users/me/search-history${query}`);
  }

  /**
   * Log a search in history (auth token injected automatically)
   */
  async addToSearchHistory(query: string, resultType: 'product' | 'ingredient' = 'product'): Promise<SearchHistoryItem> {
    return this.fetch<SearchHistoryItem>('/users/me/search-history', {
      method: 'POST',
      body: JSON.stringify({ query, result_type: resultType }),
    });
  }

  // ============================================
  // Daily Score Methods
  // ============================================

  /**
   * Get the Daily Longevity Score for the user's current-day stack.
   */
  async getDailyScore(): Promise<DailyScoreResponse> {
    return this.fetch<DailyScoreResponse>('/users/me/daily-score');
  }

  /**
   * Get a single biodomain's score + top contributing ingredients from today's stack.
   * `biodomain` is one of the canonical keys in app/core/biodomains.py (backend).
   */
  async getHealthDomain(biodomain: string): Promise<HealthDomainResponse> {
    return this.fetch<HealthDomainResponse>(`/users/me/health-domain/${biodomain}`);
  }

  /**
   * Score an explicit list of products (the on-device stack). Works for guests.
   */
  async getStackReview(productIds: string[]): Promise<StackReview> {
    return this.fetch<StackReview>('/scores/review', {
      method: 'POST',
      body: JSON.stringify({ product_ids: productIds.slice(0, 50) }),
    });
  }

  async getStackScore(productIds: string[]): Promise<DailyScoreResponse> {
    return this.fetch<DailyScoreResponse>('/scores/daily', {
      method: 'POST',
      body: JSON.stringify({ product_ids: productIds.slice(0, 50) }),
    });
  }

  /**
   * One biodomain's score + top contributing ingredients for the given products.
   */
  async getStackDomain(biodomain: string, productIds: string[]): Promise<HealthDomainResponse> {
    return this.fetch<HealthDomainResponse>(`/scores/domain/${biodomain}`, {
      method: 'POST',
      body: JSON.stringify({ product_ids: productIds.slice(0, 50) }),
    });
  }

  // ============================================
  // Tester insights
  // ============================================

  async trackEvent(body: { type: ClientEventType } & ClientEventFields): Promise<void> {
    await this.fetch<void>('/insights/events', { method: 'POST', body: JSON.stringify(body) });
  }

  /**
   * Send a product we don't have yet, with up to three label photos.
   */
  async submitProduct(input: ProductSubmissionInput): Promise<{ id: string; photos_stored: number }> {
    const form = new FormData();
    for (const key of ['barcode', 'name', 'brand', 'category', 'note'] as const) {
      const value = input[key]?.trim();
      if (value) form.append(key, value);
    }
    // React Native's FormData accepts { uri, name, type } file descriptors.
    input.photos.forEach((photo) => form.append('photos', photo as unknown as Blob));
    return this.fetch<{ id: string; photos_stored: number }>('/insights/submissions', {
      method: 'POST',
      body: form,
    });
  }

  // ============================================
  // Stack Methods
  // ============================================

  /**
   * Get user's product stack.
   * Returns StackEntry[] — each entry has its own UUID (id) used for deletion.
   */
  async getStack(authToken: string): Promise<StackEntry[]> {
    const entries: StackEntry[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.fetch<StackEntry[]>(`/users/me/stack?scope=all&limit=100&offset=${offset}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      entries.push(...page);
      if (page.length < 100) return entries;
    }
  }

  /**
   * Add product to stack.
   * Returns the created StackEntry (includes the entry UUID needed for later deletion).
   */
  async addToStack(
    authToken: string,
    productId: string,
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night',
    options?: {
      loggedAt?: Date | string;
      quantity?: number;
      unit?: string;
      notes?: string;
    },
  ): Promise<StackEntry> {
    const body: Record<string, unknown> = {
      product_id: productId,
      time_of_day: timeOfDay,
    };
    if (options?.loggedAt) {
      body.logged_at = options.loggedAt instanceof Date
        ? options.loggedAt.toISOString()
        : options.loggedAt;
    }
    if (options?.quantity !== undefined) body.quantity = options.quantity;
    if (options?.unit) body.unit = options.unit;
    if (options?.notes) body.notes = options.notes;

    return this.fetch<StackEntry>('/users/me/stack', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify(body),
    });
  }

  /**
   * Remove a stack entry by its entry UUID (not the product UUID).
   * Use the `id` field from the StackEntry returned by getStack() / addToStack().
   */
  async removeFromStack(authToken: string, entryId: string): Promise<void> {
    return this.fetch(`/users/me/stack/${entryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  // ============================================
  // Personalization Methods
  // ============================================

  /**
   * Fetch server-side personalization overlay for a product.
   *
   * Passes the user's concern and goal IDs as query params.
   * The server runs both evidence-based (PubMed) and keyword matching,
   * returning a merged result in the same shape as the client-side
   * PersonalAnalysis / IngredientPersonalization types.
   *
   * Unauthenticated — no auth token required until Supabase is wired up.
   */
  async personalizeProduct(
    productId: string,
    concerns: string[],
    goals: string[]
  ): Promise<ServerPersonalAnalysis> {
    const params = new URLSearchParams();
    if (concerns.length > 0) params.append('concerns', concerns.join(','));
    if (goals.length > 0) params.append('goals', goals.join(','));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.fetch<ServerPersonalAnalysis>(`/products/${productId}/personalize${query}`);
  }

  // ============================================
  // Ingredient Methods
  // ============================================

  /**
   * Search canonical ingredients by name.
   * Used by the Search tab when the user switches to ingredient mode.
   */
  async searchIngredients(query: string, limit = 20): Promise<IngredientSearchResponse> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return this.fetch<IngredientSearchResponse>(`/ingredients/search?${params}`);
  }

  /**
   * Get full ingredient deep dive by ID.
   * Returns mechanism, belief/reality summary, evidence records, and found-in products.
   */
  async getIngredient(ingredientId: string, country?: string): Promise<IngredientDetail> {
    return this.fetch<IngredientDetail>(`/ingredients/${ingredientId}${countryQuery(country)}`);
  }

  /** A regulated substance's rules — for label ingredients we haven't researched. */
  async getSubstance(substanceId: string, country?: string): Promise<SubstanceDetail> {
    return this.fetch<SubstanceDetail>(`/substances/${substanceId}${countryQuery(country)}`);
  }

  /**
   * Fetch an ingredient by ID, returning null on error.
   * Used by screens that want graceful error handling.
   */
  async getIngredientWithFallback(ingredientId: string, country?: string): Promise<IngredientDetail | null> {
    try {
      return await this.getIngredient(ingredientId, country);
    } catch {
      return null;
    }
  }

  /**
   * Get peptides list with optional filtering.
   * Supports search by name, US regulatory status, and WADA safety.
   */
  async getPeptides(params?: {
    search?: string;
    us_status?: string;
    wada_safe?: boolean;
  }): Promise<PeptidesResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.us_status) query.set('us_status', params.us_status);
    if (params?.wada_safe) query.set('wada_safe', 'true');
    const qs = query.toString();
    return this.fetch<PeptidesResponse>(`/peptides${qs ? `?${qs}` : ''}`);
  }

  /**
   * Full scientific domain analysis for the user's stack.
   *
   * Sends the stack's product IDs and user goals to the backend which:
   *   • Resolves ingredient_ids via product_ingredients FK
   *   • Aggregates evidence direction from PubMed records (goal_tags filtered)
   *   • Identifies missing high-evidence ingredients for this domain
   *   • Picks the strongest clinical highlight from the stack
   *   • Computes per-goal coverage from actual evidence goal_tags
   *
   * Returns an empty-ish response (no impacts/missing) when the research
   * pipeline hasn't been run yet — the UI falls back to hardcoded constants.
   */
  async analyzeDomain(
    slug: string,
    productIds: string[],
    goals: string[],
  ): Promise<DomainAnalysis> {
    const params = new URLSearchParams();
    if (productIds.length > 0) params.set('product_ids', productIds.join(','));
    if (goals.length > 0) params.set('goals', goals.join(','));
    return this.fetch<DomainAnalysis>(`/domains/${slug}/analyze?${params.toString()}`);
  }

  /**
   * Send a message to the Elory stack assistant.
   * Passes full conversation history + stack context; returns Claude's reply.
   */
  async chatMessage(request: ChatRequest): Promise<{ message: string }> {
    return this.fetch<{ message: string }>('/chat/message', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getChatHistory(authToken: string, limit = 50, offset = 0): Promise<ChatHistoryResponse> {
    return this.fetch<ChatHistoryResponse>(
      `/chat/history?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
  }

  async deleteChatHistory(authToken: string): Promise<void> {
    await this.fetch<unknown>('/chat/history', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  async getCircadian(authToken: string): Promise<CircadianResponse> {
    return this.fetch<CircadianResponse>('/atelier/circadian', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  async getEvidencePulse(authToken: string, limit = 10): Promise<EvidencePulseResponse> {
    return this.fetch<EvidencePulseResponse>(
      `/atelier/evidence-pulse?limit=${limit}`,
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
  }

  async getConflictMap(authToken: string): Promise<ConflictMapResponse> {
    return this.fetch<ConflictMapResponse>('/atelier/conflict-map', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  async getExposureLedger(authToken: string): Promise<ExposureLedgerResponse> {
    return this.fetch<ExposureLedgerResponse>('/atelier/exposure-ledger', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  async sendChatMessage(
    authToken: string,
    messages: { role: string; content: string }[],
    stackContext: { products: unknown[]; domain_scores: Record<string, number>; goals: string[] },
  ): Promise<{ message: string }> {
    return this.fetch<{ message: string }>('/chat/message', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ messages, stack_context: stackContext }),
    });
  }

  /**
   * Analyze a meal photo or free-text description with Claude AI.
   * Provide either image_base64 (base64-encoded JPEG) or description (free text).
   */
  async analyzeMeal(payload: {
    image_base64?: string;
    description?: string;
  }): Promise<MealAnalysisResponse> {
    return this.fetch<MealAnalysisResponse>('/meals/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const api = new APIService();

/**
 * Fetch a product by ID, returning null instead of throwing on error.
 * Used by the product detail screen so it can show a graceful error state.
 */
export async function getProductWithFallback(id: string, country?: string): Promise<Product | BarcodeIngestionResponse | null> {
  try {
    return await api.openProduct(id, country);
  } catch {
    return null;
  }
}
