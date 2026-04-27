import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';
import { usePurchases } from '@/context/purchases-context';
import { PremiumLock } from '@/components/elory/PremiumLock';

export default function PremiumLayout() {
  const { isPremium, isLoading } = usePurchases();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.darkSurface },
          animation: 'slide_from_bottom',
        }}
      />
      {/* Show lock overlay until RC confirms premium status.
          isLoading keeps it visible briefly on first open — prevents flash of content. */}
      {!isLoading && !isPremium && <PremiumLock />}
    </>
  );
}
