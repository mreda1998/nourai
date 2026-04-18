import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';
import { PremiumLock, SectionHead } from '@/components/elory';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S', 'M', 'T', 'W', 'T', 'F', 'S', 'S'];

const CHART_DATA = [
  [0.3, 0.4, 0.2],
  [0.2, 0.5, 0.1],
  [0.4, 0.3, 0.15],
  [0.35, 0.45, 0.2],
  [0.25, 0.5, 0.1],
  [0.3, 0.4, 0.2],
  [0.4, 0.35, 0.15],
  [0.2, 0.5, 0.2],
  [0.35, 0.4, 0.1],
  [0.3, 0.45, 0.15],
  [0.4, 0.35, 0.2],
  [0.25, 0.5, 0.1],
  [0.35, 0.4, 0.15],
  [0.3, 0.45, 0.2],
];

const CATEGORIES = [
  { name: 'Synthetic preservatives', delta: '+12%', load: 0.72, high: true },
  { name: 'Artificial sweeteners', delta: '+8%', load: 0.61, high: true },
  { name: 'Processed seed oils', delta: '+5%', load: 0.54, high: false },
  { name: 'Antioxidant vitamins', delta: '-6%', load: 0.38, high: false },
  { name: 'Anti-inflammatory', delta: '-9%', load: 0.28, high: false },
];

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.darkInk} strokeWidth={2}>
      <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BarChart() {
  const W = 320;
  const H = 120;
  const padX = 8;
  const padY = 8;
  const barW = (W - padX * 2) / DAYS.length - 2;
  const colors = [Colors.alert, Colors.sand, 'rgba(241,237,228,0.15)'];

  return (
    <Svg width={W} height={H}>
      {CHART_DATA.map((segments, i) => {
        let yOffset = padY;
        const x = padX + i * ((W - padX * 2) / DAYS.length);
        const totalH = H - padY * 2;
        return segments.map((seg, j) => {
          const segH = seg * totalH;
          const y = H - padY - yOffset - segH + padY;
          yOffset += segH;
          return (
            <Rect
              key={`${i}-${j}`}
              x={x}
              y={y}
              width={barW}
              height={segH}
              fill={colors[j] ?? 'transparent'}
              rx={1}
            />
          );
        });
      })}
    </Svg>
  );
}

export default function ExposureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + scale(8) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <BackIcon />
        </Pressable>
        <Text style={styles.headerEyebrow}>Atelier</Text>
        <View style={{ width: scale(36) }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(48) }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(300)}>
          <Text style={styles.title}>Exposure ledger.</Text>
          <Text style={styles.subtitle}>14-day compound exposure across your full diet + stack</Text>
        </Animated.View>

        {/* Bar chart */}
        <Animated.View entering={FadeInUp.delay(80).duration(300)} style={styles.chartWrap}>
          <BarChart />
          <View style={styles.dayLabels}>
            {DAYS.map((d, i) => (
              <Text key={i} style={styles.dayLabel}>{d}</Text>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.alert }]} />
              <Text style={styles.legendText}>High load</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.sand }]} />
              <Text style={styles.legendText}>Moderate</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'rgba(241,237,228,0.25)' }]} />
              <Text style={styles.legendText}>Low</Text>
            </View>
          </View>
        </Animated.View>

        {/* Category breakdown */}
        <SectionHead label="By category" dark />
        {CATEGORIES.map((cat, i) => (
          <Animated.View key={i} entering={FadeInUp.delay(i * 50).duration(280)} style={styles.catRow}>
            <View style={styles.catInfo}>
              <Text style={styles.catName}>{cat.name}</Text>
              <Text style={[styles.catDelta, { color: cat.delta.startsWith('+') ? Colors.alert : Colors.sage }]}>
                {cat.delta}
              </Text>
            </View>
            <View style={styles.catBarTrack}>
              <View
                style={[
                  styles.catBarFill,
                  {
                    width: `${Math.round(cat.load * 100)}%`,
                    backgroundColor: cat.high ? Colors.alert : Colors.sand,
                  },
                ]}
              />
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      <PremiumLock featureName="Exposure Ledger" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(24),
    paddingBottom: scale(8),
  },
  backBtn: {
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: 'rgba(241,237,228,0.4)',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(8),
  },
  title: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.heading,
    color: Colors.darkInk,
    lineHeight: FontSizes.heading * 1.1,
    marginBottom: scale(8),
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.55)',
    marginBottom: scale(24),
  },
  chartWrap: {
    backgroundColor: 'rgba(241,237,228,0.03)',
    borderRadius: scale(12),
    padding: scale(16),
    marginBottom: scale(28),
    alignItems: 'center',
  },
  dayLabels: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: scale(4),
  },
  dayLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 8,
    color: 'rgba(241,237,228,0.25)',
    width: scale(18),
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: scale(16),
    marginTop: scale(10),
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
  },
  legendDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
  },
  legendText: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    color: 'rgba(241,237,228,0.4)',
  },
  catRow: {
    paddingVertical: scale(12),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,237,228,0.08)',
    gap: scale(8),
  },
  catInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.body,
    color: Colors.darkInk,
  },
  catDelta: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
  },
  catBarTrack: {
    height: 2,
    backgroundColor: 'rgba(241,237,228,0.1)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: 1,
  },
});
