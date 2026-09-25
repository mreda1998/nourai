import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Palette } from '@/constants/theme';
import type { GridCellState, ProductEvidence } from '@/services/api';
import { PressableScale, Txt } from '@/components/ui';
import { DOMAIN_LABEL } from './labels';

const CELL = 44;
const SIZE: Record<string, number> = { strong: 8, moderate: 6.5, limited: 5, insufficient: 4 };

function Dot({ state, strength }: { state: GridCellState; strength: string | null }) {
  const r = SIZE[strength ?? ''] ?? 5.5;
  const c = 11;
  return (
    <Svg width={22} height={22}>
      {state === 'supports' ? <Circle cx={c} cy={c} r={r} fill={Palette.strong} /> : null}
      {state === 'risk' ? <Circle cx={c} cy={c} r={r} fill="none" stroke={Palette.weak} strokeWidth={2.2} /> : null}
      {state === 'mixed' ? (
        <>
          <Circle cx={c} cy={c} r={r} fill="none" stroke={Palette.moderate} strokeWidth={1.6} />
          <Path d={`M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} Z`} fill={Palette.moderate} />
        </>
      ) : null}
      {state === 'mechanism' ? <Circle cx={c} cy={c} r={5} fill="none" stroke={Palette.ink3} strokeWidth={1.2} strokeDasharray="1.5 2.5" /> : null}
      {state === 'not_reviewed' ? <Line x1={c - 4} x2={c + 4} y1={c} y2={c} stroke={Palette.ink4} strokeWidth={1.5} strokeLinecap="round" /> : null}
    </Svg>
  );
}

const STATE_WORD: Record<GridCellState, string> = {
  supports: 'supports', mixed: 'mixed evidence', risk: 'a risk', mechanism: 'mechanism only', not_reviewed: 'not reviewed',
};

/**
 * Active compounds × body areas. Each dot is one published, reviewed route —
 * never a total. Empty means "not reviewed", not "no effect".
 */
export function EvidenceGrid({ grid }: { grid: ProductEvidence['grid'] }) {
  if (!grid.rows.length) return null;
  const legend: [GridCellState, string, string | null][] = [
    ['supports', 'Supports', 'moderate'], ['mixed', 'Mixed', 'moderate'], ['risk', 'Risk', 'moderate'],
    ['mechanism', 'Mechanism only', null], ['not_reviewed', 'Not reviewed', null],
  ];
  return (
    <View>
      {grid.columns.length ? (
        <View style={{ flexDirection: 'row', paddingLeft: 0, marginBottom: 4 }}>
          <View style={{ flex: 1 }} />
          {grid.columns.map((col) => (
            <View key={col} style={{ width: CELL, alignItems: 'center' }}>
              <Txt variant="caption" tone="secondary" numberOfLines={1}>{DOMAIN_LABEL[col] ?? col}</Txt>
            </View>
          ))}
        </View>
      ) : null}
      {grid.rows.map((row, i) => (
        <PressableScale
          key={row.ingredient_id}
          onPress={() => router.push(`/ingredient/${row.ingredient_id}` as never)}
          accessibilityRole="button"
          accessibilityLabel={`${row.compound}: ${grid.columns.map((c) => `${DOMAIN_LABEL[c] ?? c} ${STATE_WORD[row.cells[c]?.state ?? 'not_reviewed']}`).join(', ') || 'no reviewed routes yet'}`}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: i ? 0.5 : 0, borderTopColor: Palette.hairline }}
        >
          <Txt variant="subheadStrong" style={{ flex: 1 }} numberOfLines={2}>{row.compound}</Txt>
          {grid.columns.map((col) => (
            <View key={col} style={{ width: CELL, alignItems: 'center' }}>
              <Dot state={row.cells[col]?.state ?? 'not_reviewed'} strength={row.cells[col]?.strength ?? null} />
            </View>
          ))}
        </PressableScale>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 12 }}>
        {legend.map(([state, label, strength]) => (
          <View key={state} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Dot state={state} strength={strength} />
            <Txt variant="caption" tone="secondary">{label}</Txt>
          </View>
        ))}
      </View>
      <Txt variant="caption" tone="tertiary" style={{ marginTop: 6 }}>
        Larger dots mean stronger evidence. Present in this product, not measured in you.
      </Txt>
    </View>
  );
}
