import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { MeasureFill, MeasureInk, Palette, Radius } from '@/constants/theme';
import type { MeasureTone, SkinActive, SkinCheck, SkinFlag, SkinSource, SunCheck, VerdictPillar } from '@/services/api';
import { PressableScale, SummaryCard, Txt } from '@/components/ui';

type CardProps = { open: boolean; onToggle: () => void };

const inkOf = (tone: MeasureTone) => (tone === 'neutral' ? Palette.ink2 : MeasureInk[tone]);

/** The study or regulation a line rests on: one quiet, tappable caption. */
function SourceLine({ source, style }: { source: SkinSource; style?: object }) {
  return (
    <Pressable onPress={() => Linking.openURL(source.url)} hitSlop={6} accessibilityRole="link" style={[{ alignSelf: 'flex-start', marginTop: 8 }, style]}>
      <Txt variant="caption" tone="tertiary" numberOfLines={2}>{source.label} ↗</Txt>
    </Pressable>
  );
}

// ─── Actives ─────────────────────────────────────────────────────────────────

/**
 * What the product is for, read against the trials: how strong the evidence is,
 * the strength studied, and whether the label order suggests there's enough of it.
 */
export function ActivesCard({ skin, pillar, open, onToggle }: CardProps & { skin: SkinCheck; pillar?: VerdictPillar | null }) {
  const [expanded, setExpanded] = useState<string | null>(skin.actives[0]?.name ?? null);
  const verdict = pillar?.verdict ?? `${skin.actives.length} active${skin.actives.length === 1 ? '' : 's'}`;
  const tone: MeasureTone = pillar?.tone ?? 'neutral';
  return (
    <SummaryCard title="Actives" verdict={verdict} tone={tone} open={open} onToggle={onToggle}>
      {skin.actives.map((a) => (
        <ActiveRow key={a.name} active={a} expanded={expanded === a.name} onToggle={() => setExpanded((o) => (o === a.name ? null : a.name))} />
      ))}
      {skin.one_percent_index != null ? (
        <View style={styles.strip}>
          <Txt variant="footnote" tone="tertiary">
            Labels list ingredients above 1 % in order of amount. {skin.one_percent_marker} is capped at 1 % or less by law, so everything listed after it is too.
          </Txt>
        </View>
      ) : null}
    </SummaryCard>
  );
}

function ActiveRow({ active, expanded, onToggle }: { active: SkinActive; expanded: boolean; onToggle: () => void }) {
  return (
    <View style={styles.divider}>
      <PressableScale pressedScale={0.99} onPress={onToggle} accessibilityLabel={`${active.name}: ${active.evidence}`} accessibilityState={{ expanded }}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: MeasureFill[active.tone] }]} />
          <View style={{ flex: 1 }}>
            <View style={styles.titleLine}>
              <Txt variant="callout" style={{ flex: 1 }}>{active.name}</Txt>
              <Txt variant="footnote" color={inkOf(active.tone)}>{active.evidence}</Txt>
            </View>
            <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
              {active.does}{active.amount ? ` · ${active.amount} on the label` : ''}
            </Txt>
            {active.likely_low ? (
              <Txt variant="footnote" color={MeasureInk.moderate} style={{ marginTop: 2 }}>
                Likely under 1 % here · trials used {active.studied}
              </Txt>
            ) : null}
          </View>
          <ChevronDown size={16} color={Palette.ink4} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
        </View>
      </PressableScale>
      {expanded ? (
        <View style={styles.body}>
          <View style={[styles.margin, { borderLeftColor: MeasureFill[active.tone] }]}>
            <Txt variant="callout">{active.reality}</Txt>
            {active.studied ? (
              <View style={styles.facts}>
                <Fact label="Studied at" value={active.studied} />
                <Fact
                  label="In this product"
                  value={active.amount ?? (active.likely_low ? 'Likely under 1 %' : 'Not stated')}
                  tone={active.likely_low ? 'moderate' : undefined}
                />
              </View>
            ) : null}
            <SourceLine source={active.source} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: MeasureTone }) {
  return (
    <View style={styles.fact}>
      <Txt variant="caption" tone="tertiary">{label}</Txt>
      <Txt variant="subheadStrong" color={tone ? inkOf(tone) : undefined} style={{ marginTop: 2 }}>{value}</Txt>
    </View>
  );
}

