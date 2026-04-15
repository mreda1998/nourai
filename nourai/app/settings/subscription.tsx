import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  Layout,
  scale,
  verticalScale,
} from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

// Subscription types
type SubscriptionTier = 'free' | 'premium_monthly' | 'premium_annual';

interface SubscriptionPlan {
  id: string;
  productId: string;
  tier: SubscriptionTier;
  name: string;
  price: string;
  pricePerMonth: string;
  billing: string;
  features: string[];
  popular?: boolean;
  savings?: string;
}

// Available plans
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'premium_monthly',
    productId: 'elory_premium_monthly',
    tier: 'premium_monthly',
    name: 'Premium',
    price: '$9.99',
    pricePerMonth: '$9.99',
    billing: 'per month',
    features: [
      'AI Chat — ask your stack anything',
      'Stack Synergy Engine',
      'Chrono-Stack Protocols',
      'Exposure Load Tracking',
      'Unlimited stack',
      'Goal-based filtering',
      'Export & share reports',
      'Full scan history & comparison',
    ],
    popular: true,
  },
  {
    id: 'premium_annual',
    productId: 'elory_premium_annual',
    tier: 'premium_annual',
    name: 'Premium Annual',
    price: '$63.99',
    pricePerMonth: '$5.33',
    billing: 'per year',
    features: [
      'Everything in Premium',
      'Early access to new features',
    ],
    savings: 'Save $56/year',
  },
];

