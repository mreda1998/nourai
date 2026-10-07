import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { MeasureFill, MeasureZone, Palette } from '@/constants/theme';
import type { Measure, MeasureTone } from '@/services/api';
import { Txt } from './Txt';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The value against its reference, drawn like a lab instrument rather than a
 * slider. Nutrients fill cells of 5% each (so the FDA 5%/20% cut-offs land on
 * notched cell edges); doses and contaminants sit on a ruler with their range
 * bracketed and the limit ruled in. Words live in the row, not the drawing.
 */
export function MeasureBar({ measure, style }: { measure: Measure; style?: StyleProp<ViewStyle> }) {
  if (measure.kind === 'dose' || measure.kind === 'contaminant') {
    return <DoseRuler measure={measure} style={style} />;
  }
  const marks = measure.kind === 'limit' ? [0.05, 0.2] : measure.kind === 'goal' ? [0.1, 0.2] : [];
  return <CellMeter style={style} position={measure.position} tone={measure.tone} marks={marks} />;
}

// ─── Cells ───────────────────────────────────────────────────────────────────

const CELL_GAP = 3;
const CELL_H = 12;

function CellMeter({ position, tone, cells = 20, marks = [], style }: {
  position: number;
  tone: MeasureTone;
  cells?: number;
  marks?: number[];
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const cellW = width ? (width - CELL_GAP * (cells - 1)) / cells : 0;
  // Fraction of the reference → x, skipping the gaps so 5% fills exactly one cell.
  const xFor = (f: number) => {
    const c = Math.min(Math.max(f, 0), 1) * cells;
    const i = Math.floor(c);
    return Math.min(width, i * (cellW + CELL_GAP) + (c - i) * cellW);
  };
  const fillX = xFor(position);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(120, withTiming(1, { duration: 800, easing: EASE }));
  }, [position]);
  const fillStyle = useAnimatedStyle(() => ({ width: progress.value * fillX }), [fillX]);

  const row = (color: string) => (
    <View style={{ flexDirection: 'row', gap: CELL_GAP, width }}>
      {Array.from({ length: cells }, (_, i) => (
        <View key={i} style={{ width: cellW, height: CELL_H, borderRadius: 3, backgroundColor: color }} />
      ))}
    </View>
  );

  return (
    <View style={style} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <View style={{ height: CELL_H }}>
          {row('rgba(14, 31, 30, 0.07)')}
          <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, fillStyle]}>
            {row(MeasureFill[tone])}
          </Animated.View>
        </View>
      ) : <View style={{ height: CELL_H }} />}

      {marks.length && width ? (
        <View style={{ height: 6 }}>
          {marks.map((m) => (
            <View key={m} style={[styles.mark, { left: Math.round(m * cells) * (cellW + CELL_GAP) - CELL_GAP / 2 - 0.75 }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─── Ruler ───────────────────────────────────────────────────────────────────

const MINOR_TICKS = 40;
const MIN_LABEL_GAP = 70;
const LABEL_W = 110;

function DoseRuler({ measure, style }: { measure: Measure; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  const { scale } = measure;
  const x = (v: number) => (scale.max ? Math.min(Math.max(v / scale.max, 0), 1) * width : 0);
  const needleX = Math.min(Math.max(measure.position, 0), 1) * width;
  const band = scale.zones.find((z) => z.tone === 'good');
  const limit = scale.zones.find((z) => z.tone === 'weak');
  const limitX = limit ? x(limit.start) : null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={style}>
     <View style={{ height: 72 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <>
          {/* bracketed range */}
          {band ? (
            <View style={{ position: 'absolute', top: 18, left: x(band.start), width: Math.max(x(band.end) - x(band.start), 2) }}>
              <View style={[styles.bracketLine, { backgroundColor: Palette.strong }]} />
              <View style={[styles.bracketCap, { left: 0, backgroundColor: Palette.strong }]} />
              <View style={[styles.bracketCap, { right: 0, backgroundColor: Palette.strong }]} />
            </View>
          ) : null}

          {/* ruler: minor ticks, major ticks at the references, zone strip */}
          {Array.from({ length: MINOR_TICKS + 1 }, (_, i) => (
            <View key={i} style={[styles.minor, { left: (i / MINOR_TICKS) * (width - 1) }]} />
          ))}
          {scale.ticks.map((t, i) => <View key={`m${i}`} style={[styles.major, { left: Math.min(x(t.value), width - 1) }]} />)}
          <View style={styles.strip}>
            {scale.zones.map((z, i) => (
              <View key={i} style={{ flex: Math.max(z.end - z.start, 0.0001), backgroundColor: MeasureZone[z.tone] }} />
            ))}
          </View>

          {/* the limit, ruled in */}
          {limitX != null ? <View style={[styles.limitLine, { left: limitX - 0.75 }]} /> : null}

          {/* needle */}
          <View style={[styles.needleHead, { left: needleX - 5 }]} />
          <View style={[styles.needle, { left: needleX - 0.75 }]} />

          {/* reference values */}
          {rulerLabels(scale, width).map(({ label, value, at }, i) => {
            const isLimit = !!limit && value === limit.start;
            const pos = at <= 0.04
              ? { left: 0 }
              : at >= 0.96
                ? { right: 0 }
                : { left: Math.min(Math.max(at * width - LABEL_W / 2, 0), width - LABEL_W), width: LABEL_W, textAlign: 'center' as const };
            const color = isLimit ? Palette.weak : band && value === band.start ? Palette.strong : undefined;
            return (
              <Txt key={i} variant="caption" tone="tertiary" color={color} numberOfLines={1} style={[{ position: 'absolute', top: 56 }, pos]}>
                {isLimit ? `${label} limit` : label}
              </Txt>
            );
          })}
        </>
      ) : null}
     </View>

    </Animated.View>
  );
}

/** Label the reference values (never "0"), dropping any that would collide with the one before. */
function rulerLabels(scale: Measure['scale'], width: number) {
  const kept: { label: string; value: number; at: number }[] = [];
  for (const t of scale.ticks) {
    if (t.value === 0) continue;
    const at = scale.max ? t.value / scale.max : 0;
    const prev = kept[kept.length - 1];
    if (!prev || (at - prev.at) * width >= MIN_LABEL_GAP) kept.push({ label: t.label, value: t.value, at });
  }
  return kept;
}

const styles = StyleSheet.create({
  mark: { position: 'absolute', top: 2, width: 1.5, height: 5, borderRadius: 1, backgroundColor: Palette.ink3 },
  bracketLine: { position: 'absolute', top: 3, left: 0, right: 0, height: 1.5, borderRadius: 1 },
  bracketCap: { position: 'absolute', top: 0, width: 1.5, height: 8, borderRadius: 1 },
  minor: { position: 'absolute', top: 40, width: 1, height: 5, backgroundColor: Palette.ink4 },
  major: { position: 'absolute', top: 34, width: 1, height: 11, backgroundColor: Palette.ink3 },
  strip: { position: 'absolute', top: 46, left: 0, right: 0, height: 4, flexDirection: 'row', gap: 2, borderRadius: 2, overflow: 'hidden' },
  limitLine: { position: 'absolute', top: 14, width: 1.5, height: 36, backgroundColor: Palette.weak },
  needleHead: {
    position: 'absolute', top: 2, width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: Palette.ink,
  },
  needle: { position: 'absolute', top: 7, width: 1.5, height: 43, backgroundColor: Palette.ink },
});
