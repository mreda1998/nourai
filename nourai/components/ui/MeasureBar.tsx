import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Fonts, MeasureFill, MeasureInk, MeasureZone, Palette } from '@/constants/theme';
import type { Measure, MeasureTone } from '@/services/api';
import { Txt } from './Txt';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * The value against its reference, drawn like a lab instrument rather than a
 * slider. Nutrients fill cells of 5% each (so the FDA 5%/20% cut-offs land on
 * cell edges); doses and contaminants sit on a ruler with their range
 * bracketed and the limit ruled in.
 */
export function MeasureBar({ measure, style }: { measure: Measure; style?: StyleProp<ViewStyle> }) {
  if (measure.kind === 'dose' || measure.kind === 'contaminant') {
    return <DoseRuler measure={measure} style={style} />;
  }
  const word = measure.panel_label.split(' ').pop()?.toLowerCase() ?? 'reference';
  const marks = measure.kind === 'limit' ? [0.05, 0.2] : measure.kind === 'goal' ? [0.1, 0.2] : [];
  const legend = measure.kind === 'limit' ? 'Low ≤5% · high ≥20%' : measure.kind === 'goal' ? 'Good source ≥10% · high ≥20%' : 'Each cell is 5% of a day';
  const top = measure.scale.ticks[measure.scale.ticks.length - 1];
  return (
    <CellMeter
      style={style}
      position={measure.position}
      tone={measure.tone}
      marks={marks}
      callout={{ value: `${measure.percent ?? 0}%`, caption: `of daily ${word}` }}
      legend={{ left: legend, right: top ? `100% = ${top.label}` : undefined }}
    />
  );
}

// ─── Cells ───────────────────────────────────────────────────────────────────

const CELL_GAP = 3;
const CELL_H = 12;

