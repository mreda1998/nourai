import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ExternalLink, FileSearch } from 'lucide-react-native';
import { api } from '@/services/api';
import type { IngredientEvidenceRecord } from '@/services/api';
import { Palette } from '@/constants/theme';
import { Card, ChipRow, EmptyState, Pill, Screen, Txt } from '@/components/ui';

const STUDY_TYPE: Record<string, string> = {
  rct: 'Randomised controlled trial',
  systematic_review: 'Systematic review',
  meta_analysis: 'Meta-analysis',
  cohort: 'Cohort study',
  case_control: 'Case-control study',
  cross_sectional: 'Cross-sectional study',
  in_vitro: 'Lab (in vitro) study',
  animal: 'Animal study',
  review: 'Review',
  case_report: 'Case report',
  other: 'Study',
};

const HUMAN = new Set(['rct', 'cohort', 'case_control', 'cross_sectional', 'case_report']);
const REVIEWS = new Set(['review', 'systematic_review']);
type FilterKey = 'all' | 'human' | 'reviews' | 'meta';

function matches(ev: IngredientEvidenceRecord, f: FilterKey) {
  const t = ev.study_type ?? 'other';
  if (f === 'human') return HUMAN.has(t);
  if (f === 'reviews') return REVIEWS.has(t);
  if (f === 'meta') return t === 'meta_analysis';
  return true;
}

const DIRECTION = {
  benefit: { label: 'Benefit', tone: 'strong' },
  risk: { label: 'Risk', tone: 'weak' },
  mixed: { label: 'Mixed', tone: 'moderate' },
  neutral: { label: 'No effect', tone: 'neutral' },
} as const;

export default function ResearchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('');
  const [evidence, setEvidence] = useState<IngredientEvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (!id) return;
    api.getIngredientWithFallback(id).then((d) => {
      if (d) { setName(d.canonical_name); setEvidence(d.evidence); }
    }).finally(() => setLoading(false));
  }, [id]);

  const count = (f: FilterKey) => evidence.filter((e) => matches(e, f)).length;
  const list = evidence.filter((e) => matches(e, filter));

  return (
    <Screen back title="Research" eyebrow={name || undefined} subtitle={loading ? undefined : `${evidence.length} studies summarised`}>
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
            {list.length ? list.map((ev, i) => {
              const dir = DIRECTION[ev.direction] ?? DIRECTION.neutral;
              return (
                <Animated.View key={ev.id} entering={FadeInDown.duration(350).delay(Math.min(i, 8) * 40)}>
                  <Card
                    padding={18}
                    onPress={ev.pmid ? () => Linking.openURL(`https://pubmed.ncbi.nlm.nih.gov/${ev.pmid}/`) : undefined}
                    accessibilityLabel={ev.finding}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Txt variant="caption" tone="secondary">{STUDY_TYPE[ev.study_type ?? 'other'] ?? ev.study_type}{ev.year ? ` · ${ev.year}` : ''}</Txt>
                      <Pill label={dir.label} tone={dir.tone} />
                    </View>
                    <Txt variant="callout" style={{ marginTop: 10 }}>{ev.finding}</Txt>
                    {ev.title ? <Txt variant="footnote" tone="secondary" numberOfLines={2} style={{ marginTop: 8 }}>{ev.title}</Txt> : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <Txt variant="caption" tone="tertiary" style={{ textTransform: 'capitalize' }}>
                        {ev.confidence} confidence{ev.sample_size ? ` · n = ${ev.sample_size.toLocaleString()}` : ''}
                      </Txt>
                      {ev.pmid ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Txt variant="caption" tone="accent">PubMed</Txt>
                          <ExternalLink size={12} color={Palette.accent} />
                        </View>
                      ) : null}
                    </View>
                  </Card>
                </Animated.View>
              );
            }) : <EmptyState icon={FileSearch} title="No studies here" message="Try a different filter." />}
          </View>
          <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 24, paddingHorizontal: 20 }}>
            Summaries of peer-reviewed research. Consider your personal context and consult a professional.
          </Txt>
        </>
      )}
    </Screen>
  );
}
