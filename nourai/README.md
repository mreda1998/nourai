# Elory — Mobile App

React Native / Expo app for iOS and Android. Scans product barcodes, surfaces evidence-backed ingredient analysis, and personalizes results to the user's health profile.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81 + Expo SDK 54 |
| Navigation | Expo Router (file-based) |
| Auth | Supabase Auth (email + Sign in with Apple); guests supported |
| Fonts | Instrument Serif + Inter (Google Fonts) |
| Animations | React Native Reanimated 4 |
| Camera | expo-camera (barcode scanning) |
| Storage | expo-secure-store (tokens), AsyncStorage (onboarding state) |

---

## Prerequisites

- **Node.js 20+**
- **Xcode 16+** with iOS 17+ simulator (macOS — for iOS)
- **Android Studio** with an emulator (for Android)
- **Expo Go** app on a physical device (optional)

---

## Install

```bash
cd nourai
npm install
```

---

## Run locally

```bash
npx expo start
```

Then press:
- `i` — open iOS simulator
- `a` — open Android emulator
- `w` — open in browser (limited — no camera)
- Scan the QR code with **Expo Go** on your phone

The app points to `http://localhost:8001/api/v1` when running in development. Make sure the backend is running (`make dev` in `backend-nourai/`).

---

## Environment variables

Expo does not use a `.env` file directly. Configuration that varies per environment lives in `services/api.ts`:

```ts
// services/api.ts
const API_BASE_URL = __DEV__
  ? 'http://localhost:8001/api/v1'       // local backend
  : 'https://api.elory.app/api/v1';    // production — update this
```

Change the production URL to your deployed backend before submitting to the App Store / Play Store.

`.env` files are git-ignored, so EAS builds don't see them. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables — see [docs/testflight-runbook.md](../docs/testflight-runbook.md).

---

## Project structure

```
elory/
├── app/
│   ├── (tabs)/          # Bottom tab screens (index, search, stack, profile)
│   ├── product/
│   │   └── [id].tsx     # Product detail screen (with "For You" personalization)
│   ├── onboarding.tsx   # 2-slide intro + 4-step profile collection
│   └── _layout.tsx      # Root layout + AuthProvider
├── assets/              # Images, fonts, icons
├── constants/
│   └── theme.ts         # Colors, Typography, Spacing, Glass constants
├── context/
│   └── auth-context.tsx # Auth state + onboarding profile (AsyncStorage)
├── services/
│   └── api.ts           # Backend API client + TypeScript interfaces
├── utils/
│   └── personalization.ts  # Client-side concern/goal → ingredient matching
├── app.json             # Expo config (bundle ID, permissions, plugins)
└── tsconfig.json
```

---

## Key screens

| File | Description |
|------|-------------|
| `app/(tabs)/index.tsx` | Home — featured products, scan CTA |
| `app/(tabs)/search.tsx` | Search products by name |
| `app/product/[id].tsx` | Product detail — ingredients, evidence, "For You" section |
| `app/onboarding.tsx` | 3-phase onboarding: intro slides → 4-step profile → summary |

---

## TypeScript

```bash
npx tsc --noEmit
```

No type errors should be present on `main`. The `utils/personalization.ts` module handles all concern/goal keyword matching with full type safety.

---

## Building for production

Elory uses **EAS Build** (Expo Application Services) for production builds.

### 1. Install EAS CLI

```bash
npm install -g eas-cli
eas login
```

### 2. Configure EAS

```bash
eas build:configure
```

This creates `eas.json` with `development`, `preview`, and `production` build profiles.

### 3. Build

```bash
# iOS (requires Apple Developer account)
eas build --platform ios --profile production

# Android
eas build --platform android --profile production

# Both at once
eas build --platform all --profile production
```

Builds run in the cloud — no local Xcode or Gradle required.

### 4. Submit to stores

```bash
# App Store (iOS)
eas submit --platform ios

# Google Play
eas submit --platform android
```

EAS Submit handles uploading the `.ipa` / `.aab` directly to App Store Connect / Google Play Console.

### 5. Over-the-air updates (JS only changes)

For JavaScript-only changes (no native code changes), skip a full build and push an OTA update:

```bash
eas update --branch production --message "fix: product detail crash"
```

Users receive the update silently on next app launch.

---

## iOS-specific setup (local builds)

If you need a local iOS build (e.g. debugging native modules):

1. Install CocoaPods: `sudo gem install cocoapods`
2. Install pods: `cd ios && pod install`
3. Open in Xcode: `open ios/elory.xcworkspace`
4. Select your simulator or connected device and press Run

Camera permission is declared in `app.json`:

```json
"NSCameraUsageDescription": "Elory uses your camera to scan product labels and ingredients."
```

---

## Deployment checklist

- [ ] Update `API_BASE_URL` production URL in `services/api.ts`
- [ ] Set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` as EAS environment variables (production)
- [ ] Run `npx tsc --noEmit` — zero type errors
- [ ] Test barcode scanning on a physical device (simulators can't use camera)
- [ ] Build with EAS: `eas build --platform all --profile production`
- [ ] Test production build on TestFlight (iOS) / Internal Testing (Android)
- [ ] Submit: `eas submit --platform all`
