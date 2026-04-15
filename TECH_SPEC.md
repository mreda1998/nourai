# Technical Specification: Elory

**Version:** 2.0.0
**Last Updated:** March 9, 2026
**Status:** In Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Payment Processing](#4-payment-processing)
5. [Implemented Features](#5-implemented-features)
6. [Remaining Work Before v1.0](#6-remaining-work-before-v10)
7. [Feature Suggestions & Roadmap](#7-feature-suggestions--roadmap)
8. [Data Models](#8-data-models)
9. [API Specification](#9-api-specification)
10. [Third-Party Integrations](#10-third-party-integrations)
11. [Security & Compliance](#11-security--compliance)
12. [Performance Requirements](#12-performance-requirements)

---

## 1. Executive Summary

Elory is a mobile-first application that empowers users to make evidence-based decisions about health and wellness products across four categories: food, cosmetics, supplements, and OTC medications. Unlike apps that provide opaque scores, Elory surfaces ingredient-level intelligence — specifically the gap between **what people believe** an ingredient does and **what clinical evidence actually supports**.

### Core Value Proposition

- Scan or search any product to see its full ingredient breakdown with evidence quality
- Understand each ingredient through a "belief vs. reality" lens backed by PubMed research
- Track your daily stack visualized as a **domain fingerprint** across 6 bio-domains
- Receive personalized alerts based on your health goals and concerns
- Browse curated newsletter-style articles linking science to real-world products

### Target Users

- Health-conscious consumers seeking transparency over marketing claims
- Individuals with specific health conditions requiring ingredient awareness
- Fitness and supplement enthusiasts building evidence-backed stacks
- Cosmetic users who want to understand what they're putting on their skin

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├──────────────────────────────────────────────────────────────────┤
│  Expo / React Native (iOS & Android)                             │
│  ├── Expo Router (file-based navigation)                         │
│  ├── expo-camera (barcode scanning)                              │
│  ├── Context API (app state + auth)                              │
│  ├── @supabase/supabase-js (auth + JWT)                          │
│  ├── react-native-gifted-charts (data visualization)             │
│  ├── react-native-reanimated (animations)                        │
│  └── AsyncStorage (local persistence)                            │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                       BACKEND SERVICES                           │
├──────────────────────────────────────────────────────────────────┤
│  FastAPI (layered: Router → Service → Repository → ORM)          │
│  ├── Products (search, barcode lookup, AI generation)            │
│  ├── Ingredients (canonical KB, PubMed evidence)                 │
│  ├── Users (profile, onboarding, stack, scan history)            │
│  ├── Meals (image/text AI analysis via Claude)                   │
│  └── Webhooks (RevenueCat subscriptions)                         │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                               │
├──────────────────────────────────────────────────────────────────┤
│  PostgreSQL 16 (Supabase)                                        │
│  ├── products + product_ingredients                              │
│  ├── ingredients + ingredient_evidence (PubMed records)          │
│  ├── user_profiles + scan_history + stack_entries                │
│  └── subscriptions                                               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                            │
├──────────────────────────────────────────────────────────────────┤
│  Supabase Auth    Anthropic Claude   PubMed API                  │
│  RevenueCat       Open Food Facts    Open Beauty Facts           │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack (Actual)

| Layer | Technology | Notes |
|-------|------------|-------|
| Mobile | React Native 0.81 + Expo SDK 54 | Managed workflow |
| Routing | Expo Router 6 | File-based, tab + stack navigation |
| State | React Context API | AppState + AuthContext |
| Backend | FastAPI + SQLAlchemy 2.0 async | Layered architecture |
| Database | PostgreSQL 16 via Supabase | 5 migrations applied |
| Auth | Supabase Auth + @supabase/supabase-js | Email/password live |
| AI | Anthropic Claude (Haiku + Sonnet) | Research agent + meal analysis |
| Charts | react-native-gifted-charts 1.4.76 | Radar, Bar (stacked), Pie |
| Fonts | Cormorant Garamond + Manrope | Expo Google Fonts |
| Payments | RevenueCat (UI wired, logic pending) | react-native-purchases TBD |
| Local storage | AsyncStorage | Skin profile, onboarding cache |

### 2.3 Backend Project Structure (Actual)

```
backend-elory/
├── app/
│   ├── main.py
│   ├── api/v1/
│   │   ├── products.py        # list, search, barcode, personalize
│   │   ├── ingredients.py     # search, detail
│   │   ├── users.py           # profile, onboarding, history, stack, subscription
│   │   ├── meals.py           # Claude AI meal analysis
│   │   ├── stack.py           # stack entries
│   │   └── webhooks/          # RevenueCat
│   ├── models/
│   │   ├── product.py         # Product, ProductIngredient
│   │   ├── ingredient.py      # Ingredient, IngredientEvidence
│   │   └── user.py            # UserProfile, StackEntry, ScanHistoryEntry, Subscription
│   ├── schemas/               # Pydantic request/response types
│   ├── repositories/          # Async DB queries
│   └── services/              # Business logic
├── alembic/versions/
│   ├── 001_initial_schema.py
│   ├── 002_ingredient_evidence.py
│   ├── 003_ingredient_belief_fields.py
│   ├── 004_widen_varchar_columns.py
│   └── 005_onboarding_and_scan_history.py
└── scripts/
    ├── seed_golden_set.py      # 16 products + 25 ingredients
    ├── fetch_popular_products.py  # Open Food/Beauty Facts scraper
    └── research_agent.py       # PubMed → Claude synthesis pipeline
```

### 2.4 Frontend App Structure (Actual)

```
elory/app/
├── (tabs)/
│   ├── index.tsx          # Home: daily composite, newsletter cards
│   ├── scan.tsx           # Barcode scanner (expo-camera)
│   ├── search.tsx         # Product + ingredient search
│   ├── stack.tsx          # Composition view: RadarChart + protocol
│   └── history.tsx        # Behavioral lens: BarChart + PieChart + timeline
├── product/[id].tsx       # Product detail: grade, bio-domains, ingredients
├── ingredient/[id].tsx    # Ingredient deep dive: belief/reality + evidence
├── newsletter/[id].tsx    # Article screen
├── onboarding.tsx         # 5-step profile collection
├── auth.tsx               # Sign-in / sign-up + email confirmation
├── profile.tsx            # Skin profile editor
├── profile-hub.tsx        # Account hub: subscription + health profile
├── health/                # Domain sub-screens (gut, skin, sleep, hair, fitness, hormonal)
└── settings/              # Account, notifications, permissions, subscription
```

---

## 3. Authentication & Authorization

### Implemented

- **Email/password auth** via Supabase Auth (sign-up, sign-in, sign-out)
- **Email confirmation flow** — shows "Check your email" screen instead of navigating blindly
- **JWT auto-injection** — `configureAuthTokenProvider` pattern wires Supabase token to all API calls automatically
- **Profile sync on sign-in** — onboarding data pushed to backend after authentication
- **Guest mode** — scanner and product browsing work without account; stack/history require sign-in

### Not Yet Implemented

- Apple Sign-In (required for App Store)
- Google OAuth
- Magic link / passwordless email

---

## 4. Payment Processing

### Implemented

- Subscription UI — three-tier UI (Free / Premium Monthly / Premium Annual) with feature comparison
- Restore Purchases button in settings
- Backend `GET /users/me/subscription` endpoint

### Not Yet Implemented

- RevenueCat SDK integration (`react-native-purchases`)
- Actual purchase flow connected to App Store / Play Store
- Subscription webhooks from RevenueCat to backend
- Paywall enforcement on premium features

---

## 5. Implemented Features

### 5.1 Product Discovery & Search

- **Barcode scanner** — `expo-camera` with `CameraView`, supports EAN-13, EAN-8, UPC-A, UPC-E, Code128, Code39, QR
- 3-second debounce to prevent duplicate scans
- Fallback: AI-generated product on unknown barcode (Claude synthesis)
- **Text search** — debounced server-side search (`GET /products/search?q=`)
- **Ingredient search mode** — separate tab in search screen, calls `/ingredients/search`
- `CategoryIcon` component replaces image thumbnails (SVG icons per food/supplement/cosmetic/otc)

### 5.2 Product Detail

- Full ingredient list with status badges (clean / watch / avoid)
- Tappable ingredients → ingredient deep dive (when `ingredient_id` FK is present)
- Bio-domain visualization (6 domains: gut, skin, metabolism, sleep, cognition, exposure)
- Grade badge (A / B / C / D) with reasoning
- Allergen warnings
- Server-side personalization overlay (`GET /products/{id}/personalize`) — matches user concerns/goals to ingredient evidence

### 5.3 Ingredient Deep Dive

- `common_belief` vs `evidence_reality` — the primary differentiator
- Mechanism summary, typical dose range, recommended daily, upper limit
- Side effects, contraindications, drug interactions
- Per-study evidence records (PubMed): direction (benefit/risk/neutral/mixed), confidence, effect size
- "Found in" products list

### 5.4 Stack (Composition View)

- **Domain Fingerprint** — `RadarChart` across 6 bio-domains, animated
- Score bars per domain (Supporting / Neutral / Watch) derived from grade × category relevance matrix
- **Goal Alignment** — maps user goals → domains → Aligned / Partial / Gap
- **Ingredient Overlap** detection — flags ingredients appearing in multiple products
- **Protocol view** — products grouped by slot (Nutrition / Supplements / Topical / Treatment)
- Remove product from stack with × button

### 5.5 History (Behavioral Lens)

- **Evidence Quality 4-week chart** — `BarChart` with stacked segments (A/B dark vs C/D light)
- Week-over-week trend badge (↑ Improving / → Stable / ↓ Declining)
- **Exploration Pattern** — `PieChart` donut by grade distribution + contextual insight text
- Timeline grouped by Today / Yesterday / date
- Fallback to local stack data when not signed in

### 5.6 Onboarding

- 5-step profile: biological sex, age range, focus areas, health concerns, goals
- Data synced to backend `PUT /users/me` on completion
- Drives server-side personalization (concern/goal tags match ingredient evidence)

### 5.7 Home Screen

- Daily Composite Score — circular SVG progress ring + domain bar chart breakdown
- Dark newsletter cards (serif italic headline, author, arrow CTA)
- Returning user UX vs first-time empty state

### 5.8 Newsletter

- Article screen with dark hero, section tag, serif title, drop cap, pull quote
- Articles keyed by ID (e.g. "creatine")

### 5.9 Profile & Settings

- **Skin profile** — skin type, sensitivity triggers, ingredient watchlist, saved to AsyncStorage + backend
- **Profile hub** — shows subscription tier, focus areas, health concerns, goals from backend
- **Settings screens** — account info, notification toggles, app permissions, subscription UI
- **Health domain screens** — Gut, Skin, Sleep, Hair, Fitness, Hormonal sub-screens

### 5.10 Meal Analysis

- `POST /meals/analyze` — Claude AI analyzes a meal photo (base64) or free-text description
- Returns recognized foods, confidence, estimated amounts, meal summary

### 5.11 Backend Intelligence Pipeline

- **Seed data**: 16 curated products + 25 canonical ingredients (golden set)
- **Bulk ingestion**: Open Food Facts + Open Beauty Facts scraper (~4,500 products target)
- **Research agent**: PubMed search → Claude Haiku abstract synthesis → Claude Sonnet belief/reality summary
- Idempotent (won't re-research already-complete ingredients), ~$0.012/ingredient

---

## 6. Remaining Work Before v1.0

### P0 — Blockers (app cannot ship without these)

| Item | Area | Notes |
|------|------|-------|
| Apple Sign-In | Auth | Required by App Store guidelines for any app with sign-in |
| RevenueCat SDK wiring | Payments | Subscription UI exists but purchases don't work |
| Push notifications | Engagement | Expo Notifications + backend delivery needed |
| App Store / Play Store assets | Distribution | Screenshots, app preview video, icon variants |
| Privacy Policy + Terms of Service | Legal | Required for store submission |

### P1 — Core UX (needed for a good first impression)

| Item | Area | Notes |
|------|------|-------|
| Empty state product database | Data | Golden set is 16 products — need bulk import run |
| Product images | UI | Most products show CategoryIcon fallback; real images improve trust |
| Offline mode | Resilience | No caching layer — network errors show blank screens |
| Error boundaries | Resilience | Unhandled promise rejections crash screens silently |
| Loading skeletons | UI | Currently uses `ActivityIndicator`; skeleton screens feel more polished |
| Search empty state | UI | No "no results" illustration |
| Barcode not found UX | UX | Currently navigates to AI-generated product with no explanation |

### P2 — Quality & Polish

| Item | Area | Notes |
|------|------|-------|
| Google OAuth | Auth | Nice-to-have for sign-up conversion |
| Magic link login | Auth | Better for low-friction re-engagement |
| Subscription webhook processing | Payments | RevenueCat → backend sync not wired |
| Notification preferences persistence | Settings | Toggle state not saved to backend |
| Actual health domain screens | Content | health/* screens are stubs |
| Deep link handling | Navigation | Barcode scan from home screen widget |
| Haptics throughout | Polish | Only on calendar; should be on scan success, add-to-stack |
| Accessibility (a11y) | Compliance | No ARIA labels, no VoiceOver testing |

### P3 — Technical Debt

| Item | Notes |
|------|-------|
| Replace Context API with Zustand | App state grows complex; Context causes unnecessary re-renders |
| React Query for server state | Currently re-fetches on every mount; no caching |
| `category: 'supplement'` hardcode in history | `ScanHistoryItem` doesn't return category yet — needs backend fix |
| Stack management via local context only | Stack should persist to `POST /users/me/stack` and be server-authoritative |
| Ingredient overlap uses string matching | Should use `ingredient_id` FK for accurate deduplication |

---

## 7. Feature Suggestions & Roadmap

### Near-Term (v1.1) — After launch stabilization

**1. Compare Mode**
Side-by-side ingredient comparison for two products. "Product A has caffeine, B doesn't. Product B has more vitamin D but lower confidence evidence." Very useful for supplement shopping.

**2. Ingredient Watchlist (actual implementation)**
The profile screen shows a watchlist UI but it's cosmetic. Wire it to the backend and flag matching ingredients on every product scan in real-time.

**3. Smart Substitution**
When a product has a "D" grade or a watchlist ingredient, suggest a similar product with a better grade. Requires a product similarity layer (embeddings on ingredient lists).

**4. Weekly Digest Notification**
"Your stack this week: 3 products scanned, gut domain improving, 1 overlap detected." Drives re-engagement and surfaces the behavioral lens value.

**5. Barcode from Gallery**
Let users scan from a photo in their camera roll, not just live camera. Useful for photographing a label earlier and analyzing later.

### Medium-Term (v1.2–v1.5) — Growth features

**6. Stack Conflict Detection**
Flag ingredient pairs that interact or compete (e.g. calcium + iron absorption, fat-soluble vitamin stacking). Requires a drug-interaction-style knowledge base for supplements.

**7. Protocol Templates**
Pre-built stacks like "Morning Focus Stack", "Evening Recovery Stack", "Gut Reset Protocol" curated by the research team. Users import as a starting point.

**8. Progress Journaling**
Let users log a quick daily check-in ("Energy: 7/10, Skin: 6/10, Sleep: 8/10") and correlate it over time with their stack. This is the bridge from awareness to behavior change.

**9. Household Mode**
Multiple profiles under one account (e.g. managing supplements for a parent with health conditions, a partner, kids). Each profile has separate stacks, goals, and allergen flags.

**10. Retail Integration / Price Comparison**
Surface where to buy the best-graded alternative and at what price. Affiliate revenue model.

**11. AI Product Chat**
"Ask Elory" — a conversational interface over the ingredient knowledge base. "Is this safe if I'm on metformin?" "What's the best magnesium form for sleep?"

### Long-Term (v2.0+) — Platform plays

**12. Practitioner Dashboard**
Web portal for dietitians, naturopaths, and pharmacists to review patient stacks, annotate products, and share curated protocols. B2B revenue stream.

**13. Brand/Manufacturer API**
Let brands submit products for analysis and display a "Elory Verified" badge. Creates a direct data partnership model and inbound product database growth.

**14. Community Layer**
User-submitted product reviews anchored to specific ingredients, not vibes. "5 people with rosacea flagged this product's fragrance concentration." Evidence-quality community signal.

**15. Lab Integration**
Connect with at-home testing services (Everlywell, Thriva). Upload bloodwork results and Elory automatically personalizes recommendations based on actual deficiencies.

**16. Wearable / Health App Sync**
Import Apple Health / Google Fit data (sleep score, HRV, activity) and cross-reference with stack changes. Closes the feedback loop from ingredient → observable outcome.

---

## 8. Data Models

### Core Tables

```sql
-- Canonical ingredient knowledge base
ingredients (
  id UUID PK,
  canonical_name TEXT,
  category TEXT,
  description TEXT,
  mechanism_summary TEXT,
  common_belief TEXT,          -- what people think it does
  evidence_reality TEXT,       -- what research actually shows
  typical_dose_range TEXT,
  recommended_daily TEXT,
  upper_limit TEXT,
  side_effects JSONB,
  contraindications JSONB,
  drug_interactions JSONB,
  evidence_level TEXT,         -- strong / moderate / weak / emerging
  research_status TEXT,        -- complete / in_progress / pending
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Per-study evidence records (PubMed)
ingredient_evidence (
  id UUID PK,
  ingredient_id FK → ingredients,
  pmid TEXT,
  title TEXT,
  journal TEXT,
  year INT,
  study_type TEXT,
  population TEXT,
  sample_size INT,
  finding TEXT,
  direction ENUM(benefit, risk, neutral, mixed),
  effect_size ENUM(strong, moderate, weak),
  confidence ENUM(high, moderate, low),
  concern_tags JSONB,
  goal_tags JSONB
)

-- Products
products (
  id UUID PK,
  barcode TEXT UNIQUE,
  name TEXT,
  brand TEXT,
  category ENUM(food, supplement, cosmetic, otc),
  subcategory TEXT,
  description TEXT,
  image_url TEXT,
  grade TEXT,                  -- A / B / C / D
  tags JSONB,
  has_allergen_warning BOOL,
  allergen_warning TEXT,
  is_ai_generated BOOL,
  bio_domains JSONB,
  recommendations JSONB,
  citations JSONB
)

-- Junction: product ↔ ingredient
product_ingredients (
  id UUID PK,
  product_id FK → products,
  ingredient_id FK → ingredients NULLABLE,  -- null = unmatched ingredient
  name TEXT,
  concentration TEXT,
  tag TEXT,
  tag_type TEXT,
  status ENUM(clean, watch, avoid),
  order_position INT
)

-- User health profile
user_profiles (
  id UUID PK (= Supabase auth.users.id),
  email TEXT,
  name TEXT,
  biological_sex TEXT,
  birth_year INT,
  age_range TEXT,
  allergies JSONB,
  conditions JSONB,
  medications JSONB,
  dietary_preferences JSONB,
  health_goals JSONB,
  focus_areas JSONB,
  health_concerns JSONB,
  is_pregnant BOOL,
  is_breastfeeding BOOL,
  onboarding_completed BOOL
)

-- Stack entries
stack_entries (
  id UUID PK,
  user_id FK → user_profiles,
  product_id FK → products,
  time_of_day TEXT,
  added_at TIMESTAMP
)

-- Scan history
scan_history (
  id UUID PK,
  user_id FK → user_profiles,
  product_id FK → products,
  scanned_at TIMESTAMP,
  created_at TIMESTAMP
)

-- Subscriptions
subscriptions (
  id UUID PK,
  user_id FK,
  tier ENUM(free, premium_monthly, premium_annual, family),
  status ENUM(active, cancelled, expired, billing_issue),
  expires_at TIMESTAMP,
  store ENUM(app_store, play_store),
  revenuecat_customer_id TEXT
)
```

---

## 9. API Specification

### Base URL
- Development: `http://localhost:8001/api/v1`
- Production: `https://api.elory.com/api/v1` (TBD)

### Endpoints

#### Products
```
GET  /products/                        List products (category, limit, offset)
GET  /products/search?q=               Text search
GET  /products/{id}                    Product detail with ingredients + bio-domains
GET  /products/{id}/personalize        Server-side personalization overlay
GET  /products/barcode/{barcode}       Lookup by barcode (triggers AI if not found)
```

#### Ingredients
```
GET  /ingredients/search?q=            Search canonical ingredients
GET  /ingredients/{id}                 Deep dive: mechanism + evidence + found-in
```

#### Users
```
GET  /users/me                         Health profile
PUT  /users/me                         Update health profile
POST /users/me/onboarding              Complete onboarding
GET  /users/me/history                 Scan history (limit, offset)
POST /users/me/history                 Record product view
GET  /users/me/subscription            Subscription status
```

#### Stack (server-side)
```
GET  /users/me/stack                   Get user stack
POST /users/me/stack                   Add product to stack
DELETE /users/me/stack/{entry_id}      Remove from stack
GET  /users/me/stack/{entry_id}        Get single entry
```

#### Meals
```
POST /meals/analyze                    AI meal analysis (image_base64 or description)
```

---

## 10. Third-Party Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| Supabase Auth | Authentication + JWT | Live |
| Anthropic Claude | Research agent (Haiku + Sonnet) + meal analysis | Live |
| PubMed E-utilities API | Fetch study abstracts for research pipeline | Live |
| Open Food Facts | Bulk product data (food category) | Live (scripts) |
| Open Beauty Facts | Bulk product data (cosmetic category) | Live (scripts) |
| RevenueCat | Subscription management | UI only — SDK pending |
| expo-camera | Barcode scanning | Live |
| react-native-gifted-charts | Data visualization (Radar, Bar, Pie) | Live |

---

## 11. Security & Compliance

- Supabase JWT required on all `/users/me/*` endpoints (verified via `Authorization: Bearer`)
- Product/ingredient endpoints are unauthenticated (public catalog)
- No PII stored beyond what the user explicitly provides
- GDPR/CCPA: users can delete account and all associated data (not yet implemented)
- Apple App Store: privacy manifest required for data collection disclosure

---

## 12. Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Product barcode lookup | < 400ms (p95) | Cached products, AI generation excluded |
| Text search | < 200ms (p95) | PostgreSQL full-text or pg_trgm |
| Ingredient deep dive | < 300ms (p95) | Single join query |
| AI product generation | < 8s | Claude Haiku, shown with loading state |
| App cold start | < 2s | Expo managed workflow baseline |
| App warm start | < 500ms | |
