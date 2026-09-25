import React from 'react';
import { View } from 'react-native';
import { Palette } from '@/constants/theme';
import type { LadderLevel } from '@/services/api';
import { Txt } from '@/components/ui';

const STEPS: { level: LadderLevel; label: string }[] = [
  { level: 'unidentified', label: 'Not yet identified' },
  { level: 'function', label: 'Function only' },
  { level: 'mechanism', label: 'Mechanism only' },
  { level: 'reviewed', label: 'Reviewed route' },
];

export const LADDER_LABEL: Record<LadderLevel, string> = Object.fromEntries(STEPS.map((s) => [s.level, s.label])) as Record<LadderLevel, string>;

const EXPLAIN: Record<LadderLevel, string> = {
  reviewed: 'A reviewed route links how it works to outcomes measured in people.',
  mechanism: 'How it works, from scientific databases. Not yet reviewed for effects in people.',
  function: 'What it does in the product. No health effect is claimed.',
  unidentified: 'We haven’t identified this ingredient yet.',
};

/** Four-step ladder showing how far our knowledge of an ingredient goes. */
export function LadderBadge({ level }: { level: LadderLevel }) {
  const reached = STEPS.findIndex((s) => s.level === level);
  return (
    <View accessibilityRole="text" accessibilityLabel={`${LADDER_LABEL[level]}. ${EXPLAIN[level]}`}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEPS.map((s, i) => (
          <View
            key={s.level}
            style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= reached ? (level === 'reviewed' ? Palette.strong : Palette.accent) : Palette.ink4 }}
          />
        ))}
      </View>
      <Txt variant="footnoteStrong" style={{ marginTop: 8 }}>{LADDER_LABEL[level]}</Txt>
      <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{EXPLAIN[level]}</Txt>
    </View>
  );
}
