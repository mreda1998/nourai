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
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { SectionHead } from '@/components/elory';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { api, CircadianScheduleItem } from '@/services/api';

const PHASE_MARKERS = [
  { h: 6,  label: 'Cortisol peak' },
  { h: 10, label: 'Insulin sensitive' },
  { h: 14, label: 'Post-prandial dip' },
  { h: 18, label: 'Temp peak' },
  { h: 22, label: 'Melatonin onset' },
];

function Timeline({ items }: { items: CircadianScheduleItem[] }) {
  const W = 300;
  const H = 64;
  const baselineY = 42;
  const cortisol = 'M 0 42 Q 40 12 80 26 Q 140 46 180 36 Q 230 26 260 36 Q 290 42 300 42';
  const melatonin = 'M 0 20 Q 60 38 120 42 Q 180 44 230 38 Q 270 24 300 8';

  return (
    <View>
      <Svg width={W} height={H}>
        <Line x1={0} y1={baselineY} x2={W} y2={baselineY} stroke="rgba(241,237,228,0.12)" strokeWidth={0.5} />
        <Path d={cortisol} stroke={Colors.sand} strokeWidth={1.4} fill="none" opacity={0.85} />
        <Path d={melatonin} stroke={Colors.sage} strokeWidth={1.4} fill="none" opacity={0.65} strokeDasharray="3 3" />
        {items.map((d, i) => {
          const [h, m] = d.time.split(':').map(Number);
          const x = ((h + m / 60) / 24) * W;
          return (
            <React.Fragment key={i}>
              <Line x1={x} y1={baselineY} x2={x} y2={baselineY + 10} stroke={Colors.darkInk} strokeWidth={1} />
              <Circle cx={x} cy={baselineY} r={3} fill={d.synergy ? Colors.sage : Colors.sand} />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.timeLabels}>
        {['00', '06', '12', '18', '24'].map((h) => (
          <Text key={h} style={styles.timeLabel}>{h}</Text>
        ))}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: Colors.sand }]} />
          <Text style={styles.legendText}>Cortisol</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: Colors.sage }]} />
          <Text style={styles.legendText}>Melatonin</Text>
        </View>
      </View>
      <View style={styles.phaseRow}>
        {PHASE_MARKERS.map((m) => (
          <View key={m.label} style={styles.phaseItem}>
            <Text style={styles.phaseTime}>{String(m.h).padStart(2, '0')}:00</Text>
            <Text style={styles.phaseLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EvidenceDots({ count }: { count: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: 5, height: 5, borderRadius: 3,
            backgroundColor: i <= count ? Colors.sand : 'transparent',
            borderWidth: 1, borderColor: Colors.sand,
          }}
        />
      ))}
    </View>
  );
}

