# TestFlight runbook — sending Elory to friends

Everything here needs *your* accounts, so it can't be done from the repo. Work
top to bottom; each step says how to check it worked. Budget an afternoon for
the first pass, mostly waiting on Apple and builds.

**What friends get:** an iPhone app (TestFlight) where every feature is
unlocked, guests are welcome, and every scan, search and "help add it" flows
back to you in `make tester-report`.

---

## 0. Do this first: revoke the leaked OpenAI key

An OpenAI key was committed to `backend-nourai/.env.example` (commit `e6e55a7`)
and is still in git history. The file is clean now, the key is not.

1. https://platform.openai.com/api-keys → revoke the key starting `sk-proj-G2Rq…`.
2. If you use image generation, create a new key and put it only in
   `backend-nourai/.env` and Railway.

Also worth doing while you're there: your local `backend-nourai/.env` holds a
real Supabase service-role key and Anthropic key. It isn't tracked, so it's not
leaked — just never paste it into a chat or a file in the repo.

---

## 1. Backend on Railway (API + ingestion worker)

The app can't do anything without a live backend: `api.elory.app` does not
resolve today.

### 1a. Two services from the same repo

| Service | Config file | Start command |
|---|---|---|
| `elory-api` | `backend-nourai/railway.toml` | runs `alembic upgrade head`, then uvicorn |
| `elory-ingestion-worker` | `backend-nourai/railway.worker.toml` | `python -m app.workers.ingestion` |

Railway → New Project → Deploy from GitHub → repo `mreda1998/nourai`. For each
service set **Root Directory = `backend-nourai`** and point *Config as Code* at
the matching toml file. The worker is what turns a first-time scan into a
product; without it every new barcode ends in "We don't know this one yet".

### 1b. Environment variables (set on **both** services)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → connection string, **Transaction pooler**, rewritten to start `postgresql+asyncpg://` |
| `ENVIRONMENT` | `production` (hides `/docs`) |
| `DEBUG` | `false` (otherwise every SQL statement is logged) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_JWT_SECRET` | Supabase → Settings → API → JWT secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (secret) |
| `SUPABASE_STORAGE_BUCKET` | `product-images` |
| `SUPABASE_SUBMISSIONS_BUCKET` | `tester-submissions` |
| `ANTHROPIC_API_KEY` | for Ask Elory |
| `REVENUECAT_WEBHOOK_SECRET` | any long random string for now |
| `OPENFOODFACTS_CONTACT_EMAIL` | an address you read — Open Food Facts asks for one |

### 1c. Domain

Railway → API service → Settings → Networking → Custom Domain `api.elory.app`,
then add the CNAME it shows at your DNS provider (`elory.app` is already
registered). Until DNS propagates you can use Railway's generated
`*.up.railway.app` URL — just put that URL in `eas.json` (step 4) instead.

### 1d. Check it

```bash
curl https://api.elory.app/health
# {"status":"ok","environment":"production"}
```

First deploy applies migrations 001–017 to your Supabase database. Watch the
deploy log for `Running upgrade 016 -> 017`.

### 1e. Give it products and ingredients

A fresh database is empty, so scans and searches find nothing. From
`backend-nourai/` with your production `DATABASE_URL` exported:

```bash
make seed            # 23 ingredients + 15 products (golden set)
make research        # PubMed + Claude evidence for the first ingredients (costs a little)
```

New barcodes are ingested on demand from Open Food Facts by the worker.

---

## 2. Supabase

1. **Storage → New bucket** → name `tester-submissions`, **Public: off**.
   This holds the label photos friends send you. Keep it private.
2. **Authentication → Providers → Apple → enable.** Services ID / key setup is
   in Apple's developer portal (step 3). Guests don't need this, but the
   "Sign in with Apple" button does. If you'd rather skip it for the first
   round, friends can use the app as guests or sign up with email.
3. **Authentication → URL configuration** — no changes needed for native
   email/password sign-in.
4. **Email confirmations:** if on, friends must confirm before signing in.
   For a small test, turn it off (Authentication → Providers → Email).

---

## 3. Apple

1. Enroll in the Apple Developer Program ($99/yr) — https://developer.apple.com/programs/enroll/
   Approval can take a day or two, so start this first.
2. **App Store Connect → Apps → + → New App**
   - Platform iOS · Name **Elory** · Primary language English
   - Bundle ID **`com.elory.app`** (EAS registers it for you on first build)
   - SKU `elory-001`
3. Note your **Team ID** (developer.apple.com → Membership) and the app's
   **Apple ID / ASC App ID** (App Store Connect → App → App Information).
4. Put them in `nourai/eas.json` under `submit.production.ios`:

```json
"ios": { "appleId": "you@example.com", "ascAppId": "1234567890", "appleTeamId": "ABCDE12345" }
```

---

## 4. Build and submit with EAS

```bash
npm i -g eas-cli
cd nourai
eas login
eas init                       # links the project; adds extra.eas.projectId to app.json — commit it
```

### 4a. Set the build's environment variables — required

`.env` files are git-ignored, so EAS never sees them. **Without these the app
crashes on launch** (the Supabase client can't be created).

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<ref>.supabase.co" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>"                --visibility plaintext
eas env:list production        # confirm both are there
```

