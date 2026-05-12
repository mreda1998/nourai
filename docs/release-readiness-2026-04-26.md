# Release Readiness — Elory App
**Date:** 2026-04-26  
**Status:** Pre-release audit  
**Target:** App Store (iOS) + Google Play public launch

---

## Executive Summary

The app is architecturally sound — auth, navigation, ingredient intelligence, and all premium screens are built and wired to real API data. However there are **3 blocking issues** that must be fixed before any public release (subscription purchase, premium gating, and the production API URL). Several additional items affect quality and completeness.

---

## Blocking — Must fix before release

### 1. Subscription purchase is not wired up
**File:** `nourai/app/settings/subscription.tsx:115`

```ts
// Mock current subscription tier — replace with RevenueCat when available
const currentTier: SubscriptionTier = 'free';
```

The subscription screen is a shell. The "Subscribe" button opens the App Store subscription management page rather than initiating a purchase. RevenueCat is configured as the payments backend (backend has webhook endpoint) but the React Native SDK is not integrated in the frontend. **App stores will reject the app if the subscription flow doesn't work end-to-end.**

**Fix required:**
- Install `react-native-purchases` (RevenueCat SDK)
- Wire `Purchases.purchasePackage()` to the subscribe button
- On success, call the backend to update subscription tier
- Read `currentTier` from the API/auth context, not a hardcoded constant

---

### 2. Premium screens have no subscription gating
**Files:** `nourai/app/(premium)/_layout.tsx`, all `(premium)/*.tsx` screens

All 6 premium screens (Ask Elory, Circadian Protocol, Conflict Map, Exposure Ledger, Evidence Pulse, Peptides) are fully accessible to free users — no paywall. The `PremiumLock` component exists (`components/elory/PremiumLock.tsx`) but is not applied.

**Fix required:**
- In `app/(premium)/_layout.tsx`, check `useAuth()` for subscription tier
- If `tier === 'free'`, render `<PremiumLock />` overlay instead of the screen content
- Also enforce on backend: activate `require_premium` dependency in `app/api/v1/atelier.py`

---

### 3. Production API URL is empty string
**File:** `nourai/services/api.ts:5-7`

```ts
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:8000/api/v1' : '');  // ← '' in production!
```

In a production build (`__DEV__ = false`), all API calls silently fail — the base URL is an empty string. The app will appear to load but every data fetch will error.

**Fix required:**
- Set `EXPO_PUBLIC_API_URL` in EAS Build secrets (production build config)
- Change the fallback to a real URL or a hard error:
  ```ts
  const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_URL ??
    'https://api.elory.com/api/v1';
  ```
- Confirm the production backend is deployed and reachable at that URL

---

## High priority — Fix before public launch

### 4. Stack is not persisted across app sessions
**File:** `nourai/context/app-state.tsx`

The user's stack lives only in memory. On every cold start, `stack` initialises as `[]`. For signed-in users, the server has their products (the stack tab fetches `serverEntries` from `GET /users/me/stack`) but those entries are **never rehydrated into the local display state**. The home screen and stack tab both show empty on fresh open.

The `serverEntries` fetched in `stack.tsx` are only used to get entry UUIDs for deletion — the actual product data (name, brand, grade, ingredients) is not loaded back into the local `Product[]` array.

**Fix required:**
- On sign-in (and on `AppStateProvider` mount when a session exists), fetch `GET /users/me/stack` and populate the local `stack` state from the response
- The `StackEntry` type returned by the API includes `product_name`, `product_brand`, `product_category`, `product_grade` — use these to reconstruct `Product[]`
- This also fixes the "home page shows products" inconsistency (currently only visible when app is backgrounded from a previous session, not on cold start)

---

### 5. History screen uses fake data
**File:** `nourai/app/(tabs)/history.tsx:198-208`

```ts
const fakeItems: ScanHistoryItem[] = stack.map((p) => ({...}));
setAllItems(fakeItems);
setHistory(groupHistoryByDate(fakeItems));
```

The scan history screen builds its list from the current in-memory `stack` array, not from the real `GET /users/me/history` API endpoint (which exists and is documented). History is also never persisted across sessions.

**Fix required:**
- Replace `fakeItems` with `await api.getHistory(token)`
- Show real scan timestamps from the server
- For guest users, derive from local stack with a "Sign in to see full history" prompt

---

### 6. Account settings screen shows "Coming Soon"
**File:** `nourai/app/settings/account.tsx:38, 185`

The "Edit Profile" / "Save" action shows an `Alert.alert('Coming Soon', ...)`. The entire name/email edit flow is a stub. This is visible to all users from the profile page.

**Fix required:**
- Wire to `PATCH /api/v1/users/me/profile` for name changes
- Wire to Supabase `updateUser({ email })` for email changes (with confirmation flow)
- Or clearly hide the edit UI until this is ready

---

## Medium priority — Quality issues

### 7. Onboarding redesign not implemented
**Spec:** `docs/superpowers/specs/2026-04-20-onboarding-redesign-design.md`  
**Plan:** `docs/superpowers/plans/2026-04-20-onboarding-redesign.md`

