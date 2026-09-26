import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { TESTER_MODE } from '@/lib/tester-mode';

// Store keys come from EAS env (appl_… / goog_…). The Test Store key is only
// ever used in development builds — never ship it in a release build.
const DEV_TEST_KEY = 'test_UeVRWNiZbGQsaoVTubCwXwUZRXi';
const STORE_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

export const RC_API_KEY = STORE_KEY || (__DEV__ ? DEV_TEST_KEY : undefined);

export const ENTITLEMENT_ID = 'Elory Pro';

let configured = false;

export function isRevenueCatConfigured() {
  return configured;
}

/**
 * Configure RevenueCat once. Skipped in tester builds (premium is unlocked
 * for friends) and when no store key is set, so a missing key leaves premium
 * locked instead of crashing the app.
 */
export function configureRevenueCat(): boolean {
  if (configured) return true;
  if (TESTER_MODE || !RC_API_KEY) return false;
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey: RC_API_KEY });
  configured = true;
  return true;
}