// ─── Skin reactions ──────────────────────────────────────────────────────────

const GROUPS: { kind: SkinFlag['kind']; title: string; tone: MeasureTone }[] = [
  { kind: 'frequent', title: 'Common allergens', tone: 'moderate' },
  { kind: 'listed', title: 'Labelled fragrance allergens', tone: 'neutral' },
  { kind: 'irritant', title: 'Possible irritants', tone: 'neutral' },
  { kind: 'photo', title: 'Reacts with sunlight', tone: 'neutral' },
];

/** Contact allergens and irritants dermatology clinics test for, and what the product is free of. */
export function ReactionsCard({ skin, pillar, open, onToggle }: CardProps & { skin: SkinCheck; pillar?: VerdictPillar | null }) {
  const verdict = pillar?.verdict ?? (skin.flags.length ? `${skin.flags.length} to know` : 'None found');
  const tone: MeasureTone = pillar?.tone ?? 'neutral';
  return (
    <SummaryCard title="Skin reactions" verdict={verdict} tone={tone} open={open} onToggle={onToggle}>
      <View style={styles.strip}>
        <Txt variant="subheadStrong">{skin.use === 'rinse-off' ? 'Rinse-off' : 'Leave-on'}</Txt>
        <Txt variant="footnote" tone="secondary" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
          {skin.use === 'rinse-off' ? 'Brief contact lowers the chance of a reaction' : 'Stays on the skin, so allergens matter more'}
        </Txt>
      </View>
      {pillar?.detail ? (
        <View style={styles.strip}><Txt variant="footnote" tone="secondary">{pillar.detail}</Txt></View>
      ) : null}
      {GROUPS.map((g) => {
        const items = skin.flags.filter((f) => f.kind === g.kind);
        if (!items.length) return null;
        return (
          <View key={g.kind} style={styles.divider}>
            <View style={styles.groupHead}>
              <Txt variant="overline" tone="secondary">{g.title}</Txt>
              <Txt variant="numeral" tone="secondary">{String(items.length).padStart(2, '0')}</Txt>
            </View>
            {items.map((f) => (
              <View key={f.name} style={styles.flag}>
                <View style={[styles.dot, { backgroundColor: MeasureFill[g.tone], marginTop: 7, alignSelf: 'flex-start' }]} />
                <View style={{ flex: 1 }}>
                  <Txt variant="callout">{f.name}{f.label_name.toLowerCase() !== f.name.toLowerCase() ? <Txt variant="footnote" tone="tertiary">{`  ${f.label_name}`}</Txt> : null}</Txt>
                  <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{f.note}</Txt>
                  {g.kind !== 'listed' ? <SourceLine source={f.source} style={{ marginTop: 4 }} /> : null}
                </View>
              </View>
            ))}
            {g.kind === 'listed' ? <SourceLine source={items[0].source} style={{ marginLeft: 18, marginTop: 0, marginBottom: 12 }} /> : null}
          </View>
        );
      })}
      {skin.free_of.length ? (
        <View style={[styles.divider, styles.chips]}>
          {skin.free_of.map((label) => (
            <View key={label} style={styles.chip}><Txt variant="caption" tone="secondary">{label}</Txt></View>
          ))}
        </View>
      ) : null}
    </SummaryCard>
  );
}

// ─── Sun protection ──────────────────────────────────────────────────────────

