import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  AlertTriangle, ArrowDown, Ban, CircleSlash, Pill as PillIcon, Quote, ShieldCheck, Sparkles,
} from 'lucide-react-native';
import { api, IngredientDetail } from '@/services/api';
import { Palette, Radius } from '@/constants/theme';
import { evidenceStrength, ingredientCategoryLabel, strengthLabel, strengthTone, toneColor, Tone } from '@/utils/grade';
import { BIODOMAIN_BY_KEY } from '@/constants/biodomains';
import { userCountry } from '@/utils/rules';
import { deviceRegion } from '@/lib/region';
import { RulesSection } from '@/components/rules/RulesSection';
import { studyStrength, verdictTone } from '@/utils/evidence';
import { ClaimCard } from '@/components/ClaimCard';
import { StudyCard } from '@/components/StudyCard';
import {
  Button, Card, EmptyState, EvidenceMeter, IconButton, ListGroup, ListRow, Pill,
  ProductImage, Screen, Section, SegmentedControl, SkeletonCard, Txt,
} from '@/components/ui';

type Tab = 'evidence' | 'mechanism' | 'safety';

export default function IngredientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<IngredientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('evidence');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getIngredientWithFallback(id, userCountry(deviceRegion())).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [id]);

  const askRight = <IconButton icon={Sparkles} label="Ask Elory about this ingredient" onPress={() => router.push('/(premium)/ask-elory' as never)} />;

  if (loading) return <Screen back right={askRight}><SkeletonCard lines={2} /><SkeletonCard lines={5} /></Screen>;
  if (!data) {
    return (
      <Screen back>
        <EmptyState icon={CircleSlash} title="Not reviewed yet" message="Our research team hasn’t published a review of this ingredient yet." action="Go back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const strength = evidenceStrength(data.evidence_level);
  // The API can list a product twice when the ingredient appears twice on its label.
  const foundIn = data.found_in.filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);
  const claims = data.claims ?? [];
  // Appraised studies are counted by study strength; older ones by their confidence label.
  const appraised = data.evidence.some((e) => e.quality_tier);
  const counts: Record<Tone, number> = { strong: 0, moderate: 0, weak: 0, neutral: 0 };
  for (const e of data.evidence) counts[studyStrength(e).tone] += 1;

  return (
    <Screen back title={data.canonical_name} right={askRight}>
      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: -6 }}>
        <View style={styles.structure}>
          {data.structure_image_url
            ? <Image source={{ uri: data.structure_image_url }} style={{ width: 60, height: 60 }} contentFit="contain" />
            : <Molecule />}
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="secondary">{ingredientCategoryLabel(data.category)}</Txt>
          <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
            <EvidenceMeter strength={strength} width={96} />
          </View>
        </View>
      </View>

      {/* Belief vs reality — the product's core idea, given the hero slot. */}
      <Animated.View entering={FadeInDown.duration(600)}>
        <BeliefReality data={data} strength={strength} />
      </Animated.View>

      {/* What the law says, right under what the studies say. */}
      <RulesSection rules={data.rules} />

      {data.description ? (
        <Section title="What it is">
          <Txt variant="body" tone="secondary">{data.description}</Txt>
        </Section>
      ) : null}

      <SegmentedControl
        style={{ marginTop: 32 }}
        options={[
          { key: 'evidence', label: `Evidence${data.evidence.length ? ` ${data.evidence.length}` : ''}` },
          { key: 'mechanism', label: 'How it works' },
          { key: 'safety', label: 'Safety' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'evidence' ? (
        <View style={{ marginTop: 16 }}>
          {claims.length ? (
            <View style={{ gap: 12 }}>
              <ClaimTally claims={claims} />
              {claims.map((c, i) => (
                <ClaimCard key={c.id} claim={c} index={i} onPress={() => router.push(`/research/${data.id}?claim=${c.id}` as never)} />
              ))}
            </View>
          ) : null}
          {data.evidence.length ? (
            <Section title={claims.length ? 'Strongest studies' : undefined} style={{ marginTop: claims.length ? 32 : 0 }}>
              <Card padding={16} style={{ flexDirection: 'row' }}>
                <Count value={counts.strong} label={appraised ? 'Strong' : 'High confidence'} tone="strong" />
                <Count value={counts.moderate} label={appraised ? 'Solid' : 'Moderate'} tone="moderate" />
                <Count value={counts.weak} label={appraised ? 'Weak' : 'Low'} tone="weak" />
              </Card>
              <View style={{ gap: 12, marginTop: 12 }}>
                {data.evidence.slice(0, claims.length ? 3 : 5).map((e, i) => <StudyCard key={e.id} study={e} index={i} />)}
              </View>
              <Button label={`See all ${data.evidence.length} studies`} variant="secondary" style={{ marginTop: 16 }} onPress={() => router.push(`/research/${data.id}` as never)} />
            </Section>
          ) : (
            <EmptyState title="Research in progress" message="We’re still reviewing studies on this ingredient. Check back soon." />
          )}
        </View>
      ) : null}

      {tab === 'mechanism' ? (
        <View style={{ marginTop: 16 }}>
          {data.mechanism_image_url ? (
            <View style={styles.mechImage}><Image source={{ uri: data.mechanism_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /></View>
          ) : null}
          <Card padding={20}>
            <Txt variant="overline" tone="secondary">Mechanism</Txt>
            <Txt variant="callout" style={{ marginTop: 8 }}>
              {data.mechanism_summary || 'The precise mechanism is still being characterised in human studies.'}
            </Txt>
          </Card>
          {data.biodomain_scores.length ? (
            <Section title="Where it acts" caption="Body systems the studies looked at, and which way they point">
              <ListGroup>
                {data.biodomain_scores.slice(0, 6).map((d) => {
                  const way = DIRECTIONS[d.direction] ?? DIRECTIONS.neutral;
                  return (
                    <ListRow
                      key={d.biodomain}
                      leading={<View style={[styles.wayDot, { backgroundColor: toneColor(way.tone) }]} />}
                      title={BIODOMAIN_BY_KEY[d.biodomain]?.name ?? d.biodomain.replace(/_/g, ' ')}
                      subtitle={d.notes ?? undefined}
                      value={`${way.label} · ${d.confidence} confidence`}
                    />
                  );
                })}
              </ListGroup>
            </Section>
          ) : null}
        </View>
      ) : null}

      {tab === 'safety' ? <Safety data={data} /> : null}

      {/* Found in */}
      {foundIn.length ? (
        <Section title="Found in" caption={`${foundIn.length} product${foundIn.length === 1 ? '' : 's'} in our library`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {foundIn.slice(0, 12).map((p) => (
              <Card key={p.id} padding={14} style={{ width: 148 }} onPress={() => router.push(`/product/${p.id}?via=ingredient` as never)} accessibilityLabel={p.name}>
                <ProductImage uri={p.image_url} category={p.category} size={52} />
                <Txt variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 12 }}>{p.brand || p.category}</Txt>
                <Txt variant="subheadStrong" numberOfLines={2} style={{ minHeight: 40 }}>{p.name}</Txt>
                {p.amount ? <Txt variant="caption" tone="accent" style={{ marginTop: 4 }}>{p.amount}</Txt> : null}
              </Card>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 32, paddingHorizontal: 24 }}>
        Evidence summaries are educational and not a substitute for medical advice.
      </Txt>
    </Screen>
  );
}

// ─── Belief vs reality ────────────────────────────────────────────────────────

function BeliefReality({ data, strength }: { data: IngredientDetail; strength: number }) {
  const belief = data.common_belief;
  const reality = data.evidence_reality || data.evidence.find((e) => e.confidence === 'high')?.finding || null;
  if (!belief && !reality) return null;
  // How deeply it has been studied is not a verdict, so it never borrows the good/bad colours.
  const studied = strengthTone(strength) === 'accent';
  const ink = studied ? Palette.accent : Palette.ink3;
  return (
    <View style={{ marginTop: 24 }}>
      {belief ? (
        <Card variant="sunken" padding={20} radius={Radius.xl}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Quote size={16} color={Palette.ink3} strokeWidth={2} />
            <Txt variant="overline" tone="secondary">What people believe</Txt>
          </View>
          <Txt variant="title2" italic tone="secondary" style={{ marginTop: 10 }}>{belief}</Txt>
        </Card>
      ) : null}
      {belief && reality ? (
        <View style={styles.connector}>
          <View style={styles.connectorDot}><ArrowDown size={14} color={Palette.onAccent} strokeWidth={2.4} /></View>
        </View>
      ) : null}
      {reality ? (
        <Card padding={20} radius={Radius.xl} style={{ borderWidth: 1.5, borderColor: studied ? Palette.accent : Palette.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={16} color={ink} strokeWidth={2} />
              <Txt variant="overline" color={ink}>What the evidence shows</Txt>
            </View>
          </View>
          <Txt variant="title2" style={{ marginTop: 10 }}>{reality}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <Pill label={strengthLabel(strength)} tone={studied ? 'accent' : 'neutral'} />
            {data.evidence.length ? <Txt variant="footnote" tone="secondary">{data.evidence.length} studies reviewed</Txt> : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

const DIRECTIONS: Record<string, { label: string; tone: Tone }> = {
  benefit: { label: 'Benefit', tone: 'strong' },
  harm: { label: 'Risk', tone: 'weak' },
  mixed: { label: 'Mixed', tone: 'moderate' },
  neutral: { label: 'No clear effect', tone: 'neutral' },
};

const TALLY: { tone: Tone; label: string }[] = [
  { tone: 'strong', label: 'hold up' },
  { tone: 'moderate', label: 'early or mixed' },
  { tone: 'weak', label: 'not supported' },
  { tone: 'neutral', label: 'unclear' },
];

/**
 * The page in one line: of the things people believe about this ingredient,
 * how many the studies support. Safety questions are counted apart, because a
 * "supported" safety claim is bad news.
 */
function ClaimTally({ claims }: { claims: IngredientDetail['claims'] }) {
  const beliefs = (claims ?? []).filter((c) => c.kind === 'benefit');
  const safety = (claims ?? []).filter((c) => c.kind === 'safety');
  if (!beliefs.length) return null;
  const counts: Record<Tone, number> = { strong: 0, moderate: 0, weak: 0, neutral: 0 };
  for (const c of beliefs) counts[verdictTone('benefit', c.verdict, c.certainty)] += 1;
  const risks = safety.filter((c) => verdictTone('safety', c.verdict, c.certainty) === 'weak').length;
  const shown = TALLY.filter((t) => counts[t.tone] > 0);
  return (
    <Card padding={18} accessibilityLabel={`${counts.strong} of ${beliefs.length} beliefs hold up`}>
      <Txt variant="overline" tone="secondary">{beliefs.length} {beliefs.length === 1 ? 'belief' : 'beliefs'} tested</Txt>
      <Txt variant="title2" style={{ marginTop: 6 }}>
        {counts.strong ? `${counts.strong} of ${beliefs.length} hold up` : counts.moderate ? 'None proven, some early signs' : counts.weak ? 'None hold up so far' : 'Too little research to say'}
      </Txt>
      <View style={styles.tallyBar}>
        {shown.map((t) => (
          <View key={t.tone} style={{ flex: counts[t.tone], height: 6, borderRadius: 3, backgroundColor: t.tone === 'neutral' ? Palette.ink4 : toneColor(t.tone) }} />
        ))}
      </View>
      <View style={styles.tallyLegend}>
        {shown.map((t) => (
          <View key={t.tone} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.tone === 'neutral' ? Palette.ink4 : toneColor(t.tone) }} />
            <Txt variant="caption" tone="secondary">{counts[t.tone]} {t.label}</Txt>
          </View>
        ))}
      </View>
      {safety.length ? (
        <Txt variant="footnote" tone={risks ? 'weak' : 'secondary'} style={{ marginTop: 12 }}>
          {risks
            ? `${risks} of ${safety.length} safety ${safety.length === 1 ? 'question' : 'questions'} found a documented risk.`
            : `${safety.length} safety ${safety.length === 1 ? 'question' : 'questions'} checked, no established risk.`}
        </Txt>
      ) : null}
    </Card>
  );
}

function Count({ value, label, tone }: { value: number; label: string; tone: Tone }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Txt variant="metric" color={toneColor(tone)}>{value}</Txt>
      <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>{label}</Txt>
    </View>
  );
}

// ─── Safety ───────────────────────────────────────────────────────────────────

function Safety({ data }: { data: IngredientDetail }) {
  // Only the amounts we actually hold: an empty tile reading "Not set" tells the reader nothing.
  const doses = [
    { label: 'Studied range', value: data.typical_dose_range },
    { label: 'Daily guidance', value: data.recommended_daily },
    { label: 'Upper limit', value: data.upper_limit },
  ].filter((d) => d.value);
  const cautions = (data.claims ?? []).filter((c) => c.avoid_if).map((c) => c.avoid_if as string)
    .filter((text, i, all) => all.indexOf(text) === i);
  return (
    <View style={{ marginTop: 16 }}>
      {doses.length ? (
        <ListGroup>
          {doses.map((d) => <ListRow key={d.label} icon={PillIcon} title={d.label} subtitle={d.value ?? undefined} />)}
        </ListGroup>
      ) : (
        <Card variant="sunken" padding={16}>
          <Txt variant="subhead" tone="secondary">No dose range or upper limit has been established in the research we reviewed.</Txt>
        </Card>
      )}

      {cautions.length ? (
        <Section title="Who should check first" caption="From the studies behind each claim">
          <ListGroup>{cautions.map((s) => <ListRow key={s} icon={AlertTriangle} iconTint={Palette.moderate} title={s} />)}</ListGroup>
        </Section>
      ) : null}

      {data.admin_routes?.length ? (
        <Section title="Routes">
          <ListGroup>
            <ListRow icon={PillIcon} title="How it is taken" subtitle={data.admin_routes.join(', ')} />
          </ListGroup>
        </Section>
      ) : null}

      <Section title="Possible side effects">
        {data.side_effects.length ? (
          <ListGroup>{data.side_effects.map((s) => <ListRow key={s} icon={AlertTriangle} iconTint={Palette.moderate} title={s} />)}</ListGroup>
        ) : <Txt variant="subhead" tone="secondary">None recorded in our library. That is not the same as none existing.</Txt>}
      </Section>

      {data.drug_interactions.length ? (
        <Section title="Interactions" caption="Check with a clinician if you take any of these">
          <ListGroup>{data.drug_interactions.map((s) => <ListRow key={s} icon={PillIcon} iconTint={Palette.weak} title={s} />)}</ListGroup>
        </Section>
      ) : null}

      {data.contraindications.length ? (
        <Section title="Avoid if">
          <ListGroup>{data.contraindications.map((s) => <ListRow key={s} icon={Ban} iconTint={Palette.weak} title={s} />)}</ListGroup>
        </Section>
      ) : null}
    </View>
  );
}

function Molecule() {
  return (
    <Svg width={40} height={40} viewBox="0 0 60 60" fill="none" stroke={Palette.accent} strokeWidth={2}>
      <Circle cx={13} cy={18} r={5} /><Circle cx={43} cy={14} r={5} /><Circle cx={31} cy={43} r={5} />
      <Path d="M18 18l20-3M16 22l12 17M40 19l-7 19" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  structure: { width: 76, height: 76, borderRadius: 38, backgroundColor: Palette.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.hairline },
  connector: { alignItems: 'center', height: 20, justifyContent: 'center', zIndex: 2 },
  connectorDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center', marginVertical: -8, borderWidth: 3, borderColor: Palette.canvas },
  wayDot: { width: 9, height: 9, borderRadius: 4.5, marginHorizontal: 10 },
  tallyBar: { flexDirection: 'row', gap: 3, marginTop: 14 },
  tallyLegend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10 },
  mechImage: { height: 220, borderRadius: Radius.xl, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: Palette.sunken, marginBottom: 12 },
});
