import React from 'react';
import { View } from 'react-native';
import { Palette } from '@/constants/theme';
import { strengthLabel, strengthTone } from '@/utils/grade';
import { Txt } from './Txt';

/** Five-segment evidence strength meter. Replaces the old dot "spectrum". */
export function EvidenceMeter({ strength, showLabel = true, width = 72, night = false }: {
  strength: number;
  showLabel?: boolean;
  width?: number;
  night?: boolean;
}) {
  // Research depth, not a verdict: one accent colour, grey when there is too little to say.
  const color = strengthTone(strength) === 'accent' ? Palette.accent : Palette.ink3;
  const seg = (width - 4 * 3) / 5;
  return (
    <View style={{ alignItems: 'flex-end' }} accessible accessibilityLabel={strengthLabel(strength)}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={{ width: seg, height: 5, borderRadius: 3, backgroundColor: i <= strength ? color : night ? Palette.nightHairline : Palette.ink4 }}
          />
        ))}
      </View>
      {showLabel ? <Txt variant="caption" tone={night ? 'inverse2' : 'secondary'} style={{ marginTop: 6 }}>{strengthLabel(strength)}</Txt> : null}
    </View>
  );
}
