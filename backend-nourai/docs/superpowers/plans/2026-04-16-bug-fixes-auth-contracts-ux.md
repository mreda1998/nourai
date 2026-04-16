# Bug Fixes: Auth, Data Contracts & UX Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 issues spanning guest auth, biodomain label mismatches, stack persistence, missing screens, subscription type drift, mock flows, onboarding gaps, test config, and dev URL.

**Architecture:** Backend receives one auth fix and a pytest config. The frontend receives contract fixes (types, label strings), new screens, API wiring for stack persistence, and mock flow replacements. All changes are independent and can be reviewed separately.

**Tech Stack:** Python/FastAPI (backend), React Native/Expo Router (frontend), SQLAlchemy async, Supabase auth, pytest-anyio.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend-nourai/app/api/v1/products.py` | Modify | Change `CurrentUser` → `OptionalUser` on barcode route |
| `backend-nourai/pytest.ini` | Create | Restrict anyio to asyncio backend only |
| `nourai/app/product/[id].tsx` | Modify | Fix `BIO_DOMAIN_LABELS` to use 10 exact backend names |
| `nourai/services/api.ts` | Modify | Fix `Subscription` types, add `StackEntry` type, fix `getStack`/`removeFromStack`, fix `API_BASE_URL`, remove `verifySubscription` |
| `nourai/constants/domains.ts` | Modify | Rename 6 domain labels to match backend names |
| `nourai/app/(tabs)/stack.tsx` | Modify | Wire `api.getStack`/`addToStack`/`removeFromStack` for signed-in users |
| `nourai/app/_layout.tsx` | Modify | Add guest→auth stack migration on sign-in; register missing screens |
| `nourai/app/settings/privacy.tsx` | Create | Stub privacy screen |
| `nourai/app/settings/about.tsx` | Create | Stub about screen |
| `nourai/app/settings/account.tsx` | Modify | Disable fake save; honest delete-account copy |
| `nourai/app/settings/subscription.tsx` | Modify | Replace mock purchase/restore with App Store/Play Store link |
| `nourai/app/onboarding.tsx` | Modify | Add 3 missing goals |
| `nourai/app/health/edit-profile.tsx` | Modify | Add same 3 missing goals |

---

## Task 1: Backend — Guest Barcode Auth + pytest.ini

**Files:**
- Modify: `backend-nourai/app/api/v1/products.py` (line ~163)
- Create: `backend-nourai/pytest.ini`

- [ ] **Step 1.1 — Fix barcode route auth dependency**

In `backend-nourai/app/api/v1/products.py`, find the `get_product_by_barcode` function. Change `CurrentUser` to `OptionalUser`:

```python
@router.get("/barcode/{barcode}", response_model=ProductWithDetails)
async def get_product_by_barcode(
    barcode: str,
    db: DBSession,
    service: Annotated[ProductService, Depends(get_product_service)] = None,
    current_user: OptionalUser = None,   # was CurrentUser — guests must be able to scan
):
```

`OptionalUser` is already imported at the top of the file (line ~12). No other change needed — the function body does not use `current_user`.

- [ ] **Step 1.2 — Create pytest.ini to eliminate trio errors**

Create `backend-nourai/pytest.ini`:

```ini
[pytest]
anyio_backends = asyncio
```

This stops pytest-anyio from parametrizing tests against the `trio` backend (which is not installed). All existing tests use asyncio; nothing is lost.

- [ ] **Step 1.3 — Run tests and verify 17 passed, 0 errors**

```bash
cd backend-nourai
. venv/bin/activate && pytest tests/ -v 2>&1 | tail -15
```

Expected:
```
17 passed, 1 warning in 0.Xs
```

No `ERROR` lines. Previously there were 3 errors from missing `trio` backend — they should be gone.

- [ ] **Step 1.4 — Commit**

```bash
cd backend-nourai
git add app/api/v1/products.py pytest.ini
git commit -m "fix: allow guest barcode scan; restrict pytest-anyio to asyncio backend"
```

---

## Task 2: Product Page — Biodomain Labels

**Files:**
- Modify: `nourai/app/product/[id].tsx`

- [ ] **Step 2.1 — Replace BIO_DOMAIN_LABELS with exact backend names**

Find `BIO_DOMAIN_LABELS` in `nourai/app/product/[id].tsx` (around line 244). Replace the entire constant with the 10 exact strings the backend returns in `bio_domains[].name`:

```typescript
// Names must match backend BioDomain.name exactly.
// Backend returns up to 10 domains; missing ones default to value: 0.
const BIO_DOMAIN_LABELS = [
  'Body Composition',
  'Energy & Metabolism',
  'Cardiovascular',
  'Gut & Digestive',
  'Inflammation & Immune',
  'Cognitive & Mental',
  'Sleep & Recovery',
  'Bone & Joint',
  'Hormonal & Endocrine',
  'Skin & Appearance',
];
```

The lines immediately after (`bioDomains = BIO_DOMAIN_LABELS.map(...)`) do not need to change — the lookup logic is already correct:

```typescript
const bioDomains = BIO_DOMAIN_LABELS.map((label) => {
  const found = product.bio_domains.find((d) => d.name === label);
  return found ?? { name: label, value: 0, is_negative: false };
});
```

- [ ] **Step 2.2 — Verify in dev**

```bash
cd nourai
npx expo start
```

Open the app on simulator. Navigate to any product that has biodomain data (e.g. scan a barcode for eggs or a supplement). Confirm domain bars show non-zero values. Previously all bars showed 0 because labels never matched.

- [ ] **Step 2.3 — Commit**

```bash
cd nourai
git add app/product/[id].tsx
git commit -m "fix: align product page BIO_DOMAIN_LABELS to exact backend domain names"
```

---

## Task 3: API Contracts — Subscription Types, StackEntry, Dev URL

**Files:**
- Modify: `nourai/services/api.ts`

- [ ] **Step 3.1 — Fix API_BASE_URL**

Find lines 5–7 in `nourai/services/api.ts`:

```typescript
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://192.168.0.163:8081/api/v1' : '');
```

Replace with:

```typescript
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? 'http://localhost:8001/api/v1' : '');

