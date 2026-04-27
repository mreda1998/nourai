import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

// Replace with platform-specific live keys before App Store submission.
// iOS key: appl_xxxx   Android key: goog_xxxx
// This test key works cross-platform during development.
export const RC_API_KEY = 'test_UeVRWNiZbGQsaoVTubCwXwUZRXi';

export const ENTITLEMENT_ID = 'Elory Pro';

export function configureRevenueCat() {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey: RC_API_KEY });
}
