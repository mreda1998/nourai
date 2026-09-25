import React, { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { ChevronRight } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import type { EvidenceRoute, RouteLink, RouteNode } from '@/services/api';
import { PressableScale, Txt } from '@/components/ui';
import { EVIDENCE_LABEL, ROLE_OVERLINE } from './labels';
import { EffectFigure } from './EffectFigure';
import { ClaimSheet } from './ClaimSheet';

const RAIL = 30; // width of the spine column

type Kind = 'human' | 'biochem' | 'stop';

function linkKind(link: RouteLink): Kind {
  if (link.evidence_stops_here) return 'stop';
  return link.human_evidence ? 'human' : 'biochem';
}

/** The spine segment for one link: its style *is* the kind of evidence. */
function Spine({ kind, colour, top = 0 }: { kind: Kind; colour: string; top?: number }) {
  const stroke = kind === 'human' ? colour : kind === 'stop' ? Palette.gold : Palette.ink3;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top, bottom: 0, width: RAIL }}>
      <Svg width={RAIL} height="100%">
        <Line
          x1={RAIL / 2} x2={RAIL / 2} y1="0" y2="100%"
          stroke={stroke}
          strokeWidth={kind === 'human' ? 3 : kind === 'stop' ? 2 : 1.25}
          strokeDasharray={kind === 'stop' ? '2 5' : undefined}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

function Marker({ role, colour }: { role: RouteNode['role']; colour: string }) {
  const c = RAIL / 2;
  return (
    <Svg width={RAIL} height={RAIL}>
      {role === 'input' ? (
        <>
          <Circle cx={c} cy={c} r={8} fill={Palette.accentSoft} stroke={Palette.accent} strokeWidth={2} />
          <Circle cx={c} cy={c} r={3} fill={Palette.accent} />
        </>
      ) : role === 'mechanism' ? (
        <Circle cx={c} cy={c} r={4.5} fill={Palette.canvas} stroke={Palette.ink} strokeWidth={1.5} />
      ) : role === 'outcome' ? (
        <Circle cx={c} cy={c} r={9} fill={colour} />
      ) : (
        <Circle cx={c} cy={c} r={8} fill={Palette.canvas} stroke={Palette.gold} strokeWidth={2} strokeDasharray="2 3" />
      )}
    </Svg>
  );
}

/**
 * A reviewed route drawn as one annotated spine: what you take → what it does
 * in the body → what was measured in people → where the evidence stops.
 * Solid teal = measured in people; thin ink = textbook biochemistry;
 * dotted gold = not shown. Tap an annotated step for the study behind it.
 */
export function EvidenceChain({ route }: { route: EvidenceRoute }) {
  const sheet = useRef<BottomSheetModal>(null);
  const [open, setOpen] = useState<RouteLink | null>(null);
  const colour = route.direction === 'risk' ? Palette.weak : route.direction === 'mixed' ? Palette.moderate : Palette.strong;

  // Each node is reached by exactly one link; drawing the link *into* the next
  // node keeps branching routes (one outcome, two boundaries) intact.
  const incoming = useMemo(() => new Map(route.links.map((l) => [l.to, l])), [route.links]);

  const show = (link: RouteLink) => { setOpen(link); sheet.current?.present(); };

  return (
    <View>
      {route.nodes.map((node, i) => {
        const into = incoming.get(node.id);
        const nextNode = route.nodes[i + 1];
        const next = nextNode ? incoming.get(nextNode.id) : undefined;
        const headline = into?.claims.find((c) => c.effect_estimate != null);
        const overline = node.role === 'boundary' ? ROLE_OVERLINE.boundary : ROLE_OVERLINE[node.role];
        return (
          <Animated.View key={node.id} entering={FadeInDown.duration(420).delay(80 + i * 90)}>
            {/* Node */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {/* Continue the spine beside tall node text so it never breaks. */}
              {next ? <Spine kind={linkKind(next)} colour={colour} top={RAIL - 2} /> : null}
              <Marker role={node.role} colour={colour} />
              <View style={{ flex: 1, paddingLeft: 10, paddingTop: 2 }}>
                <Txt variant="overline" color={node.role === 'outcome' ? colour : node.role === 'boundary' ? Palette.gold : Palette.ink3}>
                  {overline}
                </Txt>
                <Txt variant={node.role === 'outcome' ? 'title2' : 'headline'} style={{ marginTop: 3 }}>{node.label}</Txt>
                {node.plain_label ? <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{node.plain_label}</Txt> : null}
                {node.role === 'outcome' && headline ? <EffectFigure claim={headline} tone={route.direction} /> : null}
                {node.role === 'boundary' && into?.stop_reason ? (
                  <Txt variant="footnote" tone="secondary" style={{ marginTop: 4 }}>{into.stop_reason}</Txt>
                ) : null}
              </View>
            </View>

            {/* Link to the next node */}
            {next ? (
              <View style={{ paddingLeft: RAIL + 10, paddingVertical: 12, minHeight: 34 }}>
                <Spine kind={linkKind(next)} colour={colour} />
                {!next.evidence_stops_here && next.claims.length ? (
                  <PressableScale
                    onPress={() => show(next)}
                    accessibilityRole="button"
                    accessibilityHint="Shows the study behind this step"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
                  >
                    <EvidenceTag link={next} colour={colour} />
                    <ChevronRight size={13} color={Palette.ink3} />
                  </PressableScale>
                ) : !next.evidence_stops_here ? (
                  <EvidenceTag link={next} colour={colour} />
                ) : null}
                {next.relation_text && !next.evidence_stops_here ? (
                  <Txt variant="footnote" tone="tertiary" style={{ marginTop: 2 }}>{next.relation_text}</Txt>
                ) : null}
              </View>
            ) : null}
          </Animated.View>
        );
      })}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 18 }}>
        <Key colour={colour} label="Measured in people" width={3} />
        <Key colour={Palette.ink3} label="Biochemistry" width={1.25} />
        <Key colour={Palette.gold} label="Not shown" width={2} dashed />
      </View>

      <ClaimSheet ref={sheet} route={route} link={open} />
    </View>
  );
}

function EvidenceTag({ link, colour }: { link: RouteLink; colour: string }) {
  return (
    <Txt variant="caption" color={linkKind(link) === 'human' ? colour : Palette.ink3}>
      {link.evidence_type ? EVIDENCE_LABEL[link.evidence_type] : 'Evidence'}
      {link.strength ? ` · ${link.strength}` : ''}
    </Txt>
  );
}

function Key({ colour, label, width, dashed }: { colour: string; label: string; width: number; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg width={18} height={8}>
        <Line x1={1} x2={17} y1={4} y2={4} stroke={colour} strokeWidth={width} strokeDasharray={dashed ? '2 3' : undefined} strokeLinecap="round" />
      </Svg>
      <Txt variant="caption" tone="secondary">{label}</Txt>
    </View>
  );
}
