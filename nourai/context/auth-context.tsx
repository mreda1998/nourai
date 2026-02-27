import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import { api, configureAuthTokenProvider, type OnboardingProfile } from '@/services/api';

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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const ONBOARDING_KEY = '@nourai_onboarded';
const PROFILE_KEY = '@nourai_onboarding_profile';

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

  /** Maps OnboardingProfile → UserHealthProfileUpdate and sends to backend. */
  const syncProfileToBackend = async (token: string, profile: OnboardingProfile) => {
    try {
      await api.updateHealthProfile(token, {
        biological_sex:
          profile.biologicalSex === 'not_specified' ? 'other' : profile.biologicalSex,
        is_pregnant: profile.isPregnant,
        is_breastfeeding: profile.isBreastfeeding,
        age_range: profile.ageRange || undefined,
        focus_areas: profile.focusAreas,
        health_concerns: profile.healthConcerns,
        goals: profile.goals,
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

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { session } = data;

    // Sync profile on every sign-in in case it was never sent (e.g. offline signup)
    const profile =
      onboardingProfile ??
      (await AsyncStorage.getItem(PROFILE_KEY).then((v) => (v ? JSON.parse(v) : null)));

    if (profile && session?.access_token) {
      await syncProfileToBackend(session.access_token, profile);
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
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
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    // Don't clear onboarding — user should not re-onboard after logout
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
        signIn,
        signUp,
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
