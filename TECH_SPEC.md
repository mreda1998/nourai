# Technical Specification: HealthLens

**Version:** 1.1.0
**Last Updated:** January 27, 2026
**Status:** Draft for Review

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Authentication & Authorization (Supabase)](#3-authentication--authorization-supabase)
4. [Payment Processing (RevenueCat)](#4-payment-processing-revenuecat)
5. [Core Features](#5-core-features)
   - [Homepage & Discovery](#51-homepage--discovery)
   - [Product Scanning & Search](#52-product-scanning--search)
   - [Unified Product Detail Screen](#53-unified-product-detail-screen)
   - [Claim-Level Evidence Cards](#54-claim-level-evidence-cards)
   - [Ingredient Evidence & Risk View](#55-ingredient-evidence--risk-view)
   - [MyStack Dashboard](#56-mystack-dashboard)
   - [Health Domain Scoring System](#57-health-domain-scoring-system)
   - [Newsletter Integration](#58-newsletter-integration)
6. [Data Models](#6-data-models)
7. [API Specification](#7-api-specification)
8. [Third-Party Integrations](#8-third-party-integrations)
9. [Security & Compliance](#9-security--compliance)
10. [Performance Requirements](#10-performance-requirements)
11. [Device Compatibility](#11-device-compatibility)
12. [Analytics & Monitoring](#12-analytics--monitoring)
13. [Future Considerations (v2)](#13-future-considerations-v2)

---

## 1. Executive Summary

Nour AI is a mobile-first application that empowers users to make evidence-based decisions about health and wellness products across four categories: food, cosmetics, supplements, and over-the-counter (OTC) medications. Unlike traditional apps that provide opaque scores, Nour AI surfaces explicit claims with transparent evidence strength, ingredient-level analysis, and personalized risk flags based on user health profiles.

### Core Value Proposition

- Scan or search any product to see evidence-backed claims, not arbitrary scores
- Understand exactly what each ingredient does and its safety profile
- Track your daily "stack" across health domains with scientific rigor
- Receive personalized risk alerts based on your health conditions

### Target Users

- Health-conscious consumers seeking transparency
- Individuals with specific health conditions requiring ingredient awareness
- Fitness enthusiasts optimizing supplement stacks
- Parents making informed choices for family products

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
├─────────────────────────────────────────────────────────────────────┤
│  React Native Mobile App (iOS/Android)                              │
│  ├── Barcode Scanner (react-native-vision-camera)                   │
│  ├── State Management (Zustand + React Query)                       │
│  ├── Auth (@supabase/supabase-js)                                   │
│  ├── Payments (react-native-purchases - RevenueCat)                 │
│  └── Offline Cache (WatermelonDB / MMKV)                            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                                 │
├─────────────────────────────────────────────────────────────────────┤
│  AWS API Gateway / Cloudflare Workers                               │
│  ├── Rate Limiting                                                  │
│  ├── Request Validation                                             │
│  └── Supabase JWT Verification                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       BACKEND SERVICES                              │
├─────────────────────────────────────────────────────────────────────┤
│  FastAPI (Layered Architecture)                                     │
│  ├── API Layer (Routers)                                            │
│  ├── Service Layer (Business Logic)                                 │
│  ├── Repository Layer (Data Access)                                 │
│  └── SQLAlchemy 2.0 + asyncpg                                       │
│                                                                     │
│  Services:                                                          │
│  ├── Product Service                                                │
│  ├── Evidence Service                                               │
│  ├── User Service                                                   │
│  ├── Stack Service                                                  │
│  ├── Subscription Service (RevenueCat webhooks)                     │
│  └── Newsletter Service                                             │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                   │
├─────────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Supabase)          Redis (Upstash/ElastiCache)         │
│  ├── Products                   ├── Session data                    │
│  ├── Ingredients                ├── Frequently accessed products    │
│  ├── Claims & Evidence          ├── Rate limiting                   │
│  ├── User Profiles              └── Background job queues           │
│  └── Subscriptions                                                  │
│                                 Elasticsearch / Meilisearch         │
│                                 └── Product/ingredient full-text    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                                │
├─────────────────────────────────────────────────────────────────────┤
│  Supabase Auth    RevenueCat      OpenFDA        PubMed API         │
│  SendGrid         Firebase FCM    Barcode APIs   Sentry             │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Backend Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app factory
│   ├── api/
│   │   ├── __init__.py
│   │   ├── deps.py                # Shared dependencies
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── router.py          # Aggregated router
│   │       ├── products.py
│   │       ├── claims.py
│   │       ├── ingredients.py
│   │       ├── stack.py
│   │       ├── users.py
│   │       ├── discover.py
│   │       └── webhooks/
│   │           ├── __init__.py
│   │           └── revenuecat.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py              # Pydantic settings
│   │   ├── security.py            # Supabase JWT validation
│   │   └── exceptions.py          # Custom exceptions
│   ├── models/                    # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── base.py                # Base model class
│   │   ├── product.py
│   │   ├── ingredient.py
│   │   ├── claim.py
│   │   ├── user.py
│   │   └── subscription.py
│   ├── schemas/                   # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── product.py
│   │   ├── ingredient.py
│   │   ├── claim.py
│   │   ├── user.py
│   │   └── subscription.py
│   ├── repositories/              # Data access layer
│   │   ├── __init__.py
│   │   ├── base.py                # Generic repository
│   │   ├── product.py
│   │   ├── ingredient.py
│   │   ├── claim.py
│   │   ├── user.py
│   │   └── subscription.py
│   ├── services/                  # Business logic layer
│   │   ├── __init__.py
│   │   ├── product.py
│   │   ├── evidence.py
│   │   ├── stack.py
│   │   ├── domain_scoring.py
│   │   └── subscription.py
│   └── db/
│       ├── __init__.py
│       ├── session.py             # Async session factory
│       └── migrations/            # Alembic migrations
├── tests/
├── alembic.ini
├── pyproject.toml
└── Dockerfile
```

### 2.3 Environment Configuration

```bash
# .env.example

# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql+asyncpg://postgres:[password]@db.[project].supabase.co:5432/postgres

# Supabase
SUPABASE_URL=https://[project].supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

# RevenueCat
REVENUECAT_API_KEY_SERVER=sk_xxx
REVENUECAT_WEBHOOK_SECRET=whsec_xxx

# Redis (Upstash)
REDIS_URL=rediss://default:[password]@[region].upstash.io:6379

# Search (Meilisearch)
MEILISEARCH_URL=https://ms-xxx.meilisearch.io
MEILISEARCH_API_KEY=xxx

# External APIs
OPENFOODFACTS_USER_AGENT=NourAI/1.0 (contact@nourai.com)
PUBMED_API_KEY=xxx

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx

# App
DEBUG=false
ENVIRONMENT=production
CORS_ORIGINS=["https://nourai.com"]
```

### 2.4 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Mobile | React Native 0.73+ | Cross-platform, mature ecosystem, New Architecture ready |
| State | Zustand + React Query | Lightweight state, powerful server-state caching |
| Backend | FastAPI | Async Python, automatic OpenAPI, excellent performance |
| ORM | SQLAlchemy 2.0 + asyncpg | Mature, battle-tested, excellent async support |
| Database | PostgreSQL 16 (Supabase) | ACID compliance, JSONB, managed hosting with built-in auth |
| Cache | Redis 7 (Upstash) | Session management, rate limiting, serverless-friendly |
| Search | Meilisearch / Elasticsearch 8 | Fast product/ingredient search, typo-tolerant |
| Auth | Supabase Auth | Simple JWT auth, social logins, RLS support |
| Payments | RevenueCat | Native mobile subscription management, handles App Store/Play Store |
| Storage | Supabase Storage / Cloudflare R2 | Product images, user uploads |
| CDN | Cloudflare | Global edge caching |
| Monitoring | Sentry + Datadog | Error tracking, APM |
| Background Jobs | Redis + ARQ / Celery | Async task processing |

---

## 3. Authentication & Authorization (Supabase)

### 3.1 Supabase Project Configuration

**Environments:**
- Production: `nourai-prod.supabase.co`
- Staging: `nourai-staging.supabase.co`
- Development: `nourai-dev.supabase.co`

**Key Credentials (stored in environment variables):**
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...        # Public key for client
SUPABASE_SERVICE_KEY=eyJ...     # Private key for backend only
SUPABASE_JWT_SECRET=xxx         # For JWT verification in FastAPI
```

### 3.2 Authentication Flows

#### 3.2.1 User Registration & Login

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Mobile  │───▶│ Supabase │───▶│ Identity │───▶│  JWT     │
│   App    │    │  Client  │    │ Provider │    │ Tokens   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
      │                                               │
      │         ┌─────────────────────────────────────┘
      │         ▼
      │    ┌──────────┐    ┌──────────┐
      └───▶│  FastAPI │───▶│  Verify  │
           │  Backend │    │  JWT     │
           └──────────┘    └──────────┘
```

**Supported Identity Providers:**
- Email/Password (Supabase Auth)
- Google OAuth 2.0
- Apple Sign-In (required for iOS)
- Magic Link (passwordless email)

#### 3.2.2 React Native Client Setup

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Sign up
async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        subscription_tier: 'free',
        onboarding_completed: false,
      },
    },
  });
  return { data, error };
}

// Sign in with OAuth
async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'nourai://auth/callback',
    },
  });
  return { data, error };
}

// Get session for API calls
async function getAccessToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
```

#### 3.2.3 FastAPI JWT Verification

```python
# app/core/security.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from app.core.config import settings

security = HTTPBearer()

class TokenPayload(BaseModel):
    sub: str  # User ID
    email: str | None = None
    user_metadata: dict = {}
    exp: int

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TokenPayload:
    """Verify Supabase JWT and extract user info."""
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return TokenPayload(**payload)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    )
) -> TokenPayload | None:
    """Optional auth - returns None if no token provided."""
    if credentials is None:
        return None
    return await get_current_user(credentials)
```

### 3.3 Role-Based Access Control (RBAC)

Subscription tiers are managed via RevenueCat and synced to user metadata.

| Role | Permissions | Description |
|------|-------------|-------------|
| `free` | `read:products`, `write:stack` (limit 5/day) | Basic scanning |
| `premium` | All free + `read:evidence_detail`, `unlimited:stack` | Full access |
| `family` | Premium for up to 5 members | Shared subscription |
| `admin` | All permissions + `manage:products`, `manage:users` | Admin panel |

**Checking Subscription in FastAPI:**

```python
# app/api/deps.py
from app.services.subscription import SubscriptionService

async def require_premium(
    user: TokenPayload = Depends(get_current_user),
    subscription_service: SubscriptionService = Depends(),
) -> TokenPayload:
    """Dependency that requires premium subscription."""
    is_premium = await subscription_service.is_premium(user.sub)
    if not is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Premium subscription required",
        )
    return user
```

### 3.4 Session Management

- Access Token TTL: 1 hour (Supabase default)
- Refresh Token TTL: 30 days
- Auto-refresh: Handled by Supabase client SDK
- Secure storage: iOS Keychain / Android Keystore via AsyncStorage encryption

### 3.5 Security Configurations

| Feature | Configuration |
|---------|---------------|
| Rate Limiting | 100 requests/15 min per IP (Supabase default) |
| Email Confirmation | Required for new accounts |
| Password Policy | Minimum 8 characters |
| MFA/2FA | TOTP support (optional for users) |
| Passwordless | Magic link email enabled |
| Session Invalidation | On password change |

### 3.6 Database Row-Level Security (RLS)

Supabase RLS policies secure direct database access:

```sql
-- Users can only read their own health profile
CREATE POLICY "Users can view own profile"
ON user_health_profiles FOR SELECT
USING (auth.uid()::text = user_id);

-- Users can only modify their own profile
CREATE POLICY "Users can update own profile"
ON user_health_profiles FOR UPDATE
USING (auth.uid()::text = user_id);

-- Users can only access their own stack entries
CREATE POLICY "Users can manage own stack"
ON user_stack_entries FOR ALL
USING (auth.uid()::text = user_id);

-- Products are publicly readable
CREATE POLICY "Products are viewable by all"
ON products FOR SELECT
TO authenticated
USING (true);
```

---

## 4. Payment Processing (RevenueCat)

### 4.1 Why RevenueCat

RevenueCat abstracts the complexity of App Store and Google Play billing:
- Handles receipt validation automatically
- Unified API for iOS/Android subscriptions
- Built-in analytics and subscription status tracking
- Automatic grace period and billing retry handling
- Cross-platform subscription sync

### 4.2 Subscription Tiers

| Product ID | Price | Billing | Features |
|------------|-------|---------|----------|
| `nourai_free` | $0 | N/A | 5 scans/day, basic ingredient info, limited stack |
| `nourai_premium_monthly` | $9.99/mo | Monthly | Unlimited scans, full evidence cards, unlimited stack |
| `nourai_premium_annual` | $79.99/yr | Annual | All premium + 2 months free |
| `nourai_family_monthly` | $14.99/mo | Monthly | Premium for up to 5 family members |

### 4.3 RevenueCat Configuration

**Project Setup:**
- Project ID: `nourai`
- Apps: iOS (`app.nourai.ios`), Android (`app.nourai.android`)
- Entitlements: `premium`, `family`

**Environment Variables:**
```bash
REVENUECAT_API_KEY_IOS=appl_xxx
REVENUECAT_API_KEY_ANDROID=goog_xxx
REVENUECAT_WEBHOOK_SECRET=whsec_xxx
REVENUECAT_API_KEY_SERVER=sk_xxx  # For server-side API calls
```

### 4.4 Payment Flows

#### 4.4.1 Subscription Purchase Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Mobile  │───▶│ Revenue  │───▶│App Store/│───▶│ Revenue  │
│   App    │    │   Cat    │    │Play Store│    │Cat Server│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                     │
                          ┌──────────────────────────┘
                          ▼
                    ┌──────────┐    ┌──────────┐
                    │  Webhook │───▶│  FastAPI │
                    │  Event   │    │  Backend │
                    └──────────┘    └──────────┘
                                         │
                                         ▼
                                   ┌──────────┐
                                   │  Update  │
                                   │ Supabase │
                                   └──────────┘
```

### 4.5 Mobile Integration

#### 4.5.1 React Native Setup

```typescript
// lib/purchases.ts
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL
} from 'react-native-purchases';
import { Platform } from 'react-native';

const API_KEYS = {
  ios: process.env.REVENUECAT_API_KEY_IOS!,
  android: process.env.REVENUECAT_API_KEY_ANDROID!,
};

export async function initializePurchases(userId: string) {
  Purchases.setLogLevel(LOG_LEVEL.DEBUG); // Remove in production

  await Purchases.configure({
    apiKey: Platform.OS === 'ios' ? API_KEYS.ios : API_KEYS.android,
    appUserID: userId, // Supabase user ID
  });
}

export async function getOfferings() {
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg: PurchasesPackage) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.userCancelled) {
      return { success: false, cancelled: true };
    }
    throw error;
  }
}

export async function checkSubscriptionStatus(): Promise<{
  isPremium: boolean;
  expirationDate: string | null;
}> {
  const customerInfo = await Purchases.getCustomerInfo();
  const isPremium = customerInfo.entitlements.active['premium'] !== undefined;
  const expirationDate = customerInfo.entitlements.active['premium']?.expirationDate ?? null;

  return { isPremium, expirationDate };
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return await Purchases.restorePurchases();
}
```

#### 4.5.2 Paywall Screen

```typescript
// screens/PaywallScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { getOfferings, purchasePackage, restorePurchases } from '../lib/purchases';

export function PaywallScreen({ onSuccess }: { onSuccess: () => void }) {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadOfferings();
  }, []);

  async function loadOfferings() {
    const current = await getOfferings();
    setOffering(current);
    setLoading(false);
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result.success) {
        onSuccess();
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    setPurchasing(true);
    try {
      const customerInfo = await restorePurchases();
      if (customerInfo.entitlements.active['premium']) {
        onSuccess();
      }
    } finally {
      setPurchasing(false);
    }
  }

  if (loading) return <ActivityIndicator />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unlock Premium</Text>

      {offering?.availablePackages.map((pkg) => (
        <TouchableOpacity
          key={pkg.identifier}
          style={styles.package}
          onPress={() => handlePurchase(pkg)}
          disabled={purchasing}
        >
          <Text style={styles.packageTitle}>{pkg.product.title}</Text>
          <Text style={styles.packagePrice}>
            {pkg.product.priceString}/{pkg.packageType === 'ANNUAL' ? 'year' : 'month'}
          </Text>
          {pkg.packageType === 'ANNUAL' && (
            <Text style={styles.savings}>Save 33%</Text>
          )}
        </TouchableOpacity>
      ))}

      <TouchableOpacity onPress={handleRestore} disabled={purchasing}>
        <Text style={styles.restore}>Restore Purchases</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 4.6 Webhook Integration

#### 4.6.1 RevenueCat Webhook Events

| Event | Action |
|-------|--------|
| `INITIAL_PURCHASE` | Create subscription record, grant premium |
| `RENEWAL` | Extend subscription period |
| `CANCELLATION` | Mark subscription as cancelled (access until period end) |
| `EXPIRATION` | Revoke premium access |
| `BILLING_ISSUE` | Flag account, send notification |
| `PRODUCT_CHANGE` | Update subscription tier |

#### 4.6.2 FastAPI Webhook Handler

```python
# app/api/v1/webhooks/revenuecat.py
from fastapi import APIRouter, Request, HTTPException, Header
from pydantic import BaseModel
from enum import Enum
import hmac
import hashlib
from app.services.subscription import SubscriptionService
from app.core.config import settings

router = APIRouter()

class EventType(str, Enum):
    INITIAL_PURCHASE = "INITIAL_PURCHASE"
    RENEWAL = "RENEWAL"
    CANCELLATION = "CANCELLATION"
    EXPIRATION = "EXPIRATION"
    BILLING_ISSUE = "BILLING_ISSUE"
    PRODUCT_CHANGE = "PRODUCT_CHANGE"
    RESTORE = "RESTORE"

class RevenueCatEvent(BaseModel):
    event: dict
    api_version: str

def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """Verify RevenueCat webhook signature."""
    expected = hmac.new(
        settings.REVENUECAT_WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

@router.post("/revenuecat")
async def handle_revenuecat_webhook(
    request: Request,
    x_revenuecat_signature: str = Header(..., alias="X-RevenueCat-Signature"),
    subscription_service: SubscriptionService = Depends(),
):
    payload = await request.body()

    # Verify signature
    if not verify_webhook_signature(payload, x_revenuecat_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    data = await request.json()
    event = data.get("event", {})
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")  # This is our Supabase user ID

    match event_type:
        case EventType.INITIAL_PURCHASE | EventType.RESTORE:
            await subscription_service.activate_subscription(
                user_id=app_user_id,
                product_id=event.get("product_id"),
                expires_at=event.get("expiration_at_ms"),
                store=event.get("store"),
            )

        case EventType.RENEWAL:
            await subscription_service.renew_subscription(
                user_id=app_user_id,
                expires_at=event.get("expiration_at_ms"),
            )

        case EventType.CANCELLATION:
            await subscription_service.mark_cancelled(
                user_id=app_user_id,
                expires_at=event.get("expiration_at_ms"),  # Still has access until this date
            )

        case EventType.EXPIRATION:
            await subscription_service.expire_subscription(user_id=app_user_id)

        case EventType.BILLING_ISSUE:
            await subscription_service.flag_billing_issue(
                user_id=app_user_id,
                grace_period_expires_at=event.get("grace_period_expiration_at_ms"),
            )

        case EventType.PRODUCT_CHANGE:
            await subscription_service.change_product(
                user_id=app_user_id,
                new_product_id=event.get("new_product_id"),
            )

    return {"received": True}
```

#### 4.6.3 Subscription Service

```python
# app/services/subscription.py
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.subscription import SubscriptionRepository
from app.models.subscription import Subscription, SubscriptionStatus, SubscriptionTier

class SubscriptionService:
    def __init__(self, session: AsyncSession):
        self.repo = SubscriptionRepository(session)

    async def is_premium(self, user_id: str) -> bool:
        """Check if user has active premium subscription."""
        sub = await self.repo.get_by_user_id(user_id)
        if not sub:
            return False
        return (
            sub.status == SubscriptionStatus.ACTIVE
            and sub.tier in (SubscriptionTier.PREMIUM_MONTHLY, SubscriptionTier.PREMIUM_ANNUAL, SubscriptionTier.FAMILY)
            and (sub.expires_at is None or sub.expires_at > datetime.utcnow())
        )

    async def activate_subscription(
        self,
        user_id: str,
        product_id: str,
        expires_at: int | None,
        store: str,
    ):
        """Activate or create subscription."""
        tier = self._product_to_tier(product_id)
        expires_dt = datetime.fromtimestamp(expires_at / 1000) if expires_at else None

        existing = await self.repo.get_by_user_id(user_id)
        if existing:
            await self.repo.update(
                existing.id,
                tier=tier,
                status=SubscriptionStatus.ACTIVE,
                expires_at=expires_dt,
                store=store,
            )
        else:
            await self.repo.create(
                user_id=user_id,
                tier=tier,
                status=SubscriptionStatus.ACTIVE,
                expires_at=expires_dt,
                store=store,
            )

    def _product_to_tier(self, product_id: str) -> SubscriptionTier:
        mapping = {
            "nourai_premium_monthly": SubscriptionTier.PREMIUM_MONTHLY,
            "nourai_premium_annual": SubscriptionTier.PREMIUM_ANNUAL,
            "nourai_family_monthly": SubscriptionTier.FAMILY,
        }
        return mapping.get(product_id, SubscriptionTier.FREE)
```

### 4.7 Server-Side Subscription Checks

For critical operations, verify subscription status server-side:

```python
# app/services/subscription.py (additional method)
import httpx

async def verify_subscription_with_revenuecat(self, user_id: str) -> dict:
    """Verify subscription directly with RevenueCat API."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.revenuecat.com/v1/subscribers/{user_id}",
            headers={
                "Authorization": f"Bearer {settings.REVENUECAT_API_KEY_SERVER}",
                "Content-Type": "application/json",
            },
        )
        response.raise_for_status()
        data = response.json()

        subscriber = data.get("subscriber", {})
        entitlements = subscriber.get("entitlements", {})

        return {
            "is_premium": "premium" in entitlements and entitlements["premium"].get("expires_date") is None or
                         datetime.fromisoformat(entitlements["premium"]["expires_date"].replace("Z", "+00:00")) > datetime.now(),
            "entitlements": list(entitlements.keys()),
        }
```

### 4.8 Trial & Promotional Features

Configured in App Store Connect / Google Play Console and RevenueCat:

| Feature | Configuration |
|---------|---------------|
| Free Trial | 7-day trial on first subscription (configured per product in stores) |
| Introductory Offers | Managed via App Store Connect / Play Console |
| Promo Codes | RevenueCat promotional entitlements |
| Referrals | Custom implementation with RevenueCat attributes |

### 4.9 Subscription Management

Users manage subscriptions through native OS settings:
- **iOS**: Settings → Apple ID → Subscriptions
- **Android**: Play Store → Menu → Subscriptions

Deep link to subscription management:
```typescript
import { Linking, Platform } from 'react-native';

function openSubscriptionManagement() {
  if (Platform.OS === 'ios') {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
}
```

---

## 5. Core Features

### 5.1 Homepage & Discovery

#### 5.1.1 Feature Description

The homepage serves as the entry point, showcasing recently scanned products across the community and featuring curated newsletter content to drive engagement and education.

#### 5.1.2 UI Components

```
┌─────────────────────────────────────────┐
│  HealthLens              🔔  👤         │
├─────────────────────────────────────────┤
│                                         │
│  Good morning, Sarah! ☀️                │
│  Your stack looks strong today          │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │    [📷 Scan Product]                ││
│  │    [🔍 Search Products]             ││
│  └─────────────────────────────────────┘│
│                                         │
│  📊 Your Daily Stack          View All ▶│
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│  │ 🥛  │ │ 💊  │ │ 🧴  │ │ +   │       │
│  │Whey │ │Vit D│ │Cera │ │Add  │       │
│  └─────┘ └─────┘ └─────┘ └─────┘       │
│                                         │
│  🔥 Trending Scans             See All ▶│
│  ┌─────────────────────────────────────┐│
│  │ 🧃 AG1 Athletic Greens              ││
│  │ ⭐ 2.4k scans this week             ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ 💊 Creatine Monohydrate             ││
│  │ ⭐ 1.8k scans this week             ││
│  └─────────────────────────────────────┘│
│                                         │
│  📰 Latest from HealthLens     More ▶   │
│  ┌─────────────────────────────────────┐│
│  │ 📖 "The Truth About Collagen        ││
│  │     Supplements"                     ││
│  │     5 min read · Jan 6, 2026        ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ 📖 "Decoding Sunscreen Labels"      ││
│  │     7 min read · Jan 4, 2026        ││
│  └─────────────────────────────────────┘│
│                                         │
└─────────────────────────────────────────┘
│  🏠     📷     📊     📰     👤         │
└─────────────────────────────────────────┘
```

#### 5.1.3 Data Requirements

**Latest Scanned Products:**
- Aggregated anonymously (no user data exposed)
- Filtered by time window (24h, 7d, 30d)
- Cached and refreshed every 15 minutes
- Excludes private/sensitive products

**Newsletter Articles:**
- Latest 3-5 articles from CMS
- Categories: Supplements, Skincare, Nutrition, OTC
- Read time estimation
- Deep links to full article view

#### 5.1.4 API Endpoints

```
GET /api/v1/discover/trending
GET /api/v1/discover/recent
GET /api/v1/newsletter/latest?limit=5
GET /api/v1/users/me/stack/today
```

---

### 5.2 Product Scanning & Search

#### 5.2.1 Barcode Scanning

**Supported Formats:**
- UPC-A (12 digits)
- UPC-E (8 digits)
- EAN-13 (13 digits)
- EAN-8 (8 digits)
- QR Codes (for custom product links)

**Scanning Flow:**

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Camera     │────▶│   Decode     │────▶│   Lookup     │
│   Preview    │     │   Barcode    │     │   Product    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                │
                          ┌─────────────────────┴─────────────────────┐
                          ▼                                           ▼
                   ┌──────────────┐                           ┌──────────────┐
                   │   Found in   │                           │  Not Found   │
                   │   Database   │                           │  → External  │
                   └──────────────┘                           │    APIs      │
                          │                                   └──────────────┘
                          ▼                                           │
                   ┌──────────────┐                                   ▼
                   │   Product    │◀──────────────────────────┌──────────────┐
                   │   Detail     │                           │   Create     │
                   │   Screen     │                           │   Product    │
                   └──────────────┘                           └──────────────┘
```

**Technical Implementation:**

```typescript
// react-native-vision-camera + MLKit
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';

function ScannerScreen() {
  const device = useCameraDevice('back');
  
  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'qr'],
    onCodeScanned: async (codes) => {
      const barcode = codes[0]?.value;
      if (barcode) {
        hapticFeedback();
        const product = await productService.lookupByBarcode(barcode);
        navigation.navigate('ProductDetail', { product });
      }
    }
  });
  
  return (
    <Camera
      device={device}
      isActive={true}
      codeScanner={codeScanner}
    />
  );
}
```

#### 5.2.2 Text Search

**Search Features:**
- Full-text search across product names, brands, ingredients
- Fuzzy matching for typos
- Category filtering
- Recent searches
- Popular/suggested searches

**Search Architecture:**

```typescript
// Elasticsearch query example
const searchProducts = async (query: string, filters: SearchFilters) => {
  return await esClient.search({
    index: 'products',
    body: {
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query,
                fields: ['name^3', 'brand^2', 'ingredients.name'],
                fuzziness: 'AUTO',
                prefix_length: 2
              }
            }
          ],
          filter: [
            filters.category && { term: { category: filters.category } },
            filters.brand && { term: { 'brand.keyword': filters.brand } }
          ].filter(Boolean)
        }
      },
      highlight: {
        fields: { name: {}, 'ingredients.name': {} }
      }
    }
  });
};
```

---

### 5.3 Unified Product Detail Screen

#### 5.3.1 Definition of Done

- [x] Layout adapts by category but uses a shared structure
- [x] Header: product name, brand, image, category
- [x] Tabs/sections: "Overview", "Claims & Evidence", "Ingredients & Risks"
- [x] Fields shown when available: serving size, key actives, usage, price/size
- [x] Responsive on mid-range Android + iPhone 13
- [x] Required fields populated from DB for ≥90% of test products

#### 5.3.2 Screen Layout

```
┌─────────────────────────────────────────┐
│  ◀  Product Detail              ♡  ⋯   │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐│
│  │                                     ││
│  │         [Product Image]             ││
│  │                                     ││
│  └─────────────────────────────────────┘│
│                                         │
│  Optimum Nutrition Gold Standard        │
│  100% Whey Protein                      │
│  Brand: Optimum Nutrition               │
│  Category: 💊 Supplement                │
│                                         │
│  ┌────────┬────────┬──────────────────┐ │
│  │Overview│Claims &│Ingredients       │ │
│  │        │Evidence│& Risks           │ │
│  └────────┴────────┴──────────────────┘ │
├─────────────────────────────────────────┤
│                                         │
│  📦 Product Info                        │
│  ├─ Serving Size: 30.4g (1 scoop)      │
│  ├─ Servings: 74                       │
│  ├─ Usage: Oral powder, mix with water │
│  └─ Size: 5 lbs (2.27 kg)              │
│                                         │
│  ⚡ Key Actives                         │
│  ├─ Whey Protein Isolate (24g)         │
│  ├─ BCAAs (5.5g)                       │
│  └─ Glutamine (4g)                     │
│                                         │
│  ⚠️ Personalized Alerts                 │
│  ┌─────────────────────────────────────┐│
│  │ 🥛 Contains milk allergen           ││
│  │ Your profile: Lactose sensitivity   ││
│  └─────────────────────────────────────┘│
│                                         │
│  [  ➕ Add to Today's Stack  ]          │
│                                         │
└─────────────────────────────────────────┘
```

#### 5.3.3 Category-Specific Adaptations

| Field | Food | Supplements | Cosmetics | OTC |
|-------|------|-------------|-----------|-----|
| Serving Size | ✓ | ✓ | — | ✓ |
| Nutrition Facts | ✓ | ✓ | — | — |
| Key Actives | — | ✓ | ✓ | ✓ |
| Usage Instructions | — | ✓ | ✓ | ✓ |
| Drug Facts | — | — | — | ✓ |
| Skin Type | — | — | ✓ | — |
| Warnings | ✓ | ✓ | ✓ | ✓ |
| Expiration | ✓ | ✓ | ✓ | ✓ |

#### 5.3.4 Component Structure

```typescript
interface ProductDetailProps {
  product: Product;
  userProfile: UserHealthProfile;
}

function ProductDetailScreen({ product, userProfile }: ProductDetailProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'claims' | 'ingredients'>('overview');
  
  const alerts = usePersonalizedAlerts(product, userProfile);
  
  return (
    <ScrollView>
      <ProductHeader product={product} />
      
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      
      {activeTab === 'overview' && (
        <OverviewTab product={product} alerts={alerts} />
      )}
      
      {activeTab === 'claims' && (
        <ClaimsEvidenceTab claims={product.claims} />
      )}
      
      {activeTab === 'ingredients' && (
        <IngredientsRisksTab 
          ingredients={product.ingredients} 
          userProfile={userProfile}
        />
      )}
      
      <AddToStackButton productId={product.id} />
    </ScrollView>
  );
}
```

---

### 5.4 Claim-Level Evidence Cards

#### 5.4.1 Definition of Done

- [x] Each product displays list of normalized claims
- [x] Tapping claim opens evidence card with:
  - Evidence strength (Strong/Moderate/Weak/Insufficient)
  - Evidence type (RCTs, meta-analysis, observational, in vitro/animal)
  - Target population tags
  - Mechanism summary (1-2 sentences)
  - 2-5 structured references (PMID/DOI)
- [x] Evidence strength computed from reproducible rubric
- [x] 30-50 seed products with fully populated claims

#### 5.4.2 Evidence Strength Rubric

```json
{
  "evidence_rubric": {
    "strong": {
      "min_score": 8,
      "criteria": {
        "meta_analysis_rcts": 3,
        "large_rcts": 2,
        "consistent_results": 2,
        "relevant_population": 1
      }
    },
    "moderate": {
      "min_score": 5,
      "criteria": {
        "multiple_rcts": 2,
        "single_large_rct": 2,
        "observational_consistent": 1
      }
    },
    "weak": {
      "min_score": 2,
      "criteria": {
        "limited_rcts": 1,
        "observational_studies": 1,
        "animal_invitro_consistent": 1
      }
    },
    "insufficient": {
      "min_score": 0,
      "criteria": {
        "no_human_data": 0,
        "conflicting_results": 0,
        "poor_quality_studies": 0
      }
    }
  }
}
```

#### 5.4.3 Claim Card UI

```
┌─────────────────────────────────────────┐
│  💪 Supports muscle recovery            │
│  Evidence: ████████░░ Strong            │
│  Tap for details ▶                      │
└─────────────────────────────────────────┘
        │
        ▼ (Expanded)
┌─────────────────────────────────────────┐
│  💪 Supports muscle recovery            │
├─────────────────────────────────────────┤
│                                         │
│  Evidence Strength                      │
│  ████████░░ Strong                      │
│                                         │
│  Evidence Type                          │
│  🔬 Meta-analyses + Multiple RCTs       │
│                                         │
│  Target Population                      │
│  👤 Adults  🏋️ Athletes  💪 Resistance │
│                                         │
│  How It Works                           │
│  Whey protein provides essential amino  │
│  acids that stimulate muscle protein    │
│  synthesis, particularly leucine which  │
│  activates the mTOR pathway.            │
│                                         │
│  📚 References                          │
│  ┌─────────────────────────────────────┐│
│  │ Morton RW et al. (2018)             ││
│  │ Br J Sports Med. PMID: 28698222     ││
│  │ [View on PubMed]                    ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ Cermak NM et al. (2012)             ││
│  │ Am J Clin Nutr. PMID: 23134885      ││
│  │ [View on PubMed]                    ││
│  └─────────────────────────────────────┘│
│                                         │
└─────────────────────────────────────────┘
```

#### 5.4.4 Data Model

```typescript
interface Claim {
  id: string;
  product_id: string;
  normalized_claim: string;      // e.g., "Supports muscle recovery"
  category: ClaimCategory;       // muscle, skin, cognitive, etc.
  evidence_strength: 'strong' | 'moderate' | 'weak' | 'insufficient';
  evidence_score: number;        // Computed from rubric
  evidence_types: EvidenceType[];
  target_populations: string[];
  mechanism_summary: string;
  references: Reference[];
  created_at: Date;
  updated_at: Date;
}

interface Reference {
  id: string;
  citation: string;              // "Morton RW et al. (2018)"
  journal: string;
  pmid?: string;
  doi?: string;
  url?: string;
  study_type: StudyType;
  sample_size?: number;
  quality_score?: number;
}

enum EvidenceType {
  META_ANALYSIS = 'meta_analysis',
  SYSTEMATIC_REVIEW = 'systematic_review',
  RCT = 'rct',
  OBSERVATIONAL = 'observational',
  CASE_STUDY = 'case_study',
  IN_VITRO = 'in_vitro',
  ANIMAL = 'animal',
  EXPERT_OPINION = 'expert_opinion'
}
```

---

### 5.5 Ingredient Evidence & Risk View

#### 5.5.1 Definition of Done

- [x] Ingredient list parsed into normalized entries with synonym handling
- [x] Tapping ingredient opens card showing:
  - What it is (short description)
  - Mechanism summary (2-3 lines)
  - Evidence-backed effects
  - Safety notes (side effects, contraindications, dose range)
- [x] Risk flags appear for ingredients matching user profile
- [x] 50-100 high-priority ingredients with curated cards

#### 5.5.2 Ingredient Card UI

```
┌─────────────────────────────────────────┐
│  ◀  Ingredient Detail                   │
├─────────────────────────────────────────┤
│                                         │
│  Niacinamide                            │
│  Also known as: Vitamin B3, Nicotinamide│
│                                         │
│  📖 What It Is                          │
│  A form of vitamin B3 commonly used in  │
│  skincare for its anti-inflammatory and │
│  pore-minimizing properties.            │
│                                         │
│  ⚙️ How It Works                        │
│  Niacinamide supports the skin barrier  │
│  by increasing ceramide production. It  │
│  also inhibits sebum production and has │
│  anti-inflammatory effects via NF-κB    │
│  pathway modulation.                    │
│                                         │
│  ✅ Evidence-Backed Effects             │
│  ┌─────────────────────────────────────┐│
│  │ Reduces hyperpigmentation           ││
│  │ Evidence: ████████░░ Strong         ││
│  └─────────────────────────────────────┘│
│  ┌─────────────────────────────────────┐│
│  │ Minimizes pore appearance           ││
│  │ Evidence: ██████░░░░ Moderate       ││
│  └─────────────────────────────────────┘│
│                                         │
│  ⚠️ Safety Information                  │
│  ┌─────────────────────────────────────┐│
│  │ Common Side Effects                 ││
│  │ • Mild flushing at high doses       ││
│  │ • Temporary redness (rare)          ││
│  │                                     ││
│  │ Typical Dose Range                  ││
│  │ Topical: 2-5% concentration         ││
│  │                                     ││
│  │ Contraindications                   ││
│  │ • None significant at typical doses ││
│  └─────────────────────────────────────┘│
│                                         │
│  📊 This Product Contains: 4%           │
│  ████████░░ Within optimal range        │
│                                         │
└─────────────────────────────────────────┘
```

#### 5.5.3 Risk Flag System

**Risk Categories:**

| Category | Example Flags | User Profile Triggers |
|----------|---------------|----------------------|
| Allergens | Milk, Soy, Gluten, Tree nuts | `allergies[]` |
| Pregnancy | Retinoids, High-dose Vitamin A | `pregnancy: true` |
| Conditions | Sodium (hypertension), Caffeine (anxiety) | `conditions[]` |
| Medications | Warfarin interactions, MAOIs | `medications[]` |
| Age-related | Stimulants (children), High mercury (elderly) | `age` |

**Risk Flag Display:**

```typescript
interface RiskFlag {
  ingredient_id: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
  user_profile_match: string;  // Which profile field triggered
  recommendation: string;
}

// Example risk flag rendering
function RiskFlagBadge({ flag }: { flag: RiskFlag }) {
  const colors = {
    high: { bg: '#FEE2E2', text: '#DC2626', icon: '🚫' },
    medium: { bg: '#FEF3C7', text: '#D97706', icon: '⚠️' },
    low: { bg: '#DBEAFE', text: '#2563EB', icon: 'ℹ️' }
  };
  
  return (
    <View style={[styles.badge, { backgroundColor: colors[flag.severity].bg }]}>
      <Text>{colors[flag.severity].icon} {flag.reason}</Text>
      <Text style={styles.detail}>Based on your {flag.user_profile_match}</Text>
    </View>
  );
}
```

#### 5.5.4 Priority Ingredients List (v0)

**Supplements (20):**
Creatine, Caffeine, Whey Protein, BCAAs, Beta-Alanine, Citrulline, Fish Oil/Omega-3, Vitamin D, Magnesium, Zinc, Iron, B-Complex, Ashwagandha, Melatonin, Collagen, Probiotics, Fiber/Psyllium, Glucosamine, CoQ10, Turmeric/Curcumin

**Skincare (20):**
Niacinamide, Retinol/Retinoids, Vitamin C, Hyaluronic Acid, Salicylic Acid, Glycolic Acid, Benzoyl Peroxide, Ceramides, Peptides, SPF filters (Zinc Oxide, Titanium Dioxide), Azelaic Acid, Alpha Arbutin, Squalane, Centella Asiatica, Tea Tree Oil, Parabens, Fragrance, Alcohol Denat, SLS/SLES, Mineral Oil

**OTC Medications (10):**
Ibuprofen, Acetaminophen, Aspirin, Diphenhydramine, Loratadine, Pseudoephedrine, Guaifenesin, Omeprazole, Loperamide, Hydrocortisone

**Food/Preservatives (10):**
Sodium, Added Sugars, Artificial Sweeteners (Aspartame, Sucralose), MSG, Sodium Nitrate, BHA/BHT, Carrageenan, High Fructose Corn Syrup, Trans Fats, Artificial Colors

---

### 5.6 MyStack Dashboard

#### 5.6.1 Feature Description

MyStack is a personalized dashboard showing all products the user has scanned and logged for the current day, with real-time health domain scoring and insights.

#### 5.6.2 Dashboard UI

```
┌─────────────────────────────────────────┐
│  ◀  MyStack                   📅 Today  │
├─────────────────────────────────────────┤
│                                         │
│  Wednesday, January 7, 2026             │
│  8 products in your stack               │
│                                         │
│  ═══════════════════════════════════════│
│  HEALTH DOMAINS                         │
│  ═══════════════════════════════════════│
│                                         │
│  🦠 Gut Health                          │
│  Support: ████████░░ High               │
│  Evidence: ██████░░░░ Moderate          │
│  "3 products with gut-supportive        │
│   compounds (fiber, probiotics)"        │
│                                      ▶  │
│                                         │
│  🧴 Skin Health                         │
│  Support: ██████░░░░ Moderate           │
│  Evidence: ████████░░ High              │
│  "Strong vitamin C, omega-3s present"   │
│                                      ▶  │
│                                         │
│  💤 Recovery & Sleep                    │
│  Support: ████░░░░░░ Low                │
│  Evidence: ██████░░░░ Moderate          │
│  "⚠️ Caffeine detected at 2:30 PM"      │
│                                      ▶  │
│                                         │
│  💇 Hair Health                         │
│  Support: ██████░░░░ Moderate           │
│  Evidence: ████░░░░░░ Low               │
│  "Biotin and zinc present"              │
│                                      ▶  │
│                                         │
│  🔥 Metabolism & Energy                 │
│  Support: ████████░░ High               │
│  Evidence: ████████░░ Strong            │
│  "B-vitamins, iron, magnesium stack"    │
│                                      ▶  │
│                                         │
│  ═══════════════════════════════════════│
│  TODAY'S PRODUCTS                       │
│  ═══════════════════════════════════════│
│                                         │
│  🌅 Morning (7:00 AM - 12:00 PM)        │
│  ┌─────────────────────────────────────┐│
│  │ ☕ Athletic Greens AG1    8:15 AM   ││
│  │ 💊 Vitamin D3 5000IU     8:15 AM   ││
│  │ 🥛 Whey Protein          10:30 AM  ││
│  └─────────────────────────────────────┘│
│                                         │
│  ☀️ Afternoon (12:00 PM - 6:00 PM)      │
│  ┌─────────────────────────────────────┐│
│  │ 🥗 Chipotle Bowl         12:45 PM  ││
│  │ ☕ Cold Brew Coffee       2:30 PM   ││
│  └─────────────────────────────────────┘│
│                                         │
│  🌙 Evening (6:00 PM - 12:00 AM)        │
│  ┌─────────────────────────────────────┐│
│  │ 💊 Magnesium Glycinate   9:00 PM   ││
│  │ 🧴 CeraVe PM Moisturizer 9:30 PM   ││
│  │ 💊 Melatonin 3mg         10:00 PM  ││
│  └─────────────────────────────────────┘│
│                                         │
│  [  📅 View History  ]  [ 📊 Trends ]   │
│                                         │
└─────────────────────────────────────────┘
```

---

### 5.7 Health Domain Scoring System

#### 5.7.1 Domain Definitions

| Domain | Icon | Measures |
|--------|------|----------|
| Gut Health | 🦠 | Microbiome diversity, digestive function, gut barrier integrity |
| Skin Health | 🧴 | Barrier function, hydration, collagen synthesis, inflammation |
| Recovery & Sleep | 💤 | Sleep quality, muscle recovery, stress resilience |
| Hair Health | 💇 | Growth cycle, follicle health, structural integrity |
| Metabolism & Energy | 🔥 | Glucose regulation, insulin sensitivity, mitochondrial function |
| Cognitive Function | 🧠 | Focus, memory, neuroprotection (v2) |

#### 5.7.2 Signal Definitions

```typescript
interface DomainSignals {
  domain: HealthDomain;
  positive_signals: Signal[];
  negative_signals: Signal[];
}

interface Signal {
  ingredient_id: string;
  ingredient_name: string;
  effect_direction: 'positive' | 'negative';
  evidence_weight: number;      // 0.0 - 1.0
  mechanism: string;
  conditions?: string[];        // Conditional effects, e.g., "after 2pm" for caffeine
}

const GUT_HEALTH_SIGNALS: DomainSignals = {
  domain: 'gut_health',
  positive_signals: [
    { ingredient_name: 'Prebiotics (Inulin, FOS)', evidence_weight: 0.85, mechanism: 'Feeds beneficial bacteria' },
    { ingredient_name: 'Probiotics', evidence_weight: 0.80, mechanism: 'Introduces beneficial strains' },
    { ingredient_name: 'Fiber', evidence_weight: 0.90, mechanism: 'Supports motility and microbiome' },
    { ingredient_name: 'Fermented foods', evidence_weight: 0.70, mechanism: 'Natural probiotics and postbiotics' },
    { ingredient_name: 'Omega-3s', evidence_weight: 0.60, mechanism: 'Anti-inflammatory, gut barrier support' },
    { ingredient_name: 'Polyphenols', evidence_weight: 0.65, mechanism: 'Prebiotic-like effects' }
  ],
  negative_signals: [
    { ingredient_name: 'Artificial sweeteners', evidence_weight: 0.70, mechanism: 'May alter microbiome composition' },
    { ingredient_name: 'Emulsifiers (Polysorbate, CMC)', evidence_weight: 0.60, mechanism: 'May affect gut barrier' },
    { ingredient_name: 'High sugar', evidence_weight: 0.75, mechanism: 'Promotes dysbiosis' },
    { ingredient_name: 'Excess alcohol', evidence_weight: 0.80, mechanism: 'Disrupts gut barrier and microbiome' }
  ]
};
```

#### 5.7.3 Scoring Algorithm

```typescript
interface DomainScore {
  domain: HealthDomain;
  support_level: 'low' | 'moderate' | 'high';
  support_score: number;           // -100 to +100
  evidence_confidence: 'low' | 'moderate' | 'high';
  evidence_score: number;          // 0 to 100
  insight_text: string;
  positive_contributors: Contributor[];
  negative_contributors: Contributor[];
}

function calculateDomainScore(
  domain: HealthDomain,
  stackProducts: StackProduct[],
  signals: DomainSignals
): DomainScore {
  let positiveScore = 0;
  let negativeScore = 0;
  let totalEvidence = 0;
  let evidenceCount = 0;
  
  const positiveContributors: Contributor[] = [];
  const negativeContributors: Contributor[] = [];
  
  for (const product of stackProducts) {
    for (const ingredient of product.ingredients) {
      // Check positive signals
      const positiveMatch = signals.positive_signals.find(
        s => matchesIngredient(s.ingredient_name, ingredient)
      );
      if (positiveMatch) {
        const score = positiveMatch.evidence_weight * getAmountMultiplier(ingredient);
        positiveScore += score;
        totalEvidence += positiveMatch.evidence_weight;
        evidenceCount++;
        positiveContributors.push({
          product_name: product.name,
          ingredient_name: ingredient.name,
          effect: positiveMatch.mechanism,
          evidence_weight: positiveMatch.evidence_weight
        });
      }
      
      // Check negative signals (with conditions)
      const negativeMatch = signals.negative_signals.find(
        s => matchesIngredient(s.ingredient_name, ingredient) &&
             (!s.conditions || checkConditions(s.conditions, product))
      );
      if (negativeMatch) {
        negativeScore += negativeMatch.evidence_weight;
        totalEvidence += negativeMatch.evidence_weight;
        evidenceCount++;
        negativeContributors.push({
          product_name: product.name,
          ingredient_name: ingredient.name,
          effect: negativeMatch.mechanism,
          evidence_weight: negativeMatch.evidence_weight
        });
      }
    }
  }
  
  // Calculate support level
  const netScore = positiveScore - negativeScore;
  const normalizedScore = Math.max(-100, Math.min(100, netScore * 20));
  const supportLevel = normalizedScore > 30 ? 'high' : normalizedScore > 0 ? 'moderate' : 'low';
  
  // Calculate evidence confidence
  const avgEvidence = evidenceCount > 0 ? totalEvidence / evidenceCount : 0;
  const evidenceScore = avgEvidence * 100;
  const evidenceConfidence = evidenceScore > 70 ? 'high' : evidenceScore > 40 ? 'moderate' : 'low';
  
  // Generate insight
  const insightText = generateInsight(domain, positiveContributors, negativeContributors);
  
  return {
    domain,
    support_level: supportLevel,
    support_score: normalizedScore,
    evidence_confidence: evidenceConfidence,
    evidence_score: evidenceScore,
    insight_text: insightText,
    positive_contributors: positiveContributors,
    negative_contributors: negativeContributors
  };
}
```

#### 5.7.4 Domain Detail View

```
┌─────────────────────────────────────────┐
│  ◀  🦠 Gut Health                       │
├─────────────────────────────────────────┤
│                                         │
│  Support Level                          │
│  ████████████████░░░░ High              │
│                                         │
│  Evidence Confidence                    │
│  ████████████░░░░░░░░ Moderate          │
│                                         │
│  ═══════════════════════════════════════│
│  ✅ POSITIVE SIGNALS                    │
│  ═══════════════════════════════════════│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ Athletic Greens AG1                 ││
│  │ • Prebiotics (Inulin)               ││
│  │   Evidence: ████████░░ Strong       ││
│  │ • Probiotics (7.2B CFU)             ││
│  │   Evidence: ████████░░ Strong       ││
│  └─────────────────────────────────────┘│
│                                         │
│  ┌─────────────────────────────────────┐│
│  │ Chipotle Bowl                       ││
│  │ • Fiber (Black beans, fajita veg)   ││
│  │   Evidence: ██████████ Very Strong  ││
│  └─────────────────────────────────────┘│
│                                         │
│  ═══════════════════════════════════════│
│  ⚠️ CONCERNS                            │
│  ═══════════════════════════════════════│
│                                         │
│  No significant gut health concerns     │
│  detected in today's stack.             │
│                                         │
│  ═══════════════════════════════════════│
│  💡 RECOMMENDATIONS                     │
│  ═══════════════════════════════════════│
│                                         │
│  • Consider adding fermented foods      │
│    like yogurt or kimchi for additional │
│    probiotic diversity                  │
│                                         │
│  • Your fiber intake looks good!        │
│    Aim for 25-35g daily                 │
│                                         │
│  ═══════════════════════════════════════│
│  📚 METHODOLOGY                         │
│  ═══════════════════════════════════════│
│                                         │
│  Support Level is calculated by:        │
│  (Σ Positive signals × Evidence weight) │
│  - (Σ Negative signals × Evidence       │
│  weight)                                │
│                                         │
│  Evidence Confidence is the average     │
│  evidence strength of all detected      │
│  signals.                               │
│                                         │
│  ═══════════════════════════════════════│
│  ℹ️ DISCLAIMER                          │
│  ═══════════════════════════════════════│
│                                         │
│  This information is for educational    │
│  purposes only and is not intended as   │
│  medical advice. Consult a healthcare   │
│  provider for personalized guidance.    │
│                                         │
└─────────────────────────────────────────┘
```

---

### 5.8 Newsletter Integration

#### 5.8.1 Content Management

**CMS Requirements:**
- Headless CMS (Contentful, Sanity, or Strapi)
- Rich text editor with embedded media
- Category tagging (Supplements, Skincare, Nutrition, OTC)
- SEO metadata fields
- Scheduling and draft support

**Article Schema:**

```typescript
interface NewsletterArticle {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  author: Author;
  category: ArticleCategory;
  featured_image: Image;
  content: RichText;
  read_time_minutes: number;
  tags: string[];
  related_products: string[];      // Product IDs mentioned
  related_ingredients: string[];   // Ingredient IDs mentioned
  published_at: Date;
  seo: SEOMetadata;
}
```

#### 5.8.2 Features

- In-app article reader with native feel
- Deep links from product screens to related articles
- Save/bookmark articles
- Share via native share sheet
- Email newsletter subscription (via SendGrid)
- Push notification for new articles (optional opt-in)

---

## 6. Data Models

### 6.1 SQLAlchemy 2.0 Models

#### Base Model Configuration

```python
# app/models/base.py
from datetime import datetime
from uuid import uuid4
from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

class UUIDMixin:
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
```

#### Product Models

```python
# app/models/product.py
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, Numeric, Text, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, UUIDMixin, TimestampMixin

class ProductCategory(str, PyEnum):
    FOOD = "food"
    SUPPLEMENT = "supplement"
    COSMETIC = "cosmetic"
    OTC = "otc"

class Product(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "products"

    barcode: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(255))
    category: Mapped[ProductCategory] = mapped_column(Enum(ProductCategory), nullable=False, index=True)
    subcategory: Mapped[str | None] = mapped_column(String(100))
    image_url: Mapped[str | None] = mapped_column(Text)
    serving_size: Mapped[str | None] = mapped_column(String(100))
    servings_per_container: Mapped[int | None] = mapped_column(Integer)
    usage_instructions: Mapped[str | None] = mapped_column(Text)
    size: Mapped[str | None] = mapped_column(String(50))
    price_usd: Mapped[float | None] = mapped_column(Numeric(10, 2))
    metadata: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Relationships
    ingredients: Mapped[list["ProductIngredient"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    claims: Mapped[list["Claim"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )

class ProductIngredient(Base, UUIDMixin):
    __tablename__ = "product_ingredients"
    __table_args__ = (UniqueConstraint("product_id", "ingredient_id"),)

    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    ingredient_id: Mapped[str] = mapped_column(ForeignKey("ingredients.id"))
    amount: Mapped[str | None] = mapped_column(String(50))
    unit: Mapped[str | None] = mapped_column(String(20))
    percentage: Mapped[float | None] = mapped_column(Numeric(5, 2))
    order_position: Mapped[int | None] = mapped_column(Integer)

    # Relationships
    product: Mapped["Product"] = relationship(back_populates="ingredients")
    ingredient: Mapped["Ingredient"] = relationship(back_populates="product_links")
```

#### Ingredient Models

```python
# app/models/ingredient.py
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Enum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, UUIDMixin, TimestampMixin

class IngredientCategory(str, PyEnum):
    VITAMIN = "vitamin"
    MINERAL = "mineral"
    AMINO_ACID = "amino_acid"
    HERB = "herb"
    ACTIVE = "active"
    EXCIPIENT = "excipient"
    PRESERVATIVE = "preservative"
    FRAGRANCE = "fragrance"
    OTHER = "other"

class Ingredient(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "ingredients"

    canonical_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    synonyms: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    description: Mapped[str | None] = mapped_column(Text)
    mechanism_summary: Mapped[str | None] = mapped_column(Text)
    category: Mapped[IngredientCategory] = mapped_column(Enum(IngredientCategory), nullable=False)
    typical_dose_range: Mapped[str | None] = mapped_column(String(100))
    common_side_effects: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    contraindications: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    # Relationships
    product_links: Mapped[list["ProductIngredient"]] = relationship(back_populates="ingredient")
    effects: Mapped[list["IngredientEffect"]] = relationship(
        back_populates="ingredient", cascade="all, delete-orphan"
    )
```

#### Claim & Evidence Models

```python
# app/models/claim.py
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, Numeric, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, UUIDMixin, TimestampMixin

class EvidenceStrength(str, PyEnum):
    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"
    INSUFFICIENT = "insufficient"

class EvidenceType(str, PyEnum):
    META_ANALYSIS = "meta_analysis"
    SYSTEMATIC_REVIEW = "systematic_review"
    RCT = "rct"
    OBSERVATIONAL = "observational"
    CASE_STUDY = "case_study"
    IN_VITRO = "in_vitro"
    ANIMAL = "animal"
    EXPERT_OPINION = "expert_opinion"

class StudyType(str, PyEnum):
    META_ANALYSIS = "meta_analysis"
    RCT_LARGE = "rct_large"
    RCT_SMALL = "rct_small"
    COHORT = "cohort"
    CASE_CONTROL = "case_control"
    CROSS_SECTIONAL = "cross_sectional"
    CASE_REPORT = "case_report"
    IN_VITRO = "in_vitro"
    ANIMAL = "animal"

class ClaimCategory(str, PyEnum):
    MUSCLE = "muscle"
    SKIN = "skin"
    COGNITIVE = "cognitive"
    ENERGY = "energy"
    SLEEP = "sleep"
    GUT = "gut"
    IMMUNE = "immune"
    CARDIOVASCULAR = "cardiovascular"
    HAIR = "hair"
    GENERAL = "general"

class Claim(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "claims"

    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    normalized_claim: Mapped[str] = mapped_column(String(255), nullable=False)
    claim_category: Mapped[ClaimCategory] = mapped_column(Enum(ClaimCategory), nullable=False)
    evidence_strength: Mapped[EvidenceStrength] = mapped_column(Enum(EvidenceStrength), nullable=False)
    evidence_score: Mapped[float | None] = mapped_column(Numeric(4, 2))
    evidence_types: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    target_populations: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    mechanism_summary: Mapped[str | None] = mapped_column(Text)

    # Relationships
    product: Mapped["Product"] = relationship(back_populates="claims")
    references: Mapped[list["ClaimReference"]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )

class ClaimReference(Base, UUIDMixin):
    __tablename__ = "claim_references"

    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id", ondelete="CASCADE"))
    citation: Mapped[str] = mapped_column(Text, nullable=False)
    journal: Mapped[str | None] = mapped_column(String(255))
    pmid: Mapped[str | None] = mapped_column(String(20))
    doi: Mapped[str | None] = mapped_column(String(100))
    url: Mapped[str | None] = mapped_column(Text)
    study_type: Mapped[StudyType | None] = mapped_column(Enum(StudyType))
    sample_size: Mapped[int | None] = mapped_column(Integer)
    quality_score: Mapped[float | None] = mapped_column(Numeric(3, 2))

    # Relationships
    claim: Mapped["Claim"] = relationship(back_populates="references")
```

#### User Models

```python
# app/models/user.py
from enum import Enum as PyEnum
from datetime import date, datetime
from sqlalchemy import String, Date, Boolean, Enum, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base, UUIDMixin, TimestampMixin

class BiologicalSex(str, PyEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class TimeOfDay(str, PyEnum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"
    NIGHT = "night"

class UserHealthProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "user_health_profiles"

    user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)  # Supabase user ID
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    biological_sex: Mapped[BiologicalSex | None] = mapped_column(Enum(BiologicalSex))
    is_pregnant: Mapped[bool] = mapped_column(Boolean, default=False)
    is_breastfeeding: Mapped[bool] = mapped_column(Boolean, default=False)
    allergies: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    conditions: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    medications: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    dietary_preferences: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    # Relationships
    stack_entries: Mapped[list["UserStackEntry"]] = relationship(back_populates="user_profile")

class UserStackEntry(Base, UUIDMixin):
    __tablename__ = "user_stack_entries"

    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    logged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    time_of_day: Mapped[TimeOfDay | None] = mapped_column(Enum(TimeOfDay))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    product: Mapped["Product"] = relationship()
    user_profile: Mapped["UserHealthProfile"] = relationship(
        back_populates="stack_entries",
        primaryjoin="UserStackEntry.user_id == foreign(UserHealthProfile.user_id)"
    )
```

#### Subscription Model

```python
# app/models/subscription.py
from enum import Enum as PyEnum
from datetime import datetime
from sqlalchemy import String, Boolean, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, UUIDMixin, TimestampMixin

class SubscriptionTier(str, PyEnum):
    FREE = "free"
    PREMIUM_MONTHLY = "premium_monthly"
    PREMIUM_ANNUAL = "premium_annual"
    FAMILY = "family"

class SubscriptionStatus(str, PyEnum):
    ACTIVE = "active"
    CANCELLED = "cancelled"  # Still has access until expires_at
    EXPIRED = "expired"
    BILLING_ISSUE = "billing_issue"

class Subscription(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "subscriptions"

    user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    tier: Mapped[SubscriptionTier] = mapped_column(
        Enum(SubscriptionTier), nullable=False, default=SubscriptionTier.FREE
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus), nullable=False, default=SubscriptionStatus.ACTIVE
    )
    store: Mapped[str | None] = mapped_column(String(50))  # 'app_store', 'play_store'
    original_purchase_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    grace_period_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
```

### 6.2 Database Session Management

```python
# app/db/session.py
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

### 6.3 Repository Pattern Example

```python
# app/repositories/base.py
from typing import Generic, TypeVar, Type
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.base import Base

ModelType = TypeVar("ModelType", bound=Base)

class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType], session: AsyncSession):
        self.model = model
        self.session = session

    async def get(self, id: str) -> ModelType | None:
        return await self.session.get(self.model, id)

    async def get_multi(self, *, skip: int = 0, limit: int = 100) -> list[ModelType]:
        result = await self.session.execute(
            select(self.model).offset(skip).limit(limit)
        )
        return list(result.scalars().all())

    async def create(self, **kwargs) -> ModelType:
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, id: str, **kwargs) -> ModelType | None:
        instance = await self.get(id)
        if instance:
            for key, value in kwargs.items():
                setattr(instance, key, value)
            await self.session.flush()
            await self.session.refresh(instance)
        return instance

    async def delete(self, id: str) -> bool:
        instance = await self.get(id)
        if instance:
            await self.session.delete(instance)
            return True
        return False


# app/repositories/product.py
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.product import Product
from app.repositories.base import BaseRepository

class ProductRepository(BaseRepository[Product]):
    def __init__(self, session):
        super().__init__(Product, session)

    async def get_by_barcode(self, barcode: str) -> Product | None:
        result = await self.session.execute(
            select(Product)
            .options(
                selectinload(Product.ingredients),
                selectinload(Product.claims)
            )
            .where(Product.barcode == barcode)
        )
        return result.scalar_one_or_none()

    async def get_with_details(self, id: str) -> Product | None:
        result = await self.session.execute(
            select(Product)
            .options(
                selectinload(Product.ingredients).selectinload(ProductIngredient.ingredient),
                selectinload(Product.claims).selectinload(Claim.references)
            )
            .where(Product.id == id)
        )
        return result.scalar_one_or_none()
```

### 6.4 Indexes (SQL Migration)

```sql
-- Product search
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);

-- Ingredient lookup
CREATE INDEX idx_ingredients_canonical ON ingredients(canonical_name);
CREATE INDEX idx_ingredients_synonyms ON ingredients USING gin(synonyms);

-- User queries
CREATE INDEX idx_stack_user_date ON user_stack_entries(user_id, logged_at DESC);
CREATE INDEX idx_stack_logged_at ON user_stack_entries(logged_at);
CREATE INDEX idx_health_profile_user ON user_health_profiles(user_id);

-- Subscription
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expires ON subscriptions(expires_at);

-- Claims
CREATE INDEX idx_claims_product ON claims(product_id);
CREATE INDEX idx_claims_strength ON claims(evidence_strength);
```

---

## 7. API Specification


### 7.2 Authentication

All authenticated endpoints require a Supabase JWT:
```
Authorization: Bearer <supabase_access_token>
```

The token is obtained from `supabase.auth.getSession()` on the client.

### 7.3 Endpoints

#### Products

```yaml
GET /products/{id}
  description: Get product details
  auth: optional (premium features require auth)
  response: Product with claims and ingredients

GET /products/barcode/{barcode}
  description: Lookup product by barcode
  auth: required
  response: Product or 404

GET /products/search
  description: Search products
  auth: required
  params:
    q: string (search query)
    category?: product_category
    limit?: number (default 20, max 50)
    offset?: number
  response: ProductSearchResults

POST /products/scan
  description: Log a product scan (for analytics)
  auth: required
  body: { barcode: string, product_id?: string }
  response: { scanned: true }
```

#### Claims & Evidence

```yaml
GET /products/{id}/claims
  description: Get all claims for a product
  auth: required
  response: Claim[]

GET /claims/{id}
  description: Get claim details with references
  auth: required (premium)
  response: ClaimDetail with references
```

#### Ingredients

```yaml
GET /ingredients/{id}
  description: Get ingredient details
  auth: required
  response: IngredientDetail

GET /ingredients/search
  description: Search ingredients
  auth: required
  params:
    q: string
  response: Ingredient[]
```

#### User Stack

```yaml
GET /users/me/stack
  description: Get user's stack for a date
  auth: required
  params:
    date?: string (YYYY-MM-DD, default today)
  response: StackEntry[]

POST /users/me/stack
  description: Add product to stack
  auth: required
  body: { product_id: string, logged_at?: string, time_of_day?: string }
  response: StackEntry

DELETE /users/me/stack/{entry_id}
  description: Remove from stack
  auth: required
  response: 204 No Content

GET /users/me/stack/domains
  description: Get health domain scores for date
  auth: required
  params:
    date?: string
  response: DomainScore[]

GET /users/me/stack/domains/{domain}
  description: Get detailed domain breakdown
  auth: required
  params:
    date?: string
  response: DomainDetail
```

#### User Profile

```yaml
GET /users/me/profile
  description: Get health profile
  auth: required
  response: UserHealthProfile

PUT /users/me/profile
  description: Update health profile
  auth: required
  body: UserHealthProfileUpdate
  response: UserHealthProfile
```

#### Subscriptions

```yaml
GET /users/me/subscription
  description: Get subscription status (synced from RevenueCat)
  auth: required
  response: Subscription

GET /users/me/subscription/verify
  description: Verify subscription status directly with RevenueCat
  auth: required
  response: { is_premium: boolean, entitlements: string[], expires_at: string | null }

POST /webhooks/revenuecat
  description: RevenueCat webhook handler (server-to-server)
  auth: RevenueCat signature verification
  body: RevenueCatWebhookEvent
  response: { received: true }
```

Note: Subscription purchases are handled entirely through RevenueCat SDK on the client.
Users manage subscriptions via native iOS/Android subscription settings.

#### Discovery

```yaml
GET /discover/trending
  description: Get trending products
  auth: optional
  params:
    period?: '24h' | '7d' | '30d'
    limit?: number
  response: TrendingProduct[]

GET /discover/recent
  description: Get recently scanned (anonymized)
  auth: optional
  params:
    limit?: number
  response: Product[]
```

#### Newsletter

```yaml
GET /newsletter/articles
  description: Get latest articles
  auth: optional
  params:
    category?: string
    limit?: number
    offset?: number
  response: ArticleSummary[]

GET /newsletter/articles/{slug}
  description: Get full article
  auth: optional
  response: Article
```

---

## 8. Third-Party Integrations

### 8.1 Authentication & Payments

| Service | Purpose | Integration |
|---------|---------|-------------|
| Supabase Auth | User authentication, JWT tokens | SDK + JWT verification |
| RevenueCat | Subscription management | SDK + Webhooks |
| App Store Connect | iOS subscriptions | Via RevenueCat |
| Google Play Billing | Android subscriptions | Via RevenueCat |

### 8.2 Product Data Sources

| Source | Purpose | API |
|--------|---------|-----|
| OpenFoodFacts | Food product data | REST API |
| Open Beauty Facts | Cosmetics data | REST API |
| OpenFDA | Drug/OTC data | REST API |
| UPCitemdb | Barcode fallback | REST API |
| Nutritionix | Nutrition data | REST API |

### 8.3 Scientific References

| Source | Purpose | Integration |
|--------|---------|-------------|
| PubMed/NCBI | Citation lookup | E-utilities API |
| Semantic Scholar | Paper metadata | REST API |
| CrossRef | DOI resolution | REST API |

### 8.4 Communication

| Service | Purpose |
|---------|---------|
| SendGrid | Transactional email, newsletter |
| Firebase Cloud Messaging | Push notifications |
| Supabase Realtime | WebSocket updates (optional) |

### 8.5 Infrastructure

| Service | Purpose |
|---------|---------|
| Supabase | PostgreSQL hosting, Auth, Storage |
| Upstash | Serverless Redis |
| Meilisearch Cloud / Elasticsearch | Full-text search |
| Cloudflare R2 | Object storage (images) |
| Sentry | Error tracking |
| Datadog | APM, metrics |

---

## 9. Security & Compliance

### 9.1 Data Protection

- All data encrypted at rest (AES-256)
- TLS 1.3 for all API communications
- PII minimization (health data stored separately)
- GDPR-compliant data export/deletion
- HIPAA considerations (health data is user-reported, not diagnostic)

### 9.2 API Security

- Rate limiting: 100 req/min (free), 500 req/min (premium)
- JWT validation on all protected routes
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- CORS restricted to app domains

### 9.3 Mobile Security

- Certificate pinning for API calls
- Secure storage for tokens (Keychain/Keystore)
- Jailbreak/root detection (advisory only)
- No sensitive data in logs

### 9.4 Compliance

| Regulation | Status | Notes |
|------------|--------|-------|
| GDPR | Required | EU users |
| CCPA | Required | California users |
| HIPAA | Advisory | Not a covered entity, but best practices |
| PCI-DSS | Via App Stores | Payment handled by Apple/Google, no card data touches our servers |
| App Store Guidelines | Required | Privacy nutrition labels, subscription guidelines |
| Google Play Policies | Required | Data safety section, subscription policies |

---

## 10. Performance Requirements

### 10.1 Response Times

| Operation | Target | P99 |
|-----------|--------|-----|
| Product lookup | < 200ms | < 500ms |
| Barcode scan → result | < 500ms | < 1s |
| Search results | < 300ms | < 800ms |
| Stack calculation | < 400ms | < 1s |

### 10.2 Availability

- Target uptime: 99.9%
- Planned maintenance windows: < 4 hours/month
- RTO (Recovery Time Objective): 1 hour
- RPO (Recovery Point Objective): 1 hour

### 10.3 Scalability

- Support 100k DAU at launch
- Auto-scaling based on CPU/memory
- Database read replicas for query scaling
- CDN for static assets and images

---

## 11. Device Compatibility

### 11.1 Minimum Requirements

**iOS:**
- iOS 14.0+
- iPhone 8 or newer
- 100MB storage

**Android:**
- Android 8.0 (API 26)+
- 2GB RAM minimum
- 100MB storage
- Camera with autofocus

### 11.2 Target Test Devices

| Device | OS | Priority |
|--------|-----|----------|
| iPhone 13 | iOS 17 | Primary |
| iPhone SE (2022) | iOS 16 | Secondary |
| Samsung Galaxy A54 | Android 14 | Primary |
| Google Pixel 6a | Android 13 | Secondary |

### 11.3 Accessibility

- VoiceOver/TalkBack support
- Dynamic text sizing
- Minimum touch targets (44x44pt)
- Color contrast ratios (WCAG AA)
- Screen reader labels for all interactive elements

---

## 12. Analytics & Monitoring

### 12.1 Product Analytics

**Tools:** Mixpanel or Amplitude

**Key Events:**
- `product_scanned` - barcode, product_id, found_in_db
- `product_searched` - query, results_count
- `claim_viewed` - claim_id, product_id
- `ingredient_viewed` - ingredient_id
- `stack_item_added` - product_id, time_of_day
- `domain_detail_viewed` - domain
- `subscription_started` - tier
- `subscription_canceled` - tier, reason

### 12.2 Technical Monitoring

**Tools:** Datadog, Sentry

**Metrics:**
- API response times (p50, p95, p99)
- Error rates by endpoint
- Database query performance
- Cache hit rates
- Supabase auth success/failure
- RevenueCat webhook processing time
- Subscription conversion funnel

### 12.3 Business Metrics

- Daily/Monthly Active Users (DAU/MAU)
- Scans per user per day
- Free → Premium conversion rate
- Churn rate by cohort
- Feature adoption rates
- NPS score (quarterly)

---

## 13. Future Considerations (v2)

### 13.1 Cognitive Function Domain

```typescript
const COGNITIVE_SIGNALS: DomainSignals = {
  domain: 'cognitive_function',
  positive_signals: [
    { ingredient_name: 'Omega-3s (DHA)', evidence_weight: 0.85 },
    { ingredient_name: 'B-Vitamins', evidence_weight: 0.70 },
    { ingredient_name: 'Caffeine (moderate)', evidence_weight: 0.75 },
    { ingredient_name: 'Creatine', evidence_weight: 0.60 },
    { ingredient_name: 'Flavonoids', evidence_weight: 0.55 }
  ],
  negative_signals: [
    { ingredient_name: 'High sugar', evidence_weight: 0.70 },
    { ingredient_name: 'Excessive caffeine', evidence_weight: 0.65 },
    { ingredient_name: 'Alcohol', evidence_weight: 0.80 },
    { ingredient_name: 'Ultra-processed foods', evidence_weight: 0.60 }
  ]
};
```

### 13.2 Planned Features

| Feature | Priority | Target |
|---------|----------|--------|
| Cognitive domain | High | Q2 2026 |
| AI-powered recommendations | Medium | Q2 2026 |
| Wearable integration (Apple Health, Google Fit) | Medium | Q3 2026 |
| Social features (share stack) | Low | Q3 2026 |
| Practitioner accounts | Medium | Q4 2026 |
| White-label B2B offering | Low | 2027 |

### 13.3 Technical Debt Considerations

- GraphQL layer (Strawberry) for flexible mobile queries
- Supabase Realtime for live subscription status updates
- Machine learning pipeline for claim extraction from research papers
- Background job system (ARQ/Celery) for data enrichment
- CDN caching strategy for product images
- Database read replicas for scaling read-heavy endpoints

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Stack | User's collection of products for a given day |
| Claim | A specific health benefit assertion about a product |
| Evidence Strength | Confidence level based on scientific literature |
| Domain | Category of health outcomes (gut, skin, etc.) |
| Signal | Ingredient effect (positive or negative) on a domain |
| RCT | Randomized Controlled Trial |

---

## Appendix B: Contact

**Technical Lead:** [TBD]  
**Product Manager:** [TBD]  
**Design Lead:** [TBD]

---

*Document Version History:*
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | Jan 7, 2026 | NourAI Team | Initial draft |
| 1.1.0 | Jan 27, 2026 | NourAI Team | Updated auth (Supabase), payments (RevenueCat), ORM (SQLAlchemy 2.0) |