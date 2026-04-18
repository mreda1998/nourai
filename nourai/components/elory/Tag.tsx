import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

type Tone = 'default' | 'strong' | 'accent' | 'sand' | 'sage' | 'alert' | 'dark';

interface Props {
  children: React.ReactNode;
  tone?: Tone;
  style?: ViewStyle;
}

export function Tag({ children, tone = 'default', style }: Props) {
  const toneStyles: Record<Tone, { borderColor: string; color: string; backgroundColor?: string; borderLeftWidth?: number; borderWidth?: number }> = {
    default:  { borderWidth: 1, borderColor: Colors.borderHairline, color: Colors.inkSecondary },
    strong:   { borderWidth: 1, borderColor: Colors.ink, color: Colors.ink },
    accent:   { borderWidth: 1, borderColor: Colors.accent, color: Colors.accent, backgroundColor: 'rgba(26,92,90,0.04)' },
    sand:     { borderWidth: 1, borderColor: 'rgba(184,151,99,0.4)', color: '#7A5A2E', backgroundColor: 'rgba(232,213,176,0.25)' },
    sage:     { borderWidth: 1, borderColor: 'rgba(123,174,142,0.5)', color: '#3A6850' },
    alert:    { borderLeftWidth: 3, borderColor: Colors.alert, color: Colors.alert },
    dark:     { borderWidth: 1, borderColor: 'rgba(241,237,228,0.22)', color: 'rgba(241,237,228,0.85)' },
  };

  const ts = toneStyles[tone];
  const isAlert = tone === 'alert';

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 4,
          paddingHorizontal: isAlert ? 10 : 10,
          borderRadius: isAlert ? 2 : 999,
          borderLeftWidth: ts.borderLeftWidth,
          borderWidth: ts.borderWidth,
          borderColor: ts.borderColor,
          backgroundColor: ts.backgroundColor ?? 'transparent',
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: Fonts.sansSemiBold,
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: ts.color,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
