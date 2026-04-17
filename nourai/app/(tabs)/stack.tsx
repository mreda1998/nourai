import { useEffect, useMemo, useRef, useState } from 'react';
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
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { Swipeable } from 'react-native-gesture-handler';

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
import {
  DOMAINS,
  DOMAIN_SHORT_LABELS,
  DOMAIN_RELEVANCE,
  DOMAIN_SLUGS,
  GOAL_LABELS,
  computeRadarScores,
  domainScoreLabel,
  type Domain,
} from '@/constants/domains';
import { useAppState, type Product } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import ProductListItem from '@/components/ProductListItem';
import { StackAssistant } from '@/components/StackAssistant';
import { MealInputSheet } from '@/components/MealInputSheet';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';
import type { RecognizedFood, StackEntry } from '@/services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RADAR_SIZE = SCREEN_WIDTH - Layout.screenPaddingHorizontal * 2 - Spacing.md * 2;

function scoreColor(score: number) {
  if (score >= 70) return Colors.accentHill;
  if (score >= 40) return Colors.inkSecondary;
  return Colors.accentAlert;
}

// ─── Goal → Domain mapping ───────────────────────────────────────────────────

const GOAL_TO_DOMAIN: Record<string, Domain> = {
  clear_skin:          'Skin & Appearance',
  anti_aging:          'Skin & Appearance',
  brighter_skin:       'Skin & Appearance',
  hair_growth:         'Skin & Appearance',
  prevent_hair_loss:   'Skin & Appearance',
  build_muscle:        'Energy & Metabolism',
  fat_loss:            'Energy & Metabolism',
  more_energy:         'Energy & Metabolism',
  gut_health:          'Gut & Digestive',
  less_inflammation:   'Inflammation & Immune',
  mental_focus:        'Cognitive & Mental',
  reduce_stress:       'Cognitive & Mental',
  better_sleep:        'Sleep & Recovery',
  recovery:            'Energy & Metabolism',
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

// ─── Custom radar chart ───────────────────────────────────────────────────────

function CustomRadarChart({
  scores,
  onDomainPress,
}: {
  scores: number[];
  onDomainPress: (slug: string) => void;
}) {
  const size = RADAR_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const gridR = size * 0.28;   // outer grid ring radius
  const labelR = size * 0.44;  // label center radius
  const n = DOMAINS.length;

  const ang = (i: number) => (i * 2 * Math.PI) / n - Math.PI / 2;

  const ringPoints = (ratio: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = ang(i);
      return `${cx + gridR * ratio * Math.cos(a)},${cy + gridR * ratio * Math.sin(a)}`;
    }).join(' ');

  const dataPolyPoints = scores
    .map((s, i) => {
      const a = ang(i);
      const ratio = Math.min(s / 100, 1);
      return `${cx + gridR * ratio * Math.cos(a)},${cy + gridR * ratio * Math.sin(a)}`;
    })
    .join(' ');

  return (
    <Svg width={size} height={size}>
      {/* Grid rings at 25 / 50 / 75 / 100% */}
      {([0.25, 0.5, 0.75, 1] as const).map((level) => (
        <Polygon
          key={level}
          points={ringPoints(level)}
          fill="transparent"
          stroke={level === 1 ? Colors.borderStrong : Colors.borderHairline}
          strokeWidth={1}
        />
      ))}

      {/* Axis spokes */}
      {Array.from({ length: n }, (_, i) => {
        const a = ang(i);
        return (
          <Line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + gridR * Math.cos(a)}
            y2={cy + gridR * Math.sin(a)}
            stroke={Colors.borderHairline}
            strokeWidth={1}
          />
        );
      })}

      {/* Data polygon */}
      <Polygon
        points={dataPolyPoints}
        fill={Colors.ink}
        fillOpacity={0.1}
        stroke={Colors.ink}
        strokeWidth={1.5}
        strokeOpacity={0.5}
      />

      {/* Score dots */}
      {scores.map((s, i) => {
        const a = ang(i);
        const ratio = Math.min(s / 100, 1);
        const vx = cx + gridR * ratio * Math.cos(a);
        const vy = cy + gridR * ratio * Math.sin(a);
        return (
          <G key={i}>
            <Circle cx={vx} cy={vy} r={5} fill={scoreColor(s)} opacity={0.9} />
            <Circle cx={vx} cy={vy} r={2.5} fill={Colors.bone} />
          </G>
        );
      })}

      {/* Tappable labels */}
      {DOMAINS.map((domain, i) => {
        const a = ang(i);
        const lx = cx + labelR * Math.cos(a);
        const ly = cy + labelR * Math.sin(a);
        const slug = DOMAIN_SLUGS[domain];
        return (
          <G key={i} onPress={() => onDomainPress(slug)}>
            <SvgText
              x={lx}
              y={ly - 4}
              textAnchor="middle"
              fontSize={9}
              fontFamily={Fonts.sansSemiBold}
              fill={Colors.inkSecondary}
            >
              {DOMAIN_SHORT_LABELS[DOMAINS[i]].toUpperCase()}
            </SvgText>
            <SvgText
              x={lx}
              y={ly + 10}
              textAnchor="middle"
              fontSize={13}
              fontFamily={Fonts.mono}
              fill={scoreColor(scores[i])}
            >
              {Math.round(scores[i])}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─── Swipeable product row ────────────────────────────────────────────────────

function SwipeableProductRow({
  product,
  onPress,
  onRemove,
}: {
  product: Product;
  onPress: () => void;
  onRemove: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const renderRightAction = () => (
    <Pressable
      style={styles.deleteAction}
      onPress={() => {
        swipeRef.current?.close();
        onRemove();
      }}
    >
      <Text style={styles.deleteActionText}>Remove</Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightAction}
      rightThreshold={60}
      overshootRight={false}
    >
      <ProductListItem
        id={product.id}
        name={product.name}
        brand={product.brand}
        category={product.category}
        grade={product.grade}
        onPress={onPress}
      />
    </Swipeable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function StackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stack, meals, removeFromStack, addMeal } = useAppState();
  const { isSignedIn, onboardingProfile } = useAuth();

  const [chatVisible, setChatVisible] = useState(false);
  const [mealSheetVisible, setMealSheetVisible] = useState(false);

  // Server-synced stack entries (signed-in only).
  // entryIdMap: productId → stack entry UUID (needed for DELETE).
  const [serverEntries, setServerEntries] = useState<StackEntry[]>([]);
  const [entryIdMap, setEntryIdMap] = useState<Record<string, string>>({});

  // Hydrate entryIdMap from server when user is signed in.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    const loadServerStack = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      api.getStack(session.access_token)
        .then((entries) => {
          if (cancelled) return;
          setServerEntries(entries);
          setEntryIdMap(Object.fromEntries(entries.map((e) => [e.product_id, e.id])));
        })
        .catch(() => {
          // Non-fatal — local stack still visible
        });
    };
    loadServerStack();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  const radarScores = useMemo(() => computeRadarScores([...stack, ...meals]), [stack, meals]);

  // Wrap removeFromStack: call server when signed in, then update local state.
  const handleRemoveFromStack = async (productId: string) => {
    removeFromStack(productId); // optimistic local update first
    if (isSignedIn) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const entryId = entryIdMap[productId];
      if (entryId) {
        try {
          await api.removeFromStack(session.access_token, entryId);
        } catch {
          // Non-fatal — local state already updated optimistically
        }
      }
      // Refresh entryIdMap so future removals use fresh entry IDs.
      api.getStack(session.access_token)
        .then((entries) => {
          setServerEntries(entries);
          setEntryIdMap(Object.fromEntries(entries.map((e) => [e.product_id, e.id])));
        })
        .catch(() => {});
    }
  };

  const handleMealsConfirm = (foods: RecognizedFood[]) => {
    foods.forEach((food) => {
      addMeal({
        id: `meal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: food.name,
        brand: food.estimated_amount ?? '',
        category: 'food',
        grade: food.confidence >= 0.7 ? 'B' : 'C',
        ingredients: [],
        scannedAt: new Date(),
      });
    });
    setMealSheetVisible(false);
  };
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
          <View style={{ flexDirection: 'row', gap: scale(8) }}>
            <Pressable style={styles.logBtn} onPress={() => setMealSheetVisible(true)}>
              <Text style={styles.logBtnText}>+ Log</Text>
            </Pressable>
            <Pressable style={styles.aiBtn} onPress={() => setChatVisible(true)}>
              <Text style={styles.aiBtnIcon}>✦</Text>
              <Text style={styles.aiBtnText}>Ask AI</Text>
            </Pressable>
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
              <CustomRadarChart
                scores={radarScores}
                onDomainPress={(slug) => router.push(`/domain/${slug}`)}
              />
            </View>
            {/* Domain score rows — tappable → domain detail */}
            {DOMAINS.map((domain, i) => {
              const score = radarScores[i];
              const label = domainScoreLabel(domain, score);
              return (
                <Pressable
                  key={domain}
                  style={[styles.scoreRow, i < DOMAINS.length - 1 && styles.scoreRowBorder]}
                  onPress={() => router.push(`/domain/${DOMAIN_SLUGS[domain]}`)}
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
                  <Text style={styles.scoreRowChevron}>›</Text>
                </Pressable>
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
                <SwipeableProductRow
                  key={product.id}
                  product={product}
                  onPress={() => router.push(`/product/${product.id}`)}
                  onRemove={() => handleRemoveFromStack(product.id)}
                />
              ))}
            </View>
          ))}
        </Animated.View>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>

      <StackAssistant
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        stack={stack}
        radarScores={radarScores}
        goals={goals}
      />

      <MealInputSheet
        visible={mealSheetVisible}
        onClose={() => setMealSheetVisible(false)}
        onConfirm={handleMealsConfirm}
      />
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
  logBtn: {
    paddingHorizontal: scale(14),
    paddingVertical: scale(8),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  logBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
  },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    paddingHorizontal: scale(14),
    paddingVertical: scale(8),
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
  },
  aiBtnIcon: {
    fontSize: FontSizes.caption,
    color: Colors.bone,
    lineHeight: FontSizes.caption * 1.2,
  },
  aiBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.bone,
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
    width: scale(64),
    textAlign: 'right',
  },
  scoreRowChevron: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkTertiary,
    marginLeft: scale(2),
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
  deleteAction: {
    backgroundColor: Colors.accentAlert,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    borderRadius: Radius.md,
    marginVertical: scale(2),
    marginRight: scale(2),
  },
  deleteActionText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#FFFFFF',
  },
});
