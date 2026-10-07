import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import { MeasureInk, Palette, Radius, Shadows } from '@/constants/theme';
import type { MeasureTone } from '@/services/api';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

/**
 * One stacked section of the product screen. Collapsed it still reads as a
 * verdict — status dot, title, one-line summary — so the whole product scans
 * in a few lines before anything is opened.
 */
export function SummaryCard({ title, verdict, tone, open, onToggle, children, style }: {
  title: string;
  verdict: string;
  tone: MeasureTone;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.shadow, style]}>
      <View style={styles.clip}>
        <PressableScale pressedScale={0.99} onPress={onToggle} accessibilityLabel={`${title}, ${verdict}`} accessibilityState={{ expanded: open }}>
          <View style={styles.head}>
            <View style={[styles.dot, { backgroundColor: MeasureInk[tone] }]} />
            <Txt variant="headline">{title}</Txt>
            <Txt variant="subhead" tone="secondary" numberOfLines={1} style={styles.verdict}>{verdict}</Txt>
            <ChevronDown size={18} color={Palette.ink3} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
          </View>
        </PressableScale>
        {open ? <Animated.View entering={FadeIn.duration(220)}>{children}</Animated.View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: Radius.xl, borderCurve: 'continuous', backgroundColor: Palette.surface, ...Shadows.soft },
  clip: { borderRadius: Radius.xl, borderCurve: 'continuous', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 17 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
  verdict: { flex: 1, textAlign: 'right' },
});
