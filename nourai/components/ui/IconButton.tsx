import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { PressableScale } from './PressableScale';

type Variant = 'surface' | 'plain' | 'night' | 'glass' | 'accent';

const skins: Record<Variant, { bg: string; fg: string; border?: string }> = {
  surface: { bg: Palette.surface, fg: Palette.ink, border: Palette.hairline },
  plain: { bg: 'transparent', fg: Palette.ink },
  night: { bg: 'rgba(244,241,234,0.10)', fg: Palette.nightInk, border: Palette.nightHairline },
  glass: { bg: 'rgba(252,251,248,0.82)', fg: Palette.ink },
  accent: { bg: Palette.accent, fg: Palette.onAccent },
};

export function IconButton({ icon: Icon, onPress, label, variant = 'surface', size = 40, iconSize = 20, style }: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  variant?: Variant;
  size?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const skin = skins[variant];
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      pressedScale={0.9}
      hitSlop={8}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: skin.bg,
          borderWidth: skin.border ? StyleSheet.hairlineWidth : 0,
          borderColor: skin.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon size={iconSize} color={skin.fg} strokeWidth={1.75} />
    </PressableScale>
  );
}
