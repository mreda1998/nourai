import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Palette } from '@/constants/theme';
import { API_ORIGIN } from '@/services/api';
import { Card, Txt } from '@/components/ui';

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';

/** "C4H9N3O2" → "C₄H₉N₃O₂". Charges ("-", "+") stay as they are. */
export function prettyFormula(formula: string): string {
  return formula.replace(/\d/g, (d) => SUBSCRIPT[Number(d)]);
}

const ELEMENT_KEY = [
  { symbol: 'N', label: 'Nitrogen', colour: '#0F5652' },
  { symbol: 'O', label: 'Oxygen', colour: '#BE5B3B' },
  { symbol: 'S', label: 'Sulfur', colour: '#C9A465' },
  { symbol: 'P', label: 'Phosphorus', colour: '#C38A26' },
];

export type Molecule = { svg_path: string; formula: string; mass: number };

function useMoleculeSvg(path: string | undefined): string | null {
  const [xml, setXml] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    fetch(`${API_ORIGIN}${path}`)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => alive && setXml(text))
      .catch(() => alive && setXml(null));
    return () => { alive = false; };
  }, [path]);
  return xml;
}

/** Small structure for headers; `fallback` renders when there's none. */
export function MoleculeThumb({ molecule, size, fallback }: { molecule?: Molecule | null; size: number; fallback: React.ReactNode }) {
  const xml = useMoleculeSvg(molecule?.svg_path);
  if (!molecule || !xml) return <>{fallback}</>;
  return <SvgXml xml={xml} width={size} height={size} />;
}

/**
 * The molecule itself: a clean 2D structure drawn in Elory's ink, with
 * nitrogen in teal and oxygen in terracotta, plus its formula and mass.
 * Renders nothing when the ingredient has no single structure.
 */
export function MoleculeCard({ molecule, name, classLabel }: { molecule: Molecule; name: string; classLabel?: string | null }) {
  const xml = useMoleculeSvg(molecule.svg_path);
  if (!xml) return null;
  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <Card padding={20} style={{ alignItems: 'center' }}>
        <View style={{ width: '100%', height: 200 }} accessible accessibilityLabel={`Chemical structure of ${name}, ${molecule.formula}`}>
          <SvgXml xml={xml} width="100%" height="100%" />
        </View>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: Palette.hairline }}>
          <View style={{ flex: 1 }}>
            {classLabel ? <Txt variant="overline" tone="secondary">{classLabel}</Txt> : null}
            <Txt variant="title2" style={{ marginTop: 2 }}>{name}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Txt variant="headline" style={{ fontVariant: ['tabular-nums'] }}>{prettyFormula(molecule.formula)}</Txt>
            <Txt variant="caption" tone="secondary">{molecule.mass} g/mol</Txt>
          </View>
        </View>
        {/* Key only for the coloured elements this molecule actually contains. */}
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', gap: 14, marginTop: 10 }}>
          {ELEMENT_KEY.filter((e) => new RegExp(`${e.symbol}(?![a-z])`).test(molecule.formula)).map((e) => (
            <Legend key={e.symbol} colour={e.colour} label={e.label} />
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colour }} />
      <Txt variant="caption" tone="tertiary">{label}</Txt>
    </View>
  );
}
