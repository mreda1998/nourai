import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
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
import { api, type UserHealthProfile } from '@/services/api';

// ─── Label maps (mirrors onboarding + edit-profile screens) ─────────────────

const CONCERN_LABELS: Record<string, string> = {
  fertility:             'Trying to Conceive',
  thyroid:               'Thyroid Condition',
  hormonal_condition:    'Hormone-Sensitive',
  medications:           'On Medications',
  infant_proximity:      'Near Young Children',
  fragrance_sensitivity: 'Fragrance Sensitivity',
  atopic_dermatitis:     'Eczema / Atopic Dermatitis',
};

const GOAL_LABELS: Record<string, string> = {
  clear_skin:        'Clear Skin',
  anti_aging:        'Anti-Aging',
  brighter_skin:     'Brighter Skin',
  hair_growth:       'Hair Growth',
  prevent_hair_loss: 'Prevent Hair Loss',
  build_muscle:      'Build Muscle',
  fat_loss:          'Fat Loss',
  more_energy:       'More Energy',
  gut_health:        'Gut Health',
  less_inflammation: 'Less Inflammation',
  mental_focus:      'Mental Focus',
};

const FOCUS_LABELS: Record<string, string> = {
  skin:        'Skin',
  performance: 'Performance',
  gut:         'Gut',
  hormonal:    'Hormonal',
  hair:        'Hair',
  wellness:    'Wellness',
};

// Subscription tier type
type SubscriptionTier = 'free' | 'premium_monthly' | 'premium_annual';

interface SubscriptionInfo {
  tier: SubscriptionTier;
  expiresAt: string | null;
}

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// ─── Icons ─────────────────────────────────────────────────────────────────

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

// Health Profile Icons
function SkinIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Circle cx="12" cy="8" r="4" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 20v-1a6 6 0 0112 0v1" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GutIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path d="M12 3c2 0 4 1.5 4 3.5S13 10 13 12s3 2.5 3 4.5-2 3-4 3-4-1-4-3 3-2.5 3-4.5S8 6.5 8 4.5C8 2.5 10 3 12 3z" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FitnessIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HairIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path d="M12 2c-2 0-4 1-4 4 0 2 1 3 1 5s-2 3-2 5c0 3 2 5 5 6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 2c2 0 4 1 4 4 0 2-1 3-1 5s2 3 2 5c0 3-2 5-5 6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 2v20" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HormonalIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function SleepIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Settings Icons
function AccountIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CameraIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="13" r="4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BellIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShieldIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function InfoIcon({ size = 20, color = Colors.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5}>
      <Circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

type IconProps = { size?: number; color?: string };

const HEALTH_PROFILES: {
  id: string;
  name: string;
  Icon: (props: IconProps) => JSX.Element;
  description: string;
  route: string;
  color: string;
}[] = [
  {
    id: 'skin',
    name: 'Skin Health',
    Icon: SkinIcon,
    description: 'Skin type, sensitivity, and ingredient watchlist',
    route: '/profile',
    color: '#D4A574',
  },
  {
    id: 'gut',
    name: 'Gut Health',
    Icon: GutIcon,
    description: 'Digestive sensitivities and dietary preferences',
    route: '/health/gut',
    color: '#8C6A54',
  },
  {
    id: 'fitness',
    name: 'Fitness & Recovery',
    Icon: FitnessIcon,
    description: 'Activity level, recovery goals, and supplements',
    route: '/health/fitness',
    color: '#5C6E5C',
  },
  {
    id: 'hair',
    name: 'Hair & Scalp',
    Icon: HairIcon,
    description: 'Hair type, concerns, and ingredient sensitivities',
    route: '/health/hair',
    color: '#6B5B4F',
  },
  {
    id: 'hormonal',
    name: 'Hormonal Balance',
    Icon: HormonalIcon,
    description: 'Hormonal concerns and related sensitivities',
    route: '/health/hormonal',
    color: '#7A6B8A',
  },
  {
    id: 'sleep',
    name: 'Sleep & Recovery',
    Icon: SleepIcon,
    description: 'Sleep quality factors and aid preferences',
    route: '/health/sleep',
    color: '#4A5568',
  },
];

const SETTINGS_ITEMS: {
  id: string;
  name: string;
  Icon: (props: IconProps) => JSX.Element;
  route: string;
}[] = [
  { id: 'account', name: 'Account', Icon: AccountIcon, route: '/settings/account' },
  { id: 'subscription', name: 'Subscription', Icon: CrownIcon, route: '/settings/subscription' },
  { id: 'camera', name: 'Camera & Permissions', Icon: CameraIcon, route: '/settings/permissions' },
  { id: 'notifications', name: 'Notifications', Icon: BellIcon, route: '/settings/notifications' },
  { id: 'privacy', name: 'Privacy & Data', Icon: ShieldIcon, route: '/settings/privacy' },
  { id: 'about', name: 'About Elory', Icon: InfoIcon, route: '/settings/about' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSubscriptionLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case 'premium_monthly': return 'Premium';
    case 'premium_annual': return 'Premium Annual';
    default: return 'Free';
  }
}

