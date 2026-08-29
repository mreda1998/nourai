import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  label: string;
  value: number;
  max?: number;
  dark?: boolean;
}

export function FactorBar({ label, value, max = 100, dark }: Props) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const trackColor = dark ? 'rgba(241,237,228,0.12)' : Colors.borderHairline;
  const fillColor = dark ? Colors.sand : Colors.accent;
  const textColor = dark ? Colors.darkInk : Colors.ink;
  const labelColor = dark ? 'rgba(241,237,228,0.7)' : Colors.inkSecondary;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
      <Text style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 13, color: labelColor }}>{label}</Text>
      <View style={{ width: 72, height: 4, borderRadius: 2, backgroundColor: trackColor, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: fillColor, borderRadius: 2 }} />
      </View>
      <Text style={{ width: 40, textAlign: 'right', fontFamily: Fonts.sansMedium, fontSize: 13, color: textColor }}>
        {Math.round(value)}
        <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: labelColor }}>/{max}</Text>
      </Text>
    </View>
  );
}
