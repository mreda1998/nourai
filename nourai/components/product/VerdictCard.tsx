import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { ChevronRight } from 'lucide-react-native';
import { MeasureFill, MeasureInk, Palette, Radius, Shadows } from '@/constants/theme';
import type { MeasureTone, ProductVerdict, VerdictPillar } from '@/services/api';
import { PressableScale, Txt } from '@/components/ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 68;
const STROKE = 7;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const GAP = 7;

/**
 * Elory's read of a product. One segment of the ring per check, each in its
 * own verdict colour, so the ring shows how the answer was reached without
 * inventing a number.
 */
export function VerdictCard({ verdict, onOpenPillar }: {
  verdict: ProductVerdict;
  onOpenPillar?: (pillar: VerdictPillar) => void;
}) {
  const ink = verdict.tone === 'neutral' ? Palette.ink : MeasureInk[verdict.tone];
  return (
    <View style={styles.card} accessible={false}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="secondary">Elory’s read</Txt>
          <Txt variant="largeTitle" color={ink} style={{ marginTop: 6 }} accessibilityRole="header">{verdict.headline}</Txt>
        </View>
        <VerdictRing tones={verdict.pillars.map((p) => p.tone)} />
      </View>
      <Txt variant="callout" tone="secondary" style={{ marginTop: 12 }}>{verdict.summary}</Txt>

      {verdict.pillars.length ? (
        <View style={styles.pillars}>
          {verdict.pillars.map((pillar, i) => (
            <PressableScale
              key={pillar.key}
              pressedScale={0.99}
              onPress={onOpenPillar ? () => onOpenPillar(pillar) : undefined}
              accessibilityLabel={`${pillar.label}: ${pillar.verdict}`}
              style={[styles.pillar, i > 0 && styles.rule]}
            >
              <View style={[styles.dot, { backgroundColor: MeasureFill[pillar.tone] }]} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                  <Txt variant="subheadStrong">{pillar.label}</Txt>
                  <Txt variant="subhead" color={pillar.tone === 'neutral' ? Palette.ink2 : MeasureInk[pillar.tone]} style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
                    {pillar.verdict}
                  </Txt>
                </View>
                {pillar.detail ? <Txt variant="footnote" tone="tertiary" style={{ marginTop: 3 }}>{pillar.detail}</Txt> : null}
              </View>
              {onOpenPillar ? <ChevronRight size={16} color={Palette.ink4} strokeWidth={2} style={{ marginTop: 2 }} /> : null}
            </PressableScale>
          ))}
        </View>
      ) : null}

      <Txt variant="caption" tone="tertiary" style={{ marginTop: 14 }}>{verdict.basis}.</Txt>
    </View>
  );
}

/** One arc per check. An empty ring means nothing could be judged yet. */
function VerdictRing({ tones }: { tones: MeasureTone[] }) {
  const n = Math.max(tones.length, 1);
  const gap = n > 1 ? GAP : 0;
  const seg = CIRC / n - gap;
  return (
    <View style={{ width: RING, height: RING }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
        {(tones.length ? tones : (['neutral'] as MeasureTone[])).map((tone, i) => (
          <Segment key={i} index={i} length={seg} offset={i * (seg + gap) + gap / 2} color={tone === 'neutral' ? Palette.ink4 : MeasureFill[tone]} />
        ))}
      </Svg>
    </View>
  );
}

function Segment({ index, length, offset, color }: { index: number; length: number; offset: number; color: string }) {
  const drawn = useSharedValue(0);
  useEffect(() => {
    drawn.value = withDelay(180 + index * 140, withTiming(1, { duration: 700, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
  }, [drawn, index]);
  const animated = useAnimatedProps(() => ({ strokeDasharray: [length * drawn.value, CIRC] }));
  return (
    <AnimatedCircle
      cx={RING / 2}
      cy={RING / 2}
      r={R}
      fill="none"
      stroke={color}
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeDashoffset={-offset}
      animatedProps={animated}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.xl, borderCurve: 'continuous', backgroundColor: Palette.surface, padding: 22, ...Shadows.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pillars: { marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  pillar: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 13 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  dot: { width: 9, height: 9, borderRadius: 4.5, marginTop: 6 },
});
