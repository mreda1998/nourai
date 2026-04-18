import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Colors } from '@/constants/theme';
import { Eyebrow } from './Eyebrow';

interface Props {
  label: string;
  right?: string;
  style?: ViewStyle;
  dark?: boolean;
}

export function SectionHead({ label, right, style, dark }: Props) {
  const borderColor = dark ? 'rgba(241,237,228,0.15)' : Colors.borderStrong;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
          marginBottom: 16,
        },
        style,
      ]}
    >
      <Eyebrow dark={dark} color={dark ? 'rgba(241,237,228,0.55)' : Colors.ink}>
        {label}
      </Eyebrow>
      {right && (
        <Eyebrow dark={dark} color={dark ? 'rgba(241,237,228,0.38)' : Colors.inkTertiary}>
          {right}
        </Eyebrow>
      )}
    </View>
  );
}
