# Elory — Deployment & Release Guide

> **Sending the app to friends first?** Follow [docs/testflight-runbook.md](docs/testflight-runbook.md) — it is the current, step-by-step path (Railway, Supabase, Apple, EAS, TestFlight). This file is the longer reference for the public App Store release.

---

## Key Dashboards

| Task | URL |
|------|-----|
| Apple Developer Account | https://developer.apple.com/account/ |
| App Store Connect | https://appstoreconnect.apple.com/ |
| EAS Builds & Credentials | https://expo.dev/accounts/[your-account]/builds |
| Railway (backend) | https://railway.app/dashboard |

---

## Config Files

| File | Purpose |
|------|---------|
| `nourai/app.json` | Bundle ID, version, plugins |
| `nourai/eas.json` | Build profiles (dev / preview / production) |
| `backend-nourai/railway.toml` | Railway start command + healthcheck |
| `backend-nourai/Dockerfile` | Reads `$PORT` from Railway |

---

## Phase 1 — Apple Setup (one-time)

1. Enroll in Apple Developer Program ($99/year)
   → https://developer.apple.com/programs/enroll/

2. Create your app record in App Store Connect
   → https://appstoreconnect.apple.com → Apps → "+"
   - Platform: iOS
   - App Name: Elory
   - Bundle ID: `com.elory.app`
   - SKU: `elory-001` (any unique string)

3. Note your **Team ID** and **ASC App ID**, then add them to `nourai/eas.json`:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your-apple-id@example.com",
      "ascAppId": "YOUR_ASC_APP_ID",
      "appleTeamId": "YOUR_TEAM_ID"
    }
  }
}
```

---

## Phase 2 — EAS Build (run from `nourai/`)

```bash
# First time only
npx eas build:configure

# TestFlight build (internal testing)
npx eas build --platform ios --profile preview

# App Store build
npx eas build --platform ios --profile production
```

EAS manages certificates and provisioning profiles automatically.
Track build progress at: https://expo.dev/accounts/[your-account]/builds

---

## Phase 3 — TestFlight

```bash
# Submit the latest build
npx eas submit --platform ios
```

- Apple processes in ~1–2 hours
- Add testers in App Store Connect → TestFlight → Testers → "+"
- Testers install via the TestFlight app on their device

---

## Phase 4 — App Store Submission Checklist

### Metadata (App Store Connect)
- [ ] Category: Health & Fitness
- [ ] Age Rating questionnaire completed
- [ ] Privacy Policy URL (live, public — e.g. `https://elory.app/privacy`)
- [ ] Support URL
- [ ] Description, keywords, subtitle filled in
- [ ] Screenshots for iPhone 6.7" (5 required)
- [ ] Release notes written

### Technical
- [ ] `EXPO_PUBLIC_API_URL` in `eas.json` points to live backend
- [ ] Apple Sign-In enabled in Supabase dashboard (Auth → Providers → Apple)
- [ ] All API endpoints return HTTPS
- [ ] App tested end-to-end on a physical device via TestFlight

### Legal / Privacy
- [ ] Privacy Policy explains: health data, Supabase auth, Claude AI usage
- [ ] No sensitive data logged to console in production build

---

## Phase 5 — Backend on Railway

1. Push `backend-nourai/` to GitHub
2. Go to https://railway.app/dashboard → New Project → Deploy from GitHub
3. Select your repo and `main` branch
4. Set environment variables in Railway project settings:

```
DATABASE_URL          postgresql://...
ANTHROPIC_API_KEY     sk-ant-...
SUPABASE_URL          https://[project].supabase.co
SUPABASE_JWT_SECRET   (Supabase → Settings → API → JWT secret)
SUPABASE_SERVICE_ROLE_KEY  (secret; server only)
ENVIRONMENT           production
```

5. Add custom domain `api.elory.app` in Railway → Settings → Domains
6. At your DNS provider, add:
   ```
   CNAME  api.elory.app  →  [your-project].railway.app
   ```
7. Verify: `curl https://api.elory.app/health`

---

## Phase 6 — Version Updates (ongoing)

1. Bump version in `nourai/app.json` → `"version": "1.x.0"`
2. Commit and push to `main`
3. Run production build: `npx eas build --platform ios --profile production`
4. Submit: `npx eas submit --platform ios`
5. Update release notes in App Store Connect
6. Submit for review (Apple review: 24–48 hours)

`autoIncrement: true` in `eas.json` handles build numbers automatically.

---

## Remaining Gaps Before First Release

| Item | Status | Notes |
|------|--------|-------|
| Apple Developer enrollment | — | $99/year, required |
| App Store Connect app record | — | Needed for Team ID + ASC App ID |
| Supabase Apple Sign-In | — | Auth → Providers → Apple in Supabase dashboard |
| Privacy Policy page | — | Must be a live URL |
| `ANTHROPIC_API_KEY` on Railway | — | Required for Stack Assistant chat |
| RevenueCat SDK | — | Required if adding in-app purchases |
| Production screenshots | — | 5 for iPhone 6.7" |

---

## Troubleshooting

**"Provisioning profile not found" during build**
```bash
npx eas credentials --platform ios
# Select "Delete credentials", then re-run the build
```

**Bundle ID mismatch on submit**
- Verify `app.json` → `ios.bundleIdentifier` matches App Store Connect exactly
- Must be lowercase with dots: `com.elory.app`

**API calls fail after release**
- Confirm backend is live at `https://api.elory.app/api/v1`
- Check Railway logs for startup errors
- Verify CORS allows requests from the app

**Apple review rejection**
- Most common reasons: missing privacy policy, undeclared data collection, incomplete metadata
- Camera usage description is already declared in `app.json` (barcode scanner)
