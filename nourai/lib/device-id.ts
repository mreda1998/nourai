import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Anonymous per-install ID, sent as `X-Device-Id` so tester activity can be
 * grouped per person without an account. Random, never derived from hardware.
 */
const KEY = 'elory.deviceId';

let pending: Promise<string> | null = null;

function uuidV4(): string {
  // Not security sensitive — just needs to be unique per install.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getDeviceId(): Promise<string> {
  pending ??= (async () => {
    try {
      const existing = await AsyncStorage.getItem(KEY);
      if (existing) return existing;
      const created = uuidV4();
      await AsyncStorage.setItem(KEY, created);
      return created;
    } catch {
      return uuidV4(); // storage unavailable: still group this session's events
    }
  })();
  return pending;
}
