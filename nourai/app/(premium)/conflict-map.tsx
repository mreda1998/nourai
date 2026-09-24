import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { GitCompareArrows, Handshake, Swords } from 'lucide-react-native';
import { Fonts, Palette } from '@/constants/theme';
import { api, ConflictEdge, ConflictNode, ConflictNote } from '@/services/api';
import { accessToken } from '@/lib/stack-sync';
import { useAppState } from '@/context/app-state';
import { Card, EmptyState, Pill, Screen, Section, Txt } from '@/components/ui';

function nodeColor(tone: string) {
  if (tone === 'accent') return Palette.strong;
  if (tone === 'alert') return Palette.weak;
  return Palette.gold;
}

function localNodes(stack: ReturnType<typeof useAppState>['stack']): ConflictNode[] {
  const names = new Map<string, string>();
  stack.forEach((p) => (p.ingredients.length ? p.ingredients : [p.name]).forEach((n) => {
    const t = n.trim();
    if (t && !names.has(t.toLowerCase())) names.set(t.toLowerCase(), t);
  }));
  return Array.from(names.entries()).slice(0, 12).map(([k, label]) => ({ id: `local-${k}`, label, tone: 'sand' }));
}

export default function InteractionMapScreen() {
  const { stack } = useAppState();
  const [nodes, setNodes] = useState<ConflictNode[]>([]);
  const [edges, setEdges] = useState<ConflictEdge[]>([]);
  const [notes, setNotes] = useState<ConflictNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const fallback = localNodes(stack);
      const useFallback = () => { setNodes(fallback); setEdges([]); setNotes([]); setLocalOnly(fallback.length > 0); };
      try {
        const token = await accessToken();
        if (!token) { useFallback(); return; }
        const res = await api.getConflictMap(token);
        if (res.nodes.length) { setNodes(res.nodes); setEdges(res.edges); setNotes(res.notes); setLocalOnly(false); } else useFallback();
      } catch { useFallback(); } finally { setLoading(false); }
    })();
  }, [stack]);

  const syn = edges.filter((e) => e.type === 'synergy').length;
  const comp = edges.filter((e) => e.type === 'compete').length;

  return (
    <Screen back title="Interaction map" subtitle={nodes.length ? `${nodes.length} compounds across your stack` : undefined}>
      {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 32 }} /> : !nodes.length ? (
        <EmptyState icon={GitCompareArrows} title="No compounds yet" message="Add products to your stack to map how their ingredients interact." action="Go to stack" onAction={() => router.push('/(tabs)/stack' as never)} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card padding={16} style={{ flex: 1 }}>
              <Handshake size={20} color={Palette.strong} />
              <Txt variant="metric" style={{ marginTop: 8 }}>{syn}</Txt>
              <Txt variant="footnote" tone="secondary">{syn === 1 ? 'Synergy' : 'Synergies'}</Txt>
            </Card>
            <Card padding={16} style={{ flex: 1 }}>
              <Swords size={20} color={Palette.weak} />
              <Txt variant="metric" style={{ marginTop: 8 }}>{comp}</Txt>
              <Txt variant="footnote" tone="secondary">{comp === 1 ? 'Competition' : 'Competitions'}</Txt>
            </Card>
          </View>

          <Card padding={12} style={{ marginTop: 12 }}>
            <Graph nodes={nodes} edges={edges} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, paddingBottom: 6 }}>
              <LegendLine color={Palette.strong} label="Synergy" />
              <LegendLine color={Palette.weak} label="Competes" dashed />
            </View>
          </Card>

          <Section title="What this means">
            {notes.length ? (
              <View style={{ gap: 12 }}>
                {notes.map((n, i) => (
                  <Animated.View key={i} entering={FadeInDown.duration(350).delay(i * 50)}>
                    <Card padding={18}>
                      <Pill label={n.type === 'synergy' ? 'Synergy' : 'Competes'} tone={n.type === 'synergy' ? 'strong' : 'weak'} />
                      <Txt variant="headline" style={{ marginTop: 10 }}>{n.pair}</Txt>
                      <Txt variant="subhead" tone="secondary" style={{ marginTop: 4 }}>{n.note}</Txt>
                    </Card>
                  </Animated.View>
                ))}
              </View>
            ) : (
              <Card variant="sunken" padding={16}>
                <Txt variant="subhead" tone="secondary">
                  {localOnly ? 'This is a local preview. Sign in to sync your stack and check evidence-backed interactions.' : 'No evidence-backed interactions are recorded for these compounds yet.'}
                </Txt>
              </Card>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

function Graph({ nodes, edges }: { nodes: ConflictNode[]; edges: ConflictEdge[] }) {
  const [w, setW] = useState(0);
  const size = w;
  const c = size / 2;
  const r = size / 2 - 52;
  const laid = nodes.map((n, i) => {
    const a = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    return { ...n, x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  const pos = Object.fromEntries(laid.map((n) => [n.id, n]));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={size} height={size}>
          {edges.map((e, i) => {
            const a = pos[e.ingredient_a_id]; const b = pos[e.ingredient_b_id];
            if (!a || !b) return null;
            return <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={e.type === 'synergy' ? Palette.strong : Palette.weak} strokeWidth={1.6} strokeDasharray={e.type === 'compete' ? '5 4' : undefined} opacity={0.8} />;
          })}
          {laid.map((n) => (
            <React.Fragment key={n.id}>
              <Circle cx={n.x} cy={n.y} r={16} fill={Palette.surface} stroke={nodeColor(n.tone)} strokeWidth={2} />
              <Circle cx={n.x} cy={n.y} r={5} fill={nodeColor(n.tone)} />
              <SvgText x={n.x} y={n.y + 32} textAnchor="middle" fill={Palette.ink2} fontSize={11} fontFamily={Fonts.sansMedium}>
                {n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}
              </SvgText>
            </React.Fragment>
          ))}
        </Svg>
      ) : <View style={{ aspectRatio: 1 }} />}
    </View>
  );
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 18, borderTopWidth: 2, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Txt variant="caption" tone="secondary">{label}</Txt>
    </View>
  );
}