export function CellMeter({ position, tone, cells = 20, marks = [], callout, legend, delay = 0, style }: {
  position: number;
  tone: MeasureTone;
  cells?: number;
  marks?: number[];
  callout?: { value: string; caption: string };
  legend?: { left?: string; right?: string };
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const [calloutW, setCalloutW] = useState(0);
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
    progress.value = withDelay(delay, withTiming(1, { duration: 800, easing: EASE }));
  }, [position, delay]);
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
      {callout && width ? (
        <View style={{ height: 34 }}>
          <Animated.View
            entering={FadeIn.duration(400).delay(300)}
            onLayout={(e) => setCalloutW(e.nativeEvent.layout.width)}
            style={[styles.callout, { left: Math.min(Math.max(fillX - calloutW / 2, 0), width - calloutW) }]}
          >
            <Txt style={styles.serifValue} color={MeasureInk[tone]}>{callout.value}</Txt>
            <Txt variant="caption" tone="secondary" style={{ marginLeft: 5 }}>{callout.caption}</Txt>
          </Animated.View>
          {fillX > 0 ? <View style={[styles.stem, { left: Math.min(fillX, width - 1) - 0.5 }]} /> : null}
        </View>
      ) : null}

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

      {legend ? (
        <View style={styles.legend}>
          <Txt variant="caption" tone="tertiary" style={{ flex: 1 }} numberOfLines={1}>{legend.left}</Txt>
          {legend.right ? <Txt variant="caption" tone="tertiary">{legend.right}</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}

// ─── Ruler ───────────────────────────────────────────────────────────────────

const MINOR_TICKS = 40;
const MIN_LABEL_GAP = 64;

function DoseRuler({ measure, style }: { measure: Measure; style?: StyleProp<ViewStyle> }) {
  const [width, setWidth] = useState(0);
  const [calloutW, setCalloutW] = useState(0);
  const { scale } = measure;
  const x = (v: number) => (scale.max ? Math.min(Math.max(v / scale.max, 0), 1) * width : 0);
  const needleX = Math.min(Math.max(measure.position, 0), 1) * width;
  const band = scale.zones.find((z) => z.tone === 'good');
  const limit = scale.zones.find((z) => z.tone === 'weak');
  const limitX = limit ? x(limit.start) : null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={style}>
     <View style={{ height: 100 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <>
          {/* reading */}
          <View
            onLayout={(e) => setCalloutW(e.nativeEvent.layout.width)}
            style={[styles.callout, { top: 0, left: Math.min(Math.max(needleX - calloutW / 2, 0), width - calloutW) }]}
          >
            <Txt style={styles.serifValue} color={MeasureInk[measure.tone]}>{measure.display_value}</Txt>
            <Txt variant="caption" tone="secondary" style={{ marginLeft: 4 }}>{measure.unit}</Txt>
          </View>

          {/* bracketed range */}
          {band ? (
            <View style={{ position: 'absolute', top: 46, left: x(band.start), width: Math.max(x(band.end) - x(band.start), 2) }}>
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
            const pos = at <= 0.04 ? { left: 0 } : at >= 0.96 ? { right: 0 } : { left: at * width - 40, width: 80, textAlign: 'center' as const };
            const color = limit && value === limit.start ? Palette.weak : band && value === band.start ? Palette.strong : undefined;
            return (
              <Txt key={i} variant="caption" tone="tertiary" color={color} style={[{ position: 'absolute', top: 84 }, pos]}>{label}</Txt>
            );
          })}
        </>
      ) : null}
     </View>

      {/* what the bracket and the rule mean */}
      {(band && scale.band_label) || (limit && scale.limit_label) ? (
        <View style={styles.legend}>
          {band && scale.band_label ? (
            <View style={styles.legendItem}>
              <View style={styles.bracketGlyph}>
                <View style={[styles.bracketLine, { backgroundColor: Palette.strong }]} />
                <View style={[styles.bracketCap, { left: 0, backgroundColor: Palette.strong }]} />
                <View style={[styles.bracketCap, { right: 0, backgroundColor: Palette.strong }]} />
              </View>
              <Txt variant="caption" tone="secondary">{scale.band_label}</Txt>
            </View>
          ) : null}
          {limit && scale.limit_label ? (
            <View style={styles.legendItem}>
              <View style={styles.limitGlyph} />
              <Txt variant="caption" tone="secondary">{scale.limit_label}</Txt>
            </View>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

/** Drop a reference label that would collide with the one before it. */
function rulerLabels(scale: Measure['scale'], width: number) {
  const kept: { label: string; value: number; at: number }[] = [];
  for (const t of scale.ticks) {
    const at = scale.max ? t.value / scale.max : 0;
    const prev = kept[kept.length - 1];
    // A left-aligned "0" is narrow, so the next label can sit closer to it.
    const gap = prev && prev.at <= 0.04 ? MIN_LABEL_GAP * 0.75 : MIN_LABEL_GAP;
    if (!prev || (at - prev.at) * width >= gap) kept.push({ label: t.label, value: t.value, at });
  }
  return kept;
}

const styles = StyleSheet.create({
  callout: { position: 'absolute', flexDirection: 'row', alignItems: 'baseline' },
  serifValue: { fontFamily: Fonts.serif, fontSize: 26, lineHeight: 28, letterSpacing: -0.3 },
  stem: { position: 'absolute', bottom: 0, width: 1, height: 5, backgroundColor: Palette.ink3 },
  mark: { position: 'absolute', top: 2, width: 1.5, height: 5, borderRadius: 1, backgroundColor: Palette.ink3 },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  bracketLine: { position: 'absolute', top: 3, left: 0, right: 0, height: 1.5, borderRadius: 1 },
  bracketCap: { position: 'absolute', top: 0, width: 1.5, height: 8, borderRadius: 1 },
  minor: { position: 'absolute', top: 68, width: 1, height: 5, backgroundColor: Palette.ink4 },
  major: { position: 'absolute', top: 62, width: 1, height: 11, backgroundColor: Palette.ink3 },
  strip: { position: 'absolute', top: 74, left: 0, right: 0, height: 4, flexDirection: 'row', gap: 2, borderRadius: 2, overflow: 'hidden' },
  limitLine: { position: 'absolute', top: 42, width: 1.5, height: 36, backgroundColor: Palette.weak },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bracketGlyph: { width: 16, height: 8 },
  limitGlyph: { width: 1.5, height: 11, borderRadius: 1, backgroundColor: Palette.weak },
  needleHead: {
    position: 'absolute', top: 30, width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: Palette.ink,
  },
  needle: { position: 'absolute', top: 35, width: 1.5, height: 43, backgroundColor: Palette.ink },
});
