# Bug Fixes: Auth, Data Contracts & UX Polish

**Date:** 2026-04-16  
**Scope:** 9 issues across P0–P3 spanning backend auth, frontend data contracts, missing UI, mock flows, onboarding, test config, and dev environment.

---

## Section 1 — Auth & Guest Flow

### P0: Guest barcode scan unblocked

**Problem:** `GET /api/v1/products/barcode/{barcode}` uses `CurrentUser` (required auth). Unauthenticated guests receive 401, blocking the core acquisition funnel.

**Fix:** Change the dependency to `OptionalUser` (already defined in the auth module). The handler body does not use the `current_user` argument — this is a one-line change. Authenticated callers are unaffected.

**File:** `backend-nourai/app/api/v1/products.py` — barcode route signature.

### P1: Stack server persistence + guest→auth migration

**Problem:** The stack screen sources all data from in-memory `useAppState()`. The backend stack API (`GET/POST/DELETE /stack`) exists and is fully wired in `api.ts` but never called. Stack is lost on reload; cross-device sync is impossible.

**Fix — signed-in path:**
- Stack screen mounts → `useEffect` gated on `session !== null` calls `api.getStack()` and populates local state.
- Add mutation → calls `api.addToStack(productId)` optimistically; reverts + shows toast on error.
- Remove mutation → calls `api.removeFromStack(entryId)` optimistically; reverts + shows toast on error.

**Fix — guest path:** No change. Guest stack lives in `useAppState()` as before.

**Fix — guest→auth migration:** In the auth state listener (fired on `SIGNED_IN`):
1. If `appState.stack` is non-empty, iterate and call `api.addToStack()` for each item.
2. Call `api.getStack()` to replace local state with the canonical server list.
3. This is fire-once — on subsequent sign-ins the local stack is empty so there's nothing to migrate.

**Files:**
- `nourai/app/(tabs)/stack.tsx` — wire API calls
- `nourai/app/_layout.tsx` (or auth context) — add migration step in `onAuthStateChange`

---

## Section 2 — Frontend Data Contracts

### P0: Biodomain label mismatch

**Problem:** `BIO_DOMAIN_LABELS` in the product page and `DOMAINS` in `constants/domains.ts` use invented strings (`'Dermal'`, `'Metabolic'`, `'Exposure Load'`, etc.) that never match the backend `name` values. All `bio_domains.find(d => d.name === label)` lookups return `undefined` and every domain bar shows 0.

**Backend canonical names (10 domains):**

| Key | Name |
|---|---|
| `inflammation_immune` | Inflammation & Immune |
| `skin_appearance` | Skin & Appearance |
| `energy_metabolism` | Energy & Metabolism |
| `gut_digestive` | Gut & Digestive |
| `cognitive_mental` | Cognitive & Mental |
| `cardiovascular` | Cardiovascular |
| `bone_joint` | Bone & Joint |
| `hormonal_endocrine` | Hormonal & Endocrine |
| `body_composition` | Body Composition |
| `sleep_recovery` | Sleep & Recovery |

**Fix:**
- `app/product/[id].tsx` — replace `BIO_DOMAIN_LABELS` with the 10 exact backend names above. Remove `"Exposure Load"` (no backend equivalent).
- `constants/domains.ts` — replace `DOMAINS` array with the same 10 names. Verify radar chart component handles the longer label strings (truncate if needed).

### P1: Subscription type alignment

**Problem:** Frontend `Subscription` interface diverges from backend enums. `tier` expects `premium_monthly`/`premium_annual`/`family`; backend only has `free`/`premium`. Status `cancelled` (2× L) and `billing_issue` don't exist in backend; backend has `canceled` (1× L) and `grace_period`.

**Fix — align frontend to backend:**

```ts
// services/api.ts
export interface Subscription {
  tier: 'free' | 'premium';
  status: 'active' | 'expired' | 'canceled' | 'grace_period';
  // ...rest unchanged
}
```

- Remove `premium_monthly`, `premium_annual`, `family` from tier union.
- Fix status spelling: `cancelled` → `canceled`, `billing_issue` → `grace_period`.
- Remove `verifySubscription()` method from `api.ts` (no backend route exists).
- Update all downstream UI branches: `tier === 'premium_monthly' || 'premium_annual'` → `tier === 'premium'`.

**Files:**
- `nourai/services/api.ts`
- `nourai/app/settings/subscription.tsx`
- `nourai/app/profile-hub.tsx` (any tier checks)

---

## Section 3 — Missing UI, Mock Flows & Onboarding Goals

### P1: Missing settings routes

