import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Types
export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  grade: 'A' | 'B' | 'C' | 'D';
  ingredients: string[];
  scannedAt: Date;
  // Stack context — set when added via AddToStackModal
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
  // User state
  hasScannedBefore: boolean;

  // Product stack
  stack: Product[];

  // Logged meals for today (ephemeral — not persisted across sessions)
  meals: Product[];

  // Biosignals (calculated from stack)
  biosignals: BioSignal[];

  // Actions
  addToStack: (product: Product) => void;
  removeFromStack: (id: string) => void;
  clearStack: () => void;
  addMeal: (product: Product) => void;
  clearMeals: () => void;
}

const AppStateContext = createContext<AppState | undefined>(undefined);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Product[]>([]);
  const [meals, setMeals] = useState<Product[]>([]);
  const [hasScannedBefore, setHasScannedBefore] = useState(false);

  const addToStack = useCallback((product: Product) => {
    setStack((prev) => [product, ...prev]);
    setHasScannedBefore(true);
  }, []);

  const removeFromStack = useCallback((id: string) => {
    setStack((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearStack = useCallback(() => {
    setStack([]);
  }, []);

  const addMeal = useCallback((product: Product) => {
    setMeals((prev) => [product, ...prev]);
  }, []);

  const clearMeals = useCallback(() => {
    setMeals([]);
  }, []);

  // Biosignals are derived from the user's real stack data (populated by backend)
  const biosignals: BioSignal[] = [];

  return (
    <AppStateContext.Provider
      value={{
        hasScannedBefore,
        stack,
        meals,
        biosignals,
        addToStack,
        removeFromStack,
        clearStack,
        addMeal,
        clearMeals,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}
