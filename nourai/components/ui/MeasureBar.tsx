import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { MeasureRamp, MeasureRampStops, MeasureZone, Palette, Shadows } from '@/constants/theme';
import type { Measure } from '@/services/api';
import { Txt } from './Txt';

const TRACK = 6;
const THUMB_W = 8;
const THUMB_H = 20;
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * A value against its reference.
 * - limit / goal / reference: one fixed ramp spans the track and the fill
 *   reveals it up to the value, so the colour at the marker is the verdict
 *   (stops are anchored to the FDA bands — see MeasureRampStops).
 * - dose / contaminant: the server's zones are drawn, the marker sits on them.
 * - `spectrum`: the whole ramp is shown (processing level).
 */
export function MeasureBar({ kind, position, scale, spectrum = false, delay = 0, style }: {
  kind: Measure['kind'];
  position: number;
  scale?: Pick<Measure['scale'], 'max' | 'ticks' | 'zones'>;
  spectrum?: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(Math.min(1, Math.max(0, position)), { duration: 900, easing: EASE }));
  }, [position, delay]);

  const fill = useAnimatedStyle(() => ({ width: progress.value * width }), [width]);
  const thumb = useAnimatedStyle(() => {
    const x = progress.value * width - THUMB_W / 2;
    return { transform: [{ translateX: Math.min(Math.max(x, -1), width - THUMB_W + 1) }] };
  }, [width]);

  const zones = scale?.zones ?? [];
  const rampKey = kind === 'goal' ? 'goal' : kind === 'reference' ? 'reference' : 'limit';
  const ramp = [...MeasureRamp[rampKey]] as [string, string, ...string[]];
  // A spectrum spreads the ramp evenly; a value bar anchors it to the bands.
  const stops = spectrum ? undefined : ([...MeasureRampStops[rampKey]] as [number, number, ...number[]]);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={style}>
      <View onLayout={onLayout} style={{ height: THUMB_H, justifyContent: 'center' }}>
        <View style={styles.track}>
          {zones.length ? (
            <View style={{ flexDirection: 'row', flex: 1, gap: 2 }}>
              {zones.map((z, i) => (
                <View key={i} style={{ flex: Math.max(z.end - z.start, 0.0001), backgroundColor: MeasureZone[z.tone] }} />
              ))}
            </View>
          ) : spectrum ? (
            <LinearGradient colors={ramp} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          ) : (
            <Animated.View style={[{ height: TRACK, overflow: 'hidden' }, fill]}>
              <LinearGradient colors={ramp} locations={stops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width, height: TRACK }} />
            </Animated.View>
          )}
        </View>
        {width ? <Animated.View style={[styles.thumb, thumb]} /> : null}
      </View>

      {scale?.ticks?.length && width ? (
        <View style={{ height: 16, marginTop: 6 }}>
          {visibleTicks(scale, width).map(({ label, f }, i) => {
            const edge = f <= 0.04 ? { left: 0 } : f >= 0.96 ? { right: 0 } : { left: f * width - 40, width: 80, textAlign: 'center' as const };
            return <Txt key={i} variant="caption" tone="tertiary" style={[{ position: 'absolute' }, edge]}>{label}</Txt>;
          })}
        </View>
      ) : null}
    </View>
  );
}

const MIN_TICK_GAP = 64;

/** Drop a tick label that would collide with the one before it. */
function visibleTicks(scale: Pick<Measure['scale'], 'max' | 'ticks'>, width: number) {
  const kept: { label: string; f: number }[] = [];
  for (const t of scale.ticks) {
    const f = scale.max ? t.value / scale.max : 0;
    const prev = kept[kept.length - 1];
    // A left-aligned "0" is narrow, so the next label can sit closer to it.
    const gap = prev && prev.f <= 0.04 ? MIN_TICK_GAP * 0.75 : MIN_TICK_GAP;
    if (!prev || (f - prev.f) * width >= gap) kept.push({ label: t.label, f });
  }
  return kept;
}

const styles = StyleSheet.create({
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: 'rgba(14, 31, 30, 0.08)',
    overflow: 'hidden',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: THUMB_W / 2,
    backgroundColor: Palette.ink,
    borderWidth: 2,
    borderColor: Palette.surface,
    ...Shadows.soft,
  },
});
