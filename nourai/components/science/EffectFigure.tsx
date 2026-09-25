import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { Palette } from '@/constants/theme';
import type { RouteClaim } from '@/services/api';
import { Txt } from '@/components/ui';
import { effectParts, plain } from './labels';

const W = 132;
const H = 22;

/**
 * A measured result the way a paper shows it: the estimate as a large
 * figure, plus a one-line forest plot — the confidence interval against a
 * zero line. The interval is uncertainty about the study average, not the
 * range the reader should expect for themselves.
 */
export function EffectFigure({ claim, tone = 'supports' }: { claim: RouteClaim; tone?: 'supports' | 'mixed' | 'risk' }) {
  if (claim.effect_estimate == null) return null;
  const { value, unit, caption } = effectParts(claim.effect_estimate, claim.effect_unit);
  const colour = tone === 'risk' ? Palette.weak : tone === 'mixed' ? Palette.moderate : Palette.strong;
  const hasCi = claim.ci_low != null && claim.ci_high != null;

  let plot: React.ReactNode = null;
  if (hasCi) {
    const lo = Math.min(claim.ci_low!, 0, claim.effect_estimate);
    const hi = Math.max(claim.ci_high!, 0, claim.effect_estimate);
    const pad = (hi - lo) * 0.18 || 1;
    const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * W;
    const cx = x(claim.effect_estimate);
    plot = (
      <Svg width={W} height={H} accessibilityElementsHidden>
        <Line x1={x(0)} x2={x(0)} y1={1} y2={H - 1} stroke={Palette.ink3} strokeWidth={1} strokeDasharray="2 2" />
        <Line x1={x(claim.ci_low!)} x2={x(claim.ci_high!)} y1={H / 2} y2={H / 2} stroke={colour} strokeWidth={2} strokeLinecap="round" />
        <Rect x={x(claim.ci_low!) - 0.75} y={H / 2 - 4} width={1.5} height={8} fill={colour} />
        <Rect x={x(claim.ci_high!) - 0.75} y={H / 2 - 4} width={1.5} height={8} fill={colour} />
        <Path d={`M ${cx} ${H / 2 - 6} L ${cx + 6} ${H / 2} L ${cx} ${H / 2 + 6} L ${cx - 6} ${H / 2} Z`} fill={colour} />
      </Svg>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`Result ${value} ${unit}${hasCi ? `, 95 percent confidence interval ${plain(claim.ci_low!)} to ${plain(claim.ci_high!)}` : ''}`}
      style={{ marginTop: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <Txt variant="display" color={colour} style={{ fontVariant: ['tabular-nums'] }}>
          {value}
          {unit ? <Txt variant="title3" color={colour}>{` ${unit}`}</Txt> : null}
        </Txt>
        {plot ? <View style={{ paddingBottom: 9 }}>{plot}</View> : null}
      </View>
      {hasCi ? (
        <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>
          95% CI {plain(claim.ci_low!)} to {plain(claim.ci_high!)}{unit ? ` ${unit}` : ''} · dashed line = no effect
        </Txt>
      ) : null}
      {caption ? <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>{caption}</Txt> : null}
    </View>
  );
}
