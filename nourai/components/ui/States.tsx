import React, { ReactNode, useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import { Button } from './Button';
import { Txt } from './Txt';

/** Honest empty state — never fill with fake data. */
export function EmptyState({ icon: Icon, title, message, action, onAction, secondary, style, night = false }: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
  secondary?: ReactNode;
  style?: StyleProp<ViewStyle>;
  night?: boolean;
}) {
  return (
    <View style={[{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 12 }, style]}>
      {Icon ? (
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: night ? 'rgba(244,241,234,0.08)' : Palette.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <Icon size={28} color={night ? Palette.nightInk : Palette.accent} strokeWidth={1.6} />
        </View>
      ) : null}
      <Txt variant="title2" tone={night ? 'inverse' : 'primary'} align="center">{title}</Txt>
      {message ? <Txt variant="subhead" tone={night ? 'inverse2' : 'secondary'} align="center" style={{ marginTop: 8, maxWidth: 300 }}>{message}</Txt> : null}
      {action && onAction ? <Button label={action} onPress={onAction} size="md" fullWidth={false} style={{ marginTop: 22 }} /> : null}
      {secondary}
    </View>
  );
}

/** Shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, []);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: Palette.sunken }, s, style]} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ padding: 18, borderRadius: Radius.xl, backgroundColor: Palette.surface, gap: 12, marginBottom: 12 }}>
      <Skeleton width="40%" height={12} />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} />)}
    </View>
  );
}
