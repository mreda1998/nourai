import '../global.css';

import { useEffect, useCallback, useRef } from 'react';
import { configureRevenueCat } from '@/lib/revenue-cat';

// Configure RevenueCat as early as possible — before any component mounts.
configureRevenueCat();
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  InstrumentSerif_400Regular,
  InstrumentSerif_400Regular_Italic,
} from '@expo-google-fonts/instrument-serif';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Palette } from '@/constants/theme';
import * as SplashScreen from 'expo-splash-screen';

import { AppStateProvider, useAppState } from '@/context/app-state';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { PurchasesProvider } from '@/context/purchases-context';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isLoading, isOnboarded, isSignedIn } = useAuth();
  const { stack } = useAppState();
  const segments = useSegments();
  const router = useRouter();

  // Migrate guest stack to server on sign-in (fire-and-forget, best-effort).
  const prevIsSignedInRef = useRef(false);
  useEffect(() => {
    const wasSignedIn = prevIsSignedInRef.current;
    prevIsSignedInRef.current = isSignedIn;

    if (!isSignedIn || wasSignedIn || stack.length === 0) return;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      for (const product of stack) {
        try {
          await api.addToStack(session.access_token, product.id, product.timeOfDay, {
            loggedAt: product.scannedAt,
            notes: product.quantity,
          });
        } catch {
          // Non-fatal — the stack tab will reload from server anyway
        }
      }
    })();
  }, [isSignedIn]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'auth' || segments[0] === 'onboarding';

    if (!isOnboarded) {
      // User hasn't completed onboarding
      router.replace('/onboarding');
    } else if (!inAuthGroup && segments[0] !== '(tabs)' && segments[0] !== '(premium)' && segments[0] !== 'profile-hub' && segments[0] !== 'profile' && segments[0] !== 'product' && segments[0] !== 'ingredient' && segments[0] !== 'newsletter' && segments[0] !== 'settings' && segments[0] !== 'health' && segments[0] !== 'domain' && segments[0] !== 'domains' && segments[0] !== 'research' && segments[0] !== 'submit-product') {
      // After onboarding, go to main app
      router.replace('/(tabs)');
    }
  }, [isLoading, isOnboarded, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Palette.canvas }}>
        <ActivityIndicator size="large" color={Palette.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.canvas },
        animation: 'slide_from_right',
      }}
    >
      {/* Onboarding */}
      <Stack.Screen
        name="onboarding"
        options={{
          animation: 'fade',
        }}
      />

      {/* Auth */}
      <Stack.Screen
        name="auth"
        options={{
          animation: 'slide_from_bottom',
        }}
      />

      {/* Main Tabs */}
      <Stack.Screen name="(tabs)" />

      {/* Atelier — premium screens */}
      <Stack.Screen
        name="(premium)"
        options={{
          animation: 'slide_from_bottom',
          presentation: 'card',
        }}
      />

      {/* Product Detail */}
      <Stack.Screen
        name="product/[id]"
        options={{
          presentation: 'card',
        }}
      />

      {/* Tester: send us a product we don't have */}
      <Stack.Screen
        name="submit-product"
        options={{
          presentation: 'card',
          animation: 'slide_from_bottom',
        }}
      />

      {/* Scan Modal */}
      <Stack.Screen
        name="scan-modal"
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />

      {/* Profile Hub */}
      <Stack.Screen
        name="profile-hub"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />

      {/* Skin Profile (existing) */}
      <Stack.Screen
        name="profile"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />

      {/* Health Profiles */}
      <Stack.Screen
        name="health/skin"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="health/gut"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="health/fitness"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="health/hair"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="health/hormonal"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="health/sleep"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />

      {/* Domain Detail */}
      <Stack.Screen
        name="domain/[name]"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />

      {/* Ingredient Deep Dive */}
      <Stack.Screen
        name="ingredient/[id]"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />

      {/* Newsletter Article */}
      <Stack.Screen
        name="newsletter/[id]"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />

      {/* Settings */}
      <Stack.Screen
        name="settings/permissions"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/subscription"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/account"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/notifications"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/privacy"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="settings/about"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="health/edit-profile"
        options={{
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <PurchasesProvider>
          <AppStateProvider>
            <BottomSheetModalProvider>
              <StatusBar style="dark" />
              <RootLayoutNav />
            </BottomSheetModalProvider>
          </AppStateProvider>
        </PurchasesProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
