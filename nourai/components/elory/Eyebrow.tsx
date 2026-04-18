import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  style?: TextStyle;
  color?: string;
  dark?: boolean;
}

export function Eyebrow({ children, style, color, dark }: Props) {
  return (
    <Text
      style={[
        {
          fontFamily: Fonts.sansSemiBold,
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 1.4,
          color: color ?? (dark ? 'rgba(241,237,228,0.55)' : Colors.inkSecondary),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
