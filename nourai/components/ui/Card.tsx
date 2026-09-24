import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { PressableScale } from './PressableScale';

type Variant = 'raised' | 'flat' | 'sunken' | 'night' | 'accent';

export interface CardProps {
  children: ReactNode;
  variant?: Variant;
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}

const variants: Record<Variant, ViewStyle> = {
  raised: { backgroundColor: Palette.surface, ...Shadows.card },
  flat: { backgroundColor: Palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.hairline },
  sunken: { backgroundColor: Palette.sunken },
  night: { backgroundColor: Palette.nightRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.nightHairline },
  accent: { backgroundColor: Palette.accent },
};

export function Card({ children, variant = 'raised', padding = 18, radius = Radius.xl, style, onPress, accessibilityLabel }: CardProps) {
  const base: ViewStyle = { borderRadius: radius, borderCurve: 'continuous', padding, ...variants[variant] };
  if (onPress) {
    return (
      <PressableScale accessibilityLabel={accessibilityLabel} onPress={onPress} style={[base, style]}>
        {children}
      </PressableScale>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}
