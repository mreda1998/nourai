import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Colors, Fonts } from '@/constants/theme';

type Tone = 'ink' | 'alert' | 'sage' | 'accent';

interface Props {
  position?: number;
  label?: string;
  right?: string;
  tone?: Tone;
  dark?: boolean;
  gradient?: boolean;
}

export function SpectrumBar({ position = 0.6, label, right, tone = 'ink', dark, gradient = false }: Props) {
  const fill =
    tone === 'alert' ? Colors.alert
    : tone === 'sage' ? Colors.sage
    : tone === 'accent' ? Colors.accent
    : dark ? Colors.sand
    : Colors.ink;

  const trackColor = dark ? 'rgba(241,237,228,0.12)' : Colors.borderHairline;
  const pct = Math.round(position * 100);
  const trackHeight = 2;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {label && (
        <Text
          style={{
            width: 76,
            fontFamily: Fonts.sansSemiBold,
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.0,
            color: dark ? 'rgba(241,237,228,0.55)' : Colors.inkSecondary,
          }}
        >
          {label}
        </Text>
      )}
      <View style={{ flex: 1, height: trackHeight, backgroundColor: gradient ? 'transparent' : trackColor, position: 'relative' }}>
        {gradient ? (
          <Svg width="100%" height={trackHeight} style={{ borderRadius: trackHeight / 2 }}>
            <Defs>
              <LinearGradient id="spectrumGradient" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={Colors.accent} />
                <Stop offset="0.5" stopColor={Colors.sand} />
                <Stop offset="1" stopColor={Colors.alert} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={trackHeight} rx={trackHeight / 2} fill="url(#spectrumGradient)" />
          </Svg>
        ) : (
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct}%`,
              backgroundColor: fill,
            }}
          />
        )}
        <View
          style={{
            position: 'absolute',
            left: `${pct}%`,
            top: -3,
            marginLeft: -4,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: fill,
          }}
        />
      </View>
      {right && (
        <Text
          style={{
            width: 72,
            fontFamily: Fonts.serifItalic,
            fontSize: 13,
            color: dark ? 'rgba(241,237,228,0.55)' : Colors.inkSecondary,
            textAlign: 'right',
          }}
        >
          {right}
        </Text>
      )}
    </View>
  );
}
