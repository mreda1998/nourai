/**
 * API Service for NourAI Backend
 */

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:8001/api/v1' : '');

export interface Ingredient {
  name: string;
  concentration?: string;
  tag?: string;
  tag_type?: string;
  description?: string;
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
// Collected during onboarding and sent to POST /users/me/profile on sign-up.
// Drives the server-side personalization layer (Option A architecture).
export interface OnboardingProfile {
  biologicalSex: 'male' | 'female' | 'not_specified';
  ageRange: 'under_25' | '25_34' | '35_44' | '45_54' | '55_plus' | '';
  isPregnant: boolean;
  isBreastfeeding: boolean;
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
  user_id: string;
  date_of_birth?: string;
  biological_sex?: 'male' | 'female' | 'other';
  is_pregnant: boolean;
  is_breastfeeding: boolean;
  allergies: string[];
  conditions: string[];
  medications: string[];
  dietary_preferences: string[];
  created_at: string;
  updated_at: string;
}

export interface UserHealthProfileUpdate {
  date_of_birth?: string;
  biological_sex?: 'male' | 'female' | 'other';
  is_pregnant?: boolean;
  is_breastfeeding?: boolean;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  dietary_preferences?: string[];
  // Concern taxonomy — maps to server-side personalization engine
  age_range?: string;
  focus_areas?: string[];
  health_concerns?: string[];
  goals?: string[];
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
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ProductSearchResponse> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.fetch<ProductSearchResponse>(`/products/${query}`);
  }

  /**
   * Get product by ID
   */
  async getProduct(productId: string): Promise<Product> {
    return this.fetch<Product>(`/products/${productId}`);
  }

  /**
   * Get product by barcode (used by scanner)
   */
  async getProductByBarcode(barcode: string): Promise<Product> {
    return this.fetch<Product>(`/products/barcode/${barcode}`);
  }

  /**
   * Search products by name/brand
   * If generateIfNotFound is true, will use AI to generate data for unknown products
   */
  async searchProducts(
    query: string,
    generateIfNotFound: boolean = false
  ): Promise<ProductSearchResponse> {
    const params = generateIfNotFound ? '?generate_if_not_found=true' : '';
    return this.fetch<ProductSearchResponse>(`/products/search/${encodeURIComponent(query)}${params}`);
  }

  // ============================================
  // User Profile Methods
  // ============================================

  /**
   * Get current user's health profile
   */
  async getHealthProfile(authToken: string): Promise<UserHealthProfile> {
    return this.fetch<UserHealthProfile>('/users/me/profile', {
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
    return this.fetch<UserHealthProfile>('/users/me/profile', {
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
   * Get user's scan history
   */
  async getScanHistory(
    authToken: string,
    params?: { limit?: number; offset?: number; date?: string }
  ): Promise<ScanHistoryResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.date) queryParams.append('date', params.date);

    const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
    return this.fetch<ScanHistoryResponse>(`/users/me/history${query}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  }

  /**
   * Add a scan to history
   */
  async addToScanHistory(
    authToken: string,
    productId: string
  ): Promise<ScanHistoryItem> {
    return this.fetch<ScanHistoryItem>('/users/me/history', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
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
