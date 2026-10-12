import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesOfferings, type PurchasesPackage } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { configureRevenueCat, ENTITLEMENT_ID } from '@/lib/revenue-cat';
import { api } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { TESTER_MODE } from '@/lib/tester-mode';
import { createSerialQueue } from '@/utils/serial-queue';
import { useAuth } from './auth-context';

interface PurchasesState {
  customerInfo: CustomerInfo | null;
  isPremium: boolean;
  offerings: PurchasesOfferings | null;
  isLoading: boolean;
  error: string | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  presentPaywall: () => Promise<PAYWALL_RESULT>;
  presentPaywallIfNeeded: () => Promise<PAYWALL_RESULT>;
  presentCustomerCenter: () => Promise<void>;
  refreshCustomerInfo: () => Promise<void>;
}
const PurchasesContext = createContext<PurchasesState | undefined>(undefined);
// The SDK is a singleton. Serialize even across provider/account remounts.
const enqueue = createSerialQueue();

// Tester builds skip RevenueCat; the server grants their access (PREMIUM_OPEN_BETA).
const TESTER_STATE: PurchasesState = {
  customerInfo: null, offerings: null, isPremium: true, isLoading: false, error: null,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
  presentPaywall: async () => PAYWALL_RESULT.NOT_PRESENTED,
  presentPaywallIfNeeded: async () => PAYWALL_RESULT.NOT_PRESENTED,
  presentCustomerCenter: async () => undefined,
  refreshCustomerInfo: async () => undefined,
};

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (TESTER_MODE) return <PurchasesContext.Provider value={TESTER_STATE}>{children}</PurchasesContext.Provider>;
  return <AccountPurchases key={isLoading ? 'initializing' : user?.id ?? 'guest'} owner={user?.id ?? null} initializing={isLoading}>{children}</AccountPurchases>;
}

function AccountPurchases({ children, owner, initializing }: { children: React.ReactNode; owner: string | null; initializing: boolean }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [isPremium, setPremium] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const establishIdentity = useCallback(async () => {
    if (!alive.current) throw new Error('Your account changed. Please try again.');
    if (!configureRevenueCat()) throw new Error('Purchases are not configured for this build.');
    if (!owner) {
      if (!(await Purchases.isAnonymous())) await Purchases.logOut();
      return null;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== owner) throw new Error('Please sign in again before managing your subscription.');
    if ((await Purchases.getAppUserID()) !== owner) await Purchases.logIn(owner);
    return session.access_token;
  }, [owner]);

  const sync = useCallback(async (token: string | null) => {
    const info = await Purchases.getCustomerInfo();
    // The server independently verifies access; the client cannot grant it.
    const verified = token ? await api.verifySubscription(token) : null;
    if (alive.current) {
      setCustomerInfo(info);
      setPremium(!!verified?.is_premium);
      setError(null);
    }
    return !!verified?.is_premium;
  }, []);

  const refreshCustomerInfo = useCallback(() => enqueue(async () => {
    if (initializing || !alive.current) return;
    setLoading(true);
    try {
      const token = await establishIdentity();
      await sync(token);
      const available = await Purchases.getOfferings();
      if (alive.current) setOfferings(available);
    } catch (reason) {
      if (alive.current) {
        setPremium(false);
        setError(reason instanceof Error ? reason.message : 'Subscription status is unavailable.');
      }
    } finally { if (alive.current) setLoading(false); }
  }), [initializing, establishIdentity, sync]);

  useEffect(() => {
    refreshCustomerInfo();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshCustomerInfo();
    });
    return () => listener.remove();
  }, [refreshCustomerInfo]);

  const perform = useCallback(<T,>(operation: () => Promise<T>): Promise<{ result: T; verified: boolean }> => enqueue(async () => {
    try {
      const token = await establishIdentity();
      if (!token) throw new Error('Sign in to purchase or restore your Elory membership.');
      if (!alive.current) throw new Error('Your account changed. Please try again.');
      const result = await operation();
      const verified = await sync(token);
      return { result, verified };
    } catch (reason) {
      if (alive.current && !(reason as { userCancelled?: boolean })?.userCancelled) setError(reason instanceof Error ? reason.message : 'Your subscription could not be verified.');
      throw reason;
    }
  }), [establishIdentity, sync]);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage) => {
    try {
      const { verified } = await perform(async () => (await Purchases.purchasePackage(pkg)).customerInfo);
      return verified;
    } catch (reason: any) {
      if (reason?.userCancelled) return false;
      throw reason;
    }
  }, [perform]);
  const restorePurchases = useCallback(async () => {
    const { verified } = await perform(() => Purchases.restorePurchases());
    return verified;
  }, [perform]);

  return <PurchasesContext.Provider value={{ customerInfo, offerings, isPremium, isLoading, error,
    purchasePackage, restorePurchases, refreshCustomerInfo,
    presentPaywall: () => perform(() => RevenueCatUI.presentPaywall()).then(({ result }) => result),
    presentPaywallIfNeeded: () => perform(() => RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: ENTITLEMENT_ID })).then(({ result }) => result),
    presentCustomerCenter: () => perform(() => RevenueCatUI.presentCustomerCenter()).then(() => undefined),
  }}>{children}</PurchasesContext.Provider>;
}

export function usePurchases() {
  const context = useContext(PurchasesContext);
  if (!context) throw new Error('usePurchases must be used within PurchasesProvider');
  return context;
}
