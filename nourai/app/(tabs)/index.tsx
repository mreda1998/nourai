import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  Layout,
  scale,
  verticalScale,
  TextStyles,
} from '@/constants/theme';
import { useAppState } from '@/context/app-state';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Clinical categories for first-time users
const CATEGORIES = [
  { id: 'gut', icon: 'G', name: 'Gut Health' },
  { id: 'skin', icon: 'S', name: 'Dermal Care' },
  { id: 'meta', icon: 'M', name: 'Metabolics' },
  { id: 'rest', icon: 'R', name: 'Circadian' },
];

function getTrendArrow(trend: string): string {
  switch (trend) {
    case 'up': return '\u2197';
    case 'down': return '\u2198';
    default: return '\u2192';
  }
}

function getGradeStyle(grade: string): { bg: string; text: string } {
  switch (grade) {
    case 'A': return { bg: Colors.accentHill, text: Colors.bone };
    case 'B': return { bg: 'transparent', text: Colors.ink };
    default: return { bg: 'transparent', text: Colors.inkTertiary };
  }
}

function PressableScale({ children, style, ...props }: React.ComponentProps<typeof Pressable>) {
  const pressScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      style={[animatedStyle, style]}
      onPressIn={() => { pressScale.value = withSpring(0.97, { damping: 15, stiffness: 200 }); }}
      onPressOut={() => { pressScale.value = withSpring(1, { damping: 15, stiffness: 200 }); }}
    >
      {children}
    </AnimatedPressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasScannedBefore, biosignals, stack } = useAppState();

  // First-time user experience
  if (!hasScannedBefore) {
    return (
      <View className="flex-1 bg-bone">
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + Spacing.lg },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
            <Text className="font-serif-italic text-ink" style={{ fontSize: FontSizes.display, letterSpacing: 1 }}>Elory.</Text>
            <Pressable onPress={() => router.push('/profile-hub')}>
              <Text className="font-sans-semibold uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1, color: Colors.inkSecondary }}>Profile</Text>
            </Pressable>
          </Animated.View>

          {/* Hero Arch Card */}
          <Animated.View entering={FadeInUp.duration(600).delay(100)} style={styles.heroSection}>
            <View style={styles.archCard}>
              {/* Subtle noise texture overlay */}
              <View style={styles.archCardTexture} />
              <Text style={styles.heroTitle}>
                Truth in{'\n'}Composition
              </Text>
              <Text style={styles.heroPhilosophy}>
                Demystifying labels through the lens of rigorous clinical data and biological impact.
              </Text>
              <PressableScale
                style={styles.scanCta}
                onPress={() => router.push('/(tabs)/scan')}
              >
                <View style={styles.scanCtaIcon}>
                  {/* Corner brackets */}
                  <View style={[styles.scanCorner, styles.scanCornerTL]} />
                  <View style={[styles.scanCorner, styles.scanCornerTR]} />
                  <View style={[styles.scanCorner, styles.scanCornerBL]} />
                  <View style={[styles.scanCorner, styles.scanCornerBR]} />
                  {/* Scan line */}
                  <View style={styles.scanCtaIconLine} />
                </View>
                <Text style={styles.scanCtaText}>Start Scanning</Text>
              </PressableScale>
            </View>
          </Animated.View>

          {/* Clinical Categories */}
          <View style={styles.categoriesSection}>
            <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.sectionHeader}>
              <Text className="font-sans-semibold uppercase text-ink" style={{ fontSize: FontSizes.sm, letterSpacing: 1.2 }}>Clinical Categories</Text>
              <Text className="font-sans uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1, color: Colors.inkSecondary }}>View All</Text>
            </Animated.View>

            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat, index) => (
                <Animated.View
                  key={cat.id}
                  entering={FadeInDown.duration(400).delay(400 + index * 100)}
                >
                  <PressableScale style={styles.categoryItem}>
                    <View style={styles.categoryIcon}>
                      <Text style={styles.categoryIconText}>{cat.icon}</Text>
                    </View>
                    <Text style={styles.categoryName}>{cat.name}</Text>
                  </PressableScale>
                </Animated.View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // Returning user with scans - show biosignals
  return (
    <View className="flex-1 bg-bone">
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
          <View>
            <Text className="font-sans-semibold uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1.5, color: Colors.inkSecondary, marginBottom: Spacing.xs }}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            <Text className="font-serif text-ink" style={{ fontSize: FontSizes.display }}>Biosignals</Text>
          </View>
          <Pressable onPress={() => router.push('/profile-hub')}>
            <Text className="font-sans-semibold uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1, color: Colors.inkSecondary }}>Profile</Text>
          </Pressable>
        </Animated.View>

        {/* Biosignal Cards */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.biosignalScroll}
          snapToInterval={scale(140)}
          decelerationRate="fast"
        >
          {biosignals.map((signal, index) => (
            <Animated.View
              key={signal.id}
              entering={FadeInRight.duration(400).delay(100 + index * 100)}
            >
              <PressableScale style={styles.biosignalCard}>
                <View style={[styles.biosignalIndicator, { backgroundColor: signal.color }]} />
                <Text className="font-sans-medium text-ink uppercase" style={{ fontSize: FontSizes.body, letterSpacing: 0.5 }}>{signal.label}</Text>
                <View style={styles.biosignalScoreContainer}>
                  <Text style={styles.biosignalScore}>
                    {signal.score}
                    <Text style={[styles.biosignalTrend, { color: signal.color }]}>
                      {getTrendArrow(signal.trend)}
                    </Text>
                  </Text>
                  <View style={styles.biosignalContributors}>
                    {signal.contributors.map((contrib, idx) => (
                      <Text key={idx} style={styles.biosignalContributor}>{contrib}</Text>
                    ))}
                  </View>
                </View>
              </PressableScale>
            </Animated.View>
          ))}
        </ScrollView>

        {/* Daily Stack */}
        <View style={styles.stackSection}>
          <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.sectionHeader}>
            <Text className="font-sans-semibold uppercase text-ink" style={{ fontSize: FontSizes.sm, letterSpacing: 1.2 }}>Daily Stack</Text>
            <Text className="font-sans uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1, color: Colors.inkSecondary }}>Edit</Text>
          </Animated.View>

          {stack.length === 0 ? (
            <Animated.View entering={FadeInUp.duration(400).delay(400)} style={styles.emptyStack}>
              <Text style={styles.emptyStackText}>No products in your stack</Text>
              <PressableScale
                className="bg-ink px-lg py-sm rounded-pill"
                onPress={() => router.push('/(tabs)/scan')}
              >
                <Text className="font-sans-semibold text-bone uppercase" style={{ fontSize: FontSizes.body, letterSpacing: 0.5 }}>Scan a Product</Text>
              </PressableScale>
            </Animated.View>
          ) : (
            <View style={styles.stackList}>
              {stack.map((product, index) => {
                const gradeStyle = getGradeStyle(product.grade);
                return (
                  <Animated.View
                    key={product.id}
                    entering={FadeInRight.duration(400).delay(400 + index * 100)}
                  >
                    <PressableScale
                      style={styles.stackItem}
                      onPress={() => router.push(`/product/${product.id}`)}
                    >
                      <View style={styles.itemThumb} />
                      <View className="flex-1">
                        <Text className="font-sans uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1, color: Colors.inkSecondary, marginBottom: 2 }}>{product.brand}</Text>
                        <Text className="font-sans-medium text-ink" style={{ fontSize: FontSizes.bodyLarge }} numberOfLines={1}>{product.name}</Text>
                      </View>
                      <View style={[styles.gradeBadge, { backgroundColor: gradeStyle.bg }]}>
                        <Text style={[styles.gradeText, { color: gradeStyle.text }]}>
                          {product.grade}
                        </Text>
                      </View>
                    </PressableScale>
                  </Animated.View>
                );
              })}
            </View>
          )}
        </View>

        {/* Suggestion */}
        <Animated.View entering={FadeInUp.duration(400).delay(500)} style={styles.suggestionCard}>
          <Text className="font-sans-semibold uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1.2, color: Colors.inkTertiary, marginBottom: Spacing.sm }}>Suggestion</Text>
          <Text className="font-serif-italic text-ink" style={{ fontSize: FontSizes.heading - 4, lineHeight: (FontSizes.heading - 4) * 1.3 }}>
            Separate calcium & iron intake by 2 hours for optimal absorption.
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Layout.bottomPadding,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.lg,
  },

  // Hero Section (First-time user)
  heroSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
  },
  archCard: {
    backgroundColor: Colors.ink,
    borderTopLeftRadius: Radius.arch,
    borderTopRightRadius: Radius.arch,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: verticalScale(80),
    paddingBottom: verticalScale(60),
    paddingHorizontal: scale(40),
    alignItems: 'center',
    overflow: 'hidden',
  },
  archCardTexture: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.03,
    backgroundColor: Colors.bone,
  },
  heroTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.giant,
    color: Colors.bone,
    textAlign: 'center',
    lineHeight: FontSizes.giant * 1.1,
    marginBottom: Spacing.lg,
  },
  heroPhilosophy: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.title,
    color: 'rgba(233, 230, 223, 0.8)',
    textAlign: 'center',
    lineHeight: FontSizes.title * 1.5,
    maxWidth: scale(280),
    marginBottom: verticalScale(40),
  },
  scanCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bone,
    paddingVertical: scale(14),
    paddingHorizontal: scale(28),
    borderRadius: Radius.pill,
    gap: Spacing.sm,
  },
  scanCtaIcon: {
    width: scale(16),
    height: scale(16),
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCorner: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderColor: Colors.ink,
  },
  scanCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
  },
  scanCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
  },
  scanCtaIconLine: {
    width: '100%',
    height: 1.5,
    backgroundColor: Colors.ink,
  },
  scanCtaText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
  },

  // Categories (First-time user)
  categoriesSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    marginBottom: Spacing.lg,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  categoryItem: {
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderTopLeftRadius: scale(60),
    borderTopRightRadius: scale(60),
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  categoryIcon: {
    width: scale(40),
    height: scale(40),
    backgroundColor: Colors.boneDark,
    borderRadius: scale(20),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  categoryIconText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
  },
  categoryName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
    marginBottom: 4,
  },
  categoryCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.inkSecondary,
  },

  // Biosignals (Returning user)
  biosignalScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Spacing.lg,
  },
  biosignalCard: {
    minWidth: scale(130),
    height: verticalScale(160),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    padding: Spacing.md,
    marginRight: Spacing.sm,
    position: 'relative',
  },
  biosignalIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  biosignalScoreContainer: {
    marginTop: 'auto',
  },
  biosignalScore: {
    fontFamily: Fonts.sansLight,
    fontSize: scale(32),
    letterSpacing: -1,
    color: Colors.ink,
  },
  biosignalTrend: {
    fontSize: FontSizes.bodyLarge,
    marginLeft: 4,
  },
  biosignalContributors: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderHairline,
  },
  biosignalContributor: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.sm * 1.4,
  },

  // Stack Section
  stackSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
  },
  emptyStack: {
    paddingVertical: verticalScale(40),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderStyle: 'dashed',
    gap: Spacing.md,
  },
  emptyStackText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
  },
  stackList: {
    backgroundColor: Colors.borderHairline,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  stackItem: {
    backgroundColor: Colors.boneCard,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  itemThumb: {
    width: scale(48),
    height: scale(48),
    backgroundColor: Colors.boneDark,
  },
  gradeBadge: {
    width: scale(28),
    height: scale(28),
    borderWidth: 1,
    borderColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.body,
    fontWeight: '700',
  },

  // Suggestion
  suggestionCard: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
});
