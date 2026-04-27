import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { ENTITLEMENT_ID } from '@/lib/revenue-cat';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchasesState {
  customerInfo: CustomerInfo | null;
  isPremium: boolean;
  offerings: PurchasesOfferings | null;
  isLoading: boolean;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  presentPaywall: () => Promise<PAYWALL_RESULT>;
  presentPaywallIfNeeded: () => Promise<PAYWALL_RESULT>;
  presentCustomerCenter: () => Promise<void>;
  refreshCustomerInfo: () => Promise<void>;
}

const PurchasesContext = createContext<PurchasesState | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isPremium =
    customerInfo?.entitlements.active[ENTITLEMENT_ID] !== undefined ?? false;

  // ── Load on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [info, offs] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);
        if (!mounted) return;
        setCustomerInfo(info);
        setOfferings(offs);
      } catch (e) {
        if (__DEV__) console.warn('[RC] init failed:', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    // Listen for server-pushed updates (subscription renewals, webhooks)
    const onUpdate = (info: CustomerInfo) => setCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(onUpdate);

    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener(onUpdate);
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────

  const refreshCustomerInfo = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (e) {
      if (__DEV__) console.warn('[RC] refresh failed:', e);
    }
  }, []);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);
      return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    } catch (e: any) {
      if (e?.userCancelled) return false;
      throw e;
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    } catch (e) {
      if (__DEV__) console.warn('[RC] restore failed:', e);
      return false;
    }
  }, []);

  const presentPaywall = useCallback((): Promise<PAYWALL_RESULT> => {
    return RevenueCatUI.presentPaywall();
  }, []);

  const presentPaywallIfNeeded = useCallback((): Promise<PAYWALL_RESULT> => {
    return RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });
  }, []);

  const presentCustomerCenter = useCallback((): Promise<void> => {
    return RevenueCatUI.presentCustomerCenter();
  }, []);

  return (
    <PurchasesContext.Provider
      value={{
        customerInfo,
        isPremium,
        offerings,
        isLoading,
        purchasePackage,
        restorePurchases,
        presentPaywall,
        presentPaywallIfNeeded,
        presentCustomerCenter,
        refreshCustomerInfo,
      }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePurchases() {
  const ctx = useContext(PurchasesContext);
  if (!ctx) throw new Error('usePurchases must be used within PurchasesProvider');
  return ctx;
}
