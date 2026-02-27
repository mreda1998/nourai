import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, { FadeInUp } from 'react-native-reanimated';

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
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';

// Subscription tier type
type SubscriptionTier = 'free' | 'premium_monthly' | 'premium_annual' | 'family';

interface SubscriptionInfo {
  tier: SubscriptionTier;
  expiresAt: string | null;
  scansRemaining: number;
  scansPerDay: number;
}

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

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

// Health profile sections
const HEALTH_PROFILES = [
  {
    id: 'skin',
    name: 'Skin Health',
    icon: '✦',
    description: 'Skin type, sensitivity, and ingredient watchlist',
    route: '/profile',
    color: '#D4A574',
  },
  {
    id: 'gut',
    name: 'Gut Health',
    icon: '◎',
    description: 'Digestive sensitivities and dietary preferences',
    route: '/health/gut',
    color: '#8C6A54',
  },
  {
    id: 'fitness',
    name: 'Fitness & Recovery',
    icon: '△',
    description: 'Activity level, recovery goals, and supplements',
    route: '/health/fitness',
    color: '#5C6E5C',
  },
  {
    id: 'hair',
    name: 'Hair & Scalp',
    icon: '◇',
    description: 'Hair type, concerns, and ingredient sensitivities',
    route: '/health/hair',
    color: '#6B5B4F',
  },
  {
    id: 'hormonal',
    name: 'Hormonal Balance',
    icon: '○',
    description: 'Hormonal concerns and related sensitivities',
    route: '/health/hormonal',
    color: '#7A6B8A',
  },
  {
    id: 'sleep',
    name: 'Sleep & Recovery',
    icon: '◐',
    description: 'Sleep quality factors and aid preferences',
    route: '/health/sleep',
    color: '#4A5568',
  },
];

// Settings sections
const SETTINGS_ITEMS = [
  { id: 'account', name: 'Account', icon: '○', route: '/settings/account' },
  { id: 'subscription', name: 'Subscription', icon: '★', route: '/settings/subscription' },
  { id: 'camera', name: 'Camera & Permissions', icon: '◉', route: '/settings/permissions' },
  { id: 'notifications', name: 'Notifications', icon: '◆', route: '/settings/notifications' },
  { id: 'privacy', name: 'Privacy & Data', icon: '◈', route: '/settings/privacy' },
  { id: 'about', name: 'About Elory', icon: '◎', route: '/settings/about' },
];

// Subscription helpers
function getSubscriptionLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case 'premium_monthly': return 'Premium Monthly';
    case 'premium_annual': return 'Premium Annual';
    case 'family': return 'Family Plan';
    default: return 'Free';
  }
}

function getSubscriptionPrice(tier: SubscriptionTier): string {
  switch (tier) {
    case 'premium_monthly': return '$9.99/month';
    case 'premium_annual': return '$79.99/year';
    case 'family': return '$14.99/month';
    default: return 'Free';
  }
}

function isPremium(tier: SubscriptionTier): boolean {
  return tier !== 'free';
}

