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

export function EvidenceSpectrum({ strength = 3, max = 5, color, label, dark }: Props) {
  const c = color ?? (dark ? Colors.sand : Colors.ink);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              borderWidth: 0.8,
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
            letterSpacing: 0.1,
            color: dark ? 'rgba(241,237,228,0.55)' : Colors.inkSecondary,
          }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}
