import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Dna, SearchX } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { api, PeptideListItem } from '@/services/api';
import { evidenceStrength } from '@/utils/grade';
import { Card, ChipRow, EmptyState, EvidenceMeter, Pill, Screen, SearchField, Txt } from '@/components/ui';

type FilterKey = 'all' | 'fda_approved' | 'research_chemical' | 'wada_safe';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fda_approved', label: 'FDA approved' },
  { key: 'research_chemical', label: 'Research chemical' },
  { key: 'wada_safe', label: 'WADA permitted' },
];

const US_STATUS: Record<string, { label: string; tone: 'strong' | 'moderate' | 'weak' | 'neutral' }> = {
  fda_approved: { label: 'FDA approved', tone: 'strong' },
  compounded: { label: 'Compounded', tone: 'moderate' },
  research_chemical: { label: 'Research chemical', tone: 'weak' },
  unapproved_drug: { label: 'Unapproved drug', tone: 'weak' },
};

const WADA_PROHIBITED = new Set(['prohibited_in_competition', 'prohibited_all']);

export default function PeptidesScreen() {
  const [all, setAll] = useState<PeptideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setAll((await api.getPeptides()).peptides); } catch (e: any) { setError(e?.message ?? 'Couldn’t load peptides.'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const list = useMemo(() => {
    let l = all;
    const q = search.trim().toLowerCase();
    if (q.length >= 2) l = l.filter((p) => p.canonical_name.toLowerCase().includes(q));
    if (filter === 'fda_approved' || filter === 'research_chemical') l = l.filter((p) => p.us_regulatory_status === filter);
    if (filter === 'wada_safe') l = l.filter((p) => !WADA_PROHIBITED.has(p.wada_status ?? ''));
    return l;
  }, [all, search, filter]);

  return (
    <Screen back title="Peptides" subtitle="Research dossiers for the grey zone">
      <SearchField value={search} onChangeText={setSearch} onClear={() => setSearch('')} placeholder="Search peptides" autoCapitalize="none" />
      <ChipRow style={{ marginTop: 12 }} options={FILTERS} value={filter} onChange={setFilter} />

      <View style={{ marginTop: 20 }}>
        {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 24 }} /> : error ? (
          <EmptyState icon={Dna} title="Couldn’t load peptides" message={error} action="Try again" onAction={load} />
        ) : !list.length ? (
          <EmptyState icon={SearchX} title="No matches" message="Try a different name or filter." />
        ) : (
          <View style={{ gap: 12 }}>
            {list.map((p, i) => {
              const us = p.us_regulatory_status ? US_STATUS[p.us_regulatory_status] ?? { label: p.us_regulatory_status, tone: 'neutral' as const } : null;
              const prohibited = WADA_PROHIBITED.has(p.wada_status ?? '');
              return (
                <Animated.View key={p.id} entering={FadeInDown.duration(350).delay(Math.min(i, 10) * 35)}>
                  <Card padding={18} onPress={() => router.push(`/ingredient/${p.id}` as never)} accessibilityLabel={p.canonical_name}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <Txt variant="title2" style={{ flex: 1 }}>{p.canonical_name}</Txt>
                      <EvidenceMeter strength={evidenceStrength(p.evidence_level)} showLabel={false} width={52} />
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {us ? <Pill label={us.label} tone={us.tone} /> : null}
                      {p.wada_status ? <Pill label={prohibited ? 'WADA prohibited' : 'WADA permitted'} tone={prohibited ? 'weak' : 'strong'} /> : null}
                    </View>
                    {p.mechanism_summary ? <Txt variant="footnote" tone="secondary" numberOfLines={2} style={{ marginTop: 10 }}>{p.mechanism_summary}</Txt> : null}
                  </Card>
                </Animated.View>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
