import React, { ReactNode } from 'react';
import { ActivityIndicator, StyleProp, View, ViewStyle } from 'react-native';
import { Palette, Radius } from '@/constants/theme';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'night' | 'inverse' | 'destructive';
type Size = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const heights: Record<Size, number> = { lg: 56, md: 46, sm: 36 };
const pad: Record<Size, number> = { lg: 24, md: 18, sm: 14 };

const skins: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: Palette.accent, fg: Palette.onAccent },
  secondary: { bg: Palette.surface, fg: Palette.ink, border: Palette.hairline },
  tertiary: { bg: 'transparent', fg: Palette.accent },
  night: { bg: Palette.nightInk, fg: Palette.night },
  inverse: { bg: 'rgba(244,241,234,0.12)', fg: Palette.nightInk, border: Palette.nightHairline },
  destructive: { bg: Palette.weakSoft, fg: Palette.weak },
};

export function Button({ label, onPress, variant = 'primary', size = 'lg', icon, iconRight, loading, disabled, fullWidth = true, style, accessibilityHint }: ButtonProps) {
  const skin = skins[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      pressedScale={0.96}
      haptic={variant === 'primary' ? 'medium' : 'light'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={[
        {
          height: heights[size],
          paddingHorizontal: pad[size],
          borderRadius: size === 'sm' ? Radius.pill : Radius.lg,
          borderCurve: 'continuous',
          backgroundColor: skin.bg,
          borderWidth: skin.border ? 1 : 0,
          borderColor: skin.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={skin.fg} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Txt variant={size === 'sm' ? 'footnoteStrong' : 'headline'} color={skin.fg}>{label}</Txt>
          {iconRight ? <View>{iconRight}</View> : null}
        </>
      )}
    </PressableScale>
  );
}
