/**
 * Beta builds for friends (EAS `testflight` profile) set EXPO_PUBLIC_TESTER_MODE=1:
 * premium is unlocked without RevenueCat and feedback entry points appear.
 */
export const TESTER_MODE = process.env.EXPO_PUBLIC_TESTER_MODE === '1';
