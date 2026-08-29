import React from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { ProductThumb } from './ProductThumb';
import { EvidenceSpectrum } from './EvidenceSpectrum';

function scoreToDots(value: number): number {
  if (value >= 80) return 5;
  if (value >= 65) return 4;
  if (value >= 50) return 3;
  if (value >= 35) return 2;
  return 1;
}

function scoreToQualifier(value: number): string {
  if (value >= 80) return 'High';
  if (value >= 65) return 'Good';
  if (value >= 50) return 'Moderate';
  return 'Low';
}

interface Props {
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  score: number;
  qualifier?: string;
  onPress?: () => void;
}

export function ScoreListRow({ imageUrl, title, subtitle, score, qualifier, onPress }: Props) {
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: 44, height: 55, borderRadius: 6, backgroundColor: Colors.surfaceAlt }} />
      ) : (
        <ProductThumb size={44} letter={title.charAt(0)} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 16, color: Colors.ink }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: Colors.inkSecondary, marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 18, color: Colors.ink }}>
          {Math.round(score)}
          <Text style={{ fontFamily: Fonts.sans, fontSize: 11, color: Colors.inkTertiary }}> /100</Text>
        </Text>
        <EvidenceSpectrum strength={scoreToDots(score)} max={5} label={qualifier ?? scoreToQualifier(score)} />
      </View>
    </Wrapper>
  );
}
