import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Palette } from '@/constants/theme';
import { scoreTone, toneColor } from '@/utils/grade';
import { Txt } from './Txt';

/** Compact ring + number used in list rows and cards (Bevel-style mini gauge). */
export function ScoreBadge({ score, size = 40, night = false }: { score: number | null; size?: number; night?: boolean }) {
  const stroke = size >= 48 ? 3.5 : 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const color = toneColor(scoreTone(score));
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityLabel={score == null ? 'Not rated' : `Score ${Math.round(score)} of 100`}
    >
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={night ? Palette.nightHairline : Palette.hairline} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
        />
      </Svg>
      <Txt variant="numeral" tone={night ? 'inverse' : 'primary'} style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>
        {score == null ? '–' : Math.round(score)}
      </Txt>
    </View>
  );
}