/** Which UV filters, what each covers, and whether long UVA is reached and kept. */
export function SunCard({ sun, open, onToggle }: CardProps & { sun: SunCheck }) {
  return (
    <SummaryCard title="Sun protection" verdict={sun.verdict} tone={sun.tone} open={open} onToggle={onToggle}>
      <View style={styles.body}>
        <View style={[styles.margin, { borderLeftColor: MeasureFill[sun.tone] }]}>
          <Txt variant="callout">{sun.detail}</Txt>
        </View>
      </View>
      <Spectrum filters={sun.filters.map((f) => f.covers)} />
      {sun.filters.map((f) => (
        <View key={f.name} style={[styles.divider, styles.row, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleLine}>
              <Txt variant="callout" style={{ flex: 1 }}>{f.name}</Txt>
              {f.amount ? <Txt variant="subheadStrong">{f.amount}</Txt> : null}
            </View>
            <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{f.covers} · {f.status}</Txt>
            {f.note ? <Txt variant="footnote" tone="tertiary" style={{ marginTop: 4 }}>{f.note}</Txt> : null}
          </View>
        </View>
      ))}
      <View style={[styles.divider, styles.body, { paddingTop: 8 }]}>
        {sun.sources.map((s) => <SourceLine key={s.url} source={s} />)}
      </View>
    </SummaryCard>
  );
}

/** A plain bar of the UV range, lit where the filters reach. */
function Spectrum({ filters }: { filters: string[] }) {
  const uvb = filters.some((c) => c.includes('UVB'));
  const short = filters.some((c) => /short UVA|long UVA/i.test(c));
  const long = filters.some((c) => /long UVA/i.test(c));
  const bands: { label: string; range: string; on: boolean; flex: number }[] = [
    { label: 'UVB', range: '290–320 nm', on: uvb, flex: 3 },
    { label: 'Short UVA', range: '320–340', on: short, flex: 3 },
    { label: 'Long UVA', range: '340–400', on: long, flex: 5 },
  ];
  return (
    <View style={[styles.divider, { paddingHorizontal: 18, paddingVertical: 14 }]} accessibilityLabel={`Covers ${bands.filter((b) => b.on).map((b) => b.label).join(', ') || 'no UV range'}`}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {bands.map((b) => (
          <View key={b.label} style={{ flex: b.flex }}>
            <View style={[styles.band, { backgroundColor: b.on ? MeasureFill.good : Palette.hairline }]} />
            <Txt variant="caption" tone={b.on ? 'secondary' : 'tertiary'} style={{ marginTop: 6 }}>{b.label}</Txt>
            <Txt variant="caption" tone="tertiary">{b.range}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Good to know ────────────────────────────────────────────────────────────

/** Pregnancy, sun sensitivity, and the myths where the evidence says otherwise. */
export function GoodToKnowCard({ skin, open, onToggle }: CardProps & { skin: SkinCheck }) {
  const lead = skin.notes.find((n) => n.tone !== 'neutral') ?? skin.notes[0];
  return (
    <SummaryCard title="Good to know" verdict={lead.title} tone={lead.tone} open={open} onToggle={onToggle}>
      {skin.notes.map((n) => (
        <View key={n.key} style={[styles.divider, styles.body]}>
          <View style={[styles.margin, { borderLeftColor: n.tone === 'neutral' ? Palette.hairline : MeasureFill[n.tone] }]}>
            <Txt variant="subheadStrong">{n.title}</Txt>
            <Txt variant="footnote" tone="secondary" style={{ marginTop: 3 }}>{n.body}</Txt>
            {n.source ? <SourceLine source={n.source} /> : null}
          </View>
        </View>
      ))}
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16 },
  margin: { borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 2 },
  facts: { flexDirection: 'row', gap: 10, marginTop: 12 },
  fact: { flex: 1, backgroundColor: Palette.sunken, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
  flag: { flexDirection: 'row', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, paddingVertical: 14 },
  chip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.hairline, paddingHorizontal: 10, paddingVertical: 5 },
  band: { height: 8, borderRadius: 4 },
});
