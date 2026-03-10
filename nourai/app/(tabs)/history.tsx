import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BarChart, PieChart } from 'react-native-gifted-charts';

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
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { api, type ScanHistoryItem } from '@/services/api';
import ProductListItem from '@/components/ProductListItem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_INNER_WIDTH = SCREEN_WIDTH - Layout.screenPaddingHorizontal * 2 - Spacing.md * 2;
const BAR_CHART_WIDTH = CARD_INNER_WIDTH - scale(16); // leave room for initial spacing

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getWeekDays() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + (i - 3));
    return {
      day: d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0),
      date: d.getDate(),
      isToday: i === 3,
    };
  });
}

// ─── Domain Drift ─────────────────────────────────────────────────────────────

interface WeekBucket {
  label: string;
  total: number;
  highQuality: number; // grade A or B
}

function buildWeekBuckets(items: ScanHistoryItem[]): WeekBucket[] {
  const now = Date.now();
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
  const labels = ['W−3', 'W−2', 'W−1', 'Now'];
  const buckets: WeekBucket[] = labels.map((label) => ({ label, total: 0, highQuality: 0 }));

  items.forEach((item) => {
    const age = now - new Date(item.scanned_at).getTime();
    const weekIndex = Math.floor(age / MS_WEEK);
    if (weekIndex >= 4) return;
    const bucket = buckets[3 - weekIndex];
    bucket.total++;
    if (item.product_grade === 'A' || item.product_grade === 'B') bucket.highQuality++;
  });

  return buckets;
}

function weekTrend(buckets: WeekBucket[]): 'improving' | 'declining' | 'stable' | 'insufficient' {
  const filled = buckets.filter((b) => b.total > 0);
  if (filled.length < 2) return 'insufficient';
  const first = filled[0].highQuality / filled[0].total;
  const last = filled[filled.length - 1].highQuality / filled[filled.length - 1].total;
  if (last - first > 0.15) return 'improving';
  if (first - last > 0.15) return 'declining';
  return 'stable';
}

function trendLabel(t: ReturnType<typeof weekTrend>) {
  switch (t) {
    case 'improving': return { text: '↑ Improving', color: Colors.accentHill };
    case 'declining': return { text: '↓ Declining', color: Colors.accentAlert };
    case 'stable':    return { text: '→ Stable',    color: Colors.inkSecondary };
    default:          return { text: '—',           color: Colors.inkTertiary };
  }
}

// ─── Attention pattern ────────────────────────────────────────────────────────

interface GradeDistribution {
  grade: string;
  count: number;
  pct: number;
  color: string;
}

function buildGradeDistribution(items: ScanHistoryItem[]): GradeDistribution[] {
  if (items.length === 0) return [];
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  items.forEach((i) => { counts[i.product_grade] = (counts[i.product_grade] ?? 0) + 1; });
  const colors: Record<string, string> = {
    A: Colors.accentHill,
    B: 'rgba(28,28,28,0.55)',
    C: Colors.accentClay,
    D: Colors.accentAlert,
  };
  return ['A', 'B', 'C', 'D']
    .filter((g) => counts[g] > 0)
    .map((g) => ({
      grade: g,
      count: counts[g],
      pct: Math.round((counts[g] / items.length) * 100),
      color: colors[g],
    }));
}

function buildInsight(items: ScanHistoryItem[]): string {
  if (items.length === 0) return '';
  const highQ = items.filter((i) => i.product_grade === 'A' || i.product_grade === 'B').length;
  const pct = Math.round((highQ / items.length) * 100);
  if (pct >= 70) return `${pct}% of what you've explored has strong evidence quality.`;
  if (pct >= 40) return `${pct}% of explored products have good evidence quality. Worth refining.`;
  return `Most products you're exploring have mixed or limited evidence.`;
}

// ─── History grouping ─────────────────────────────────────────────────────────

interface HistoryGroup {
  date: string;
  items: { id: string; productId: string; name: string; brand: string; category: string; grade: string }[];
}

