import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Beef, BookOpenCheck, Candy, CandyCane, ChevronDown, ChevronRight, Croissant, Droplet, ExternalLink,
  FlaskConical, Flame, Hexagon, Pill, Wheat,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { MeasureInk, Palette } from '@/constants/theme';
import type {
  AdditiveItem, AdditivesSummary, BioDomain, Ingredient, LabObservation, Measure, MeasureTone, NutritionPanel,
  ProcessingInfo, Product, RuleNote,
} from '@/services/api';
import { statusTone } from '@/utils/rules';
import { toneColor } from '@/utils/grade';
import { ContributorBar, ListRow, MeasureRow, PressableScale, SummaryCard, Txt, showMeasureSources } from '@/components/ui';

type CardProps = { open: boolean; onToggle: () => void };

const NUTRIENT_ICONS: Record<string, LucideIcon> = {
  sugars: Candy,
  'added-sugars': CandyCane,
  'saturated-fat': Droplet,
  sodium: Hexagon,
  fiber: Wheat,
  proteins: Beef,
  'energy-kcal': Flame,
  carbohydrates: Croissant,
};

const PREVIEW_COUNT = 8;

const openIngredientPage = (id?: string | null) => (id ? () => router.push(`/ingredient/${id}` as never) : undefined);

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`;
}

const TONE_RANK: Record<MeasureTone, number> = { weak: 3, moderate: 2, good: 1, neutral: 0 };

/** One open row per card; starts on the row that most needs attention. */
function useAccordion(measures: Measure[], keyOf: (m: Measure, i: number) => string) {
  let start = measures.length ? 0 : -1;
  measures.forEach((m, i) => {
    const best = measures[start];
    const rank = TONE_RANK[m.tone] - TONE_RANK[best.tone] || (m.percent ?? 0) - (best.percent ?? 0);
    if (rank > 0) start = i;
  });
  const [open, setOpen] = useState<string | null>(start >= 0 ? keyOf(measures[start], start) : null);
  return [open, (k: string) => setOpen((o) => (o === k ? null : k))] as const;
}

const SHORT_NAMES: Record<string, string> = { 'saturated-fat': 'sat fat', 'added-sugars': 'added sugar' };

// ─── Nutrition ───────────────────────────────────────────────────────────────

export function NutritionCard({ panel, open, onToggle }: CardProps & { panel: NutritionPanel }) {
  const [openKey, toggle] = useAccordion(panel.measures, (m) => m.key);
  const highs = panel.measures.filter((m) => m.kind === 'limit' && m.band === 'high').map((m) => SHORT_NAMES[m.key] ?? m.label.toLowerCase());
  const moderate = panel.measures.some((m) => m.kind === 'limit' && m.band === 'moderate');
  const verdict = highs.length > 2 ? `${highs.length} nutrients high` : highs.length ? `High in ${joinAnd(highs)}` : moderate ? 'Moderate' : 'Nothing high';
  const tone: MeasureTone = highs.length ? 'weak' : moderate ? 'moderate' : 'good';

  return (
    <SummaryCard title="Nutrition" verdict={verdict} tone={tone} open={open} onToggle={onToggle}>
      <View style={styles.strip}>
        <Txt variant="subheadStrong">{panel.basis === 'serving' ? 'Per serving' : 'Per 100 g'}</Txt>
        <Txt variant="footnote" tone="secondary" numberOfLines={1} style={styles.stripRight}>
          {panel.basis === 'serving' ? panel.serving_label : 'No serving size on the label'}
        </Txt>
      </View>
      {panel.measures.map((m) => (
        <MeasureRow key={m.key} measure={m} icon={NUTRIENT_ICONS[m.key]} expanded={openKey === m.key} onToggle={() => toggle(m.key)} />
      ))}
    </SummaryCard>
  );
}

/** Older servers send nutrients only as text rows — keep showing them. */
export function LegacyNutritionCard({ nutrients, open, onToggle }: CardProps & { nutrients: Ingredient[] }) {
  return (
    <SummaryCard title="Nutrition" verdict={`${nutrients.length} listed`} tone="neutral" open={open} onToggle={onToggle}>
      {nutrients.map((n) => (
        <View key={n.name} style={styles.divider}>
          <ListRow title={n.name} value={n.concentration} chevron={false} />
        </View>
      ))}
    </SummaryCard>
  );
}

// ─── Doses ───────────────────────────────────────────────────────────────────

export function DoseCard({ doses, open, onToggle }: CardProps & { doses: Measure[] }) {
  const keyOf = (m: Measure, i: number) => `${m.key}-${i}`;
  const [openKey, toggle] = useAccordion(doses, keyOf);
  const over = doses.filter((d) => d.band === 'over_ul').length;
  const off = doses.filter((d) => d.tone === 'moderate').length;
  const inRange = doses.filter((d) => d.band === 'in_range').length;
  const verdict = over ? `${over} above upper limit` : off ? `${off} outside studied range` : `${inRange} of ${doses.length} in range`;
  const tone: MeasureTone = over ? 'weak' : off ? 'moderate' : inRange === doses.length ? 'good' : 'neutral';

  return (
    <SummaryCard title="Dose check" verdict={verdict} tone={tone} open={open} onToggle={onToggle}>
      {doses.map((d, i) => (
        <MeasureRow
          key={keyOf(d, i)}
          measure={d}
          icon={Pill}
          expanded={openKey === keyOf(d, i)}
          onToggle={() => toggle(keyOf(d, i))}
          onOpen={openIngredientPage(d.ingredient_id)}
        />
      ))}
    </SummaryCard>
  );
}

// ─── Ingredients ─────────────────────────────────────────────────────────────

export function IngredientsCard({ ingredients, additives, describe, resolving, onOpenIngredient, ruleExtras, open, onToggle }: CardProps & {
  ingredients: Ingredient[];
  additives?: AdditivesSummary | null;
  describe: (ing: Ingredient) => { dot: string; subtitle?: string };
  resolving: string | null;
  onOpenIngredient: (ing: Ingredient) => void;
  /** Rules found only through the product's E-number tags, shown after the label list. */
  ruleExtras?: RuleNote[];
}) {
  const avoid = additives?.avoid ?? [];
  const watch = additives?.watch ?? [];
  const tiered = avoid.length + watch.length > 0;
  const [showAll, setShowAll] = useState(false);
  // Tiered cards lead with the flagged items; otherwise preview the label's first few.
  const preview = tiered ? 0 : PREVIEW_COUNT;
  const visible = showAll ? ingredients : ingredients.slice(0, preview);
  const canExpand = ingredients.length > preview;
  const reviewed = avoid.length + watch.length + (additives?.clean_count ?? 0);

  const verdict = avoid.length
    ? `${avoid.length} to avoid${watch.length ? ` · ${watch.length} to watch` : ''}`
    : watch.length ? `${watch.length} to watch`
      : reviewed ? 'Nothing flagged'
        : ingredients.length ? 'Not yet reviewed' : 'None listed';
  const tone: MeasureTone = avoid.length ? 'weak' : watch.length ? 'moderate' : reviewed ? 'good' : 'neutral';

  return (
    <SummaryCard title="Ingredients" verdict={verdict} tone={tone} open={open} onToggle={onToggle}>
      {avoid.length ? <TierGroup title="Avoid" items={avoid} tone="weak" /> : null}
      {watch.length ? <TierGroup title="Watch" items={watch} tone="moderate" /> : null}

      {ingredients.length ? (
        <>
          {visible.map((ing, i) => {
            const { dot, subtitle } = describe(ing);
            return (
              <View key={`${ing.name}-${i}`} style={styles.divider}>
                <ListRow
                  leading={<View style={[styles.dot, { backgroundColor: dot }]} />}
                  title={ing.name}
                  subtitle={subtitle}
                  trailing={resolving === ing.name ? <ActivityIndicator size="small" color={Palette.accent} /> : null}
                  onPress={() => onOpenIngredient(ing)}
                />
              </View>
            );
          })}
          {canExpand ? (
            <PressableScale pressedScale={0.99} onPress={() => setShowAll((v) => !v)} accessibilityState={{ expanded: showAll }}>
              <View style={styles.strip}>
                <Txt variant="subheadStrong" tone="accent">
                  {showAll ? 'Show fewer' : tiered ? `All ${ingredients.length} ingredients` : `Show all ${ingredients.length}`}
                </Txt>
                <View style={{ flex: 1 }} />
                <ChevronDown size={16} color={Palette.accent} style={{ transform: [{ rotate: showAll ? '180deg' : '0deg' }] }} />
              </View>
            </PressableScale>
          ) : null}
        </>
      ) : (
        <View style={[styles.strip, styles.divider]}>
          <Txt variant="footnote" tone="secondary">We don’t have an ingredient list for this product yet.</Txt>
        </View>
      )}

      {ruleExtras?.map((note) => (
        <View key={note.substance_id} style={styles.divider}>
          <ListRow
            leading={<View style={[styles.dot, { backgroundColor: toneColor(statusTone(note.status)) }]} />}
            title={note.substance_name ?? note.place}
            subtitle={`${note.text}${note.more ? ` +${note.more} more` : ''}`}
            onPress={() => router.push(`/substance/${note.substance_id}` as never)}
          />
        </View>
      ))}

      {additives?.unreviewed_count ? (
        <View style={[styles.strip, styles.divider]}>
          <Txt variant="footnote" tone="tertiary">
            {additives.unreviewed_count} ingredient{additives.unreviewed_count === 1 ? ' isn’t' : 's aren’t'} in our research library yet, so {additives.unreviewed_count === 1 ? 'it isn’t' : 'they aren’t'} rated.
          </Txt>
        </View>
      ) : null}
    </SummaryCard>
  );
}

function TierGroup({ title, items, tone }: { title: string; items: AdditiveItem[]; tone: MeasureTone }) {
  return (
    <View style={styles.divider}>
      <View style={styles.tierHead}>
        <Txt variant="overline" tone="secondary">{title}</Txt>
        <Txt variant="numeral" tone="secondary">{String(items.length).padStart(2, '0')}</Txt>
      </View>
      {items.map((item) => (
        <PressableScale key={item.ingredient_id ?? item.name} pressedScale={0.99} onPress={openIngredientPage(item.ingredient_id)} accessibilityLabel={`${item.name}, ${title}`}>
          <View style={styles.tierRow}>
            <View style={[styles.dot, { backgroundColor: MeasureInk[tone], marginHorizontal: 0 }]} />
            <Txt variant="callout" style={{ flex: 1 }}>{item.name}</Txt>
            {item.reason ? <Txt variant="footnote" tone="tertiary">{item.reason}</Txt> : null}
            <ChevronRight size={16} color={Palette.ink4} />
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

// ─── Processing ──────────────────────────────────────────────────────────────

const NOVA_SHORT: Record<number, string> = { 1: 'Minimally processed', 2: 'Culinary ingredient', 3: 'Processed', 4: 'Ultra-processed' };

// Plain-language meaning of each NOVA group — words, not a gauge.
const NOVA_MEANING: Record<number, string> = {
  1: 'Whole foods that are at most cleaned, dried, frozen or pasteurised.',
  2: 'An ingredient you cook with, such as oil, butter, sugar or salt.',
  3: 'Whole foods with salt, sugar or oil added, like cheese, bread or canned vegetables.',
  4: 'Made mostly from industrial ingredients and additives rather than whole foods.',
};

export function ProcessingCard({ processing, open, onToggle }: CardProps & { processing: ProcessingInfo }) {
  return (
    <SummaryCard title="Processing" verdict={NOVA_SHORT[processing.nova_group] ?? processing.label} tone={processing.tone} open={open} onToggle={onToggle}>
      <View style={styles.panel}>
        <View style={[styles.margin, { borderLeftColor: MeasureInk[processing.tone] }]}>
          <Txt variant="callout">{NOVA_MEANING[processing.nova_group] ?? processing.label}</Txt>
          <Pressable
            onPress={() => showMeasureSources({ panel_label: 'Processing level', sources: [{ ...processing.source, detail: `Group ${processing.nova_group} of 4: ${processing.label.toLowerCase()}` }] })}
            hitSlop={8}
            style={{ marginTop: 12, alignSelf: 'flex-start' }}
            accessibilityRole="link"
          >
            <Txt variant="caption" tone="tertiary">NOVA group {processing.nova_group} · via Open Food Facts</Txt>
          </Pressable>
        </View>
      </View>
    </SummaryCard>
  );
}

// ─── Lab results ─────────────────────────────────────────────────────────────

export function LabCard({ lab, open, onToggle }: CardProps & { lab: LabObservation[] }) {
  const measured = lab.filter((o) => o.measure);
  const [openKey, toggle] = useAccordion(measured.map((o) => o.measure!), (m) => m.key);
  const above = measured.filter((o) => o.measure!.band === 'above_limit').length;
  const verdict = above ? `${above} above limit` : measured.length ? 'All below limits' : `${lab.length} measured`;
  const tone: MeasureTone = above ? 'weak' : measured.length ? 'good' : 'neutral';

  return (
    <SummaryCard title="Lab results" verdict={verdict} tone={tone} open={open} onToggle={onToggle}>
      <View style={styles.strip}>
        <Txt variant="footnote" tone="secondary">Measured on a tested sample, shown separately from the label.</Txt>
      </View>
      {lab.slice(0, 12).map((o) =>
        o.measure ? (
          <MeasureRow key={o.observation_id} measure={o.measure} icon={FlaskConical} expanded={openKey === o.measure.key} onToggle={() => toggle(o.measure!.key)} />
        ) : (
          <View key={o.observation_id} style={styles.divider}>
            <ListRow
              icon={BookOpenCheck}
              title={o.analyte_name}
              subtitle={`${o.publisher} · Grade ${o.trust_grade}${o.lot_number ? ` · Lot ${o.lot_number}` : ''}`}
              value={`${o.raw_value ?? `${o.qualifier ?? ''}${o.value ?? '—'}`} ${o.unit ?? ''}`.trim()}
              onPress={() => Linking.openURL(o.source_url)}
            />
          </View>
        ),
      )}
    </SummaryCard>
  );
}

// ─── Supports & source ───────────────────────────────────────────────────────

export function SupportsCard({ supports, open, onToggle }: CardProps & { supports: BioDomain[] }) {
  return (
    <SummaryCard title="What it supports" verdict={supports[0]?.name ?? ''} tone="good" open={open} onToggle={onToggle}>
      <View style={[styles.panel, { paddingVertical: 6 }]}>
        {supports.slice(0, 6).map((d, i) => <ContributorBar key={d.name} label={d.name} value={d.value} valueLabel={`${Math.round(d.value)}`} delay={i * 70} />)}
      </View>
    </SummaryCard>
  );
}

export function SourceCard({ attribution, open, onToggle }: CardProps & { attribution: NonNullable<Product['attribution']> }) {
  return (
    <SummaryCard title="Source" verdict={attribution.source_name} tone="neutral" open={open} onToggle={onToggle}>
      <View style={styles.divider}>
        <ListRow
          icon={ExternalLink}
          title={attribution.source_name}
          subtitle={[attribution.data_license_name, attribution.image_license_name && `Images ${attribution.image_license_name}`].filter(Boolean).join(' · ') || attribution.attribution_text}
          onPress={() => Linking.openURL(attribution.source_url)}
        />
      </View>
    </SummaryCard>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  stripRight: { flex: 1, textAlign: 'right' },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 11 },
  tierHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  panel: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  margin: { borderLeftWidth: 2, paddingLeft: 14, paddingVertical: 2 },
});