// Icons
function CrownIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CheckIcon({ size = 16, color = Colors.accentHill }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function openSubscriptionManagement() {
  if (Platform.OS === 'ios') {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<string>('premium_monthly');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Mock current subscription — replace with RevenueCat
  const currentTier: SubscriptionTier = 'free';
  const isPremium = currentTier !== 'free';

  const handlePurchase = async (planId: string) => {
    if (!isSignedIn) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to subscribe to Elory Premium.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => router.push('/auth') },
        ]
      );
      return;
    }

    setPurchasing(true);

    try {
      // TODO: Integrate with RevenueCat
      // const purchaseResult = await Purchases.purchaseProduct(plan.productId);
      // if (purchaseResult.customerInfo.entitlements.active['premium']) {
      //   // Success
      // }

      // Mock purchase flow
      await new Promise(resolve => setTimeout(resolve, 1500));

      Alert.alert(
        'Purchase Successful',
        'Welcome to Elory Premium! Enjoy unlimited access.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      Alert.alert(
        'Purchase Failed',
        'There was an error processing your purchase. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);

    try {
      // TODO: Integrate with RevenueCat
      // const customerInfo = await Purchases.restorePurchases();
      // if (customerInfo.entitlements.active['premium']) {
      //   Alert.alert('Restored!', 'Your subscription has been restored.');
      // }

      // Mock restore flow
      await new Promise(resolve => setTimeout(resolve, 1000));

      Alert.alert(
        'Restore Complete',
        'No previous purchases found.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert(
        'Restore Failed',
        'There was an error restoring your purchases. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={styles.pageTitle}>Subscription</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconContainer}>
            <CrownIcon size={32} color={Colors.ink} />
          </View>
          <Text style={styles.heroTitle}>Your Health Intelligence</Text>
          <Text style={styles.heroSubtitle}>
            AI Chat, Stack Synergy Engine, and clinical evidence — all in one place
          </Text>
        </View>

        {/* Free tier summary */}
        <View style={styles.freeSummary}>
          <Text style={styles.freeSummaryLabel}>Free — always included</Text>
          <Text style={styles.freeSummaryText}>Unlimited scans · Full ingredient data · Domain signals (read-only) · Stack up to 10 items · Basic flagging</Text>
        </View>

        {/* Plans */}
        <View style={styles.plansSection}>
          <Text style={styles.sectionLabel}>Unlock Premium</Text>

          {SUBSCRIPTION_PLANS.map((plan) => (
            <Pressable
              key={plan.id}
              style={[
                styles.planCard,
                selectedPlan === plan.id && styles.planCardSelected,
                plan.popular && styles.planCardPopular,
              ]}
              onPress={() => setSelectedPlan(plan.id)}
            >
              {plan.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>Most Popular</Text>
                </View>
              )}
              {plan.savings && (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsBadgeText}>{plan.savings}</Text>
                </View>
              )}

              <View style={styles.planHeader}>
                <View style={styles.planRadio}>
                  {selectedPlan === plan.id && <View style={styles.planRadioInner} />}
                </View>
                <View style={styles.planInfo}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planBilling}>{plan.billing}</Text>
                </View>
                <View style={styles.planPricing}>
                  <Text style={styles.planPrice}>{plan.price}</Text>
                  {plan.pricePerMonth !== plan.price && (
                    <Text style={styles.planPricePerMonth}>
                      {plan.pricePerMonth}/mo
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.planFeatures}>
                {plan.features.map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <CheckIcon />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          ))}
        </View>

        {/* Subscribe Button */}
        <Pressable
          style={[styles.subscribeBtn, purchasing && styles.subscribeBtnDisabled]}
          onPress={() => handlePurchase(selectedPlan)}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color={Colors.bone} />
          ) : (
            <>
              <CrownIcon size={18} color={Colors.bone} />
              <Text style={styles.subscribeBtnText}>
                Subscribe Now
              </Text>
            </>
          )}
        </Pressable>

        {/* Restore Purchases */}
        <Pressable
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={restoring}
        >
          <Text style={styles.restoreBtnText}>
            {restoring ? 'Restoring...' : 'Restore Purchases'}
          </Text>
        </Pressable>

        {/* Current Subscription (if premium) */}
        {isPremium && (
          <View style={styles.currentPlanSection}>
            <Text style={styles.sectionLabel}>Current Plan</Text>
            <View style={styles.currentPlanCard}>
              <View style={styles.currentPlanHeader}>
                <CrownIcon size={20} color={Colors.accentHill} />
                <Text style={styles.currentPlanName}>
                  {SUBSCRIPTION_PLANS.find(p => p.tier === currentTier)?.name || 'Premium'}
                </Text>
              </View>
              <Text style={styles.currentPlanStatus}>Active</Text>
              <Pressable
                style={styles.managePlanBtn}
                onPress={openSubscriptionManagement}
              >
                <Text style={styles.managePlanBtnText}>
                  Manage Subscription
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Terms & Conditions */}
        <View style={styles.termsSection}>
          <Text style={styles.termsText}>
            Payment will be charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account
            at confirmation of purchase. Subscription automatically renews unless auto-renew is
            turned off at least 24 hours before the end of the current period. Your account will
            be charged for renewal within 24 hours prior to the end of the current period.
          </Text>
          <View style={styles.termsLinks}>
            <Pressable>
              <Text style={styles.termsLink}>Terms of Service</Text>
            </Pressable>
            <Text style={styles.termsSeparator}>•</Text>
            <Pressable>
              <Text style={styles.termsLink}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
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
  backBtnIcon: {
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginTop: -2,
  },
  pageTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    fontWeight: '500',
    color: Colors.ink,
  },
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: verticalScale(40),
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  heroIconContainer: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    backgroundColor: Colors.boneDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  heroTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.5,
    maxWidth: scale(300),
  },
  freeSummary: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  freeSummaryLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkTertiary,
    marginBottom: 4,
  },
  freeSummaryText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
  },
  plansSection: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: Colors.inkSecondary,
    marginBottom: Spacing.md,
  },
  planCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelected: {
    borderColor: Colors.ink,
    borderWidth: 2,
  },
  planCardPopular: {
    backgroundColor: Colors.boneCard,
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomLeftRadius: Radius.md,
  },
  popularBadgeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  savingsBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.accentHill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomLeftRadius: Radius.md,
  },
  savingsBadgeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  planRadio: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(11),
    borderWidth: 2,
    borderColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  planRadioInner: {
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: Colors.ink,
  },
  planInfo: {
    flex: 1,
  },
  planName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
    marginBottom: 2,
  },
  planBilling: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  planPricing: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
  },
  planPricePerMonth: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  planFeatures: {
    paddingLeft: scale(34),
    gap: Spacing.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.pill,
    marginBottom: Spacing.md,
  },
  subscribeBtnDisabled: {
    opacity: 0.7,
  },
  subscribeBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    fontWeight: '600',
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  restoreBtn: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  restoreBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    textDecorationLine: 'underline',
  },
  currentPlanSection: {
    marginBottom: Spacing.xl,
  },
  currentPlanCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.accentHill,
    borderRadius: Radius.md,
    padding: Spacing.lg,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  currentPlanName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
  },
  currentPlanStatus: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentHill,
    marginBottom: Spacing.md,
  },
  managePlanBtn: {
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  managePlanBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    fontWeight: '500',
    color: Colors.ink,
  },
  termsSection: {
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderHairline,
  },
  termsText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    lineHeight: FontSizes.caption * 1.5,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  termsLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  termsLink: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    textDecorationLine: 'underline',
  },
  termsSeparator: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
});