function groupHistoryByDate(items: ScanHistoryItem[]): HistoryGroup[] {
  const groups: Record<string, HistoryGroup> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  items.forEach((item) => {
    const d = new Date(item.scanned_at);
    const ds = d.toDateString();
    const label =
      ds === today ? 'Today' :
      ds === yesterday ? 'Yesterday' :
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (!groups[label]) groups[label] = { date: label, items: [] };
    groups[label].items.push({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      brand: item.product_brand ?? '',
      category: 'supplement',
      grade: item.product_grade,
    });
  });

  return Object.values(groups).sort((a, b) => {
    if (a.date === 'Today') return -1;
    if (b.date === 'Today') return 1;
    if (a.date === 'Yesterday') return -1;
    if (b.date === 'Yesterday') return 1;
    return 0;
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasScannedBefore, stack } = useAppState();
  const { isSignedIn } = useAuth();
  const weekDays = getWeekDays();

  const [allItems, setAllItems] = useState<ScanHistoryItem[]>([]);
  const [history, setHistory] = useState<HistoryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      if (!isSignedIn) throw new Error('not signed in');
      const response = await api.getScanHistory({ limit: 100 });
      setAllItems(response.items);
      setHistory(groupHistoryByDate(response.items));
    } catch {
      if (stack.length > 0) {
        const fakeItems: ScanHistoryItem[] = stack.map((p) => ({
          id: p.id,
          product_id: p.id,
          product_name: p.name,
          product_brand: p.brand,
          product_grade: p.grade,
          scanned_at: p.scannedAt.toISOString(),
        }));
        setAllItems(fakeItems);
        setHistory(groupHistoryByDate(fakeItems));
      }
    } finally {
      setLoading(false);
    }
  };

  const weekBuckets = useMemo(() => buildWeekBuckets(allItems), [allItems]);
  const trend = useMemo(() => weekTrend(weekBuckets), [weekBuckets]);
  const trendDisplay = trendLabel(trend);
  const gradeDistribution = useMemo(() => buildGradeDistribution(allItems), [allItems]);
  const insight = useMemo(() => buildInsight(allItems), [allItems]);
  const maxBucketTotal = Math.max(...weekBuckets.map((b) => b.total), 1);

  // BarChart stacked data
  const stackBarData = useMemo(() => weekBuckets.map((bucket) => {
    const low = Math.max(0, bucket.total - bucket.highQuality);
    const isEmpty = bucket.total === 0;
    return {
      stacks: [
        { value: isEmpty ? 0 : bucket.highQuality, color: Colors.ink, borderRadius: isEmpty ? 0 : 3 },
        { value: isEmpty ? 0 : low, color: Colors.boneDark, borderRadius: isEmpty ? 0 : 3 },
      ],
      label: bucket.label,
      labelTextStyle: {
        fontFamily: Fonts.mono,
        fontSize: 10,
        color: Colors.inkTertiary,
        marginTop: 4,
      },
    };
  }), [weekBuckets]);

  // PieChart data
  const pieData = useMemo(() => gradeDistribution.map((g) => ({
    value: g.count,
    color: g.color,
    text: g.grade,
    textSize: 11,
    textColor: '#fff',
    fontWeight: '700' as const,
  })), [gradeDistribution]);

  const hasHistory = history.length > 0 || hasScannedBefore;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + Spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.overline}>Behavioral Lens</Text>
            <Text style={styles.title}>History</Text>
          </View>
          <Text style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </Text>
        </View>

        {/* ── Calendar strip ───────────────────────────────────────────────── */}
        <View style={styles.calendarStrip}>
          {weekDays.map((day, i) => (
            <Pressable
              key={i}
              style={[styles.calendarDay, day.isToday && styles.calendarDayActive]}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <Text style={[styles.calDayLabel, day.isToday && styles.calDayLabelActive]}>
                {day.day}
              </Text>
              <Text style={[styles.calDayNum, day.isToday && styles.calDayNumActive]}>
                {day.date}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.ink} />
          </View>
        )}

        {!loading && !hasHistory && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.center}>
            <Text style={styles.emptyTitle}>Nothing yet</Text>
            <Text style={styles.emptyBody}>
              Products you scan or view will appear here as a timeline.
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/scan')}>
              <Text style={styles.emptyBtnText}>Start Scanning</Text>
            </Pressable>
          </Animated.View>
        )}

        {!loading && hasHistory && (
          <>
            {/* ── Evidence Quality · 4 Weeks ─────────────────────────────── */}
            <Animated.View entering={FadeInUp.duration(400)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Evidence Quality · 4 Weeks</Text>
                <Text style={[styles.trendBadge, { color: trendDisplay.color }]}>
                  {trendDisplay.text}
                </Text>
              </View>

              <View style={styles.driftCard}>
                <BarChart
                  stackData={stackBarData}
                  maxValue={Math.max(maxBucketTotal, 4)}
                  height={verticalScale(90)}
                  width={BAR_CHART_WIDTH}
                  barWidth={scale(44)}
                  spacing={scale(16)}
                  initialSpacing={scale(20)}
                  endSpacing={scale(8)}
                  noOfSections={3}
                  hideRules
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor={Colors.borderHairline}
                  hideYAxisText
                  backgroundColor={Colors.boneCard}
                  disableScroll
                  isAnimated
                  animationDuration={500}
                />

                <View style={styles.driftLegend}>
                  <View style={styles.driftLegendItem}>
                    <View style={[styles.driftLegendDot, { backgroundColor: Colors.ink }]} />
                    <Text style={styles.driftLegendText}>Grade A/B</Text>
                  </View>
                  <View style={styles.driftLegendItem}>
                    <View style={[styles.driftLegendDot, { backgroundColor: Colors.boneDark }]} />
                    <Text style={styles.driftLegendText}>Grade C/D</Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            {/* ── Exploration Pattern ────────────────────────────────────── */}
            {gradeDistribution.length > 0 && (
              <Animated.View entering={FadeInUp.duration(400).delay(80)} style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>Exploration Pattern</Text>
                  <Text style={styles.totalCount}>{allItems.length} scanned</Text>
                </View>

                <View style={styles.patternCard}>
                  <View style={styles.patternRow}>
                    {/* Donut chart */}
                    <PieChart
                      data={pieData}
                      donut
                      radius={scale(56)}
                      innerRadius={scale(38)}
                      innerCircleColor={Colors.boneCard}
                      backgroundColor={Colors.boneCard}
                      isAnimated
                      centerLabelComponent={() => (
                        <View style={styles.pieCenterLabel}>
                          <Text style={styles.pieCenterCount}>{allItems.length}</Text>
                          <Text style={styles.pieCenterSub}>total</Text>
                        </View>
                      )}
                    />

                    {/* Grade breakdown */}
                    <View style={styles.gradeBreakdown}>
                      {gradeDistribution.map((g) => (
                        <View key={g.grade} style={styles.gradeItem}>
                          <View style={[styles.gradeDot, { backgroundColor: g.color }]} />
                          <Text style={styles.gradeItemLabel}>Grade {g.grade}</Text>
                          <Text style={styles.gradeItemPct}>{g.pct}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {insight ? (
                    <Text style={styles.insightText}>"{insight}"</Text>
                  ) : null}
                </View>
              </Animated.View>
            )}

            {/* ── Timeline ──────────────────────────────────────────────── */}
            <Animated.View entering={FadeInUp.duration(400).delay(160)} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Timeline</Text>
              </View>

              {history.map((group, gi) => (
                <Animated.View
                  key={group.date}
                  entering={FadeInDown.duration(300).delay(gi * 60)}
                  style={styles.group}
                >
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupDate}>{group.date}</Text>
                    <View style={styles.groupLine} />
                    <Text style={styles.groupCount}>{group.items.length}</Text>
                  </View>

                  {group.items.map((item) => (
                    <ProductListItem
                      key={item.id}
                      id={item.productId}
                      name={item.name}
                      brand={item.brand}
                      category={item.category}
                      grade={item.grade}
                      onPress={() => router.push(`/product/${item.productId}`)}
                    />
                  ))}
                </Animated.View>
              ))}
            </Animated.View>
          </>
        )}

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bone },
  container: { paddingBottom: Layout.bottomPadding },

  // ── Header
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.lg,
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
  headerDate: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },

  // ── Calendar
  calendarStrip: {
    flexDirection: 'row',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  calendarDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  calendarDayActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  calDayLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    color: Colors.inkTertiary,
    marginBottom: 3,
  },
  calDayLabelActive: { color: 'rgba(233,230,223,0.55)' },
  calDayNum: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  calDayNumActive: { color: Colors.bone },

  // ── Center state
  center: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: verticalScale(60),
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  emptyBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.5,
    maxWidth: scale(280),
    marginBottom: Spacing.xl,
  },
  emptyBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
  },
  emptyBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // ── Section
  section: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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

  // ── Evidence Quality (BarChart)
  trendBadge: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  driftCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  driftLegend: {
    flexDirection: 'row',
    gap: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderHairline,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
  },
  driftLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
  },
  driftLegendDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  driftLegendText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },

  // ── Exploration pattern (PieChart)
  totalCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
  patternCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  pieCenterLabel: {
    alignItems: 'center',
  },
  pieCenterCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.heading,
    color: Colors.ink,
    lineHeight: FontSizes.heading * 1.1,
  },
  pieCenterSub: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gradeBreakdown: {
    flex: 1,
    gap: scale(10),
  },
  gradeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  gradeDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  gradeItemLabel: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  gradeItemPct: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  insightText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.subtitle,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.subtitle * 1.5,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderHairline,
    paddingTop: Spacing.md,
  },

  // ── Timeline
  group: {
    marginBottom: Spacing.xl,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  groupDate: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
  },
  groupLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderHairline,
  },
  groupCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
});
