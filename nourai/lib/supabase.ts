import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const isServerRender = Platform.OS === 'web' && typeof window === 'undefined';
const serverStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => undefined,
  removeItem: async (_key: string) => undefined,
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Use AsyncStorage so sessions persist across app restarts
    storage: isServerRender ? serverStorage : AsyncStorage,
    autoRefreshToken: !isServerRender,
    persistSession: !isServerRender,
    detectSessionInUrl: false,
  },
});
