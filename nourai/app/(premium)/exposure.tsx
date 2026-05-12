import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '@/lib/supabase';
import { api, ExposureCategory, ExposureDay } from '@/services/api';

const BAR_COLORS = [Colors.alert, Colors.sand, 'rgba(241,237,228,0.18)'];

function StackedBarChart({ data }: { data: ExposureDay[] }) {
  const W = 300;
  const H = 100;
  const padX = 0;
  const padY = 6;
  const gap = 2;
  const barW = (W - padX * 2 - gap * (data.length - 1)) / data.length;
  const availH = H - padY * 2;

  return (
    <Svg width={W} height={H}>
      {data.map((day, i) => {
        const segments = [day.high, day.moderate, day.low];
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
  const [chart, setChart] = useState<ExposureDay[]>([]);
  const [categories, setCategories] = useState<ExposureCategory[]>([]);
  const [summary, setSummary] = useState('');
  const [caveat, setCaveat] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await api.getExposureLedger(token);
        setChart(res.chart);
        setCategories(res.categories);
        setSummary(res.summary);
        setCaveat(res.caveat);
      } catch {
        // Non-fatal — keep empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
          {loading ? (
            <ActivityIndicator color={Colors.sand} style={{ marginVertical: scale(32) }} />
          ) : categories.length === 0 ? (
            <Animated.View entering={FadeInUp.duration(300)}>
              <Text style={styles.subtitle}>{summary || 'No label-exposure signals found in your current stack.'}</Text>
              {caveat ? <Text style={styles.caveat}>{caveat}</Text> : null}
            </Animated.View>
          ) : (
            <>
              {/* Subtitle */}
              <Animated.View entering={FadeInUp.duration(300)}>
                <Text style={styles.subtitle}>{summary}</Text>
                {caveat ? <Text style={styles.caveat}>{caveat}</Text> : null}
                <View style={styles.subtitleDivider} />
              </Animated.View>

              {/* Chart */}
              <Animated.View entering={FadeInUp.delay(80).duration(300)}>
                <Text style={styles.sectionEyebrow}>Last 14 days</Text>
                <View style={styles.chartCard}>
                  <StackedBarChart data={chart} />
                  <View style={styles.chartBorder} />
                </View>

                {/* Chart legend */}
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.alert, opacity: 0.55 }]} />
                    <Text style={styles.legendText}>Higher</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: Colors.sand }]} />
                    <Text style={styles.legendText}>Moderate</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: 'rgba(241,237,228,0.3)' }]} />
                    <Text style={styles.legendText}>Lower</Text>
                  </View>
                </View>
              </Animated.View>

              {/* Category breakdown */}
              <SectionHead label="By category · today" dark />

              {categories.map((cat, i) => (
                <Animated.View
                  key={cat.name}
                  entering={FadeInUp.delay(i * 50 + 180).duration(280)}
                  style={[styles.catRow, i < categories.length - 1 && styles.catRowBorder]}
                >
                  <View style={styles.catHeader}>
                    <Text style={styles.catName}>{cat.name}</Text>
                    <View style={styles.catRight}>
                      <Text style={styles.catItems}>{cat.sources} sources</Text>
                      <Text style={[styles.catDelta, {
                        color: cat.delta.startsWith('+') || cat.delta === 'new' ? Colors.alert : Colors.sage,
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
                  <Text style={styles.catNote}>{cat.note}</Text>
                </Animated.View>
              ))}
            </>
          )}
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
  caveat: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    lineHeight: FontSizes.caption * 1.45,
    color: 'rgba(241,237,228,0.45)',
    marginBottom: scale(18),
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
  catNote: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    lineHeight: FontSizes.caption * 1.4,
    color: 'rgba(241,237,228,0.42)',
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
