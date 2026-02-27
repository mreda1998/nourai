/**
 * scan-modal is no longer a standalone mock screen.
 * Redirects immediately to the real barcode scanner tab.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function ScanModal() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(tabs)/scan');
  }, []);
  return null;
}
