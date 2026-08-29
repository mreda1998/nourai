import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { ScoreRing } from './ScoreRing';
import { EvidenceSpectrum } from './EvidenceSpectrum';
import { Eyebrow } from './Eyebrow';
import type { HealthDomainFactor } from '@/services/api';

function strengthToDots(strength: string): number {
  if (strength === 'Strong') return 4;
  if (strength === 'Moderate') return 3;
  return 1;
}

interface Props {
  score: number;
  qualifier: string;
  factors: HealthDomainFactor[];
  dark?: boolean;
}

export function HealthScoreCard({ score, qualifier, factors, dark }: Props) {
  const cardBg = dark ? 'rgba(241,237,228,0.05)' : Colors.surfaceCard;
  const borderColor = dark ? 'rgba(241,237,228,0.12)' : Colors.borderHairline;
  const textColor = dark ? Colors.darkInk : Colors.ink;

  return (
    <View
      style={{
        backgroundColor: cardBg,
        borderWidth: 0.5,
        borderColor,
        borderRadius: Radius.lg,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <View style={{ alignItems: 'center', marginBottom: factors.length > 0 ? 20 : 0 }}>
        <ScoreRing score={score} qualifier={qualifier} size={110} dark={dark} />
      </View>
      {factors.length > 0 && (
        <>
          <Eyebrow dark={dark} style={{ marginBottom: 10 }}>Top factors</Eyebrow>
          {factors.map((f, i) => (
            <View
              key={`${f.ingredient_name}-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 8,
                borderTopWidth: i > 0 ? 0.5 : 0,
                borderTopColor: borderColor,
              }}
            >
              <Text style={{ flex: 1, fontFamily: Fonts.sansMedium, fontSize: 13, color: textColor }} numberOfLines={1}>
                {f.ingredient_name}
              </Text>
              <EvidenceSpectrum strength={strengthToDots(f.strength)} max={4} label={f.strength} dark={dark} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}
