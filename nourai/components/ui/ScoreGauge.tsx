import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { Motion, Palette } from '@/constants/theme';
import { Txt } from './Txt';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Oura-style open arc gauge. 240° sweep, tick dots, animated fill.
 * `night` renders for dark hero backgrounds.
 */
export function ScoreGauge({ score, size = 260, label, qualifier, night = false, max = 100 }: {
  score: number | null;
  size?: number;
  label?: string;
  qualifier?: string;
  night?: boolean;
  max?: number;
}) {
  const stroke = 5;
  const r = size / 2 - stroke * 3;
  const cx = size / 2;
  const cy = size / 2;
  const sweep = 240;
  const start = 90 + (360 - sweep) / 2; // bottom-left

  const polar = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const a = polar(start);
  const b = polar(start + sweep);
  const d = `M ${a.x} ${a.y} A ${r} ${r} 0 1 1 ${b.x} ${b.y}`;
  const length = (sweep / 360) * 2 * Math.PI * r;

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(score == null ? 0 : Math.min(1, Math.max(0, score / max)), {
      duration: Motion.gaugeMs,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
  }, [score, max]);

  const fillProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - progress.value) }));
  const knobProps = useAnimatedProps(() => {
    const deg = start + sweep * progress.value;
    const rad = (deg * Math.PI) / 180;
    return { cx: cx + r * Math.cos(rad), cy: cy + r * Math.sin(rad), opacity: progress.value > 0.01 ? 1 : 0 };
  });

  const track = night ? 'rgba(244,241,234,0.14)' : Palette.hairline;
  const tickColor = night ? 'rgba(244,241,234,0.45)' : Palette.ink4;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const deg = start + sweep * t;
    const rad = (deg * Math.PI) / 180;
    const rr = r + 14;
    return { x: cx + rr * Math.cos(rad), y: cy + rr * Math.sin(rad) };
  });

  return (
    <View style={{ width: size, height: size * 0.82, alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0 }}>
        <Defs>
          <LinearGradient id="gaugeFill" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={night ? 'rgba(244,241,234,0.55)' : '#6FAE97'} />
            <Stop offset="1" stopColor={night ? '#F4F1EA' : Palette.accent} />
          </LinearGradient>
        </Defs>
        <Path d={d} stroke={track} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        <AnimatedPath
          d={d}
          stroke="url(#gaugeFill)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${length} ${length}`}
          animatedProps={fillProps}
        />
        <AnimatedCircle r={7} fill={night ? Palette.nightInk : Palette.surface} stroke={night ? 'transparent' : Palette.accent} strokeWidth={2} animatedProps={knobProps} />
        {ticks.map((t, i) => <Circle key={i} cx={t.x} cy={t.y} r={1.6} fill={tickColor} />)}
      </Svg>
      <View style={{ position: 'absolute', top: size * 0.3, alignItems: 'center' }}>
        {label ? <Txt variant="overline" tone={night ? 'inverse2' : 'secondary'}>{label}</Txt> : null}
        <Txt variant="gauge" tone={night ? 'inverse' : 'primary'} style={{ marginTop: 2 }}>
          {score == null ? '–' : Math.round(score)}
        </Txt>
        {qualifier ? <Txt variant="subheadStrong" tone={night ? 'inverse2' : 'accent'}>{qualifier}</Txt> : null}
      </View>
    </View>
  );
}
