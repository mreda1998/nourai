# Tester Release — Design

**Date:** 2026-09-26
**Status:** Approved in chat (2026-09-26)
**Goal:** Put Elory on friends' iPhones via TestFlight and learn which products
they actually scan, so research effort goes where real usage is.

## Context

Audit findings on branch `claude/app-release-testing-prep-2af552`:

- No production backend: `api.elory.app` does not resolve; nothing is deployed.
- The app calls endpoints that only existed as *staged, uncommitted* work in the
  main checkout (queued ingestion, lab results, daily score, health domains,
  search history). That work was imported unchanged as commit `102660b`.
- Barcode misses leave no trace; guests leave no trace at all.
- The committed `nourai/ios/` project is stale (first commit): empty entitlements
  (Sign in with Apple would fail), old icon, none of the current plugins. EAS
  uses a committed native project instead of regenerating it from `app.json`.
- Daily score / health domains require sign-in and only count stack entries
  logged *today*, so guests always see "couldn't calculate" and signed-in users
  drop to 0 the next day.
- Splash is a 5 KB placeholder; RevenueCat is configured with a `test_` key.
- A real OpenAI key is in git history (`backend-nourai/.env.example`, commit
  `e6e55a7`). The file is now clean; the key must be revoked by the owner.

## Decisions (from Q&A)

| Topic | Decision |
|---|---|
| Distribution | TestFlight, iPhone only |
| Premium for testers | Unlocked via build-time tester mode; production stays gated |
| Missed scans | Log barcode automatically; ask for front + ingredient photos, name, brand |
| Identity | Guests allowed; anonymous per-install device ID |
| Staged backend work | Imported into this branch and built upon |

## Non-goals

App Store public-launch metadata (screenshots, listing copy), Android builds,
domain-score redesign, any admin UI beyond a generated HTML report.

## 1. Identity

- `nourai/lib/device-id.ts` creates a random v4 UUID on first launch, persists it
  in AsyncStorage (`elory.deviceId`), and caches it in memory.
- `services/api.ts` sends `X-Device-Id` and `X-App-Version` on every request.
- When signed in, the backend also records `user_id` (Bearer token already sent).

## 2. Backend: tester insights

### Schema (migration `017_tester_insights`)

`tester_events`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| device_id | varchar(64) not null | indexed |
| user_id | uuid null | FK `user_profiles.id` ON DELETE SET NULL |
| event_type | varchar(32) not null | `scan`, `search`, `product_view`, `stack_add`, `feedback` |
| barcode | varchar(32) null | GTIN-14 for scans; indexed |
| product_id | uuid null | FK `products.id` ON DELETE SET NULL |
| query | varchar(200) null | search text |
| meta | jsonb not null default `{}` | e.g. `{"result":"cached"}`, `{"results":0}`, `{"via":"search"}`, `{"message":"…"}` |
| app_version | varchar(32) null | |
| created_at | timestamptz default now() | index with event_type |

`product_submissions`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| device_id | varchar(64) not null | |
| user_id | uuid null | FK ON DELETE SET NULL |
| barcode | varchar(32) null | GTIN-14 when valid, else raw digits |
| name, brand | varchar(300)/(200) null | |
| category | varchar(32) null | `food`, `supplement`, `cosmetic`, `otc`, `other` |
| note | text null | |
| photo_paths | jsonb not null default `[]` | object keys in the private bucket |
| status | varchar(16) default `new` | `new`, `added`, `rejected` |
| created_at | timestamptz | |

### Behaviour

- `app/services/insights.py`: `record_event(...)` opens its **own** session and
  swallows/logs failures, so analytics can never break a user request.
- `GET /products/barcode/{barcode}` records a `scan` event (when `X-Device-Id`
  is present) with `meta.result` = `cached` | `queued` | `invalid`, plus `job_id`.
  Final outcome is resolved at report time by checking whether a product now
  exists for that GTIN — robust to worker timing.
- `POST /insights/events` — client events (`search`, `product_view`,
  `stack_add`, `feedback`). Requires `X-Device-Id` (400 otherwise); validates
  type, caps `query` at 200 chars and `meta` at 2 KB. Returns 204.
- `POST /insights/submissions` — multipart: optional `barcode`, `name`, `brand`,
  `category`, `note`, and 0–3 `photos` (JPEG/PNG/HEIC, ≤ 6 MB each). At least
  one of barcode/name/photo is required. Photos go to a **private** Supabase
  Storage bucket (`tester-submissions`, setting `supabase_submissions_bucket`)
  under `{submission_id}/{n}.{ext}`. If storage is not configured, photo uploads
  are rejected with 503; text-only submissions still work. Per-device cap of 20
  submissions per 24 h (429).

