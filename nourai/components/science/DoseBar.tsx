import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Fonts, Palette } from '@/constants/theme';
import type { DoseBarData } from '@/services/api';
import { Txt } from '@/components/ui';
import { doseText, plain } from './labels';

const TRACK_Y = 30;

/**
 * A ruler: the dose range studies used (shaded), the upper safe limit when
 * known (gold tick), and where this product or your logged amount sits.
 * Being inside the band means "the amount studied", not "guaranteed to work".
 */
export function DoseBar({ bar, amountLabel = 'This product' }: { bar: DoseBarData; amountLabel?: string }) {
  const [width, setWidth] = useState(0);
  const values = [bar.studied_high, bar.amount_value ?? 0, bar.upper_limit_value ?? 0];
  const max = Math.max(...values) * 1.25 || 1;
  const x = (v: number) => 8 + (v / max) * (width - 16);
  const unit = bar.unit_label;
  const band = bar.studied_low === bar.studied_high;
  const amountColour = bar.amount_value == null
    ? Palette.ink3
    : bar.upper_limit_value != null && bar.amount_value > bar.upper_limit_value
      ? Palette.weak
      : bar.amount_value >= bar.studied_low && bar.amount_value <= bar.studied_high
        ? Palette.strong
        : Palette.moderate;

  return (
    <View
      accessible
      accessibilityLabel={`Studied dose ${doseText(bar.studied_low, bar.studied_high, unit)}. ${
        bar.amount_value != null ? `${amountLabel}: ${plain(bar.amount_value)} ${unit}.` : bar.amount_note ?? ''}`}
    >
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 64 }}>
        {width > 0 ? (
          <Svg width={width} height={64}>
            <Line x1={8} x2={width - 8} y1={TRACK_Y} y2={TRACK_Y} stroke={Palette.ink4} strokeWidth={2} strokeLinecap="round" />
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <Line key={f} x1={8 + f * (width - 16)} x2={8 + f * (width - 16)} y1={TRACK_Y - 3} y2={TRACK_Y + 3} stroke={Palette.ink4} strokeWidth={1} />
            ))}
            {band ? (
              <Rect x={x(bar.studied_low) - 3} y={TRACK_Y - 7} width={6} height={14} rx={3} fill={Palette.accent} opacity={0.35} />
            ) : (
              <Rect x={x(bar.studied_low)} y={TRACK_Y - 7} width={Math.max(x(bar.studied_high) - x(bar.studied_low), 4)} height={14} rx={7} fill={Palette.accent} opacity={0.22} />
            )}
            <SvgText x={x(bar.studied_low)} y={TRACK_Y + 22} fontSize={11} fontFamily={Fonts.sansMedium} fill={Palette.accent}
              textAnchor={band ? 'middle' : 'start'}>
              {`Studied ${doseText(bar.studied_low, bar.studied_high, unit)}`}
            </SvgText>
            {bar.upper_limit_value != null ? (
              <>
                <Line x1={x(bar.upper_limit_value)} x2={x(bar.upper_limit_value)} y1={TRACK_Y - 11} y2={TRACK_Y + 11} stroke={Palette.gold} strokeWidth={2} />
                <SvgText x={x(bar.upper_limit_value)} y={TRACK_Y + 22} fontSize={11} fontFamily={Fonts.sansMedium} fill={Palette.gold} textAnchor="middle">
                  {`Upper limit ${plain(bar.upper_limit_value)}`}
                </SvgText>
              </>
            ) : null}
            {bar.amount_value != null ? (
              <>
                <Path d={`M ${x(bar.amount_value) - 6} ${TRACK_Y - 16} L ${x(bar.amount_value) + 6} ${TRACK_Y - 16} L ${x(bar.amount_value)} ${TRACK_Y - 8} Z`} fill={amountColour} />
                <SvgText x={Math.min(Math.max(x(bar.amount_value), 40), width - 40)} y={TRACK_Y - 20} fontSize={11} fontFamily={Fonts.sansSemiBold} fill={amountColour} textAnchor="middle">
                  {`${amountLabel} ${plain(bar.amount_value)} ${unit}`}
                </SvgText>
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
      {bar.amount_value == null && bar.amount_note ? (
        <Txt variant="caption" tone="tertiary">{bar.amount_note}</Txt>
      ) : null}
    </View>
  );
}