function getSubscriptionPrice(tier: SubscriptionTier): string {
  switch (tier) {
    case 'premium_monthly': return '$9.99/month';
    case 'premium_annual': return '$63.99/year';
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
  });
  const [healthProfile, setHealthProfile] = useState<UserHealthProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      const loadProfileData = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;

          const [sub, profile] = await Promise.allSettled([
            api.getSubscription(session.access_token),
            api.getHealthProfile(session.access_token),
          ]);

          if (sub.status === 'fulfilled') {
            setSubscription({
              tier: sub.value.tier,
              expiresAt: sub.value.expires_at ?? null,
            });
          }

          if (profile.status === 'fulfilled') {
            setHealthProfile(profile.value);
          }
        } catch {
          // Keep defaults if API is unreachable
        }
      };
      loadProfileData();
    }, [])
  );

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
        {/* Header */}
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
                <CrownIcon size={14} color={Colors.bone} />
              ) : null}
              <Text style={styles.subscriptionTierText}>
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
              <View style={styles.freeIncludes}>
                {['Unlimited scans', 'Full ingredient data', 'Stack up to 10 items'].map((f) => (
                  <View key={f} style={styles.featureItem}>
                    <CheckIcon size={14} color={Colors.inkTertiary} />
                    <Text style={styles.freeFeatureText}>{f}</Text>
                  </View>
                ))}
              </View>

              <Pressable style={styles.upgradeBtn} onPress={handleUpgrade}>
                <CrownIcon size={16} color={Colors.bone} />
                <Text style={styles.upgradeBtnText}>Upgrade to Premium</Text>
              </Pressable>

              <View style={styles.premiumFeatures}>
                <Text style={styles.premiumFeaturesLabel}>Premium unlocks</Text>
                {[
                  'AI Chat — ask your stack anything',
                  'Stack Synergy Engine',
                  'Chrono-Stack Protocols',
                  'Exposure Load Tracking',
                  'Goal-based filtering',
                  'Export & share reports',
                ].map((f) => (
                  <View key={f} style={styles.featureItem}>
                    <CheckIcon size={14} />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.subscriptionPriceLabel}>
                {getSubscriptionPrice(subscription.tier)}
              </Text>
              <Pressable
                style={styles.manageSubscriptionBtn}
                onPress={openSubscriptionManagement}
              >
                <Text style={styles.manageSubscriptionBtnText}>Manage Subscription</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Onboarding Profile Summary */}
        {isSignedIn && healthProfile && (
          <View style={styles.profileSummaryCard}>
            <View style={styles.profileSummaryHeader}>
              <Text style={styles.profileSummaryTitle}>Your Health Profile</Text>
              <Pressable onPress={() => router.push('/health/edit-profile' as any)}>
                <Text style={styles.profileSummaryEdit}>Edit</Text>
              </Pressable>
            </View>

            {healthProfile.focus_areas.length > 0 && (
              <View style={styles.profileSummaryRow}>
                <Text style={styles.profileSummaryLabel}>Focus Areas</Text>
                <View style={styles.profileSummaryTags}>
                  {healthProfile.focus_areas.map((f) => (
                    <View key={f} style={styles.profileSummaryTag}>
                      <Text style={styles.profileSummaryTagText}>
                        {FOCUS_LABELS[f] ?? f}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {healthProfile.health_concerns.length > 0 && (
              <View style={styles.profileSummaryRow}>
                <Text style={styles.profileSummaryLabel}>Concerns</Text>
                <View style={styles.profileSummaryTags}>
                  {healthProfile.health_concerns.map((c) => (
                    <View key={c} style={styles.profileSummaryTag}>
                      <Text style={styles.profileSummaryTagText}>
                        {CONCERN_LABELS[c] ?? c}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {healthProfile.health_goals.length > 0 && (
              <View style={styles.profileSummaryRow}>
                <Text style={styles.profileSummaryLabel}>Goals</Text>
                <View style={styles.profileSummaryTags}>
                  {healthProfile.health_goals.map((g) => (
                    <View key={g} style={styles.profileSummaryTag}>
                      <Text style={styles.profileSummaryTagText}>
                        {GOAL_LABELS[g] ?? g}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {healthProfile.focus_areas.length === 0 &&
              healthProfile.health_concerns.length === 0 &&
              healthProfile.health_goals.length === 0 && (
              <Text style={styles.profileSummaryEmpty}>
                Tap Edit to set your health concerns and goals.
              </Text>
            )}
          </View>
        )}

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
                    <profile.Icon size={20} color={profile.color} />
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
                  <View style={styles.settingsIconWrap}>
                    <item.Icon size={18} color={Colors.inkSecondary} />
                  </View>
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
        <Text style={styles.version}>elory v{APP_VERSION}</Text>
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
  subscriptionTierText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subscriptionExpiry: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
  subscriptionPriceLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginBottom: Spacing.md,
  },
  freeIncludes: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  freeFeatureText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
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
  premiumFeaturesLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkTertiary,
    marginBottom: 4,
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
  profileSummaryCard: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  profileSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  profileSummaryTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkSecondary,
  },
  profileSummaryEdit: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    textDecorationLine: 'underline',
  },
  profileSummaryEmpty: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
    fontStyle: 'italic',
  },
  profileSummaryRow: {
    gap: Spacing.xs,
  },
  profileSummaryLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkTertiary,
  },
  profileSummaryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  profileSummaryTag: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.bone,
  },
  profileSummaryTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    textTransform: 'capitalize',
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
  settingsIconWrap: {
    width: scale(24),
    height: scale(24),
    justifyContent: 'center',
    alignItems: 'center',
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