export default function CircadianScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [schedule, setSchedule] = useState<CircadianScheduleItem[]>([]);
  const [chronotype, setChronotype] = useState('moderate_morning');
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await api.getCircadian(token);
        setSchedule(res.schedule);
        setChronotype(res.chronotype);
        setEmptyReason(res.empty_reason ?? null);
      } catch {
        // Non-fatal — keep empty state
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const chronotypeLabel = chronotype.replace(/_/g, ' ');

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
          <Text style={styles.eyebrow}>Premium · Chronobiology</Text>
          <Text style={styles.title}>Your {'\n'}<Text style={{ fontStyle: 'italic' }}>circadian{'\n'}</Text>protocol.</Text>
        </View>

        <View style={{ paddingHorizontal: scale(24) }}>
          <Animated.View entering={FadeInUp.duration(300)}>
            <Text style={styles.subtitle}>
              Tuned to your chronotype:{' '}
              <Text style={{ color: Colors.sand }}>{chronotypeLabel}</Text>.
            </Text>
            <View style={styles.subtitleDivider} />
          </Animated.View>

          {loading ? (
            <ActivityIndicator color={Colors.sand} style={{ marginVertical: scale(32) }} />
          ) : emptyReason === 'timing_data_pending' || schedule.length === 0 ? (
            <Animated.View entering={FadeInUp.delay(80).duration(300)}>
              <Text style={styles.pendingText}>
                Timing data is being researched — check back soon.
              </Text>
            </Animated.View>
          ) : (
            <>
              <Animated.View entering={FadeInUp.delay(80).duration(300)} style={styles.timelineCard}>
                <Text style={styles.sectionEyebrow}>24h biological phase</Text>
                <Timeline items={schedule} />
              </Animated.View>

              <SectionHead label="Today's sequence" dark />

              {schedule.map((item, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInUp.delay(i * 50 + 160).duration(280)}
                  style={[styles.doseRow, i < schedule.length - 1 && styles.doseRowBorder]}
                >
                  <Text style={[styles.doseTime, item.synergy && { color: Colors.sand }]}>{item.time}</Text>
                  <View style={styles.doseInfo}>
                    <Text style={styles.doseName}>{item.ingredient_name}</Text>
                    <Text style={styles.doseNote}>{item.note}</Text>
                    {item.synergy && <Text style={styles.synergyTag}>✦ Stack synergy</Text>}
                  </View>
                  <EvidenceDots count={item.evidence_dots} />
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(24) },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(241,237,228,0.6)' },
  atelierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(241,237,228,0.22)', borderRadius: 999 },
  atelierBadgeText: { fontFamily: Fonts.sansSemiBold, fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: Colors.sand },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.45)', marginBottom: scale(10) },
  title: { fontFamily: Fonts.serif, fontSize: scale(38), lineHeight: scale(40), color: Colors.darkInk, letterSpacing: -0.5 },
  subtitle: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, lineHeight: FontSizes.subtitle * 1.5, color: 'rgba(241,237,228,0.75)', paddingBottom: scale(20) },
  subtitleDivider: { height: 1, backgroundColor: 'rgba(241,237,228,0.12)', marginBottom: scale(24) },
  sectionEyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.45)', marginBottom: scale(14) },
  timelineCard: { backgroundColor: 'rgba(241,237,228,0.03)', borderWidth: 1, borderColor: 'rgba(241,237,228,0.08)', borderRadius: Radius.lg, padding: scale(16), marginBottom: scale(28) },
  timeLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: scale(6) },
  timeLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 9, color: 'rgba(241,237,228,0.35)', letterSpacing: 0.5 },
  legend: { flexDirection: 'row', gap: scale(16), marginTop: scale(14) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  legendLine: { width: scale(16), height: 1.5 },
  legendText: { fontFamily: Fonts.sans, fontSize: 9, color: 'rgba(241,237,228,0.45)' },
  phaseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginTop: scale(14) },
  phaseItem: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  phaseTime: { fontFamily: Fonts.sansSemiBold, fontSize: 8, color: 'rgba(241,237,228,0.35)', letterSpacing: 0.6 },
  phaseLabel: { fontFamily: Fonts.sans, fontSize: 8, color: Colors.sand, opacity: 0.8 },
  doseRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: scale(16), gap: scale(14) },
  doseRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(241,237,228,0.08)' },
  doseTime: { fontFamily: Fonts.serif, fontSize: scale(20), color: Colors.darkInk, width: scale(52) },
  doseInfo: { flex: 1 },
  doseName: { fontFamily: Fonts.serif, fontSize: FontSizes.title, color: Colors.darkInk, marginBottom: scale(3) },
  doseNote: { fontFamily: Fonts.sans, fontSize: FontSizes.caption, color: 'rgba(241,237,228,0.5)', lineHeight: FontSizes.caption * 1.4 },
  synergyTag: { fontFamily: Fonts.sansSemiBold, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: Colors.sand, marginTop: scale(5) },
  pendingText: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, color: 'rgba(241,237,228,0.5)', lineHeight: FontSizes.subtitle * 1.5 },
});
