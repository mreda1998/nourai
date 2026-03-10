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
import { useAppState } from '@/context/app-state';
import ProductListItem from '@/components/ProductListItem';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function gradeToScore(grade: string): number {
  switch (grade) {
    case 'A': return 95;
    case 'B': return 80;
    case 'C': return 60;
    case 'D': return 35;
    default: return 50;
  }
}

function PressableScale({ children, style, onPress, ...props }: React.ComponentProps<typeof Pressable>) {
  const pressScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      style={[animatedStyle, style]}
      onPress={onPress}
      onPressIn={() => { pressScale.value = withSpring(0.97, { damping: 15, stiffness: 200 }); }}
      onPressOut={() => { pressScale.value = withSpring(1, { damping: 15, stiffness: 200 }); }}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Circular SVG progress ring */
function CircleProgress({ score }: { score: number }) {
  const CIRCLE_PATH = 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831';
  return (
    <View style={styles.circleWrapper}>
      {/* SVG ring rotated -90° so progress starts at top */}
      <View style={styles.circleSvgContainer}>
        <Svg width={96} height={96} viewBox="0 0 36 36" style={{ transform: [{ rotate: '-90deg' }] }}>
          {/* Track */}
          <Path
            d={CIRCLE_PATH}
            fill="none"
            stroke={Colors.boneDark}
            strokeWidth="2"
          />
          {/* Progress */}
          <Path
            d={CIRCLE_PATH}
            fill="none"
            stroke={Colors.ink}
            strokeWidth="2"
            strokeDasharray={`${score}, 100`}
            strokeLinecap="round"
          />
        </Svg>
      </View>
      {/* Score text centred over SVG */}
      <View style={styles.circleScoreOverlay} pointerEvents="none">
        <Text style={styles.circleScore}>{score}</Text>
      </View>
    </View>
  );
}

/** Daily Composite Score card */
function DailyCompositeCard({ score, domainBars }: { score: number; domainBars: { label: string; score: number }[] }) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.compositeCard}>
      {/* Card header */}
      <View style={styles.compositeHeader}>
        <Text style={styles.compositeLabel}>Daily Composite</Text>
        <Pressable>
          <Text style={styles.compositeViewReport}>View Report</Text>
        </Pressable>
      </View>

      {/* Score + bars */}
      <View style={styles.compositeBody}>
        <CircleProgress score={score} />

        {/* Bar chart breakdown */}
        <View style={styles.barsContainer}>
          {domainBars.map((d) => (
            <View key={d.label} style={styles.barRow}>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>{d.label}</Text>
                <Text style={styles.barScore}>{d.score}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${d.score}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/** Newsletter card — dark ink background */
function NewsletterCard() {
  const router = useRouter();
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.newsletterCard}>
      {/* Ambient glow orb */}
      <View style={styles.newsletterOrb} />

      {/* Label row */}
      <View style={styles.newsletterLabelRow}>
        <View style={styles.newsletterDot} />
        <Text style={styles.newsletterIssue}>Science Brief · No. 1</Text>
      </View>

      {/* Headline */}
      <Text style={styles.newsletterHeadline}>
        "Creatine monohydrate: the most evidence-backed supplement you're probably under-dosing."
      </Text>

      {/* Footer */}
      <View style={styles.newsletterFooter}>
        <View style={styles.newsletterAuthor}>
          <View style={styles.newsletterAvatar}>
            <Text style={styles.newsletterAvatarText}>MW</Text>
          </View>
          <Text style={styles.newsletterAuthorName}>Dr. Marcus Webb</Text>
        </View>

        <PressableScale
          style={styles.newsletterArrow}
          onPress={() => router.push('/newsletter/creatine')}
        >
          <Text style={styles.newsletterArrowText}>→</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasScannedBefore, stack } = useAppState();

  const compositeScore = stack.length === 0
    ? 0
    : Math.round(stack.reduce((sum, p) => sum + gradeToScore(p.grade), 0) / stack.length);

  const domainBars = [
    { label: 'Gut Health', score: Math.min(100, Math.round(compositeScore * 1.05)) },
    { label: 'Dermal', score: Math.round(compositeScore * 0.9) },
    { label: 'Metabolic', score: Math.min(100, Math.round(compositeScore * 0.97)) },
  ];

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
                  <View style={[styles.scanCorner, styles.scanCornerTL]} />
                  <View style={[styles.scanCorner, styles.scanCornerTR]} />
                  <View style={[styles.scanCorner, styles.scanCornerBL]} />
                  <View style={[styles.scanCorner, styles.scanCornerBR]} />
                  <View style={styles.scanCtaIconLine} />
                </View>
                <Text style={styles.scanCtaText}>Start Scanning</Text>
              </PressableScale>
            </View>
          </Animated.View>

          {/* Composite + Newsletter teaser for first-time users too */}
          <View style={styles.pageContent}>
            <DailyCompositeCard score={compositeScore} domainBars={domainBars} />
            <NewsletterCard />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Returning user
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
            <Text className="font-sans-semibold uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1.5, color: Colors.inkSecondary, marginBottom: 2 }}>
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            <Text className="font-serif text-ink" style={{ fontSize: FontSizes.display }}>Elory.</Text>
          </View>
          <Pressable onPress={() => router.push('/profile-hub')}>
            <Text className="font-sans-semibold uppercase" style={{ fontSize: FontSizes.sm, letterSpacing: 1, color: Colors.inkSecondary }}>Profile</Text>
          </Pressable>
        </Animated.View>

        <View style={styles.pageContent}>
          {/* Daily Composite Score */}
          <DailyCompositeCard score={compositeScore} domainBars={domainBars} />

          {/* Newsletter link */}
          <NewsletterCard />

          {/* Daily Stack */}
          <Animated.View entering={FadeInDown.duration(400).delay(300)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Today's Log</Text>
              <Text style={styles.sectionAction}>Edit</Text>
            </View>

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
              <View>
                {stack.map((product, index) => (
                  <Animated.View
                    key={product.id}
                    entering={FadeInRight.duration(400).delay(400 + index * 80)}
                  >
                    <ProductListItem
                      id={product.id}
                      name={product.name}
                      brand={product.brand}
                      category={product.category}
                      grade={product.grade}
                      onPress={() => router.push(`/product/${product.id}`)}
                    />
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: Layout.bottomPadding,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.lg,
  },

  pageContent: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    gap: Spacing.lg,
  },

  // ── Composite Score Card ────────────────────────────────────────
  compositeCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: 16,
    padding: Spacing.md,
  },
  compositeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  compositeLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkTertiary,
  },
  compositeViewReport: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ink,
    paddingBottom: 1,
  },
  compositeBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },

  // Circle progress
  circleWrapper: {
    width: scale(96),
    height: scale(96),
    position: 'relative',
    flexShrink: 0,
  },
  circleSvgContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  circleScoreOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: scale(96),
    height: scale(96),
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleScore: {
    fontFamily: Fonts.serif,
    fontSize: scale(32),
    color: Colors.ink,
    lineHeight: scale(32) * 1.1,
  },

  // Bar chart
  barsContainer: {
    flex: 1,
    gap: Spacing.sm,
  },
  barRow: {
    gap: 4,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkSecondary,
  },
  barScore: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.ink,
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.boneDark,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.ink,
    borderRadius: 3,
  },

  // ── Newsletter Card ─────────────────────────────────────────────
  newsletterCard: {
    backgroundColor: Colors.ink,
    borderRadius: 16,
    padding: Spacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  newsletterOrb: {
    position: 'absolute',
    top: -scale(20),
    right: -scale(20),
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: Colors.bone,
    opacity: 0.04,
  },
  newsletterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.md,
    opacity: 0.6,
  },
  newsletterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bone,
  },
  newsletterIssue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.bone,
  },
  newsletterHeadline: {
    fontFamily: Fonts.serifItalic,
    fontSize: scale(20),
    lineHeight: scale(20) * 1.35,
    color: Colors.bone,
    marginBottom: Spacing.md,
  },
  newsletterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newsletterAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  newsletterAvatar: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: 'rgba(233, 230, 223, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsletterAvatarText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.bone,
  },
  newsletterAuthorName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.caption,
    color: Colors.bone,
    opacity: 0.8,
  },
  newsletterArrow: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: 'rgba(233, 230, 223, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsletterArrowText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.title,
    color: Colors.bone,
    lineHeight: FontSizes.title,
  },

  // ── Section header ──────────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    marginBottom: 0,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.ink,
  },
  sectionAction: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    opacity: 0.5,
  },

  // ── Empty stack ─────────────────────────────────────────────────
  emptyStack: {
    paddingVertical: verticalScale(40),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderStyle: 'dashed',
    gap: Spacing.md,
    marginTop: 1,
  },
  emptyStackText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
  },

  // ── First-time user hero ────────────────────────────────────────
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
    top: 0, left: 0, right: 0, bottom: 0,
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
  scanCornerTL: { top: 0, left: 0, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  scanCornerTR: { top: 0, right: 0, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  scanCornerBL: { bottom: 0, left: 0, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  scanCornerBR: { bottom: 0, right: 0, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
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
});
