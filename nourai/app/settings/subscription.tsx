import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { PurchasesPackage } from 'react-native-purchases';

import {
  Colors,
  Fonts,
  FontSizes,
  Layout,
  Radius,
  scale,
  Spacing,
  verticalScale,
} from '@/constants/theme';
import { usePurchases } from '@/context/purchases-context';

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon({ color = Colors.accentHill }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Free-tier features ───────────────────────────────────────────────────────

const FREE_FEATURES = [
  'Unlimited barcode scans',
  'Full ingredient intelligence',
  'Domain health signals (read-only)',
  'Stack up to 10 products',
  'Scan history',
];

const PRO_FEATURES = [
  'Ask Elory AI — chat your stack',
  'Circadian dosing protocols',
  'Ingredient conflict map',
  'Exposure load ledger',
  'Evidence Pulse — live research feed',
  'Peptides knowledge base',
  'Unlimited stack',
  'Priority support',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function packagePeriodLabel(pkg: PurchasesPackage): string {
  const id = pkg.packageType?.toLowerCase() ?? '';
  if (id.includes('annual') || id.includes('yearly')) return 'per year';
  if (id.includes('weekly')) return 'per week';
  return 'per month';
}

function packageSavingsLabel(pkg: PurchasesPackage, monthlyPkg: PurchasesPackage | null): string | null {
  if (!monthlyPkg) return null;
  const type = pkg.packageType?.toLowerCase() ?? '';
  if (!type.includes('annual') && !type.includes('yearly')) return null;

  const annual = pkg.product.price;
  const monthly = monthlyPkg.product.price;
  if (!annual || !monthly || monthly === 0) return null;

  const saving = Math.round(((monthly * 12 - annual) / (monthly * 12)) * 100);
  return saving > 0 ? `Save ${saving}%` : null;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    isPremium,
    isLoading,
    offerings,
    customerInfo,
    purchasePackage,
    restorePurchases,
    presentPaywall,
    presentCustomerCenter,
  } = usePurchases();

  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Ordered packages from the current offering
  const packages: PurchasesPackage[] = offerings?.current?.availablePackages ?? [];
  const monthlyPkg = packages.find((p) => p.packageType?.toLowerCase().includes('monthly')) ?? null;

  // Active entitlement expiry
  const activeEntitlement = customerInfo?.entitlements.active['Elory Pro'];
  const expiresAt = activeEntitlement?.expirationDate
    ? new Date(activeEntitlement.expirationDate).toLocaleDateString()
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(pkg.identifier);
    try {
      const succeeded = await purchasePackage(pkg);
      if (succeeded) router.back();
    } catch (e: any) {
      Alert.alert('Purchase failed', e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert('Restored', 'Your Elory Pro subscription has been restored.');
        router.back();
      } else {
        Alert.alert('Nothing to restore', 'No active subscription found for this Apple ID.');
      }
    } catch {
      Alert.alert('Restore failed', 'Please try again later.');
    } finally {
      setRestoring(false);
    }
  };

  const handleShowPaywall = async () => {
    await presentPaywall();
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={Colors.ink} />
      </View>
    );
  }

  // ── Premium — show current plan + Customer Center ─────────────────────────

  if (isPremium) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Subscription</Text>
        </View>

        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {/* Active badge */}
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumBadgeEyebrow}>◆ ACTIVE</Text>
            <Text style={styles.premiumBadgeTitle}>Elory Pro</Text>
            {expiresAt && (
              <Text style={styles.premiumBadgeExpiry}>Renews {expiresAt}</Text>
            )}
          </View>

          {/* Pro features list */}
          <View style={styles.featureCard}>
            <Text style={styles.featureCardLabel}>What's included</Text>
            {PRO_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <CheckIcon />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>

          {/* Customer Center — lets user manage/cancel their sub in-app */}
          <Pressable style={styles.managePrimaryBtn} onPress={() => presentCustomerCenter()}>
            <Text style={styles.managePrimaryBtnText}>Manage Subscription</Text>
          </Pressable>

          <Text style={styles.manageHint}>
            Change plan, cancel, or contact support — all from one place.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ── Free — show upgrade UI ────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Upgrade</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>◆ ELORY PRO</Text>
          <Text style={styles.heroTitle}>Your health,{'\n'}analysed deeply.</Text>
          <Text style={styles.heroSub}>
            AI chat, circadian dosing, conflict maps, and clinical evidence — built for people who take this seriously.
          </Text>
        </View>

        {/* Free vs Pro comparison */}
        <View style={styles.comparisonRow}>
          <View style={[styles.comparisonCol, styles.comparisonColFree]}>
            <Text style={styles.comparisonColLabel}>Free</Text>
            {FREE_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <CheckIcon color={Colors.inkTertiary} />
                <Text style={[styles.featureText, { color: Colors.inkSecondary }]}>{f}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.comparisonCol, styles.comparisonColPro]}>
            <Text style={styles.comparisonColLabel}>Pro</Text>
            {PRO_FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <CheckIcon color={Colors.accentHill} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Packages from RC offering */}
        {packages.length > 0 ? (
          <View style={styles.packagesSection}>
            <Text style={styles.sectionLabel}>Choose a plan</Text>
            {packages.map((pkg) => {
              const savings = packageSavingsLabel(pkg, monthlyPkg);
              const isBuying = purchasing === pkg.identifier;
              return (
                <Pressable
                  key={pkg.identifier}
                  style={styles.packageCard}
                  onPress={() => handlePurchase(pkg)}
                  disabled={!!purchasing || restoring}
                >
                  <View style={styles.packageCardLeft}>
                    <Text style={styles.packagePeriod}>{packagePeriodLabel(pkg)}</Text>
                    <Text style={styles.packagePrice}>{pkg.product.priceString}</Text>
                    {savings && <Text style={styles.packageSavings}>{savings}</Text>}
                  </View>
                  {isBuying ? (
                    <ActivityIndicator color={Colors.bone} size="small" />
                  ) : (
                    <Text style={styles.packageCta}>Subscribe</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : (
          // Fallback: launch the RC-configured paywall if no packages loaded
          <Pressable style={styles.paywallBtn} onPress={handleShowPaywall}>
            <Text style={styles.paywallBtnText}>View Plans →</Text>
          </Pressable>
        )}

        {/* Restore */}
        <Pressable
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={restoring || !!purchasing}
        >
          {restoring
            ? <ActivityIndicator color={Colors.inkSecondary} size="small" />
            : <Text style={styles.restoreBtnText}>Restore Purchases</Text>
          }
        </Pressable>

        {/* Legal */}
        <Text style={styles.legal}>
          Payment charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account
          at purchase confirmation. Subscription auto-renews unless cancelled at least 24 hours
          before the end of the current period.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginTop: -2,
  },
  pageTitle: {
    fontFamily: Fonts.serifMedium,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: verticalScale(48),
  },
  // ── Premium view ──
  premiumBadge: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.lg,
    padding: scale(24),
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  premiumBadgeEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: Colors.sand,
    marginBottom: scale(8),
  },
  premiumBadgeTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: scale(32),
    color: Colors.bone,
    marginBottom: scale(6),
  },
  premiumBadgeExpiry: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.55)',
  },
  featureCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  featureCardLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.inkTertiary,
    marginBottom: scale(4),
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(8),
  },
  featureText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    flex: 1,
    lineHeight: FontSizes.body * 1.4,
  },
  managePrimaryBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  managePrimaryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  manageHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textAlign: 'center',
    lineHeight: FontSizes.caption * 1.5,
  },
  // ── Free upgrade view ──
  hero: {
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  heroEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: Colors.inkTertiary,
    marginBottom: scale(10),
  },
  heroTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: scale(36),
    color: Colors.ink,
    lineHeight: scale(40),
    marginBottom: scale(12),
  },
  heroSub: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.bodyLarge * 1.55,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  comparisonCol: {
    flex: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  comparisonColFree: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  comparisonColPro: {
    backgroundColor: Colors.ink,
  },
  comparisonColLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.sand,
    marginBottom: scale(6),
  },
  // ── Packages ──
  packagesSection: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.inkTertiary,
    marginBottom: Spacing.md,
  },
  packageCard: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  packageCardLeft: {
    gap: 2,
  },
  packagePeriod: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  packagePrice: {
    fontFamily: Fonts.serifMedium,
    fontSize: scale(22),
    color: Colors.bone,
  },
  packageSavings: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.sand,
    letterSpacing: 0.4,
  },
  packageCta: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  paywallBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: verticalScale(16),
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  paywallBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  restoreBtn: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  restoreBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    textDecorationLine: 'underline',
  },
  legal: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textAlign: 'center',
    lineHeight: FontSizes.caption * 1.5,
  },
});
