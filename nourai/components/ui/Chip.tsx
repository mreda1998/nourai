import React from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { Tone, toneColor, toneSoft } from '@/utils/grade';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

/** Selectable filter chip. */
export function Chip({ label, selected, onPress, icon: Icon, night = false }: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  night?: boolean;
}) {
  const bg = selected ? (night ? Palette.nightInk : Palette.ink) : night ? 'rgba(244,241,234,0.08)' : Palette.surface;
  const fg = selected ? (night ? Palette.night : Palette.nightInk) : night ? Palette.nightInk : Palette.ink;
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      pressedScale={0.94}
      accessibilityState={{ selected }}
      style={{
        height: 36,
        paddingHorizontal: 15,
        borderRadius: 18,
        backgroundColor: bg,
        borderWidth: selected ? 0 : StyleSheet.hairlineWidth,
        borderColor: night ? Palette.nightHairline : Palette.hairline,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {Icon ? <Icon size={15} color={fg} strokeWidth={2} /> : null}
      <Txt variant="footnoteStrong" color={fg}>{label}</Txt>
    </PressableScale>
  );
}

export function ChipRow<T extends string>({ options, value, onChange, style, night }: {
  options: { key: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (k: T) => void;
  style?: StyleProp<ViewStyle>;
  night?: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginHorizontal: -20 }, style]} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {options.map((o) => <Chip key={o.key} label={o.label} icon={o.icon} selected={o.key === value} onPress={() => onChange(o.key)} night={night} />)}
    </ScrollView>
  );
}

/** Non-interactive status pill, coloured by evidence tone. */
export function Pill({ label, tone = 'neutral', icon: Icon, style }: { label: string; tone?: Tone | 'accent'; icon?: LucideIcon; style?: StyleProp<ViewStyle> }) {
  const fg = tone === 'accent' ? Palette.accent : toneColor(tone);
  const bg = tone === 'accent' ? Palette.accentSoft : toneSoft(tone);
  return (
    <View style={[{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: bg }, style]}>
      {Icon ? <Icon size={13} color={fg} strokeWidth={2.2} /> : null}
      <Txt variant="caption" color={tone === 'neutral' ? Palette.ink2 : fg}>{label}</Txt>
    </View>
  );
}
