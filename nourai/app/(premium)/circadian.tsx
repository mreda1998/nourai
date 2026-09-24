import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Clock, UtensilsCrossed } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { api, CircadianScheduleItem } from '@/services/api';
import { accessToken } from '@/lib/stack-sync';
import { useAppState } from '@/context/app-state';
import { Card, EmptyState, EvidenceMeter, ListGroup, Pill, Screen, Section, Txt } from '@/components/ui';

const PHASES = [
  { h: 6, label: 'Cortisol peak' },
  { h: 10, label: 'Insulin sensitive' },
  { h: 14, label: 'Afternoon dip' },
  { h: 18, label: 'Temperature peak' },
  { h: 22, label: 'Melatonin onset' },
];

const LOCAL_TIME = { morning: '08:00', afternoon: '13:00', evening: '19:00', night: '22:00' } as const;

function localSchedule(stack: ReturnType<typeof useAppState>['stack']): CircadianScheduleItem[] {
  const seen = new Set<string>();
  return stack.flatMap((p) => {
    const time = LOCAL_TIME[p.timeOfDay ?? 'morning'];
    return (p.ingredients.length ? p.ingredients : [p.name])
      .filter((n) => { const k = `${time}:${n.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((n) => ({ time, ingredient_name: n, note: 'Using the time you logged. Researched timing isn’t available for this ingredient yet.', with_food: false, synergy: false, evidence_dots: 1 }));
  }).sort((a, b) => a.time.localeCompare(b.time));
}

function format(time: string) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(); d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CircadianScreen() {
  const { stack } = useAppState();
  const [schedule, setSchedule] = useState<CircadianScheduleItem[]>([]);
  const [chronotype, setChronotype] = useState('moderate_morning');
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const fallback = localSchedule(stack);
      try {
        const token = await accessToken();
        if (!token) { setSchedule(fallback); setReason(stack.length ? 'local_only' : 'stack_empty'); return; }
        const res = await api.getCircadian(token);
        setSchedule(res.schedule.length ? res.schedule : fallback);
        setChronotype(res.chronotype);
        setReason(res.schedule.length ? (res.empty_reason ?? null) : fallback.length ? 'local_only' : res.empty_reason ?? null);
      } catch {
        setSchedule(fallback);
        setReason(fallback.length ? 'local_only' : 'stack_empty');
      } finally {
        setLoading(false);
      }
    })();
  }, [stack]);

  return (
    <Screen back title="Timing protocol" subtitle={`Tuned to your chronotype: ${chronotype.replace(/_/g, ' ')}`}>
      {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 32 }} /> : !schedule.length ? (
        <EmptyState
          icon={Clock}
          title={reason === 'timing_data_pending' ? 'Timing research in progress' : 'Nothing to schedule yet'}
          message={reason === 'timing_data_pending' ? 'We’re still researching timing for your ingredients.' : 'Add products to your stack to build a daily sequence.'}
          action="Go to stack"
          onAction={() => router.push('/(tabs)/stack' as never)}
        />
      ) : (
        <>
          <Card padding={18}>
            <Txt variant="overline" tone="secondary">Your 24-hour rhythm</Txt>
            <Timeline items={schedule} />
          </Card>

          {reason === 'local_only' ? (
            <Card variant="sunken" padding={14} style={{ marginTop: 12 }}>
              <Txt variant="footnote" tone="secondary">Preview based on the times you logged. Sign in to sync your stack and get researched timing.</Txt>
            </Card>
          ) : null}

          <Section title="Today’s sequence">
            <ListGroup>
              {schedule.map((item, i) => (
                <Animated.View key={`${item.time}-${item.ingredient_name}-${i}`} entering={FadeInDown.duration(350).delay(i * 40)} style={{ flexDirection: 'row', gap: 14, padding: 16 }}>
                  <View style={{ width: 70 }}>
                    <Txt variant="numeral" tone={item.synergy ? 'accent' : 'primary'}>{format(item.time)}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="headline">{item.ingredient_name}</Txt>
                    <Txt variant="footnote" tone="secondary" style={{ marginTop: 3 }}>{item.note}</Txt>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {item.synergy ? <Pill label="Evidence-timed" tone="strong" /> : null}
                      {item.with_food ? <Pill label="With food" icon={UtensilsCrossed} /> : null}
                    </View>
                  </View>
                  <EvidenceMeter strength={Math.min(5, Math.round(item.evidence_dots * 1.25))} showLabel={false} width={44} />
                </Animated.View>
              ))}
            </ListGroup>
          </Section>
        </>
      )}
    </Screen>
  );
}

function Timeline({ items }: { items: CircadianScheduleItem[] }) {
  const [w, setW] = useState(0);
  const H = 90;
  const base = 62;
  const sx = (h: number) => (h / 24) * w;
  const cortisol = `M 0 ${base} C ${sx(4)} ${base} ${sx(6)} 14 ${sx(8)} 22 S ${sx(16)} 48 ${sx(24)} ${base}`;
  const melatonin = `M 0 24 C ${sx(4)} 40 ${sx(8)} ${base} ${sx(12)} ${base} S ${sx(20)} 40 ${sx(24)} 16`;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginTop: 14 }}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Line x1={0} y1={base} x2={w} y2={base} stroke={Palette.hairline} strokeWidth={1} />
          <Path d={cortisol} stroke={Palette.gold} strokeWidth={2} fill="none" />
          <Path d={melatonin} stroke={Palette.accent} strokeWidth={2} fill="none" strokeDasharray="4 4" />
          {items.map((d, i) => {
            const [h, m] = d.time.split(':').map(Number);
            const x = sx(h + (m || 0) / 60);
            return <Circle key={i} cx={x} cy={base} r={5} fill={d.synergy ? Palette.strong : Palette.surface} stroke={Palette.ink} strokeWidth={1.5} />;
          })}
        </Svg>
      ) : <View style={{ height: H }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        {['12am', '6am', '12pm', '6pm', '12am'].map((t, i) => <Txt key={i} variant="caption" tone="tertiary">{t}</Txt>)}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 14 }}>
        <Legend color={Palette.gold} label="Cortisol" />
        <Legend color={Palette.accent} label="Melatonin" dashed />
        <Legend color={Palette.strong} label="Evidence-timed dose" dot />
      </View>
      <View style={{ marginTop: 16, gap: 6 }}>
        {PHASES.map((p) => (
          <View key={p.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="footnote" tone="secondary">{p.label}</Txt>
            <Txt variant="footnoteStrong">{format(`${p.h}:00`)}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

function Legend({ color, label, dashed, dot }: { color: string; label: string; dashed?: boolean; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dot ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} /> : (
        <View style={{ width: 16, height: 2, backgroundColor: dashed ? 'transparent' : color, borderTopWidth: dashed ? 2 : 0, borderStyle: 'dashed', borderColor: color }} />
      )}
      <Txt variant="caption" tone="secondary">{label}</Txt>
    </View>
  );
}
