import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { Palette, Type, TypeVariant } from '@/constants/theme';

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'strong' | 'moderate' | 'weak' | 'inverse' | 'inverse2' | 'inverse3' | 'gold';

const toneColor: Record<TextTone, string> = {
  primary: Palette.ink,
  secondary: Palette.ink2,
  tertiary: Palette.ink3,
  accent: Palette.accent,
  strong: Palette.strong,
  moderate: Palette.moderate,
  weak: Palette.weak,
  inverse: Palette.nightInk,
  inverse2: Palette.nightInk2,
  inverse3: Palette.nightInk3,
  gold: Palette.gold,
};

export interface TxtProps extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  color?: string;
  align?: TextStyle['textAlign'];
  italic?: boolean;
}

/** The only text component screens should need. */
export function Txt({ variant = 'body', tone = 'primary', color, align, italic, style, ...rest }: TxtProps) {
  const base = Type[variant] as TextStyle;
  const italicFamily = italic && base.fontFamily?.startsWith('InstrumentSerif') ? { fontFamily: 'InstrumentSerif_400Regular_Italic' } : null;
  return (
    <Text
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[base, { color: color ?? toneColor[tone] }, align ? { textAlign: align } : null, italicFamily, style]}
      {...rest}
    />
  );
}
