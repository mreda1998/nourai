import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronDown, Info } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { MeasureInk, Palette } from '@/constants/theme';
import type { Measure } from '@/services/api';
import { MeasureBar } from './MeasureBar';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

/** Where a reference comes from — every number on a bar is cited. */
export function showMeasureSources(measure: Pick<Measure, 'panel_label' | 'sources'>) {
  const lines = measure.sources.map((s) => (s.detail ? `${s.name}: ${s.detail}` : s.name)).join('\n\n');
  const links = measure.sources.filter((s) => s.url).slice(0, 2).map((s) => ({ text: `Open ${s.name}`, onPress: () => Linking.openURL(s.url!) }));
  Alert.alert(measure.panel_label, lines, [...links, { text: 'Close', style: 'cancel' }]);
}

/**
 * Collapsed: icon, name, coloured verdict, value. Expanded: the bar against its
 * cited reference, scale ticks and one plain-language sentence.
 */
export function MeasureRow({ measure, icon: Icon, expanded, onToggle, onOpen, divider = true }: {
  measure: Measure;
  icon?: LucideIcon;
  expanded: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  divider?: boolean;
}) {
  const ink = MeasureInk[measure.tone];
  return (
    <View style={divider ? styles.divider : null}>
      <PressableScale
        pressedScale={0.99}
        onPress={onToggle}
        accessibilityLabel={`${measure.label}, ${measure.display_value} ${measure.unit}, ${measure.verdict}`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.row}>
          {Icon ? <Icon size={18} color={Palette.ink2} strokeWidth={1.8} /> : null}
          <View style={{ flex: 1 }}>
            <Txt variant="callout">{measure.label}</Txt>
            <Txt variant="footnote" color={ink} style={{ marginTop: 2 }} numberOfLines={1}>{measure.verdict}</Txt>
          </View>
          <View style={styles.value}>
            <Txt variant="numeral">{measure.display_value}</Txt>
            <Txt variant="footnote" tone="secondary" style={{ marginLeft: 3 }}>{measure.unit}</Txt>
          </View>
          <View style={[styles.dot, { backgroundColor: ink }]} />
          <ChevronDown size={16} color={Palette.ink3} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
        </View>
      </PressableScale>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.panel}>
          <View style={styles.panelHead}>
            <Txt variant="overline" tone="secondary">{measure.panel_label}</Txt>
            <Pressable hitSlop={12} onPress={() => showMeasureSources(measure)} accessibilityLabel="Where this reference comes from">
              <Info size={16} color={Palette.ink3} />
            </Pressable>
          </View>
          <MeasureBar kind={measure.kind} position={measure.position} scale={measure.scale} style={{ marginTop: 14 }} />
          <Txt variant="footnote" style={{ marginTop: 12 }}>{measure.sentence}</Txt>
          {onOpen ? (
            <Pressable onPress={onOpen} hitSlop={8} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Txt variant="footnoteStrong" tone="accent">Open the research →</Txt>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  value: { flexDirection: 'row', alignItems: 'baseline' },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  panel: { backgroundColor: 'rgba(14, 31, 30, 0.035)', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