**Problem:** `profile-hub.tsx` links to `/settings/privacy` and `/settings/about` — neither screen exists. Tapping either crashes navigation.

**Fix:** Create two stub screens following the pattern of `notifications.tsx`:

`app/settings/privacy.tsx`:
- Header: "Privacy"
- Body: brief statement that user data is not sold or shared with third parties
- Placeholder link: "View Privacy Policy" (opens a URL via `Linking.openURL`)

`app/settings/about.tsx`:
- Header: "About NourAI"
- App version from `expo-constants` (`Constants.expoConfig?.version`)
- Tagline
- Placeholder links: "Terms of Service", "Privacy Policy"

### P2: Non-misleading mock flows

**Problem:** Account screen "Save changes" logs to console; subscription screen "Subscribe"/"Restore" show fake success alerts. Beta testers can mistake these for real functionality.

**Fix — `settings/account.tsx`:**
- Disable "Save changes" button; replace label with *"Profile editing coming soon"*.
- Delete-account action shows alert: *"To delete your account, email support@nourai.app"* — no simulated deletion.

**Fix — `settings/subscription.tsx`:**
- Remove Subscribe/Restore buttons.
- Replace with *"Manage your subscription in the App Store or Google Play"* and a `Linking.openURL` to the respective store subscription management page.
- No fake success alerts.

### P2: Onboarding goals — add missing options

**Problem:** Onboarding goal picker is missing `reduce_stress`, `better_sleep`, and `recovery` — goals the backend and chat layer already support.

**Fix:** Add three entries to the goal picker list:
- `reduce_stress` → "Reduce Stress"
- `better_sleep` → "Better Sleep"
- `recovery` → "Recovery"

**Files:** `nourai/app/onboarding.tsx` (primary goal picker) and `nourai/app/health/edit-profile.tsx` (goal editing in profile).

---

## Section 4 — Backend & Dev Config

### P2: Anyio/trio test errors

**Problem:** `@pytest.mark.anyio` parametrizes tests against both `asyncio` and `trio` backends. `trio` is not installed, producing 3 errors (not failures) in the test run. CI health is misleadingly weak.

**Fix:** Add `pytest.ini` to `backend-nourai/`:

```ini
[pytest]
anyio_backends = asyncio
```

This restricts parametrization to asyncio only. No trio code exists in the codebase, so nothing is lost.

### P3: Hardcoded dev API URL

**Problem:** `services/api.ts` falls back to `http://192.168.0.163:8081/api/v1` in dev (wrong IP, wrong port — backend runs on 8001) and `''` in production (silently breaks all native API calls).

**Fix:**

```ts
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:8001/api/v1' : '');

if (!API_BASE_URL) {
  console.warn('[api] EXPO_PUBLIC_API_URL is not set — API calls will fail in production');
}
```

Dev fallback points to `localhost:8001` (matches `make start`). Production requires `EXPO_PUBLIC_API_URL` to be set via Expo environment config; a console warning is emitted at startup if it isn't.

---

## File Change Summary

| File | Change |
|---|---|
| `backend-nourai/app/api/v1/products.py` | `CurrentUser` → `OptionalUser` on barcode route |
| `backend-nourai/pytest.ini` | Create — restrict anyio to asyncio backend |
| `nourai/app/(tabs)/stack.tsx` | Wire `api.getStack/addToStack/removeFromStack` |
| `nourai/app/_layout.tsx` | Add guest→auth stack migration on `SIGNED_IN` |
| `nourai/app/product/[id].tsx` | Fix `BIO_DOMAIN_LABELS` to match backend names |
| `nourai/constants/domains.ts` | Fix `DOMAINS` to match backend names |
| `nourai/services/api.ts` | Fix `Subscription` types, remove `verifySubscription`, fix dev URL |
| `nourai/app/settings/privacy.tsx` | Create stub screen |
| `nourai/app/settings/about.tsx` | Create stub screen |
| `nourai/app/settings/account.tsx` | Disable save button, honest delete-account copy |
| `nourai/app/settings/subscription.tsx` | Remove fake subscribe/restore, add store link |
| `nourai/app/onboarding/*.tsx` | Add 3 missing goals to picker |

---

## Success Criteria

- Guest can scan a barcode and see a product — no 401.
- Product page bio-domain bars show non-zero values for products with backend scores.
- Signed-in user's stack persists across app restarts.
- Guest stack items appear in the server stack after sign-in.
- `/settings/privacy` and `/settings/about` navigate without crashing.
- Subscription UI shows no fake success alerts.
- `pytest tests/` reports 17 passed, 0 errors (no trio errors).
- Dev server URL matches `make start` port.
