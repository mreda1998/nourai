import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { FileSearch } from 'lucide-react-native';
import { api } from '@/services/api';
import type { IngredientClaim, IngredientEvidenceRecord } from '@/services/api';
import { Palette } from '@/constants/theme';
import { certaintyLabel, studiesForClaim, verdictLabel, verdictTone } from '@/utils/evidence';
import { StudyCard } from '@/components/StudyCard';
import { Card, ChipRow, EmptyState, Pill, Screen, Section, Txt } from '@/components/ui';

const HUMAN = new Set(['rct', 'crossover_rct', 'non_randomized_trial', 'cohort', 'case_control', 'cross_sectional', 'case_series', 'case_report']);
const REVIEWS = new Set(['review', 'narrative_review', 'systematic_review']);
type FilterKey = 'all' | 'human' | 'reviews' | 'meta';

function matches(ev: IngredientEvidenceRecord, f: FilterKey) {
  const t = ev.study_type ?? 'other';
  if (f === 'human') return HUMAN.has(t);
  if (f === 'reviews') return REVIEWS.has(t);
  if (f === 'meta') return t === 'meta_analysis';
  return true;
}

export default function ResearchScreen() {
  const { id, claim: claimId } = useLocalSearchParams<{ id: string; claim?: string }>();
  const [name, setName] = useState('');
  const [evidence, setEvidence] = useState<IngredientEvidenceRecord[]>([]);
  const [claims, setClaims] = useState<IngredientClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (!id) return;
    api.getIngredientWithFallback(id).then((d) => {
      if (d) { setName(d.canonical_name); setEvidence(d.evidence); setClaims(d.claims ?? []); }
    }).finally(() => setLoading(false));
  }, [id]);

  const claim = claimId ? claims.find((c) => c.id === claimId) : undefined;
  if (claim) {
    const studies = studiesForClaim(claim, evidence);
    return (
      <Screen back title={claim.claim} eyebrow={name || undefined}>
        <ClaimVerdict claim={claim} />
        <Section title="The studies" caption={`${studies.length} ${studies.length === 1 ? 'study' : 'studies'}, strongest first`}>
          <View style={{ gap: 12 }}>
            {studies.length
              ? studies.map(({ study, stance }, i) => <StudyCard key={study.id} study={study} stance={stance} index={i} />)
              : <EmptyState icon={FileSearch} title="No studies yet" message="We found no studies that test this directly." />}
          </View>
        </Section>
        <Disclaimer />
      </Screen>
    );
  }

  const count = (f: FilterKey) => evidence.filter((e) => matches(e, f)).length;
  const list = evidence.filter((e) => matches(e, filter));

  return (
    <Screen back title="Research" eyebrow={name || undefined} subtitle={loading ? undefined : `${evidence.length} studies reviewed`}>
      {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 32 }} /> : (
        <>
          <ChipRow
            options={[
              { key: 'all', label: `All ${evidence.length}` },
              { key: 'human', label: `Human ${count('human')}` },
              { key: 'reviews', label: `Reviews ${count('reviews')}` },
              { key: 'meta', label: `Meta-analyses ${count('meta')}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <View style={{ gap: 12, marginTop: 20 }}>
            {list.length
              ? list.map((ev, i) => <StudyCard key={ev.id} study={ev} index={i} />)
              : <EmptyState icon={FileSearch} title="No studies here" message="Try a different filter." />}
          </View>
          <Disclaimer />
        </>
      )}
    </Screen>
  );
}

function ClaimVerdict({ claim }: { claim: IngredientClaim }) {
  const details = [
    { label: 'How much', value: claim.effect_size },
    { label: 'Who this applies to', value: claim.applies_to },
    { label: 'Who should be careful', value: claim.avoid_if },
    { label: 'Dose and form', value: claim.dose_note },
  ].filter((d) => d.value);
  return (
    <>
      <Card padding={20} style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pill label={verdictLabel(claim.kind, claim.verdict, claim.certainty)} tone={verdictTone(claim.kind, claim.verdict, claim.certainty)} />
          <Txt variant="caption" tone="tertiary">{certaintyLabel(claim.certainty)}</Txt>
        </View>
        {claim.reality ? <Txt variant="callout" style={{ marginTop: 14 }}>{claim.reality}</Txt> : null}
        {details.map((d) => (
          <View key={d.label} style={{ marginTop: 14 }}>
            <Txt variant="overline" tone="tertiary">{d.label}</Txt>
            <Txt variant="subhead" tone="secondary" style={{ marginTop: 4 }}>{d.value}</Txt>
          </View>
        ))}
        {claim.certainty_reasons.length ? (
          <View style={{ marginTop: 14 }}>
            <Txt variant="overline" tone="tertiary">Why we’re not more certain</Txt>
            {claim.certainty_reasons.map((r) => <Txt key={r} variant="subhead" tone="secondary" style={{ marginTop: 4 }}>• {r}</Txt>)}
          </View>
        ) : null}
      </Card>
      {claim.why_people_believe ? (
        <Card variant="sunken" padding={18} style={{ marginTop: 12 }}>
          <Txt variant="overline" tone="secondary">Why people believe it</Txt>
          <Txt variant="subhead" tone="secondary" style={{ marginTop: 6 }}>{claim.why_people_believe}</Txt>
        </Card>
      ) : null}
    </>
  );
}

function Disclaimer() {
  return (
    <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 24, paddingHorizontal: 20 }}>
      Summaries of peer-reviewed research. Consider your personal context and consult a professional.
    </Txt>
  );
}