The 13-step value-first onboarding (with 3 AHA evidence moments, age/sex/activity/sleep collection, and structured convert step) is fully specced and planned but **not yet implemented**. The current onboarding is a shorter, simpler flow.

This is not a blocker for launch (the current flow works) but is a significant conversion opportunity.

**Onboarding images also missing:** `nourai/assets/onboarding/` directory is empty. Five images needed: `welcome.png`, `noise.png`, `vitamin_c.png`, `fish_oil.png`, `probiotic.png`.

---

### 8. App bundle ID and name may need updating
**File:** `nourai/app.json`

The app is configured as:
- Bundle ID: `com.elory.app`
- Display name: `"Elory"`

If the brand has shifted toward "NourAI," the bundle ID and name must be updated **before** first submission. Changing them after an app is live in the store requires creating a new listing.

---

### 9. App icon and splash are placeholder size
**Files:** `nourai/assets/icon.png`, `nourai/assets/splash.png`

Both are present but only 5.2 KB — very small for a production icon (a proper 1024×1024 app icon is typically 200–500 KB). These are likely placeholder assets.

**Required for App Store submission:**
- `icon.png`: 1024×1024 px, PNG, no transparency, no rounded corners (Apple adds them)
- `splash.png`: 1284×2778 px minimum, or use `expo-splash-screen` with proper config
- `adaptive-icon.png` (Android): 1024×1024 with safe zone

---

### 10. No iOS Privacy Manifest
**Required for iOS 17+ / Xcode 15+**

Apps using certain APIs (including `UserDefaults`, networking APIs used by Supabase, and possibly camera) must include a `PrivacyInfo.xcprivacy` manifest declaring what data is accessed and why. Without it, App Store review may reject the build.

---

## Low priority — Polish before launch

### 11. Supabase keys committed to version control
**File:** `nourai/.env`

The `.env` file contains real Supabase URL and anon key. The anon key is intentionally public (it's safe to expose per Supabase design) but committing `.env` files is poor practice. Before production, rotate both keys and ensure `.env` is in `.gitignore`.

### 12. Backend `.env` also committed
**File:** `backend-nourai/` — check `.gitignore`

The backend `.env` contains `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret), and `REVENUECAT_WEBHOOK_SECRET`. These **must not** be in version control.

---

## Feature completion status

| Feature | Status | Notes |
|---------|--------|-------|
| Barcode scanning | ✅ Complete | Real camera + barcode lookup |
| Product deep-dive | ✅ Complete | Full ingredient list → ingredient FK links |
| Ingredient deep-dive | ✅ Complete | Belief vs. reality, PubMed evidence, dose/safety |
| Stack (local) | ✅ Complete | In-memory, add/remove, radar scores |
| Stack (server sync) | ⚠️ Partial | Push on sign-in works; pull on app start missing |
| Ask Elory (chat) | ✅ Complete | Persistent chat history, streak tracking |
| Circadian Protocol | ✅ Complete | Time-segmented supplement schedule |
| Conflict Map | ✅ Complete | Interaction graph with biochemical detail |
| Exposure Ledger | ✅ Complete | 14-day compound tracking |
| Evidence Pulse | ✅ Complete | New research on stack ingredients |
| Peptides browse | ✅ Complete | Search, filter, regulatory badges |
| Peptide deep-dive extensions | ✅ Complete | Regulatory, admin routes, cycle protocol |
| Premium gating | ❌ Missing | All premium screens open to free users |
| Subscription purchase | ❌ Missing | RevenueCat not wired in frontend |
| Scan history | ⚠️ Fake data | Uses local stack, not API history endpoint |
| Account editing | ⚠️ Stub | Shows "Coming Soon" alert |
| Onboarding (13-step redesign) | ⚠️ Not started | Plan + spec complete; current onboarding is shorter |
| Onboarding images | ❌ Missing | 5 Midjourney images not provided |
| Production API URL | ❌ Missing | Empty string in production build |
| App Store assets | ⚠️ Placeholder | Icons are 5.2 KB — need production artwork |
| iOS Privacy Manifest | ❌ Missing | Required for iOS 17+ submission |

---

## Minimum viable release checklist

Before submitting to App Store / Play Store:

- [ ] Wire RevenueCat SDK — purchase flow works end-to-end
- [ ] Add premium gating — free users see paywall, not content
- [ ] Set `EXPO_PUBLIC_API_URL` in EAS Build secrets for production
- [ ] Load stack from server on app start (rehydration bug fix)
- [ ] Replace fake history with real `GET /users/me/history` call
- [ ] Produce final app icon (1024×1024) and splash screen assets
- [ ] Add `PrivacyInfo.xcprivacy` manifest
- [ ] Move `.env` secrets to EAS secrets / CI; rotate committed keys
- [ ] Confirm bundle ID (`com.elory.app`) matches App Store Connect listing
- [ ] Test production build (`eas build --profile production`) fully before submission
