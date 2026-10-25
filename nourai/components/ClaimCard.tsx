import React from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronRight, ShieldAlert } from 'lucide-react-native';
import type { IngredientClaim } from '@/services/api';
import { Palette } from '@/constants/theme';
import { certaintyLabel, verdictLabel, verdictTone } from '@/utils/evidence';
import { Card, Pill, Txt } from '@/components/ui';

/** A belief and its verdict; opens the studies behind it. */
export function ClaimCard({ claim, index = 0, onPress }: { claim: IngredientClaim; index?: number; onPress?: () => void }) {
  const tone = verdictTone(claim.kind, claim.verdict, claim.certainty);
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(index * 60)}>
      <Card padding={18} onPress={onPress} accessibilityLabel={`${claim.claim}: ${verdictLabel(claim.kind, claim.verdict, claim.certainty)}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {claim.kind === 'safety' ? <ShieldAlert size={14} color={Palette.ink3} strokeWidth={2} /> : null}
          <Txt variant="overline" tone="secondary">{claim.kind === 'safety' ? 'Safety question' : 'People believe'}</Txt>
        </View>
        <Txt variant="headline" style={{ marginTop: 6 }}>{claim.claim}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <Pill label={verdictLabel(claim.kind, claim.verdict, claim.certainty)} tone={tone} />
          <Txt variant="caption" tone="tertiary">{certaintyLabel(claim.certainty)}</Txt>
        </View>
        {claim.reality ? <Txt variant="subhead" tone="secondary" numberOfLines={3} style={{ marginTop: 12 }}>{claim.reality}</Txt> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <Txt variant="caption" tone="tertiary">
            {claim.study_count ? `${claim.study_count} ${claim.study_count === 1 ? 'study' : 'studies'}` : 'No studies yet'}
          </Txt>
          {onPress ? <ChevronRight size={16} color={Palette.ink3} /> : null}
        </View>
      </Card>
    </Animated.View>
  );
}
