import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { RadarChart } from 'react-native-gifted-charts';

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
import { useAppState, type Product } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import ProductListItem from '@/components/ProductListItem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RADAR_SIZE = SCREEN_WIDTH - Layout.screenPaddingHorizontal * 2 - Spacing.md * 2;

// ─── Domain configuration ────────────────────────────────────────────────────

const DOMAINS = [
  'Gut Health',
  'Skin',
  'Metabolism',
  'Sleep & Recovery',
  'Cognition',
  'Exposure Load',
] as const;

type Domain = typeof DOMAINS[number];

const DOMAIN_SHORT_LABELS = ['Gut', 'Skin', 'Metab.', 'Sleep', 'Mind', 'Exposure'];

// How relevant each product category is to each domain (0–1)
const DOMAIN_RELEVANCE: Record<Domain, Record<string, number>> = {
  'Gut Health':       { food: 1.0, supplement: 0.6, cosmetic: 0.0, otc: 0.3 },
  'Skin':             { food: 0.3, supplement: 0.5, cosmetic: 1.0, otc: 0.2 },
  'Metabolism':       { food: 0.9, supplement: 0.6, cosmetic: 0.0, otc: 0.3 },
  'Sleep & Recovery': { food: 0.2, supplement: 0.8, cosmetic: 0.0, otc: 0.7 },
  'Cognition':        { food: 0.3, supplement: 0.7, cosmetic: 0.0, otc: 0.2 },
  'Exposure Load':    { food: 0.8, supplement: 0.5, cosmetic: 0.9, otc: 0.7 },
};

// Returns 0-100 score per domain.
// For Exposure Load: high score = clean (low exposure).
function computeRadarScores(stack: Product[]): number[] {
  return DOMAINS.map((domain) => {
    const isExposure = domain === 'Exposure Load';
    let beneficial = 0, moderate = 0, mixed = 0, caution = 0;

    stack.forEach((product) => {
      const relevance = DOMAIN_RELEVANCE[domain]?.[product.category] ?? 0;
      if (relevance === 0) return;

      if (isExposure) {
        if (product.grade === 'D' && relevance >= 0.5) caution++;
        else if (product.grade === 'C' && relevance >= 0.5) mixed++;
      } else {
        if (product.grade === 'A') relevance >= 0.8 ? beneficial++ : moderate++;
        else if (product.grade === 'B') relevance >= 0.8 ? moderate++ : mixed++;
        else if (product.grade === 'C') mixed++;
        else if (product.grade === 'D') caution++;
      }
    });

    if (isExposure) {
      return Math.max(10, 90 - caution * 35 - mixed * 15);
    }
    return Math.max(5, Math.min(95, 50 + beneficial * 20 + moderate * 10 - mixed * 8 - caution * 20));
  });
}

function scoreColor(score: number) {
  if (score >= 70) return Colors.accentHill;
  if (score >= 40) return Colors.inkSecondary;
  return Colors.accentAlert;
}

// ─── Goal → Domain mapping ───────────────────────────────────────────────────

const GOAL_TO_DOMAIN: Record<string, Domain> = {
  clear_skin:        'Skin',
  anti_aging:        'Skin',
  brighter_skin:     'Skin',
  hair_growth:       'Skin',
  prevent_hair_loss: 'Skin',
  build_muscle:      'Metabolism',
  fat_loss:          'Metabolism',
  more_energy:       'Metabolism',
  gut_health:        'Gut Health',
  less_inflammation: 'Gut Health',
  mental_focus:      'Cognition',
};

const GOAL_LABELS: Record<string, string> = {
  clear_skin:        'Clear Skin',
  anti_aging:        'Anti-Aging',
  brighter_skin:     'Brighter Skin',
  hair_growth:       'Hair Growth',
  prevent_hair_loss: 'Hair Loss',
  build_muscle:      'Build Muscle',
  fat_loss:          'Fat Loss',
  more_energy:       'More Energy',
  gut_health:        'Gut Health',
  less_inflammation: 'Inflammation',
  mental_focus:      'Mental Focus',
};

// ─── Protocol slots ──────────────────────────────────────────────────────────

const CATEGORY_SLOT: Record<string, string> = {
  food:       'Nutrition',
  supplement: 'Supplements',
  cosmetic:   'Topical',
  otc:        'Treatment',
};

// ─── Goal alignment row ──────────────────────────────────────────────────────

