import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import { SectionHead } from '@/components/elory';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { api, ConflictNode, ConflictEdge, ConflictNote } from '@/services/api';
import { useAppState } from '@/context/app-state';

function nodeColor(tone: string): string {
  if (tone === 'accent') return Colors.sage;
  if (tone === 'alert') return Colors.alert;
  return Colors.sand;
}

function layoutNodes(nodes: ConflictNode[]): Array<ConflictNode & { x: number; y: number }> {
  const CX = 170;
  const CY = 170;
  const R = 120;
  return nodes.map((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    return { ...n, x: Math.round(CX + R * Math.cos(angle)), y: Math.round(CY + R * Math.sin(angle)) };
  });
}

function ForceGraph({ nodes, edges }: { nodes: ConflictNode[]; edges: ConflictEdge[] }) {
  const laid = layoutNodes(nodes);
  const posMap: Record<string, { x: number; y: number }> = {};
  laid.forEach((n) => { posMap[n.id] = { x: n.x, y: n.y }; });

  return (
    <Svg width={340} height={340}>
      <Defs>
        <Pattern id="dots" width={16} height={16} patternUnits="userSpaceOnUse">
          <Circle cx={1} cy={1} r={0.5} fill="rgba(18,51,50,0.08)" />
        </Pattern>
      </Defs>
      <Rect width={340} height={340} fill="url(#dots)" />

      {edges.map((e, i) => {
        const a = posMap[e.ingredient_a_id];
        const b = posMap[e.ingredient_b_id];
        if (!a || !b) return null;
        const color = e.type === 'synergy' ? Colors.sand : Colors.alert;
        return (
          <Line
            key={i}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={color}
            strokeWidth={0.9}
            strokeDasharray={e.type === 'compete' ? '3 3' : undefined}
            opacity={0.75}
          />
        );
      })}

      {laid.map((n) => {
        const color = nodeColor(n.tone);
        return (
          <React.Fragment key={n.id}>
            <Circle cx={n.x} cy={n.y} r={18} fill={Colors.surface} stroke={color} strokeWidth={1.2} />
            <Circle cx={n.x} cy={n.y} r={3.5} fill={color} />
            <SvgText
              x={n.x} y={n.y + 30}
              textAnchor="middle"
              fill="rgba(18,51,50,0.75)"
              fontSize={10}
              fontFamily={Fonts.serifItalic}
            >
              {n.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function localConflictNodes(stack: ReturnType<typeof useAppState>['stack']): ConflictNode[] {
  const names = new Map<string, string>();
  stack.forEach((product) => {
    const ingredientNames = product.ingredients.length > 0 ? product.ingredients : [product.name];
    ingredientNames.forEach((name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (!names.has(key)) names.set(key, trimmed);
    });
  });
  return Array.from(names.entries()).slice(0, 12).map(([key, label]) => ({
    id: `local-${key}`,
    label,
    tone: 'sand',
  }));
}

export default function ConflictMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stack } = useAppState();
  const [nodes, setNodes] = useState<ConflictNode[]>([]);
  const [edges, setEdges] = useState<ConflictEdge[]>([]);
  const [notes, setNotes] = useState<ConflictNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const fallbackNodes = localConflictNodes(stack);
        if (!token) {
          setNodes(fallbackNodes);
          setEdges([]);
          setNotes([]);
          setLocalOnly(fallbackNodes.length > 0);
          return;
        }
        const res = await api.getConflictMap(token);
        if (res.nodes.length > 0) {
          setNodes(res.nodes);
          setEdges(res.edges);
          setNotes(res.notes);
          setLocalOnly(false);
        } else {
          setNodes(fallbackNodes);
          setEdges([]);
          setNotes([]);
          setLocalOnly(fallbackNodes.length > 0);
        }
      } catch {
        const fallbackNodes = localConflictNodes(stack);
        setNodes(fallbackNodes);
        setEdges([]);
        setNotes([]);
        setLocalOnly(fallbackNodes.length > 0);
      } finally {
        setLoading(false);
      }
    })();
  }, [stack]);

  const synCount = edges.filter((e) => e.type === 'synergy').length;
  const compCount = edges.filter((e) => e.type === 'compete').length;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + scale(48) }]}
      >
        {/* Editorial header */}
        <View style={{ paddingTop: insets.top + scale(12), paddingHorizontal: scale(24), paddingBottom: scale(20) }}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(18,51,50,0.6)" strokeWidth={2}>
                <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <View style={styles.atelierBadge}>
              <Text style={styles.atelierBadgeText}>ELORY PREMIUM</Text>
            </View>
          </View>
          <Text style={styles.eyebrow}>Premium · Interactions</Text>
          <Text style={styles.title}>Biochemical{'\n'}<Text style={{ fontStyle: 'italic' }}>conflict</Text> map.</Text>
        </View>

        <View style={{ paddingHorizontal: scale(24) }}>
          <Animated.View entering={FadeInUp.duration(300)}>
            {loading ? (
              <ActivityIndicator color={Colors.sand} style={{ marginVertical: scale(32) }} />
            ) : nodes.length === 0 ? (
              <Text style={styles.emptyText}>
                No interactions found between your current stack ingredients.
              </Text>
            ) : (
              <>
                <Text style={styles.subtitle}>
                  <Text style={{ color: Colors.sand }}>{nodes.length} compounds</Text>
                  {' '}active in your stack. {synCount} {synCount === 1 ? 'synergy' : 'synergies'}, {compCount} {compCount === 1 ? 'competition' : 'competitions'}.
                </Text>
                <View style={styles.subtitleDivider} />
              </>
            )}
          </Animated.View>

          {!loading && nodes.length > 0 && (
            <>
              <Animated.View entering={FadeInUp.delay(60).duration(280)} style={styles.legend}>
                <View style={styles.legendItem}>
                  <Svg width={20} height={2} style={{ marginRight: 6 }}>
                    <Line x1={0} y1={1} x2={20} y2={1} stroke={Colors.sand} strokeWidth={1.2} />
                  </Svg>
                  <Text style={styles.legendText}>Synergy</Text>
                </View>
                <View style={styles.legendItem}>
                  <Svg width={20} height={2} style={{ marginRight: 6 }}>
                    <Line x1={0} y1={1} x2={20} y2={1} stroke={Colors.alert} strokeWidth={1.2} strokeDasharray="3 3" />
                  </Svg>
                  <Text style={styles.legendText}>Competes</Text>
                </View>
              </Animated.View>

              <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.graphCard}>
                <ForceGraph nodes={nodes} edges={edges} />
              </Animated.View>

              <SectionHead label="What this means" dark />
              {notes.length === 0 ? (
                  <Text style={styles.emptyText}>
                  {localOnly
                    ? 'Local preview: sign in to sync this stack and check evidence-backed pair interactions.'
                    : 'No evidence-backed pair interactions are stored for these compounds yet.'}
                </Text>
              ) : notes.map((note, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInUp.delay(i * 60 + 180).duration(280)}
                  style={[styles.noteRow, { borderLeftColor: note.type === 'synergy' ? Colors.sand : Colors.alert }]}
                >
                  <Text style={[styles.noteType, { color: note.type === 'synergy' ? Colors.sand : Colors.alert }]}>
                    {note.type}
                  </Text>
                  <Text style={styles.notePair}>{note.pair}</Text>
                  <Text style={styles.noteText}>{note.note}</Text>
                </Animated.View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  scroll: {},
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(24) },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(18,51,50,0.6)' },
  atelierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(18,51,50,0.22)', borderRadius: 999 },
  atelierBadgeText: { fontFamily: Fonts.sansSemiBold, fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: Colors.sand },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(18,51,50,0.45)', marginBottom: scale(10) },
  title: { fontFamily: Fonts.serif, fontSize: scale(38), lineHeight: scale(40), color: Colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, lineHeight: FontSizes.subtitle * 1.5, color: 'rgba(18,51,50,0.75)', paddingBottom: scale(20) },
  subtitleDivider: { height: 1, backgroundColor: 'rgba(18,51,50,0.12)', marginBottom: scale(24) },
  legend: { flexDirection: 'row', gap: scale(20), marginBottom: scale(16), alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendText: { fontFamily: Fonts.sans, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.0, color: 'rgba(18,51,50,0.55)' },
  graphCard: { backgroundColor: 'rgba(18,51,50,0.03)', borderWidth: 1, borderColor: 'rgba(18,51,50,0.1)', borderRadius: Radius.lg, overflow: 'hidden', marginBottom: scale(28) },
  noteRow: { borderLeftWidth: 2, paddingLeft: scale(14), paddingVertical: scale(12), marginBottom: scale(10), gap: scale(4) },
  noteType: { fontFamily: Fonts.sansSemiBold, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4 },
  notePair: { fontFamily: Fonts.serif, fontSize: FontSizes.title, color: Colors.ink },
  noteText: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, color: 'rgba(18,51,50,0.65)', lineHeight: FontSizes.subtitle * 1.45 },
  emptyText: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, color: 'rgba(18,51,50,0.5)', lineHeight: FontSizes.subtitle * 1.5 },
});
