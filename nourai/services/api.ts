/**
 * API Service for Elory Backend
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://192.168.0.163:8081/api/v1' : '');

export interface Ingredient {
  name: string;
  concentration?: string;
  tag?: string;
  tag_type?: string;
  description?: string;
  ingredient_id?: string | null;   // FK to canonical ingredient — present when matched
  is_nutrient?: boolean;           // True for rows from the OFF nutrition panel
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
}

export interface ProductListItem {
  id: string;
  name: string;
  brand?: string;
  category: string;
  grade: string;
  is_ai_generated: boolean;
  image_url?: string;
}

export interface ProductSearchResponse {
  products: ProductListItem[];
  total: number;
  ai_generated: boolean;
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
  // Pre-computed per-bio-domain effect signal (JSONB from model)
  domain_effects: Record<string, {
    direction: 'benefit' | 'risk' | 'neutral' | 'mixed';
    confidence: 'high' | 'moderate' | 'low';
    evidence_count: number;
    top_finding: string | null;
  }> | null;
  evidence: IngredientEvidenceRecord[];
  found_in: IngredientFoundInProduct[];
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
export interface Subscription {
  id: string;
  user_id: string;
  tier: 'free' | 'premium_monthly' | 'premium_annual' | 'family';
  status: 'active' | 'cancelled' | 'expired' | 'billing_issue';
  expires_at?: string;
  store: 'app_store' | 'play_store';
  created_at: string;
  updated_at: string;
}

// Scan History Types
export interface ScanHistoryItem {
  id: string;
  product_id: string;
  product_name: string;
  product_brand?: string;
  product_grade: string;
  product_category: string;
  scanned_at: string;
}

export interface ScanHistoryResponse {
  items: ScanHistoryItem[];
  total: number;
}

// ─── Auth token provider ────────────────────────────────────────────────────
// Set by AuthProvider after Supabase initialises. Avoids a circular import
// between api.ts ↔ lib/supabase.ts.
let _authTokenProvider: (() => Promise<string | null>) | null = null;

export function configureAuthTokenProvider(fn: () => Promise<string | null>) {
  _authTokenProvider = fn;
}

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

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...sessionHeader,
          ...options?.headers, // explicit headers win (e.g. caller passes their own token)
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error(`[API] Error fetching ${endpoint}:`, error);
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
    return this.fetch<ProductSearchResponse>(`/products/${query}`);
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

  /**
   * Get product by barcode (used by scanner)
   */
  async getProductByBarcode(barcode: string): Promise<Product> {
    return this.fetch<Product>(`/products/barcode/${barcode}`);
  }

  /**
   * Server-side text search: GET /products/search?q=xxx
   * Used by the search screen (debounced, min 2 chars).
   */
  async searchProducts(
    query: string,
    params?: { limit?: number; category?: string }
  ): Promise<ProductSearchResponse> {
    const qp = new URLSearchParams({ q: query });
    if (params?.limit) qp.append('limit', params.limit.toString());
    if (params?.category) qp.append('category', params.category);
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
  async verifySubscription(authToken: string): Promise<{
    is_premium: boolean;
    entitlements: string[];
    expires_at: string | null;
  }> {
    return this.fetch('/users/me/subscription/verify', {
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
  // Stack Methods
  // ============================================

  /**
   * Get user's product stack
   */
  async getStack(authToken: string): Promise<ProductListItem[]> {
    return this.fetch<ProductListItem[]>('/users/me/stack', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  /**
   * Add product to stack
   */
  async addToStack(
    authToken: string,
    productId: string,
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night'
  ): Promise<void> {
    return this.fetch('/users/me/stack', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ product_id: productId, time_of_day: timeOfDay }),
    });
  }

  /**
   * Remove product from stack
   */
  async removeFromStack(authToken: string, productId: string): Promise<void> {
    return this.fetch(`/users/me/stack/${productId}`, {
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
  async getIngredient(ingredientId: string): Promise<IngredientDetail> {
    return this.fetch<IngredientDetail>(`/ingredients/${ingredientId}`);
  }

  /**
   * Fetch an ingredient by ID, returning null on error.
   * Used by screens that want graceful error handling.
   */
  async getIngredientWithFallback(ingredientId: string): Promise<IngredientDetail | null> {
    try {
      return await this.getIngredient(ingredientId);
    } catch {
      return null;
    }
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
export async function getProductWithFallback(id: string): Promise<Product | null> {
  try {
    return await api.getProduct(id);
  } catch {
    return null;
  }
}
