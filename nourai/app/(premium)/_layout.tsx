import { Stack } from 'expo-router';
import { Colors } from '@/constants/theme';

export default function PremiumLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.darkSurface },
        animation: 'slide_from_bottom',
      }}
    />
  );
}