function openSubscriptionManagement() {
  if (Platform.OS === 'ios') {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
}

export default function ProfileHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isSignedIn, signOut } = useAuth();

  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    tier: 'free',
    expiresAt: null,
    scansRemaining: 5,
    scansPerDay: 5,
  });

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const sub = await api.getSubscription(session.access_token);
        setSubscription({
          tier: sub.tier,
          expiresAt: sub.expires_at ?? null,
          scansRemaining: sub.tier === 'free' ? 5 : -1, // -1 = unlimited
          scansPerDay: sub.tier === 'free' ? 5 : -1,
        });
      } catch {
        // Keep free-tier defaults if API is unreachable
      }
    };
    loadSubscription();
  }, []);

  const userIsPremium = isPremium(subscription.tier);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/auth');
  };

  const handleUpgrade = () => {
    router.push('/settings/subscription' as any);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Back Button */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnIcon}>‹</Text>
          </Pressable>
          <Text style={styles.pageTitle}>Profile</Text>
        </View>

        {/* User Info Card */}
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarText}>
              {isSignedIn && user ? user.name.charAt(0).toUpperCase() : 'G'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {isSignedIn && user ? user.name : 'Guest User'}
            </Text>
            <Text style={styles.userEmail}>
              {isSignedIn && user ? user.email : 'Sign in to sync your data'}
            </Text>
          </View>
          {!isSignedIn && (
            <Pressable
              style={styles.signInBtn}
              onPress={() => router.push('/auth')}
            >
              <Text style={styles.signInBtnText}>Sign In</Text>
            </Pressable>
          )}
        </View>

        {/* Subscription Card */}
        <View style={styles.subscriptionCard}>
          <View style={styles.subscriptionHeader}>
            <View style={styles.subscriptionTierBadge}>
              {userIsPremium ? (
                <CrownIcon size={16} color={Colors.bone} />
              ) : (
                <Text style={styles.subscriptionTierIcon}>◇</Text>
              )}
              <Text style={[
                styles.subscriptionTierText,
                userIsPremium && styles.subscriptionTierTextPremium,
              ]}>
                {getSubscriptionLabel(subscription.tier)}
              </Text>
            </View>
            {userIsPremium && subscription.expiresAt && (
              <Text style={styles.subscriptionExpiry}>
                Renews {new Date(subscription.expiresAt).toLocaleDateString()}
              </Text>
            )}
          </View>

          {!userIsPremium ? (
            <>
              <View style={styles.subscriptionUsage}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Daily Scans</Text>
                  <Text style={styles.usageValue}>
                    {subscription.scansRemaining}/{subscription.scansPerDay} remaining
                  </Text>
                </View>
                <View style={styles.usageBar}>
                  <View
                    style={[
                      styles.usageBarFill,
                      { width: `${(subscription.scansRemaining / subscription.scansPerDay) * 100}%` }
                    ]}
                  />
                </View>
              </View>

              <Pressable style={styles.upgradeBtn} onPress={handleUpgrade}>
                <CrownIcon size={16} color={Colors.bone} />
                <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
              </Pressable>

              <View style={styles.premiumFeatures}>
                <View style={styles.featureItem}>
                  <CheckIcon />
                  <Text style={styles.featureText}>Unlimited scans</Text>
                </View>
                <View style={styles.featureItem}>
                  <CheckIcon />
                  <Text style={styles.featureText}>Full evidence cards</Text>
                </View>
                <View style={styles.featureItem}>
                  <CheckIcon />
                  <Text style={styles.featureText}>Personalized risk alerts</Text>
                </View>
              </View>
            </>
          ) : (
            <Pressable
              style={styles.manageSubscriptionBtn}
              onPress={openSubscriptionManagement}
            >
              <Text style={styles.manageSubscriptionBtnText}>Manage Subscription</Text>
            </Pressable>
          )}
        </View>

        {/* Health Profiles Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Health Profiles</Text>
            <Text style={styles.sectionSubtitle}>
              Configure your health data for personalized insights
            </Text>
          </View>

          <View style={styles.profileGrid}>
            {HEALTH_PROFILES.map((profile, index) => (
              <Animated.View key={profile.id} entering={FadeInUp.duration(400).delay(index * 80)} style={{ width: '48.5%' }}>
                <Pressable
                  style={styles.profileCard}
                  onPress={() => router.push(profile.route as any)}
                >
                  <View style={[styles.profileIconBg, { backgroundColor: profile.color + '20' }]}>
                    <Text style={[styles.profileIcon, { color: profile.color }]}>
                      {profile.icon}
                    </Text>
                  </View>
                  <Text style={styles.profileName}>{profile.name}</Text>
                  <Text style={styles.profileDescription} numberOfLines={2}>
                    {profile.description}
                  </Text>
                  <Text style={styles.profileArrow}>→</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Settings</Text>
          </View>

          <View style={styles.settingsList}>
            {SETTINGS_ITEMS.map((item, index) => (
              <Animated.View key={item.id} entering={FadeInUp.duration(300).delay(index * 50)}>
                <Pressable
                  style={[
                    styles.settingsItem,
                    index < SETTINGS_ITEMS.length - 1 && styles.settingsItemBorder,
                  ]}
                  onPress={() => router.push(item.route as any)}
                >
                  <Text style={styles.settingsIcon}>{item.icon}</Text>
                  <Text style={styles.settingsName}>{item.name}</Text>
                  <Text style={styles.settingsArrow}>›</Text>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Sign Out Button */}
        {isSignedIn && (
          <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutBtnText}>Sign Out</Text>
          </Pressable>
        )}

        {/* App Version */}
        <Text style={styles.version}>nourai v{APP_VERSION}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  container: {
    paddingBottom: verticalScale(40),
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
    fontFamily: Fonts.serifMedium,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  userCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  userAvatar: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    backgroundColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.bone,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
    marginBottom: 2,
  },
  userEmail: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  signInBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  signInBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  subscriptionCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  subscriptionTierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  subscriptionTierIcon: {
    fontSize: FontSizes.body,
    color: Colors.bone,
  },
  subscriptionTierText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subscriptionTierTextPremium: {
    color: Colors.bone,
  },
  subscriptionExpiry: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
  subscriptionUsage: {
    marginBottom: Spacing.md,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  usageLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  usageValue: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  usageBar: {
    height: scale(6),
    backgroundColor: Colors.boneDark,
    borderRadius: scale(3),
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    backgroundColor: Colors.accentHill,
    borderRadius: scale(3),
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    marginBottom: Spacing.md,
  },
  upgradeBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  premiumFeatures: {
    gap: Spacing.xs,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  manageSubscriptionBtn: {
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  manageSubscriptionBtnText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  section: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.ink,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  profileCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: verticalScale(140),
  },
  profileIconBg: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  profileIcon: {
    fontSize: FontSizes.subtitle,
  },
  profileName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.bodyLarge,
    color: Colors.ink,
    marginBottom: 4,
  },
  profileDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.4,
    flex: 1,
  },
  profileArrow: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
    alignSelf: 'flex-end',
    marginTop: Spacing.sm,
  },
  settingsList: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  settingsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  settingsIcon: {
    fontSize: FontSizes.subtitle,
    color: Colors.inkSecondary,
    width: scale(24),
    textAlign: 'center',
  },
  settingsName: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
  },
  settingsArrow: {
    fontSize: FontSizes.heading,
    color: Colors.inkTertiary,
  },
  signOutBtn: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    borderWidth: 1,
    borderColor: Colors.accentAlert,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  signOutBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  version: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textAlign: 'center',
  },
});
