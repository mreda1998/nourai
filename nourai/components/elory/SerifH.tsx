import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  size?: number;
  italic?: boolean;
  style?: TextStyle;
  dark?: boolean;
}

export function SerifH({ children, size = 28, italic = false, style, dark }: Props) {
  return (
    <Text
      style={[
        {
          fontFamily: italic ? Fonts.serifItalic : Fonts.serif,
          fontSize: size,
          fontWeight: '400',
          lineHeight: size * 1.05,
          letterSpacing: -0.2,
          color: dark ? Colors.darkInk : Colors.ink,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