## 3. Backend: scores for any stack

Move the daily-score and health-domain computation out of `users.py` into
`app/services/stack_score.py` (pure functions over a list of product IDs).
Add public endpoints that score an explicit product list (≤ 50 IDs):

- `POST /scores/daily` `{product_ids}` → `DailyScoreResponse`
- `POST /scores/domain/{biodomain}` `{product_ids}` → `HealthDomainResponse`

The app always sends its current stack's product IDs, so guests get a score and
signed-in users no longer drop to 0 overnight. Existing `GET /users/me/...`
endpoints stay, backed by the same service.

## 4. App

- **Scan miss:** when ingestion ends `needs_review`/`dead` (or lookup 404s), the
  result area shows "We don't know this one yet" with **Help add it** →
  `/submit-product?barcode=…` and **Scan again**.
- **`app/submit-product.tsx`** (modal): photo slots *Front* and *Ingredients*
  (+ optional *Other*) via `expo-image-picker` camera (library fallback),
  compressed (quality 0.6); name, brand, category chips, note; submit →
  `api.submitProduct(FormData)`; thank-you state.
- **Search with no results:** "Can't find it? Help add it" → same screen with
  the query prefilled as the name. Searches are tracked with result counts.
- **Product page:** tracks `product_view` (`via` = `scan` | `search` | `stack`
  | `other`); a quiet **Something look wrong?** link opens a feedback sheet
  (`feedback` event with the product ID and text).
- **Stack add:** tracked as `stack_add`.
- **Scanner copy:** replace "Nothing is recorded or stored" with an honest line
  ("Elory only reads the barcode. Scans help us decide which products to add
  next.").
- **Scores:** Today card and domain screens call the new `/scores/*` endpoints
  with the local stack's product IDs.
- **Tester mode** (`EXPO_PUBLIC_TESTER_MODE=1`): RevenueCat is not configured,
  `isPremium` is true, subscription screen shows a beta note, and the You tab
  gains a **Beta feedback** row (general feedback event).
- **RevenueCat key:** read `EXPO_PUBLIC_REVENUECAT_IOS_KEY`; the `test_` key is
  used only in `__DEV__`. Without a key in a release build, RevenueCat is not
  configured (premium stays locked) instead of crashing.

## 5. Release configuration

- Stop committing `nourai/ios/` (remove from git, add to `.gitignore`); EAS
  prebuilds from `app.json`.
- `app.json`: `ios.usesAppleSignIn: true`, `ITSAppUsesNonExemptEncryption:
  false`, `expo-image-picker` plugin with camera/photo strings,
  `expo-splash-screen` plugin using the logo on the canvas colour, iOS
  `privacyManifests` (UserDefaults, FileTimestamp, SystemBootTime, DiskSpace).
- `eas.json`: `cli.appVersionSource: "remote"`; new `testflight` profile
  (extends `production`, adds `EXPO_PUBLIC_TESTER_MODE=1`); `EXPO_PUBLIC_API_URL`
  stays a placeholder the owner sets to the Railway URL.
- `railway.toml`: run `alembic upgrade head` before starting the API.
- `docs/testflight-runbook.md`: owner-only steps (revoke the OpenAI key; Railway
  API + worker services and env vars; Supabase private bucket; Apple Developer
  + App Store Connect record; `eas login/build/submit`; external testing group
  with public link) and a ready-to-paste "What to Test" note.

## 6. Tester report

`scripts/tester_report.py` (`make tester-report`) writes
`reports/tester-report-YYYY-MM-DD.html` and prints a short summary:

1. **Overview** — testers (distinct devices), scans, hit rate, searches, submissions.
2. **Missed products** — scanned GTINs with no product today, ranked by distinct
   testers, with any submissions (name, brand, photos via 7-day signed URLs).
3. **Most-used products** — scanned/viewed/stacked products with ingredient
   coverage (% linked to canonical ingredients, % researched).
4. **Research priority** — ingredients in those products ranked by distinct
   testers, flagged `unresearched` (no completed research) or `unlinked` (no
   canonical match). This is the "what to research next" list.
5. **Category mix**, **zero-result searches**, **feedback**, **per-tester activity**
   (short device hash).

## Testing

- Backend unit tests (no DB) for event validation, submission validation, and
  score service helpers; integration tests against a throwaway Postgres
  (`TEST_DATABASE_URL`, skipped when unset) for migrations 014–017, event
  recording, submissions (storage mocked) and report queries.
- `npx tsc --noEmit` for the app.
- iOS simulator run: search → no results → submit flow; product view; tester
  mode unlock. The camera path cannot run in the simulator; the miss card is
  exercised via a barcode that ingestion cannot resolve.
