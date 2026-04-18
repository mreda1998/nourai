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
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Fonts, FontSizes, scale, Radius, Spacing } from '@/constants/theme';
import { PremiumLock, SectionHead } from '@/components/elory';

const DOSE_ITEMS = [
  { time: '07:00', name: 'Creatine Monohydrate', note: 'Post-workout window', synergy: true },
  { time: '08:00', name: 'Vitamin D3 + K2', note: 'With fatty meal', synergy: false },
  { time: '12:00', name: 'Omega-3 EPA/DHA', note: 'Largest meal', synergy: true },
  { time: '21:30', name: 'Magnesium Glycinate', note: '1–2h before sleep', synergy: false },
  { time: '21:30', name: 'Ashwagandha KSM-66', note: 'Evening — cortisol taper', synergy: true },
];

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.darkInk} strokeWidth={2}>
      <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CircadianTimeline() {
  const W = 320;
  const H = 100;
  const pad = 16;

  const cortisol = [0.1, 0.2, 0.75, 0.9, 0.8, 0.55, 0.4, 0.3, 0.35, 0.25, 0.15, 0.08];
  const melatonin = [0.8, 0.5, 0.1, 0.05, 0.05, 0.05, 0.05, 0.1, 0.3, 0.65, 0.85, 0.9];

  const toPath = (pts: number[]) => {
    const xStep = (W - pad * 2) / (pts.length - 1);
    return pts
      .map((y, i) => {
        const x = pad + i * xStep;
        const cy = pad + (1 - y) * (H - pad * 2);
        return `${i === 0 ? 'M' : 'L'} ${x} ${cy}`;
      })
      .join(' ');
  };

  return (
    <Svg width={W} height={H} style={{ marginVertical: scale(12) }}>
      {/* Cortisol — sand */}
      <Path d={toPath(cortisol)} stroke={Colors.sand} strokeWidth={1.5} fill="none" />
      {/* Melatonin — sage dashed */}
      <Path d={toPath(melatonin)} stroke={Colors.sage} strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
    </Svg>
  );
}

export default function CircadianScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      {/* Header */}
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
          <Text style={styles.title}>Your circadian protocol.</Text>
          <Text style={styles.subtitle}>Morning chronotype · Peak cortisol 07:00–09:00</Text>
        </Animated.View>

        {/* Timeline */}
        <Animated.View entering={FadeInUp.delay(80).duration(300)} style={styles.timelineWrap}>
          <CircadianTimeline />
          <View style={styles.timelineLabels}>
            {['00', '06', '12', '18', '24'].map((h) => (
              <Text key={h} style={styles.timelineLabel}>{h}</Text>
            ))}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: Colors.sand }]} />
              <Text style={styles.legendText}>Cortisol</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: Colors.sage, opacity: 0.7 }]} />
              <Text style={styles.legendText}>Melatonin</Text>
            </View>
          </View>
        </Animated.View>

        {/* Dose schedule */}
        <SectionHead label="Optimal dosing schedule" dark />
        {DOSE_ITEMS.map((item, i) => (
          <Animated.View key={i} entering={FadeInUp.delay(i * 60).duration(300)} style={styles.doseRow}>
            <Text style={styles.doseTime}>{item.time}</Text>
            <View style={styles.doseInfo}>
              <Text style={styles.doseName}>{item.name}</Text>
              <Text style={styles.doseNote}>{item.note}</Text>
            </View>
            {item.synergy && (
              <Text style={styles.synergyBadge}>✦</Text>
            )}
          </Animated.View>
        ))}
      </ScrollView>

      <PremiumLock featureName="Circadian Protocol" />
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
  timelineWrap: {
    backgroundColor: 'rgba(241,237,228,0.04)',
    borderRadius: Radius.md,
    padding: scale(16),
    marginBottom: scale(28),
    alignItems: 'center',
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: scale(4),
  },
  timelineLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    color: 'rgba(241,237,228,0.3)',
    letterSpacing: 0.5,
  },
  legend: {
    flexDirection: 'row',
    gap: scale(20),
    marginTop: scale(12),
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  legendLine: {
    width: scale(16),
    height: 1.5,
  },
  legendText: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    color: 'rgba(241,237,228,0.45)',
  },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(14),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,237,228,0.08)',
    gap: scale(14),
  },
  doseTime: {
    fontFamily: Fonts.serif,
    fontSize: scale(18),
    color: Colors.sand,
    width: scale(48),
  },
  doseInfo: { flex: 1 },
  doseName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.darkInk,
  },
  doseNote: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.45)',
    marginTop: scale(2),
  },
  synergyBadge: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.sand,
  },
});
