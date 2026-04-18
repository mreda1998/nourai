import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

type Tone = 'ink' | 'alert' | 'sage' | 'accent';

interface Props {
  position?: number;
  label?: string;
  right?: string;
  tone?: Tone;
  dark?: boolean;
}

export function SpectrumBar({ position = 0.6, label, right, tone = 'ink', dark }: Props) {
  const fill =
    tone === 'alert' ? Colors.alert
    : tone === 'sage' ? Colors.sage
    : tone === 'accent' ? Colors.accent
    : dark ? Colors.sand
    : Colors.ink;

  const trackColor = dark ? 'rgba(241,237,228,0.12)' : Colors.borderHairline;
  const pct = Math.round(position * 100);

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
      <View style={{ flex: 1, height: 2, backgroundColor: trackColor, position: 'relative' }}>
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
