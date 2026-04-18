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
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';
import { PremiumLock, SectionHead } from '@/components/elory';

const NODES = [
  { id: 'creatine',   label: 'Creatine',   x: 160, y: 60 },
  { id: 'mgly',       label: 'Magnesium',  x: 80,  y: 140 },
  { id: 'zinc',       label: 'Zinc',       x: 240, y: 140 },
  { id: 'vd3',        label: 'Vitamin D3', x: 50,  y: 60 },
  { id: 'omega',      label: 'Omega-3',    x: 270, y: 60 },
];

const EDGES = [
  { from: 'creatine', to: 'omega',   type: 'synergy' },
  { from: 'mgly',     to: 'zinc',    type: 'compete' },
  { from: 'vd3',      to: 'mgly',    type: 'synergy' },
  { from: 'creatine', to: 'zinc',    type: 'compete' },
];

const NOTES = [
  { type: 'synergy', text: 'Creatine + Omega-3 both support cell membrane integrity — complementary effects.' },
  { type: 'synergy', text: 'Vitamin D3 requires magnesium for conversion to active form (calcitriol).' },
  { type: 'compete', text: 'Magnesium and zinc compete for intestinal absorption — separate by 2h.' },
  { type: 'compete', text: 'High-dose creatine may transiently increase zinc excretion.' },
];

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.darkInk} strokeWidth={2}>
      <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ForceGraph() {
  const nodeMap: Record<string, { x: number; y: number }> = {};
  NODES.forEach((n) => { nodeMap[n.id] = { x: n.x, y: n.y }; });

  return (
    <Svg width={320} height={200} style={{ marginVertical: scale(8) }}>
      {/* Edges */}
      {EDGES.map((e, i) => {
        const from = nodeMap[e.from];
        const to = nodeMap[e.to];
        const isSynergy = e.type === 'synergy';
        return (
          <Line
            key={i}
            x1={from.x} y1={from.y}
            x2={to.x} y2={to.y}
            stroke={isSynergy ? Colors.sand : Colors.alert}
            strokeWidth={isSynergy ? 1.5 : 1.5}
            strokeDasharray={isSynergy ? undefined : '5 3'}
            opacity={0.7}
          />
        );
      })}
      {/* Nodes */}
      {NODES.map((n) => (
        <React.Fragment key={n.id}>
          <Circle cx={n.x} cy={n.y} r={20} fill="rgba(15,62,61,0.8)" stroke="rgba(241,237,228,0.2)" strokeWidth={1} />
          <Circle cx={n.x} cy={n.y} r={3} fill={Colors.sand} />
          <SvgText
            x={n.x} y={n.y + 34}
            textAnchor="middle"
            fill="rgba(241,237,228,0.65)"
            fontSize={9}
            fontFamily={Fonts.serifItalic}
          >
            {n.label}
          </SvgText>
        </React.Fragment>
      ))}
    </Svg>
  );
}

import React from 'react';

export default function ConflictMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const synergies = EDGES.filter((e) => e.type === 'synergy').length;
  const conflicts = EDGES.filter((e) => e.type === 'compete').length;

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
          <Text style={styles.title}>Biochemical conflict map.</Text>
          <Text style={styles.subtitle}>
            {NODES.length} compounds · {synergies} synergies · {conflicts} competitions
          </Text>
        </Animated.View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: Colors.sand }]} />
            <Text style={styles.legendText}>Synergy</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: Colors.alert, borderStyle: 'dashed' }]} />
            <Text style={styles.legendText}>Competes</Text>
          </View>
        </View>

        {/* Graph */}
        <Animated.View entering={FadeInUp.delay(80).duration(300)} style={styles.graphWrap}>
          <ForceGraph />
        </Animated.View>

        {/* Notes */}
        <SectionHead label="What this means" dark />
        {NOTES.map((note, i) => (
          <Animated.View
            key={i}
            entering={FadeInUp.delay(i * 60).duration(280)}
            style={[
              styles.noteRow,
              { borderLeftColor: note.type === 'synergy' ? Colors.sand : Colors.alert },
            ]}
          >
            <Text style={styles.noteText}>{note.text}</Text>
          </Animated.View>
        ))}
      </ScrollView>

      <PremiumLock featureName="Conflict Map" />
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
    marginBottom: scale(20),
  },
  legend: {
    flexDirection: 'row',
    gap: scale(20),
    marginBottom: scale(8),
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  legendLine: {
    width: scale(20),
    height: 1.5,
  },
  legendText: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    color: 'rgba(241,237,228,0.45)',
  },
  graphWrap: {
    backgroundColor: 'rgba(241,237,228,0.03)',
    borderRadius: scale(12),
    alignItems: 'center',
    padding: scale(16),
    marginBottom: scale(28),
  },
  noteRow: {
    borderLeftWidth: 2,
    paddingLeft: scale(12),
    paddingVertical: scale(8),
    marginBottom: scale(10),
  },
  noteText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.75)',
    lineHeight: FontSizes.body * 1.5,
  },
});
