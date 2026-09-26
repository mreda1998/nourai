import React from 'react';
import { View } from 'react-native';
import { Palette } from '@/constants/theme';
import type { LadderLevel } from '@/services/api';
import { Txt } from '@/components/ui';

const STEPS: { level: LadderLevel; label: string }[] = [
  { level: 'unidentified', label: 'Not yet reviewed' },
  { level: 'function', label: 'Function only' },
  { level: 'mechanism', label: 'Mechanism only' },
  { level: 'reviewed', label: 'Reviewed route' },
];

export const LADDER_LABEL: Record<LadderLevel, string> = Object.fromEntries(STEPS.map((s) => [s.level, s.label])) as Record<LadderLevel, string>;

const EXPLAIN: Record<LadderLevel, string> = {
  reviewed: 'A reviewed route links how it works to outcomes measured in people.',
  mechanism: 'How it works, from scientific databases. Not yet reviewed for effects in people.',
  function: 'What it does in the product. No health effect is claimed.',
  unidentified: 'We haven’t reviewed what this ingredient does or how it works yet.',
};

/** Four-step ladder showing how far our knowledge of an ingredient goes. */
export function LadderBadge({ level, pending = false }: { level: LadderLevel; pending?: boolean }) {
  const reached = STEPS.findIndex((s) => s.level === level);
  // A published route nobody has reviewed yet is a draft, and says so.
  const draft = level === 'reviewed' && pending;
  const label = draft ? 'Draft route' : LADDER_LABEL[level];
  const explain = draft
    ? 'Links how it works to outcomes measured in people. Drafted from the cited studies and checked automatically; not yet reviewed by an expert.'
    : EXPLAIN[level];
  return (
    <View accessibilityRole="text" accessibilityLabel={`${label}. ${explain}`}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEPS.map((s, i) => (
          <View
            key={s.level}
            style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= reached ? (level === 'reviewed' && !draft ? Palette.strong : Palette.accent) : Palette.ink4 }}
          />
        ))}
      </View>
      <Txt variant="footnoteStrong" style={{ marginTop: 8 }}>{label}</Txt>
      <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{explain}</Txt>
    </View>
  );
}
