import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, type StackEntry } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { isCatalogueId, track } from '@/lib/insights';
import { useAuth } from './auth-context';
import { createSerialQueue } from '@/utils/serial-queue';

// Types
export interface Product {
  id: string;
  stackEntryId?: string;
  name: string;
  brand: string;
  category: string;
  grade: 'A' | 'B' | 'C' | 'D';
  ingredients: string[];
  scannedAt: Date;
  imageUri?: string | null;
  // Stack context — set when added via AddToStackSheet
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  protocol?: 'meal' | 'supplement' | 'skincare' | 'treatment' | 'other';
  quantity?: string;
}

export interface BioSignal {
  id: string;
  label: string;
  score: number;
  trend: 'up' | 'down' | 'stable';
  color: string;
  contributors: string[];
}

interface AppState {
  hasScannedBefore: boolean;
  stack: Product[];
  meals: Product[];
  biosignals: BioSignal[];
  isStackLoading: boolean;
  stackError: string | null;
  addToStack: (product: Product) => Promise<void>;
  removeFromStack: (entryId: string) => Promise<void>;
  refreshStack: () => Promise<void>;
  addMeal: (product: Product) => void;
  clearMeals: () => void;
}
const AppStateContext = createContext<AppState | undefined>(undefined);
const GUEST_STACK_KEY = '@elory_guest_stack_v1';
// Earlier builds saved every stack on the device under this key. Guests keep theirs;
// signed-in accounts drop it because the server is their record.
const LEGACY_STACK_KEY = 'elory.stack.v1';
const enqueue = createSerialQueue();

export function productFromStackEntry(entry: StackEntry): Product {
  return {
    id: entry.product_id, stackEntryId: entry.id, name: entry.product_name,
    brand: entry.product_brand ?? '', category: entry.product_category,
    grade: (entry.product_grade as Product['grade']) ?? 'C', ingredients: [],
    imageUri: entry.product_image_url, scannedAt: new Date(entry.logged_at ?? entry.created_at),
    timeOfDay: entry.time_of_day ?? undefined,
    quantity: entry.notes?.trim() || (entry.unit ? `${entry.quantity} ${entry.unit}` : undefined),
  };
}

// Remount synchronously on account change: no frame can expose the previous owner's state.
export function AppStateProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  return <ScopedAppState key={isLoading ? 'initializing' : user?.id ?? 'guest'} owner={user?.id ?? null} initializing={isLoading}>{children}</ScopedAppState>;
}

function ScopedAppState({ children, owner, initializing }: { children: ReactNode; owner: string | null; initializing: boolean }) {
  const [stack, setStack] = useState<Product[]>([]);
  const [meals, setMeals] = useState<Product[]>([]);
  const [isStackLoading, setLoading] = useState(true);
  const [stackError, setError] = useState<string | null>(null);
  const current = useRef<Product[]>([]);
  const alive = useRef(true);
  const guestLoaded = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const tokenForOwner = useCallback(async () => {
    if (!alive.current) throw new Error('Your account changed. Please try again.');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== owner) throw new Error('Please sign in again to update your routine.');
    return session.access_token;
  }, [owner]);

  const publish = (next: Product[]) => {
    if (!alive.current) return;
    current.current = next;
    setStack(next);
  };

  const refreshStack = useCallback(() => enqueue(async () => {
    if (initializing || !alive.current) return;
    setLoading(true); setError(null);
    try {
      if (owner) {
        const entries = await api.getStack(await tokenForOwner());
        publish(entries.map(productFromStackEntry));
        AsyncStorage.removeItem(LEGACY_STACK_KEY).catch(() => undefined);
      } else {
        const stored = (await AsyncStorage.getItem(GUEST_STACK_KEY)) ?? (await migrateLegacyGuestStack());
        const entries = stored ? JSON.parse(stored) : [];
        if (!Array.isArray(entries)) throw new Error('Saved routine could not be read.');
        publish(entries.map((entry: Product) => ({ ...entry, scannedAt: new Date(entry.scannedAt) })));
        guestLoaded.current = true;
      }
    } catch (error) {
      if (alive.current) setError(error instanceof Error ? error.message : 'Your routine could not be loaded.');
      throw error;
    } finally { if (alive.current) setLoading(false); }
  }), [initializing, owner, tokenForOwner]);

  useEffect(() => { refreshStack().catch(() => undefined); }, [refreshStack]);

  const addToStack = useCallback((product: Product) => enqueue(async () => {
    if (!alive.current) throw new Error('Your account changed. Please try again.');
    if (owner) {
      const entry = await api.addToStack(await tokenForOwner(), product.id, product.timeOfDay, {
        loggedAt: product.scannedAt, notes: product.quantity,
      });
      publish([productFromStackEntry(entry), ...current.current]);
    } else {
      if (!guestLoaded.current) throw new Error('Load your saved routine before adding a product.');
      const next = [{ ...product, stackEntryId: `guest-${Date.now()}-${Math.random().toString(36).slice(2)}` }, ...current.current];
      await AsyncStorage.setItem(GUEST_STACK_KEY, JSON.stringify(next));
      publish(next);
    }
    track('stack_add', isCatalogueId(product.id)
      ? { product_id: product.id, meta: { category: product.category } }
      : { meta: { ref: product.id, category: product.category } });
  }), [owner, tokenForOwner]);

  const removeFromStack = useCallback((entryId: string) => enqueue(async () => {
    if (!alive.current) throw new Error('Your account changed. Please try again.');
    if (!current.current.some((item) => item.stackEntryId === entryId)) throw new Error('This entry is no longer available. Refresh your routine.');
    const next = current.current.filter((item) => item.stackEntryId !== entryId);
    if (owner) await api.removeFromStack(await tokenForOwner(), entryId);
    else await AsyncStorage.setItem(GUEST_STACK_KEY, JSON.stringify(next));
    publish(next);
  }), [owner, tokenForOwner]);

  return <AppStateContext.Provider value={{ stack, meals, biosignals: [], hasScannedBefore: stack.length > 0,
    isStackLoading, stackError, refreshStack, addToStack, removeFromStack,
    addMeal: (product) => setMeals((previous) => [product, ...previous]), clearMeals: () => setMeals([]),
  }}>{children}</AppStateContext.Provider>;
}

/** Move an earlier build's on-device stack into the guest store, giving entries removable ids. */
async function migrateLegacyGuestStack(): Promise<string | null> {
  const legacy = await AsyncStorage.getItem(LEGACY_STACK_KEY);
  if (!legacy) return null;
  const entries = JSON.parse(legacy);
  if (!Array.isArray(entries)) return null;
  const migrated = JSON.stringify(entries.map((entry: Product, index: number) => ({
    ...entry, stackEntryId: entry.stackEntryId ?? `guest-legacy-${index}-${Date.now()}`,
  })));
  await AsyncStorage.setItem(GUEST_STACK_KEY, migrated);
  await AsyncStorage.removeItem(LEGACY_STACK_KEY);
  return migrated;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used within AppStateProvider');
  return context;
}