function GoalAlignmentRow({
  goalId,
  radarScores,
}: {
  goalId: string;
  radarScores: number[];
}) {
  const label = GOAL_LABELS[goalId] ?? goalId;
  const domain = GOAL_TO_DOMAIN[goalId];
  const domainIndex = domain ? DOMAINS.indexOf(domain) : -1;
  const score = domainIndex >= 0 ? radarScores[domainIndex] : 50;

  const coverage = score >= 70 ? 'aligned' : score >= 40 ? 'partial' : 'gap';
  const coverageStyle = {
    aligned: { dot: Colors.accentHill, text: 'Aligned' },
    partial:  { dot: Colors.accentClay, text: 'Partial' },
    gap:      { dot: Colors.boneDark, text: 'Gap' },
  }[coverage];

  return (
    <View style={styles.goalRow}>
      <View style={[styles.goalDot, { backgroundColor: coverageStyle.dot }]} />
      <Text style={styles.goalLabel}>{label}</Text>
      <Text style={[styles.goalStatus, coverage === 'gap' && styles.goalStatusGap]}>
        {coverageStyle.text}
      </Text>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function StackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stack, removeFromStack } = useAppState();
  const { onboardingProfile } = useAuth();

  const radarScores = useMemo(() => computeRadarScores(stack), [stack]);
  const goals = onboardingProfile?.goals ?? [];
  const hasGoals = goals.length > 0;

  // Group stack by protocol slot
  const slotGroups = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    stack.forEach((p) => {
      const slot = CATEGORY_SLOT[p.category] ?? 'Other';
      if (!groups[slot]) groups[slot] = [];
      groups[slot].push(p);
    });
    return Object.entries(groups);
  }, [stack]);

  // Overlap detection: ingredient names that appear in >1 product
  const overlapIngredients = useMemo(() => {
    const counts: Record<string, number> = {};
    stack.forEach((p) => {
      p.ingredients.forEach((ing) => {
        const key = ing.toLowerCase().trim();
        counts[key] = (counts[key] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .filter(([, c]) => c > 1)
      .map(([name]) => name)
      .slice(0, 4);
  }, [stack]);

  if (stack.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={[styles.emptyContainer, { paddingTop: insets.top + Spacing.xxl }]}>
          <Animated.View entering={FadeIn.duration(600)}>
            <Text style={styles.emptyTitle}>Your stack is empty</Text>
            <Text style={styles.emptyBody}>
              Scan a product to start building your composition view.
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/scan')}>
              <Text style={styles.emptyBtnText}>Start Scanning</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }

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
          <View>
            <Text style={styles.overline}>Composition View</Text>
            <Text style={styles.title}>Stack</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countText}>{stack.length}</Text>
          </View>
        </View>

        {/* ── Domain Fingerprint ─────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Domain Fingerprint</Text>
            <Text style={styles.sectionHint}>evidence signal</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.radarContainer}>
              <RadarChart
                data={radarScores}
                labels={DOMAIN_SHORT_LABELS}
                maxValue={100}
                noOfSections={4}
                chartSize={RADAR_SIZE - Spacing.md * 2}
                isAnimated
                polygonConfig={{
                  fill: Colors.ink,
                  opacity: 0.08,
                  stroke: Colors.ink,
                  strokeWidth: 1.5,
                }}
                gridConfig={{
                  stroke: Colors.borderHairline,
                  strokeWidth: 1,
                  fill: 'transparent',
                }}
                asterLinesConfig={{
                  stroke: Colors.borderHairline,
                  strokeWidth: 1,
                }}
                labelConfig={{
                  fontSize: 11,
                  stroke: Colors.inkSecondary,
                  fontFamily: Fonts.sans,
                }}
              />
            </View>
            {/* Domain score rows */}
            {DOMAINS.map((domain, i) => {
              const score = radarScores[i];
              const isExposure = domain === 'Exposure Load';
              const label = isExposure
                ? score >= 75 ? 'Clean' : score >= 45 ? 'Some flags' : 'Caution'
                : score >= 70 ? 'Supporting' : score >= 40 ? 'Neutral' : 'Watch';
              return (
                <View
                  key={domain}
                  style={[styles.scoreRow, i < DOMAINS.length - 1 && styles.scoreRowBorder]}
                >
                  <Text style={styles.scoreRowDomain}>{domain}</Text>
                  <View style={styles.scoreBarTrack}>
                    <View
                      style={[
                        styles.scoreBarFill,
                        {
                          width: `${score}%`,
                          backgroundColor: scoreColor(score),
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.scoreRowLabel, { color: scoreColor(score) }]}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* ── Goal Alignment ─────────────────────────────────────────────── */}
        {hasGoals && (
          <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Goal Alignment</Text>
            </View>
            <View style={styles.card}>
              {goals.map((goalId, i) => (
                <View
                  key={goalId}
                  style={[
                    styles.goalRowWrap,
                    i < goals.length - 1 && styles.goalRowBorder,
                  ]}
                >
                  <GoalAlignmentRow goalId={goalId} radarScores={radarScores} />
                </View>
              ))}
            </View>
            <Text style={styles.goalNote}>
              Alignment is based on category-level evidence. Tap an ingredient for study-level detail.
            </Text>
          </Animated.View>
        )}

        {/* ── Ingredient Overlap ─────────────────────────────────────────── */}
        {overlapIngredients.length > 0 && (
          <Animated.View entering={FadeInUp.duration(400).delay(160)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Overlap Detected</Text>
            </View>
            <View style={[styles.card, styles.overlapCard]}>
              <Text style={styles.overlapBody}>
                These ingredients appear in multiple products — monitor combined intake:
              </Text>
              <View style={styles.overlapTags}>
                {overlapIngredients.map((ing) => (
                  <View key={ing} style={styles.overlapTag}>
                    <Text style={styles.overlapTagText}>{ing}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Protocol / Product List ────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.duration(400).delay(220)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Your Protocol</Text>
          </View>
          {slotGroups.map(([slot, products]) => (
            <View key={slot} style={styles.slotGroup}>
              <View style={styles.slotHeader}>
                <Text style={styles.slotLabel}>{slot}</Text>
                <View style={styles.slotLine} />
              </View>
              {products.map((product) => (
                <View key={product.id} style={styles.protocolRow}>
                  <View style={styles.protocolRowItem}>
                    <ProductListItem
                      id={product.id}
                      name={product.name}
                      brand={product.brand}
                      category={product.category}
                      grade={product.grade}
                      onPress={() => router.push(`/product/${product.id}`)}
                    />
                  </View>
                  <Pressable
                    onPress={() => removeFromStack(product.id)}
                    style={styles.removeBtn}
                    hitSlop={8}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </Animated.View>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  container: {
    paddingBottom: Layout.bottomPadding,
  },

  // ── Empty state
  emptyContainer: {
    flex: 1,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  emptyBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.6,
    marginBottom: Spacing.xl,
  },
  emptyBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  emptyBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // ── Header
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  overline: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.inkSecondary,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  countPill: {
    paddingHorizontal: scale(12),
    paddingVertical: scale(5),
    backgroundColor: Colors.boneDark,
    borderRadius: Radius.pill,
  },
  countText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
  },

  // ── Section
  section: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.ink,
  },
  sectionHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },

  // ── Radar chart
  radarContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },

  // ── Score rows
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: scale(11),
    gap: Spacing.sm,
  },
  scoreRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  scoreRowDomain: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.ink,
    width: scale(100),
  },
  scoreBarTrack: {
    flex: 1,
    height: scale(4),
    backgroundColor: Colors.boneDark,
    borderRadius: scale(2),
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: scale(2),
  },
  scoreRowLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    width: scale(72),
    textAlign: 'right',
  },

  // ── Goal alignment
  goalRowWrap: {},
  goalRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: scale(12),
    gap: Spacing.sm,
  },
  goalDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  goalLabel: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  goalStatus: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.accentHill,
  },
  goalStatusGap: {
    color: Colors.inkTertiary,
  },
  goalNote: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
    marginTop: Spacing.sm,
    lineHeight: FontSizes.xs * 1.6,
    paddingHorizontal: Spacing.xs,
  },

  // ── Overlap card
  overlapCard: {
    padding: Spacing.md,
  },
  overlapBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
    marginBottom: Spacing.sm,
  },
  overlapTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  overlapTag: {
    paddingVertical: scale(5),
    paddingHorizontal: scale(10),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(163, 78, 78, 0.3)',
    backgroundColor: 'rgba(163, 78, 78, 0.06)',
  },
  overlapTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.accentAlert,
    textTransform: 'capitalize',
  },

  // ── Protocol groups
  slotGroup: {
    marginBottom: Spacing.lg,
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  slotLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.inkTertiary,
  },
  slotLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderHairline,
  },
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  protocolRowItem: {
    flex: 1,
  },
  removeBtn: {
    width: scale(32),
    height: scale(32),
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.xs,
  },
  removeBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
});
