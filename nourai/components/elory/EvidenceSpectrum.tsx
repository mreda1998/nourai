import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  strength?: number;
  max?: number;
  color?: string;
  label?: string;
  dark?: boolean;
}

export function EvidenceSpectrum({ strength = 3, max = 4, color, label, dark }: Props) {
  const c = color ?? (dark ? Colors.sand : Colors.ink);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: c,
              backgroundColor: i < strength ? c : 'transparent',
            }}
          />
        ))}
      </View>
      {label && (
        <Text
          style={{
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
    </View>
  );
}