The anon key is meant to be public (row-level security protects the data); the
service-role key must never go here.

`EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_TESTER_MODE=1` are already set for the
`testflight` profile in `eas.json`. If you're using Railway's URL instead of
`api.elory.app`, edit `EXPO_PUBLIC_API_URL` there first.

### 4b. Build and upload

```bash
eas build --platform ios --profile testflight
# first time: sign in with your Apple ID when asked, let EAS create the certificates
eas submit --platform ios --profile testflight --latest
```

The build takes 15–30 minutes. Apple then processes it for another 10–30.

**Tester mode:** the `testflight` profile turns on `EXPO_PUBLIC_TESTER_MODE`,
which unlocks Atelier without RevenueCat and adds a *Send feedback* row on the
You tab. Do **not** use this profile for the public App Store release — use
`--profile production`, which keeps the paywall.

---

## 5. TestFlight: add your friends

1. App Store Connect → your app → **TestFlight**.
2. **Internal testing** (up to 100 people on your App Store Connect team, no
   review): fastest, but every friend needs an App Store Connect user role.
3. **External testing** (up to 10,000, no account needed): create a group,
   add the build, fill in *Test Information* (see 6), submit for **Beta App
   Review** (usually about a day, first build only), then enable the **public
   link** and send it to friends.
4. Friends install the free **TestFlight** app, open your link, tap Install.

Builds expire after 90 days.

---

## 6. Message to send friends (paste-ready)

> Hey! I'm building **Elory** — an app that scans the products you use (food,
> supplements, skincare) and tells you what the ingredients *actually* do,
> based on research. Would you try it for a week?
>
> 1. Install TestFlight from the App Store, then open: **<your public link>**
> 2. Open Elory, skip or fill in the quick profile.
> 3. **Scan things you really use** — supplements, your moisturiser, snacks.
>    If Elory doesn't know one, tap **Help add it** and take two photos: the
>    front and the ingredient list. That's the most useful thing you can do.
> 4. Add what you use to your stack and look at the score.
> 5. Anything confusing, wrong or missing? **You tab → Send feedback**, or tap
>    *Something look wrong?* on any product.
>
> Elory records which products you scan and search (no name, no email unless
> you sign in) so I can decide what to build next.

Paste the same "What to test" summary into TestFlight's *Test Information*.
Beta App Review also wants: a contact email, and — since there's a sign-in —
either demo credentials or a note that **guests can use everything**.

Also fill in **App Privacy** in App Store Connect: you collect *Usage Data*
(product interaction — scans, searches) and, if they sign in, *Contact Info*
(email), *Photos* (label photos they choose to send) and *Health & Fitness*
(goals and concerns from the profile).

---

## 7. Read what your friends are doing

From `backend-nourai/` with the production `DATABASE_URL` exported:

```bash
make tester-report                    # everything
make tester-report ARGS="--days 7"    # last week
open ../reports/tester-report-$(date +%F).html
```

Read it top to bottom:

1. **Research priority** — ingredients in products your friends scanned that
   you can't yet explain, ranked by how many friends they reach. The report
   ends this section with a ready-to-run `research_agent.py` command. *This is
   your "what should I focus the analysis on" answer.*
2. **Products we're missing** — barcodes with no product, with the photos and
   names friends sent. Add the frequent ones first (`make enqueue-barcodes`
   for a barcode list, or seed by hand).
3. **Most-used products** — check *Linked* and *Researched* columns; low
   numbers mean the analysis for that product is thin.
4. **Searches with no result** — what people looked for and didn't find.
5. **Feedback** — verbatim messages.

Photo links in the report are signed for 7 days; re-run the report to refresh.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| App crashes on launch | `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` not set in EAS (4a) |
| Everything says "couldn't load" | `EXPO_PUBLIC_API_URL` wrong, or backend down — `curl …/health` |
| Every scan says "We don't know this one yet" | Ingestion worker not running or `DATABASE_URL` differs between services |
| "Photo uploads are not available" | `SUPABASE_SERVICE_ROLE_KEY` unset, or bucket `tester-submissions` missing |
| Build fails: bundle ID | Must be exactly `com.elory.app` in `app.json` and App Store Connect |
| Apple Sign-In fails | Apple provider not enabled in Supabase (2), or use email sign-in |
| Report is empty | Friends' builds pointing at a different backend, or no `X-Device-Id` (old build) |
