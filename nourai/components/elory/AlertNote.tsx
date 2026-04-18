import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

type Tone = 'alert' | 'sage' | 'accent';

interface Props {
  title?: string;
  children: React.ReactNode;
  tone?: Tone;
}

export function AlertNote({ title, children, tone = 'alert' }: Props) {
  const c =
    tone === 'alert' ? Colors.alert
    : tone === 'sage' ? Colors.sage
    : Colors.accent;

  return (
    <View
      style={{
        borderLeftWidth: 2,
        borderLeftColor: c,
        paddingLeft: 14,
        paddingVertical: 10,
        marginVertical: 4,
      }}
    >
      {title && (
        <Text
          style={{
            fontFamily: Fonts.sansSemiBold,
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 1.4,
            color: c,
            marginBottom: 4,
          }}
        >
          {title}
        </Text>
      )}
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: 15,
          lineHeight: 22,
          color: Colors.ink,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
