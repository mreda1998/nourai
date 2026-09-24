import React, { Children, ReactNode, isValidElement } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Palette, Radius, Shadows } from '@/constants/theme';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

/** iOS inset-grouped list container. Draws inset separators between rows. */
export function ListGroup({ children, style, night = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; night?: boolean }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View
      style={[
        {
          borderRadius: Radius.xl,
          borderCurve: 'continuous',
          backgroundColor: night ? Palette.nightRaised : Palette.surface,
          overflow: 'hidden',
        },
        night ? { borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.nightHairline } : Shadows.soft,
        style,
      ]}
    >
      {rows.map((row, i) => (
        <View key={row.key ?? i}>
          {row}
          {i < rows.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 60, backgroundColor: night ? Palette.nightHairline : Palette.hairline }} /> : null}
        </View>
      ))}
    </View>
  );
}

export function ListRow({ icon: Icon, iconTint, leading, title, subtitle, value, trailing, onPress, chevron = !!onPress, destructive, night = false }: {
  icon?: LucideIcon;
  iconTint?: string;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  night?: boolean;
}) {
  const content = (
    <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 }}>
      {leading ?? (Icon ? (
        <View style={{ width: 30, height: 30, borderRadius: 9, borderCurve: 'continuous', backgroundColor: iconTint ?? Palette.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={iconTint ? '#fff' : Palette.accent} strokeWidth={2} />
        </View>
      ) : null)}
      <View style={{ flex: 1 }}>
        <Txt variant="callout" tone={destructive ? 'weak' : night ? 'inverse' : 'primary'} numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="footnote" tone={night ? 'inverse2' : 'secondary'} numberOfLines={2} style={{ marginTop: 2 }}>{subtitle}</Txt> : null}
      </View>
      {value ? <Txt variant="subhead" tone={night ? 'inverse2' : 'secondary'}>{value}</Txt> : null}
      {trailing}
      {chevron ? <ChevronRight size={18} color={night ? Palette.nightInk3 : Palette.ink4} strokeWidth={2} /> : null}
    </View>
  );
  return onPress ? <PressableScale pressedScale={0.985} onPress={onPress} accessibilityLabel={title}>{content}</PressableScale> : content;
}
