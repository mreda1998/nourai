import { Stack, router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Colors, Palette } from '@/constants/theme';
import { usePurchases } from '@/context/purchases-context';
import { PremiumLock } from '@/components/elory/PremiumLock';
import { Button, Txt } from '@/components/ui';

/**
 * Premium screens mount only once access is verified: never while it's loading,
 * and never when verification failed (that shows the reason and a retry instead).
 */
export default function PremiumLayout() {
  const { isPremium, isLoading, error, refreshCustomerInfo } = usePurchases();

  if (isLoading || error) {
    return (
      <View style={{ flex: 1, backgroundColor: Palette.canvas, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        {isLoading ? <ActivityIndicator color={Palette.accent} /> : (
          <>
            <Txt variant="callout" tone="secondary" align="center">{error}</Txt>
            <Button label="Try again" variant="secondary" fullWidth={false} style={{ marginTop: 16 }} onPress={() => refreshCustomerInfo()} />
          </>
        )}
        <Button label="Back" variant="tertiary" fullWidth={false} style={{ marginTop: 8 }} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never))} />
      </View>
    );
  }

  if (!isPremium) return <View style={{ flex: 1, backgroundColor: Palette.canvas }}><PremiumLock /></View>;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.surface },
        animation: 'slide_from_bottom',
      }}
    />
  );
}