if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL) {
  console.warn('[api] EXPO_PUBLIC_API_URL is not set — all API calls will fail in production');
}
```

- [ ] **Step 3.2 — Fix Subscription interface**

Find the `Subscription` interface (around line 359). Replace it:

```typescript
export interface Subscription {
  id: string;
  user_id: string;
  tier: 'free' | 'premium';                                          // backend: free | premium only
  status: 'active' | 'expired' | 'canceled' | 'grace_period';       // 'canceled' single-L, no billing_issue
  expires_at?: string;
  store: 'app_store' | 'play_store';
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3.3 — Add StackEntry type**

Find the `ScanHistoryItem` interface (around line 373) and add the `StackEntry` type directly before it:

```typescript
export interface StackEntry {
  id: string;                  // stack entry UUID — required for removeFromStack
  product_id: string;
  product: ProductListItem;    // backend includes the product in each entry
  time_of_day?: 'morning' | 'afternoon' | 'evening' | 'night';
  created_at: string;
}
```

- [ ] **Step 3.4 — Update getStack return type**

Find `getStack` (around line 583):

```typescript
async getStack(authToken: string): Promise<ProductListItem[]> {
  return this.fetch<ProductListItem[]>('/users/me/stack', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}
```

Replace with:

```typescript
async getStack(authToken: string): Promise<StackEntry[]> {
  return this.fetch<StackEntry[]>('/users/me/stack', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}
```

- [ ] **Step 3.5 — Fix removeFromStack to use entryId**

Find `removeFromStack` (around line 607):

```typescript
async removeFromStack(authToken: string, productId: string): Promise<void> {
  return this.fetch(`/users/me/stack/${productId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}
```

Replace with:

```typescript
async removeFromStack(authToken: string, entryId: string): Promise<void> {
  return this.fetch(`/users/me/stack/${entryId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
}
```

The backend `DELETE /stack/{entry_id}` expects the stack entry UUID, not the product UUID. The parameter rename makes the intent explicit.

- [ ] **Step 3.6 — Remove verifySubscription**

Search for `verifySubscription` in `api.ts` (around line 537) and delete the entire method:

```typescript
// DELETE this entire method — backend route GET /users/me/subscription/verify does not exist
async verifySubscription(authToken: string): Promise<{ is_premium: boolean; entitlements: string[]; expires_at?: string }> {
  return this.fetch('/users/me/subscription/verify', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}
```

- [ ] **Step 3.7 — Commit**

```bash
cd nourai
git add services/api.ts
git commit -m "fix: align API contracts — Subscription types, StackEntry type, dev URL, remove verifySubscription"
```

---

## Task 4: Domain Label Rename in constants/domains.ts

**Files:**
- Modify: `nourai/constants/domains.ts`
- Modify: `nourai/app/(tabs)/stack.tsx`

The radar chart on the Stack tab uses 6 domain labels. We rename them to match backend names where they overlap, and replace `'Exposure Load'` (no backend equivalent) with `'Inflammation & Immune'`.

**Rename map:**
| Old | New |
|---|---|
| `'Gut Health'` | `'Gut & Digestive'` |
| `'Skin'` | `'Skin & Appearance'` |
| `'Metabolism'` | `'Energy & Metabolism'` |
| `'Sleep & Recovery'` | `'Sleep & Recovery'` *(unchanged)* |
| `'Cognition'` | `'Cognitive & Mental'` |
| `'Exposure Load'` | `'Inflammation & Immune'` |

- [ ] **Step 4.1 — Update DOMAINS array and SHORT_LABELS**

In `nourai/constants/domains.ts`, find the `DOMAINS` array and `DOMAIN_SHORT_LABELS` and replace:

```typescript
export const DOMAINS = [
  'Gut & Digestive',
  'Skin & Appearance',
  'Energy & Metabolism',
  'Sleep & Recovery',
  'Cognitive & Mental',
  'Inflammation & Immune',
] as const;

export type Domain = typeof DOMAINS[number];

export const DOMAIN_SHORT_LABELS: Record<Domain, string> = {
  'Gut & Digestive':      'Gut',
  'Skin & Appearance':    'Skin',
  'Energy & Metabolism':  'Energy',
  'Sleep & Recovery':     'Sleep',
  'Cognitive & Mental':   'Mind',
  'Inflammation & Immune':'Immune',
};
```

- [ ] **Step 4.2 — Update DOMAIN_SLUGS and SLUG_TO_DOMAIN**

Find `DOMAIN_SLUGS` and `SLUG_TO_DOMAIN` in `constants/domains.ts`. Replace with:

```typescript
export const DOMAIN_SLUGS: Record<Domain, string> = {
  'Gut & Digestive':      'gut-digestive',
  'Skin & Appearance':    'skin-appearance',
  'Energy & Metabolism':  'energy-metabolism',
  'Sleep & Recovery':     'sleep-recovery',
  'Cognitive & Mental':   'cognitive-mental',
  'Inflammation & Immune':'inflammation-immune',
};

export const SLUG_TO_DOMAIN: Record<string, Domain> = {
  'gut-digestive':        'Gut & Digestive',
  'skin-appearance':      'Skin & Appearance',
  'energy-metabolism':    'Energy & Metabolism',
  'sleep-recovery':       'Sleep & Recovery',
  'cognitive-mental':     'Cognitive & Mental',
  'inflammation-immune':  'Inflammation & Immune',
};
```

- [ ] **Step 4.3 — Update all remaining domain name string literals in constants/domains.ts**

Search the rest of `constants/domains.ts` for the old label strings and rename each occurrence. The places to update are `DOMAIN_RELEVANCE`, `DOMAIN_DESCRIPTIONS`, `DOMAIN_GOALS`, `DOMAIN_KEY_INGREDIENTS`, `DOMAIN_TIMING_NOTES`, `DOMAIN_EVIDENCE`, and `DOMAIN_RECOMMENDATIONS` — all use domain names as object keys or in string values. Apply these replacements throughout the entire file:

- Every key `'Gut Health'` → `'Gut & Digestive'`
- Every key `'Skin'` → `'Skin & Appearance'`  
  *(Careful: only replace standalone `'Skin'` as an object key, not substrings like `'clear_skin'` or `'skin_appearance'`)*
- Every key `'Metabolism'` → `'Energy & Metabolism'`
- Every key `'Cognition'` → `'Cognitive & Mental'`
- Every key `'Exposure Load'` → `'Inflammation & Immune'`

The TypeScript compiler will flag any missed occurrences since `Domain` is a `const` union — run `npx tsc --noEmit` to catch them.

- [ ] **Step 4.4 — Update GOAL_TO_DOMAIN in stack.tsx**

In `nourai/app/(tabs)/stack.tsx`, find `GOAL_TO_DOMAIN` (around line 54). Replace with the renamed domain values and add the 3 new goals:

```typescript
const GOAL_TO_DOMAIN: Record<string, Domain> = {
  clear_skin:          'Skin & Appearance',
  anti_aging:          'Skin & Appearance',
  brighter_skin:       'Skin & Appearance',
  hair_growth:         'Skin & Appearance',
  prevent_hair_loss:   'Skin & Appearance',
  build_muscle:        'Energy & Metabolism',
  fat_loss:            'Energy & Metabolism',
  more_energy:         'Energy & Metabolism',
  gut_health:          'Gut & Digestive',
  less_inflammation:   'Inflammation & Immune',   // was incorrectly 'Gut Health'
  mental_focus:        'Cognitive & Mental',
  reduce_stress:       'Cognitive & Mental',
  better_sleep:        'Sleep & Recovery',
  recovery:            'Energy & Metabolism',
};
```

- [ ] **Step 4.5 — Type-check to catch any missed occurrences**

```bash
cd nourai
npx tsc --noEmit 2>&1 | grep -i domain
```

Expected: no errors related to `Domain` type. Fix any that appear.

- [ ] **Step 4.6 — Commit**

```bash
cd nourai
git add constants/domains.ts app/(tabs)/stack.tsx
git commit -m "fix: rename 6 stack radar domains to match backend biodomain names"
```

---

## Task 5: Stack API Wiring (Signed-in Users)

**Files:**
- Modify: `nourai/app/(tabs)/stack.tsx`

The stack screen already imports `useAuth` for `onboardingProfile`. We extend it to also get `session`, then wire up server sync.

- [ ] **Step 5.1 — Import api and extend useAuth destructure**

In `nourai/app/(tabs)/stack.tsx`, find the `useAuth()` call (the line that destructures `onboardingProfile`) and extend it:

```typescript
const { session, onboardingProfile } = useAuth();
```

Also add the api import near the top of the file if not already present:

```typescript
import { api } from '@/services/api';
```

- [ ] **Step 5.2 — Add server stack state**

Near the top of the `Stack` component function body, add two pieces of state:

```typescript
// Server-synced stack entries (signed-in users only).
// Each entry has .id (for deletion) and .product (for rendering).
const [serverEntries, setServerEntries] = useState<import('@/services/api').StackEntry[]>([]);
const [entryIdMap, setEntryIdMap] = useState<Record<string, string>>({});  // productId → entryId
```

- [ ] **Step 5.3 — Load stack from server on mount**

Add a `useEffect` that fires when `session` is available:

```typescript
useEffect(() => {
  if (!session?.access_token) return;

  let cancelled = false;
  api.getStack(session.access_token)
    .then((entries) => {
      if (cancelled) return;
      setServerEntries(entries);
      setEntryIdMap(
        Object.fromEntries(entries.map((e) => [e.product_id, e.id]))
      );
    })
    .catch(() => {
      // Non-fatal — guest stack still visible
    });

  return () => { cancelled = true; };
}, [session?.access_token]);
```

- [ ] **Step 5.4 — Use server stack for signed-in users**

Find where `stack` from `useAppState()` is used to render the product list. Immediately after the `serverEntries` / `entryIdMap` state declarations, add:

```typescript
// Signed-in: use server-synced entries (products extracted for rendering).
// Guest: fall back to local appState stack.
const displayStack: typeof stack = session
  ? serverEntries.map((e) => e.product as any)
  : stack;
```

Then replace every usage of `stack` in the render and logic sections with `displayStack`. (Do NOT replace the `useAppState()` destructure itself — only replace downstream usages.)

- [ ] **Step 5.5 — Wire add-to-stack to call API when signed in**

Find where `addMeal` or the add-to-stack action is triggered. Look for the function that adds a product to the stack and wrap the existing local mutation with a server call:

```typescript
const handleAddToStack = async (product: ProductListItem) => {
  if (session?.access_token) {
    try {
      await api.addToStack(session.access_token, product.id);
      // Reload server entries to stay in sync
      const entries = await api.getStack(session.access_token);
      setServerEntries(entries);
      setEntryIdMap(Object.fromEntries(entries.map((e) => [e.product_id, e.id])));
    } catch {
      // Fall through — optimistic local update handles UI
    }
  }
  // Local state update (for guests and as optimistic update)
  addMeal(product);   // or whichever local mutation applies
};
```

*Note: replace `addMeal` with the actual function name used in the stack screen for adding products.*

- [ ] **Step 5.6 — Wire remove-from-stack to call API when signed in**

Find where `removeFromStack` from `useAppState()` is called. Wrap it:

```typescript
const handleRemoveFromStack = async (product: ProductListItem) => {
  if (session?.access_token) {
    const entryId = entryIdMap[product.id];
    if (entryId) {
      try {
        await api.removeFromStack(session.access_token, entryId);
      } catch {
        // Non-fatal — optimistic update already applied
      }
    }
    // Reload to keep entryIdMap accurate
    api.getStack(session.access_token)
      .then((entries) => {
        setServerEntries(entries);
        setEntryIdMap(Object.fromEntries(entries.map((e) => [e.product_id, e.id])));
      })
      .catch(() => {});
  }
  removeFromStack(product.id);   // local state update
};
```

Replace all direct `removeFromStack(...)` calls in the screen with `handleRemoveFromStack(...)`.

- [ ] **Step 5.7 — Verify in dev**

```bash
cd nourai && npx expo start
```

1. Sign in. Add a product to the stack. Close and reopen the app. Confirm the item is still there.
2. Remove an item. Reopen. Confirm it's gone.
3. Sign out. Add items as guest. Sign back in. Confirm guest items appear in the server stack.

- [ ] **Step 5.8 — Commit**

```bash
cd nourai
git add app/(tabs)/stack.tsx
git commit -m "feat: wire stack screen to server API for signed-in users"
```

---

## Task 6: Guest→Auth Stack Migration

**Files:**
- Modify: `nourai/app/_layout.tsx`

When a guest signs in, any products they added locally should be migrated to their server stack. This runs once per sign-in event.

- [ ] **Step 6.1 — Add migration logic in _layout.tsx**

In `nourai/app/_layout.tsx`, find the `useAuth()` call and extend it to also get `session`:

```typescript
const { isLoading, isOnboarded, isSignedIn, session } = useAuth();
```

Then import `useAppState` (check the actual import path used in other screens — it's likely `@/context/AppStateContext` or `@/hooks/useAppState`) and `api`:

```typescript
import { useAppState } from '@/context/AppStateContext'; // adjust path as needed
import { api } from '@/services/api';
```

Add a `useRef` to track the previous sign-in state, and a migration `useEffect`:

```typescript
const prevIsSignedInRef = useRef(false);
const { stack } = useAppState();

useEffect(() => {
  const wasSignedIn = prevIsSignedInRef.current;
  prevIsSignedInRef.current = isSignedIn;

  // Only run when transitioning from guest → signed-in
  if (!isSignedIn || wasSignedIn || !session?.access_token) return;
  if (stack.length === 0) return;

  // Fire-and-forget: migrate each local stack item to server
  (async () => {
    for (const product of stack) {
      try {
        await api.addToStack(session.access_token, product.id);
      } catch {
        // Non-fatal — best-effort migration
      }
    }
    // Stack tab's own useEffect (watching session) will reload from server
  })();
}, [isSignedIn, session?.access_token]);
```

Place this `useEffect` after the existing navigation `useEffect` that handles routing.

- [ ] **Step 6.2 — Register missing screens**

In `nourai/app/_layout.tsx`, find the `<Stack>` component and add the three missing `Stack.Screen` registrations alongside the existing settings screens:

```tsx
<Stack.Screen name="settings/privacy" options={{ headerShown: false }} />
<Stack.Screen name="settings/about" options={{ headerShown: false }} />
<Stack.Screen name="health/edit-profile" options={{ headerShown: false }} />
```

- [ ] **Step 6.3 — Commit**

```bash
cd nourai
git add app/_layout.tsx
git commit -m "feat: migrate guest stack to server on sign-in; register missing screen routes"
```

---

## Task 7: Missing Settings Screens

**Files:**
- Create: `nourai/app/settings/privacy.tsx`
- Create: `nourai/app/settings/about.tsx`

Use `nourai/app/settings/notifications.tsx` as the pattern reference: standard header with `←` back, serif page title, `Colors.bone` background.

- [ ] **Step 7.1 — Create privacy.tsx**

Create `nourai/app/settings/privacy.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Privacy & Data</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionTitle}>Your data, your control</Text>
        <Text style={styles.paragraph}>
          NourAI does not sell your personal data to third parties. Your scan history,
          health profile, and stack are stored securely and used only to personalise
          your in-app experience.
        </Text>

        <Text style={styles.sectionTitle}>What we collect</Text>
        <Text style={styles.paragraph}>
          • Products you scan{'\n'}
          • Health goals and concerns you provide during onboarding{'\n'}
          • Your supplement and food stack{'\n'}
          • Anonymous usage analytics (no personally identifiable information)
        </Text>

        <Text style={styles.sectionTitle}>Deleting your data</Text>
        <Text style={styles.paragraph}>
          You can request full data deletion by contacting us at{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('mailto:privacy@nourai.app')}
          >
            privacy@nourai.app
          </Text>
          . We will process your request within 30 days.
        </Text>

        <Pressable
          style={styles.policyBtn}
          onPress={() => Linking.openURL('https://nourai.app/privacy')}
        >
          <Text style={styles.policyBtnText}>View Full Privacy Policy</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bone },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D4CFC7',
  },
  backBtn: { width: 32 },
  backArrow: { fontSize: 28, color: '#2C2C2C', lineHeight: 32 },
  title: { fontFamily: 'CormorantGaramond-SemiBold', fontSize: 22, color: '#2C2C2C' },
  body: { padding: 24, gap: 8 },
  sectionTitle: { fontFamily: 'Manrope-SemiBold', fontSize: 15, color: '#2C2C2C', marginTop: 16 },
  paragraph: { fontFamily: 'Manrope-Regular', fontSize: 14, color: '#5C5752', lineHeight: 22 },
  link: { color: '#2C6E49', textDecorationLine: 'underline' },
  policyBtn: {
    marginTop: 24, paddingVertical: 14, borderRadius: 8,
    backgroundColor: '#2C2C2C', alignItems: 'center',
  },
  policyBtnText: { fontFamily: 'Manrope-SemiBold', fontSize: 15, color: Colors.bone },
});
```

- [ ] **Step 7.2 — Create about.tsx**

Create `nourai/app/settings/about.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Colors } from '@/constants/theme';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.title}>About NourAI</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.appName}>NourAI</Text>
        <Text style={styles.tagline}>Ingredient intelligence, in your pocket.</Text>
        <Text style={styles.version}>Version {version}</Text>

        <View style={styles.divider} />

        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://nourai.app/terms')}
        >
          <Text style={styles.linkText}>Terms of Service</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://nourai.app/privacy')}
        >
          <Text style={styles.linkText}>Privacy Policy</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL('mailto:support@nourai.app')}
        >
          <Text style={styles.linkText}>Contact Support</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bone },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D4CFC7',
  },
  backBtn: { width: 32 },
  backArrow: { fontSize: 28, color: '#2C2C2C', lineHeight: 32 },
  title: { fontFamily: 'CormorantGaramond-SemiBold', fontSize: 22, color: '#2C2C2C' },
  body: { padding: 24, alignItems: 'center' },
  appName: { fontFamily: 'CormorantGaramond-Bold', fontSize: 36, color: '#2C2C2C', marginTop: 16 },
  tagline: { fontFamily: 'Manrope-Regular', fontSize: 14, color: '#5C5752', marginTop: 6 },
  version: { fontFamily: 'Manrope-Regular', fontSize: 13, color: '#9C9690', marginTop: 4 },
  divider: { width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: '#D4CFC7', marginVertical: 24 },
  linkRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D4CFC7',
  },
  linkText: { fontFamily: 'Manrope-Regular', fontSize: 15, color: '#2C2C2C' },
  chevron: { fontSize: 20, color: '#9C9690' },
});
```

- [ ] **Step 7.3 — Verify navigation**

```bash
cd nourai && npx expo start
```

Open the app, go to Profile Hub → tap "Privacy & Data" → should open privacy screen, back navigates correctly. Tap "About NourAI" → should open about screen with the app version.

- [ ] **Step 7.4 — Commit**

```bash
cd nourai
git add app/settings/privacy.tsx app/settings/about.tsx
git commit -m "feat: add Privacy & Data and About NourAI settings screens"
```

---

## Task 8: Mock Flows Cleanup + Onboarding Goals

**Files:**
- Modify: `nourai/app/settings/account.tsx`
- Modify: `nourai/app/settings/subscription.tsx`
- Modify: `nourai/app/onboarding.tsx`
- Modify: `nourai/app/health/edit-profile.tsx`

- [ ] **Step 8.1 — account.tsx: disable fake save, honest delete**

In `nourai/app/settings/account.tsx`:

**Replace `handleSave`** (the mock setTimeout function, around line 38):

```typescript
const handleSave = () => {
  Alert.alert('Coming Soon', 'Profile editing will be available in a future update.');
};
```

**Replace the Save button JSX** (around line 196) with a visually-disabled button:

```tsx
<Pressable
  style={[styles.saveBtn, styles.saveBtnDisabled]}
  onPress={handleSave}
>
  <Text style={styles.saveBtnText}>Profile Editing Coming Soon</Text>
</Pressable>
```

**Replace `handleDeleteAccount`**: find the final `signOut()` + redirect call inside the nested alert confirmation and replace just that action:

```typescript
// Find the inner Alert.alert that confirms deletion and replace its onPress:
{
  text: 'Delete Account',
  style: 'destructive',
  onPress: () => {
    Alert.alert(
      'Contact Support',
      'To delete your account and all associated data, please email support@nourai.app',
      [{ text: 'OK' }]
    );
  },
},
```

Remove any `isSaving` state if it's now unused, and remove the mock `setTimeout` import if it was the only usage.

- [ ] **Step 8.2 — subscription.tsx: replace mock flows with store link**

In `nourai/app/settings/subscription.tsx`:

**Add `Platform` and `Linking` imports** at the top if not already present:

```typescript
import { Platform, Linking } from 'react-native';
```

**Replace `handlePurchase` and `handleRestore`** with a single handler:

```typescript
const handleManageSubscription = () => {
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions';
  Linking.openURL(url);
};
```

**Replace the Subscribe button and Restore button JSX** (the two `<Pressable>` blocks) with:

```tsx
<View style={styles.storeSection}>
  <Text style={styles.storeSectionText}>
    Manage your NourAI subscription directly in the{' '}
    {Platform.OS === 'ios' ? 'App Store' : 'Google Play Store'}.
  </Text>
  <Pressable style={styles.storeBtn} onPress={handleManageSubscription}>
    <Text style={styles.storeBtnText}>
      Open {Platform.OS === 'ios' ? 'App Store' : 'Play Store'}
    </Text>
  </Pressable>
</View>
```

**Add the new styles** to the StyleSheet at the bottom of the file:

```typescript
storeSection: {
  marginTop: 24,
  padding: 20,
  backgroundColor: '#F5F2ED',
  borderRadius: 12,
  gap: 14,
},
storeSectionText: {
  fontFamily: 'Manrope-Regular',
  fontSize: 14,
  color: '#5C5752',
  lineHeight: 22,
  textAlign: 'center',
},
storeBtn: {
  paddingVertical: 14,
  borderRadius: 8,
  backgroundColor: '#2C2C2C',
  alignItems: 'center',
},
storeBtnText: {
  fontFamily: 'Manrope-SemiBold',
  fontSize: 15,
  color: Colors.bone,
},
```

Remove unused state variables `purchasing` and `restoring` and their `set*` calls.

- [ ] **Step 8.3 — Add missing goals to onboarding.tsx**

In `nourai/app/onboarding.tsx`, find the `GOALS` array (around line 162). Add the 3 missing goals:

```typescript
const GOALS = [
  { id: 'clear_skin',        label: 'Clear Skin' },
  { id: 'anti_aging',        label: 'Anti-Aging' },
  { id: 'brighter_skin',     label: 'Brighter Skin' },
  { id: 'hair_growth',       label: 'Hair Growth' },
  { id: 'prevent_hair_loss', label: 'Prevent Hair Loss' },
  { id: 'build_muscle',      label: 'Build Muscle' },
  { id: 'fat_loss',          label: 'Fat Loss' },
  { id: 'more_energy',       label: 'More Energy' },
  { id: 'gut_health',        label: 'Gut Health' },
  { id: 'less_inflammation', label: 'Less Inflammation' },
  { id: 'mental_focus',      label: 'Mental Focus' },
  { id: 'reduce_stress',     label: 'Reduce Stress' },   // ← new
  { id: 'better_sleep',      label: 'Better Sleep' },    // ← new
  { id: 'recovery',          label: 'Recovery' },        // ← new
];
```

- [ ] **Step 8.4 — Add missing goals to health/edit-profile.tsx**

In `nourai/app/health/edit-profile.tsx`, find the `GOALS` constant (same 11 entries as onboarding). Apply the identical 3 additions:

```typescript
const GOALS = [
  { id: 'clear_skin',        label: 'Clear Skin' },
  { id: 'anti_aging',        label: 'Anti-Aging' },
  { id: 'brighter_skin',     label: 'Brighter Skin' },
  { id: 'hair_growth',       label: 'Hair Growth' },
  { id: 'prevent_hair_loss', label: 'Prevent Hair Loss' },
  { id: 'build_muscle',      label: 'Build Muscle' },
  { id: 'fat_loss',          label: 'Fat Loss' },
  { id: 'more_energy',       label: 'More Energy' },
  { id: 'gut_health',        label: 'Gut Health' },
  { id: 'less_inflammation', label: 'Less Inflammation' },
  { id: 'mental_focus',      label: 'Mental Focus' },
  { id: 'reduce_stress',     label: 'Reduce Stress' },   // ← new
  { id: 'better_sleep',      label: 'Better Sleep' },    // ← new
  { id: 'recovery',          label: 'Recovery' },        // ← new
];
```

- [ ] **Step 8.5 — Commit**

```bash
cd nourai
git add app/settings/account.tsx app/settings/subscription.tsx \
        app/onboarding.tsx app/health/edit-profile.tsx
git commit -m "fix: replace mock save/purchase flows with honest copy; add 3 missing onboarding goals"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ P0 guest barcode auth → Task 1
- ✅ P0 biodomain label mismatch → Task 2
- ✅ P1 stack persistence + guest migration → Tasks 5 + 6
- ✅ P1 missing settings routes → Tasks 6 + 7
- ✅ P1 subscription type drift → Task 3
- ✅ P2 mock flows → Task 8
- ✅ P2 onboarding goals → Task 8
- ✅ P2 trio test errors → Task 1
- ✅ P3 hardcoded dev URL → Task 3

**Type consistency:**
- `StackEntry.id` used in `removeFromStack(token, entryId)` — defined Task 3, used Task 5 ✅
- `Subscription.tier: 'free' | 'premium'` — defined Task 3; subscription screen uses `tier !== 'free'` which still works ✅
- `Domain` type from `DOMAINS` const — changes in Task 4 propagate to `GOAL_TO_DOMAIN` in same task ✅
- `BIO_DOMAIN_LABELS` strings match backend `BioDomain.name` values from `biodomains.py` ✅
