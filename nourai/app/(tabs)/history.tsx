import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInLeft, FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

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
import { api, ScanHistoryItem } from '@/services/api';

// Calendar helper
function getWeekDays() {
  const today = new Date();
  const days = [];
  for (let i = -3; i <= 3; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push({
      day: date.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0),
      date: date.getDate(),
      isToday: i === 0,
      fullDate: date,
    });
  }
  return days;
}

interface HistoryGroup {
  date: string;
  items: {
    id: string;
    productId: string;
    name: string;
    brand: string;
    grade: string;
    time: string;
  }[];
}

function groupHistoryByDate(items: ScanHistoryItem[]): HistoryGroup[] {
  const groups: Record<string, HistoryGroup> = {};
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  items.forEach((item) => {
    const date = new Date(item.scanned_at);
    const dateStr = date.toDateString();

    let label: string;
    if (dateStr === today) {
      label = 'Today';
    } else if (dateStr === yesterday) {
      label = 'Yesterday';
    } else {
      label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    if (!groups[label]) {
      groups[label] = { date: label, items: [] };
    }

    groups[label].items.push({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      brand: item.product_brand || 'Unknown',
      grade: item.product_grade,
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    });
  });

  // Sort by date (Today first, then Yesterday, then by date descending)
  return Object.values(groups).sort((a, b) => {
    if (a.date === 'Today') return -1;
    if (b.date === 'Today') return 1;
    if (a.date === 'Yesterday') return -1;
    if (b.date === 'Yesterday') return 1;
    return 0;
  });
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasScannedBefore, stack } = useAppState();
  const weekDays = getWeekDays();

  const [history, setHistory] = useState<HistoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, gradeA: 0, qualityScore: 0 });

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      // For MVP, we don't have auth yet, so we'll call without token
      // In production, this would include the auth token
      const response = await api.getScanHistory('mock-token');
      const grouped = groupHistoryByDate(response.items);
      setHistory(grouped);

      // Calculate stats
      const total = response.items.length;
      const gradeA = response.items.filter((i) => i.product_grade === 'A').length;
      const qualityScore = total > 0 ? Math.round((gradeA / total) * 100) : 0;
      setStats({ total, gradeA, qualityScore });
    } catch (error) {
      console.error('Error loading history:', error);
      // Use local stack as fallback
      if (stack.length > 0) {
        const stackHistory: HistoryGroup[] = [{
          date: 'Recent',
          items: stack.map((p) => ({
            id: p.id,
            productId: p.id,
            name: p.name,
            brand: p.brand,
            grade: p.grade,
            time: p.scannedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          })),
        }];
        setHistory(stackHistory);

        const gradeA = stack.filter((p) => p.grade === 'A').length;
        setStats({
          total: stack.length,
          gradeA,
          qualityScore: Math.round((gradeA / stack.length) * 100),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const hasHistory = history.length > 0 || hasScannedBefore;

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
          <Text style={styles.title}>History</Text>
          <Text style={styles.subtitle}>
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>

        {/* Calendar Strip */}
        <View style={styles.calendarStrip}>
          {weekDays.map((day, index) => (
            <Pressable
              key={index}
              style={[
                styles.calendarDay,
                day.isToday && styles.calendarDayActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={[
                styles.calendarDayLabel,
                day.isToday && styles.calendarDayLabelActive,
              ]}>
                {day.day}
              </Text>
              <Text style={[
                styles.calendarDayNumber,
                day.isToday && styles.calendarDayNumberActive,
              ]}>
                {day.date}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Loading State */}
        {loading && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={Colors.ink} />
            <Text style={styles.loadingText}>Loading history...</Text>
          </View>
        )}

        {/* Empty State */}
        {!loading && !hasHistory && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Scan History</Text>
            <Text style={styles.emptyDescription}>
              Your scanned products will appear here as a timeline.
            </Text>
            <Pressable
              style={styles.scanButton}
              onPress={() => router.push('/(tabs)/scan')}
            >
              <Text style={styles.scanButtonText}>Scan First Product</Text>
            </Pressable>
          </View>
        )}

        {/* History Timeline */}
        {!loading && hasHistory && (
          <View style={styles.timeline}>
            {history.map((group) => (
              <View key={group.date} style={styles.timelineGroup}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.timelineDate}>{group.date}</Text>
                  <View style={styles.timelineLine} />
                </View>
                {group.items.map((item, index) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInLeft.duration(400).delay(index * 80)}
                  >
                    <Pressable
                      style={styles.timelineItem}
                      onPress={() => router.push(`/product/${item.productId}`)}
                    >
                      <View style={styles.timelineDot} />
                      <View style={styles.timelineContent}>
                        <View style={styles.itemHeader}>
                          <Text style={styles.itemTime}>{item.time}</Text>
                          <View style={[
                            styles.gradeBadge,
                            item.grade === 'A' && styles.gradeBadgeA,
                          ]}>
                            <Text style={[
                              styles.gradeText,
                              item.grade === 'A' && styles.gradeTextA,
                            ]}>
                              {item.grade}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.itemBrand}>{item.brand}</Text>
                        <Text style={styles.itemName}>{item.name}</Text>
                      </View>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Statistics Card */}
        {!loading && hasHistory && stats.total > 0 && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.statsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Summary</Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.total}</Text>
                <Text style={styles.statLabel}>Products Scanned</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.gradeA}</Text>
                <Text style={styles.statLabel}>Grade A</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.qualityScore}%</Text>
                <Text style={styles.statLabel}>Quality Score</Text>
              </View>
            </View>
          </Animated.View>
        )}
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
    paddingBottom: Layout.bottomPadding,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginTop: 4,
  },
  calendarStrip: {
    flexDirection: 'row',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  calendarDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  calendarDayActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  calendarDayLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    color: Colors.inkTertiary,
    marginBottom: 4,
  },
  calendarDayLabelActive: {
    color: 'rgba(233, 230, 223, 0.6)',
  },
  calendarDayNumber: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
  },
  calendarDayNumberActive: {
    color: Colors.bone,
  },
  loadingState: {
    paddingVertical: verticalScale(60),
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginTop: Spacing.md,
  },
  emptyState: {
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
  emptyDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.5,
    maxWidth: scale(280),
    marginBottom: Spacing.xl,
  },
  scanButton: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
  },
  scanButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timeline: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  timelineGroup: {
    marginBottom: Spacing.xl,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  timelineDate: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
  },
  timelineLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderStrong,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    paddingLeft: 4,
  },
  timelineDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: Colors.ink,
    marginTop: 6,
    marginRight: Spacing.md,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    padding: Spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  itemTime: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.inkTertiary,
  },
  itemBrand: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    marginBottom: 2,
  },
  itemName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.bodyLarge,
    color: Colors.ink,
  },
  gradeBadge: {
    width: scale(24),
    height: scale(24),
    borderWidth: 1,
    borderColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeBadgeA: {
    backgroundColor: Colors.accentHill,
    borderColor: Colors.accentHill,
  },
  gradeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.caption,
    fontWeight: '700',
    color: Colors.ink,
  },
  gradeTextA: {
    color: Colors.bone,
  },
  statsSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: Spacing.lg,
  },
  sectionHeader: {
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
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    padding: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.borderHairline,
  },
  statValue: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.inkSecondary,
    textAlign: 'center',
  },
});
