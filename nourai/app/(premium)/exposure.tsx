import React from 'react';
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
import { SectionHead } from '@/components/elory';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';

// 14 days of stacked bar data: [alert, sand, muted]
const CHART_DATA = [
  [0.4, 0.55, 0.45],
  [0.2, 0.55, 0.45],
  [0.4, 0.30, 0.45],
  [0.35, 0.45, 0.20],
  [0.25, 0.50, 0.10],
  [0.30, 0.40, 0.20],
  [0.40, 0.35, 0.15],
  [0.20, 0.50, 0.20],
  [0.35, 0.40, 0.10],
  [0.30, 0.45, 0.15],
  [0.40, 0.35, 0.20],
  [0.25, 0.50, 0.10],
  [0.35, 0.40, 0.15],
  [0.30, 0.45, 0.20],
];

const CATEGORIES = [
  { name: 'Microplastics',         load: 0.72, delta: '+8%',   items: 3, alert: true  },
  { name: 'Synthetic fragrance',   load: 0.45, delta: '-12%',  items: 2, alert: false },
  { name: 'Added caffeine',        load: 0.61, delta: '+4%',   items: 4, alert: true  },
  { name: 'Seed oils',             load: 0.38, delta: '-5%',   items: 6, alert: false },
  { name: 'Emulsifiers',           load: 0.52, delta: '+2%',   items: 5, alert: false },
  { name: 'Added sugars',          load: 0.28, delta: '-18%',  items: 3, alert: false },
];

const BAR_COLORS = [Colors.alert, Colors.sand, 'rgba(241,237,228,0.18)'];

function StackedBarChart() {
  const W = 300;
  const H = 100;
  const padX = 0;
  const padY = 6;
  const gap = 2;
  const barW = (W - padX * 2 - gap * (CHART_DATA.length - 1)) / CHART_DATA.length;
  const availH = H - padY * 2;

  return (
    <Svg width={W} height={H}>
      {CHART_DATA.map((segments, i) => {
        const x = padX + i * (barW + gap);
        let stackY = H - padY;

        return segments.map((seg, j) => {
          const segH = Math.max(seg * availH * 0.7, 0);
          stackY -= segH;
          const y = stackY;
          stackY -= 1; // small gap between layers
          return (
            <Rect
              key={`${i}-${j}`}
              x={x}
              y={y}
              width={barW}
              height={segH}
              fill={BAR_COLORS[j]}
              rx={1}
              opacity={j === 2 ? 0.4 : j === 0 ? 0.55 : 1}
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + scale(48) }]}
      >
        {/* Editorial header */}
        <View style={{ paddingTop: insets.top + scale(12), paddingHorizontal: scale(24), paddingBottom: scale(20) }}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(241,237,228,0.6)" strokeWidth={2}>
                <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <View style={styles.atelierBadge}>
              <Text style={styles.atelierBadgeText}>◆ Atelier</Text>
            </View>
          </View>
          <Text style={styles.eyebrow}>Premium · Cumulative Exposure</Text>
          <Text style={styles.title}>Exposure{'\n'}<Text style={{ fontStyle: 'italic' }}>ledger.</Text></Text>
        </View>

        <View style={{ paddingHorizontal: scale(24) }}>
          {/* Subtitle */}
          <Animated.View entering={FadeInUp.duration(300)}>
            <Text style={styles.subtitle}>
              Today's load is about{' '}
              <Text style={{ color: Colors.sand }}>consistent</Text>
              {' '}with your 14-day average.
            </Text>
            <View style={styles.subtitleDivider} />
          </Animated.View>

          {/* Chart */}
          <Animated.View entering={FadeInUp.delay(80).duration(300)}>
            <Text style={styles.sectionEyebrow}>Last 14 days</Text>
            <View style={styles.chartCard}>
              <StackedBarChart />
              <View style={styles.chartBorder} />
            </View>

            {/* Chart legend */}
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.alert, opacity: 0.55 }]} />
                <Text style={styles.legendText}>High load</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.sand }]} />
                <Text style={styles.legendText}>Moderate</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: 'rgba(241,237,228,0.3)' }]} />
                <Text style={styles.legendText}>Low</Text>
              </View>
            </View>
          </Animated.View>

          {/* Category breakdown */}
          <SectionHead label="By category · today" dark />

          {CATEGORIES.map((cat, i) => (
            <Animated.View
              key={i}
              entering={FadeInUp.delay(i * 50 + 180).duration(280)}
              style={[styles.catRow, i < CATEGORIES.length - 1 && styles.catRowBorder]}
            >
              <View style={styles.catHeader}>
                <Text style={styles.catName}>{cat.name}</Text>
                <View style={styles.catRight}>
                  <Text style={styles.catItems}>{cat.items} sources</Text>
                  <Text style={[styles.catDelta, {
                    color: cat.delta.startsWith('+') ? Colors.alert : Colors.sage,
                  }]}>
                    {cat.delta}
                  </Text>
                </View>
              </View>
              <View style={styles.loadTrack}>
                <View
                  style={[
                    styles.loadFill,
                    {
                      width: `${Math.round(cat.load * 100)}%` as any,
                      backgroundColor: cat.alert ? Colors.alert : Colors.sand,
                    },
                  ]}
                />
              </View>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.darkSurface },
  scroll: {},

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(24),
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(241,237,228,0.6)',
  },
  atelierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.22)',
    borderRadius: 999,
  },
  atelierBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: Colors.sand,
  },
  eyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(241,237,228,0.45)',
    marginBottom: scale(10),
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: scale(38),
    lineHeight: scale(40),
    color: Colors.darkInk,
    letterSpacing: -0.5,
  },

  subtitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.subtitle,
    lineHeight: FontSizes.subtitle * 1.5,
    color: 'rgba(241,237,228,0.75)',
    paddingBottom: scale(20),
  },
  subtitleDivider: {
    height: 1,
    backgroundColor: 'rgba(241,237,228,0.12)',
    marginBottom: scale(24),
  },

  sectionEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(241,237,228,0.45)',
    marginBottom: scale(12),
  },
  chartCard: {
    alignItems: 'center',
    paddingBottom: scale(8),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,237,228,0.15)',
    marginBottom: scale(12),
  },
  chartBorder: {},
  chartLegend: {
    flexDirection: 'row',
    gap: scale(16),
    marginBottom: scale(28),
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: scale(5) },
  legendDot: { width: scale(6), height: scale(6), borderRadius: scale(3) },
  legendText: {
    fontFamily: Fonts.sans,
    fontSize: 9,
    color: 'rgba(241,237,228,0.4)',
  },

  catRow: {
    paddingVertical: scale(16),
    gap: scale(10),
  },
  catRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,237,228,0.08)',
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  catName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.darkInk,
  },
  catRight: {
    flexDirection: 'row',
    gap: scale(10),
    alignItems: 'baseline',
  },
  catItems: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.4)',
    letterSpacing: 0.8,
  },
  catDelta: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.title,
  },
  loadTrack: {
    height: 2,
    backgroundColor: 'rgba(241,237,228,0.1)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  loadFill: {
    height: '100%',
    borderRadius: 1,
  },
});
