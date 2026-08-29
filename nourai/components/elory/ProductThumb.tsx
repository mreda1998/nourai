import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts } from '@/constants/theme';

type ThumbColor = 'sand' | 'sage' | 'dark' | 'default';

interface Props {
  color?: ThumbColor;
  letter?: string;
  size?: number;
  imageUri?: string | null;
}

export function ProductThumb({ color = 'default', letter, size = 64, imageUri }: Props) {
  const bg =
    color === 'sand' ? Colors.sand
    : color === 'sage' ? 'rgba(123,174,142,0.25)'
    : color === 'dark' ? Colors.ink
    : '#D6D3CC';

  const textColor = color === 'dark' ? Colors.surface : Colors.ink;

  return (
    <View
      style={{
        width: size,
        height: size * 1.25,
        backgroundColor: imageUri ? Colors.surfaceCard : bg,
        borderTopLeftRadius: 999,
        borderTopRightRadius: 999,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
        borderWidth: 1,
        borderColor: Colors.borderHairline,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          transition={180}
          accessibilityLabel="Authentic product image"
        />
      ) : letter ? (
        <Text
          style={{
            fontFamily: Fonts.serifItalic,
            fontSize: size * 0.42,
            color: textColor,
            opacity: 0.5,
          }}
        >
          {letter}
        </Text>
      ) : null}
      {!imageUri ? (
        <View
          style={{
            position: 'absolute',
            top: '20%',
            left: '22%',
            width: 3,
            height: '40%',
            backgroundColor: 'rgba(255,255,255,0.4)',
            borderRadius: 2,
          }}
        />
      ) : null}
    </View>
  );
}
