import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Fonts, MeasureInk, MeasureSoft, Palette } from '@/constants/theme';
import type { Measure, MeasureSource } from '@/services/api';
import { MeasureBar } from './MeasureBar';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

const SUPERSCRIPTS = ['¹', '²', '³', '⁴'];

/** Where a reference comes from — every number on a measure is cited. */
export function showMeasureSources(measure: Pick<Measure, 'panel_label' | 'sources'>) {
  const lines = measure.sources.map((s) => (s.detail ? `${s.name}: ${s.detail}` : s.name)).join('\n\n');
  const links = measure.sources.filter((s) => s.url).slice(0, 2).map((s) => ({ text: `Open ${s.name}`, onPress: () => Linking.openURL(s.url!) }));
  Alert.alert(measure.panel_label, lines, [...links, { text: 'Close', style: 'cancel' }]);
}

const openSource = (measure: Measure, source: MeasureSource) =>
  source.url ? Linking.openURL(source.url) : showMeasureSources(measure);

/**
 * Collapsed: icon, name, coloured verdict, value and its share of the reference.
 * Expanded: a margin rule in the verdict colour, the instrument, one sentence
 * with footnoted sources, and — for foods — how many servings reach the reference.
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
  const share = measure.display_value === 'ND' ? 'ND' : measure.percent != null ? `${measure.percent}%` : null;
  const sources = measure.sources.slice(0, SUPERSCRIPTS.length);
  const marks = sources.map((_, i) => SUPERSCRIPTS[i]).join(',');

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
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            <View style={styles.value}>
              <Txt variant="numeral">{measure.display_value}</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginLeft: 3 }}>{measure.unit}</Txt>
            </View>
            {share ? (
              <View style={[styles.share, { backgroundColor: MeasureSoft[measure.tone] }]}>
                <Txt variant="caption" color={ink} style={{ fontSize: 11, lineHeight: 14 }}>{share}</Txt>
              </View>
            ) : null}
          </View>
          <ChevronDown size={16} color={Palette.ink3} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
        </View>
      </PressableScale>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.body}>
          <View style={[styles.margin, { borderLeftColor: ink }]}>
            <Txt variant="footnoteStrong" tone="secondary">{measure.panel_label}</Txt>
            <MeasureBar measure={measure} style={{ marginTop: 10 }} />
            <Txt variant="footnote" style={{ marginTop: 14 }}>
              {measure.sentence}
              <Txt variant="footnote" tone="accent">{marks}</Txt>
            </Txt>
            {measure.servings_note ? <Txt style={styles.servings}>{measure.servings_note}.</Txt> : null}

            <View style={styles.footnotes}>
              {sources.map((s, i) => (
                <Pressable key={s.name} onPress={() => openSource(measure, s)} hitSlop={6} accessibilityRole="link" accessibilityLabel={`Source: ${s.name}`}>
                  <Txt variant="caption" tone="tertiary">
                    <Txt variant="caption" tone="accent">{SUPERSCRIPTS[i]} </Txt>
                    {s.name}{s.detail ? ` · ${s.detail}` : ''}
                  </Txt>
                </Pressable>
              ))}
            </View>

            {onOpen ? (
              <Pressable onPress={onOpen} hitSlop={8} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                <Txt variant="footnoteStrong" tone="accent">Open the research →</Txt>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  value: { flexDirection: 'row', alignItems: 'baseline' },
  share: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  body: { paddingLeft: 26, paddingRight: 18, paddingBottom: 20 },
  margin: { borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 2 },
  servings: { fontFamily: Fonts.serifItalic, fontSize: 19, lineHeight: 24, color: Palette.ink, marginTop: 10 },
  footnotes: { marginTop: 12, gap: 4 },
});
