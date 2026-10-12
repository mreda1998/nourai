import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '@/lib/supabase';
import { api, configureAuthTokenProvider, type OnboardingProfile, type UserHealthProfile } from '@/services/api';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface AuthState {
  isLoading: boolean;
  isOnboarded: boolean;
  isSignedIn: boolean;
  user: User | null;
  onboardingProfile: OnboardingProfile | null;
  completeOnboarding: (profile?: OnboardingProfile) => Promise<void>;
  updateOnboardingProfile: (profile: OnboardingProfile) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ONBOARDING_KEY = '@elory_onboarded';
const PROFILE_KEY = '@elory_onboarding_profile';

const AuthContext = createContext<AuthState | undefined>(undefined);

// Wire the API service to always use the current Supabase session token.
// This runs once at module load — before any component mounts.
configureAuthTokenProvider(async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const [onboardedValue, profileValue] = await Promise.all([
          AsyncStorage.getItem(ONBOARDING_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
        ]);

        setIsOnboarded(onboardedValue === 'true');
        if (profileValue) setOnboardingProfile(JSON.parse(profileValue));

        // Restore existing Supabase session (persisted in AsyncStorage)
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(userFromSupabase(session.user));
          setIsSignedIn(true);

          // If there's a live session but no local profile, fetch from backend.
          // Covers: post-signOut restart, OS-cleared AsyncStorage, or fresh install
          // where the user was previously signed in on another device.
          if (!profileValue && session.access_token) {
            restoreProfileFromBackend(session.access_token).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[Auth] Failed to restore session:', err);
      } finally {
        setIsLoading(false);
      }
    };

    init();

    // Keep auth state in sync when Supabase fires events (token refresh, sign-out)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(userFromSupabase(session.user));
        setIsSignedIn(true);
      } else {
        setUser(null);
        setIsSignedIn(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const userFromSupabase = (u: {
    id: string;
    email?: string;
    user_metadata?: Record<string, string>;
  }): User => ({
    id: u.id,
    email: u.email ?? '',
    name: u.user_metadata?.name ?? u.email?.split('@')[0] ?? 'User',
  });

  /**
   * Maps a UserHealthProfile fetched from GET /users/me back into the local
   * OnboardingProfile shape so the rest of the app can use it for personalization.
   */
  const healthProfileToOnboarding = (hp: UserHealthProfile): OnboardingProfile => ({
    biologicalSex:
      hp.biological_sex === 'other' || !hp.biological_sex ? 'not_specified' : hp.biological_sex,
    ageRange: (hp.age_range as OnboardingProfile['ageRange']) ?? '',
    isPregnant: hp.is_pregnant ?? false,
    isBreastfeeding: hp.is_breastfeeding ?? false,
    sleepQuality: (hp.sleep_quality as OnboardingProfile['sleepQuality']) ?? '',
    activityLevel: (hp.activity_level as OnboardingProfile['activityLevel']) ?? '',
    dietaryPattern: hp.dietary_pattern ?? [],
    environment: (hp.environment as OnboardingProfile['environment']) ?? '',
    productCategories: hp.product_categories ?? [],
    focusAreas: hp.focus_areas ?? [],
    healthConcerns: hp.health_concerns ?? [],
    goals: hp.health_goals ?? [],
  });

  /**
   * Fetch the user's onboarding profile from the backend and hydrate local
   * state + AsyncStorage. Called after sign-in so a returning user on a new
   * device always gets their saved personalization tags without re-onboarding.
   *
   * Returns the restored profile, or null if the backend profile is incomplete
   * or the fetch fails (caller should fall back to the local profile).
   */
  const restoreProfileFromBackend = async (token: string): Promise<OnboardingProfile | null> => {
    try {
      const hp = await api.getHealthProfile(token);
      if (!hp.onboarding_completed) return null;
      const restored = healthProfileToOnboarding(hp);
      await Promise.all([
        AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(restored)),
        AsyncStorage.setItem(ONBOARDING_KEY, 'true'),
      ]);
      setOnboardingProfile(restored);
      setIsOnboarded(true);
      return restored;
    } catch {
      return null;
    }
  };

  /** Maps OnboardingProfile → UserHealthProfileUpdate and sends to backend. */
  const syncProfileToBackend = async (token: string, profile: OnboardingProfile) => {
    try {
      await api.updateHealthProfile(token, {
        biological_sex:
          profile.biologicalSex === 'not_specified' ? 'other' : profile.biologicalSex,
        age_range: profile.ageRange || undefined,
        focus_areas: profile.focusAreas,
        health_concerns: profile.healthConcerns,
        health_goals: profile.goals,
        is_pregnant: profile.isPregnant,
        is_breastfeeding: profile.isBreastfeeding,
        onboarding_completed: true,
        sleep_quality: profile.sleepQuality || undefined,
        activity_level: profile.activityLevel || undefined,
        dietary_pattern: profile.dietaryPattern,
        environment: profile.environment || undefined,
        product_categories: profile.productCategories,
      });
      console.log('[Auth] Profile synced to backend');
    } catch (err) {
      // Non-fatal — app works without server-side personalization
      console.warn('[Auth] Profile sync failed:', err);
    }
  };

  // ─── Public actions ───────────────────────────────────────────────────────

  const completeOnboarding = async (profile?: OnboardingProfile) => {
    const writes: Promise<void>[] = [AsyncStorage.setItem(ONBOARDING_KEY, 'true')];
    if (profile) {
      writes.push(AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)));
    }
    await Promise.all(writes);
    setIsOnboarded(true);
    if (profile) setOnboardingProfile(profile);
  };

  /**
   * Update the onboarding profile after the user edits their health profile
   * in-app. Persists to AsyncStorage, updates React state, and syncs to the
   * backend — so the product page personalization reflects the change instantly.
   */
  const updateOnboardingProfile = async (profile: OnboardingProfile) => {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    setOnboardingProfile(profile);

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await syncProfileToBackend(session.access_token, profile);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { session } = data;
    if (!session?.access_token) return;

    // Always pull the authoritative profile from the backend first.
    // This handles: new device, reinstall, different user signing in.
    const backendRestored = await restoreProfileFromBackend(session.access_token);

    if (!backendRestored) {
      // Backend profile incomplete — sync whatever we have locally (e.g. offline signup)
      const localProfile =
        onboardingProfile ??
        (await AsyncStorage.getItem(PROFILE_KEY).then((v) => (v ? JSON.parse(v) : null)));
      if (localProfile) {
        await syncProfileToBackend(session.access_token, localProfile);
      }
    }
  };

  const signUp = async (email: string, password: string, name: string): Promise<{ needsEmailConfirmation: boolean }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) throw error;

    const { session } = data;

    if (session?.access_token && onboardingProfile) {
      await syncProfileToBackend(session.access_token, onboardingProfile);
    }

    // When email confirmation is required, Supabase returns user but no session
    return { needsEmailConfirmation: !session };
  };

  const signInWithApple = async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) throw new Error('Apple Sign-In failed: no identity token');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;

    // Apple only returns name on the very first sign-in — persist it to Supabase user metadata
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ');
    if (fullName && data.user) {
      await supabase.auth.updateUser({ data: { name: fullName } });
    }

    const { session } = data;
    if (!session?.access_token) return;

    const backendRestored = await restoreProfileFromBackend(session.access_token);
    if (!backendRestored) {
      const localProfile =
        onboardingProfile ??
        (await AsyncStorage.getItem(PROFILE_KEY).then((v) => (v ? JSON.parse(v) : null)));
      if (localProfile) {
        await syncProfileToBackend(session.access_token, localProfile);
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Clear per-user profile so a different account signing in on this device
    // doesn't inherit the previous user's concern/goal tags.
    // We keep ONBOARDING_KEY + isOnboarded so the same user won't re-onboard.
    await AsyncStorage.removeItem(PROFILE_KEY);
    setOnboardingProfile(null);
    setUser(null);
    setIsSignedIn(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isOnboarded,
        isSignedIn,
        user,
        onboardingProfile,
        completeOnboarding,
        updateOnboardingProfile,
        signIn,
        signUp,
        signInWithApple,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
