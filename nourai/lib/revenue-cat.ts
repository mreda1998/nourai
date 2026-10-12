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
const STORE_PREFIX = Platform.select({ ios: 'appl_', android: 'goog_' });

export const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || 'Elory Pro';

let configured = false;

/** A store key for this platform, or (dev builds only) a Test Store key. */
function apiKey(): string | undefined {
  if (__DEV__ && process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY) return process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  if (STORE_PREFIX && STORE_KEY?.startsWith(STORE_PREFIX)) return STORE_KEY;
  return __DEV__ ? DEV_TEST_KEY : undefined;
}

/**
 * Configure RevenueCat once. Skipped in tester builds (premium is unlocked
 * for friends), on web, and when no valid store key is set, so a missing key
 * leaves premium locked instead of crashing the app.
 */
export function configureRevenueCat(): boolean {
  if (configured) return true;
  const key = apiKey();
  if (TESTER_MODE || Platform.OS === 'web' || !key) return false;
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey: key });
  configured = true;
  return true;
}
