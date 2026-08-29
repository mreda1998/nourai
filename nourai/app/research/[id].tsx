import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { Colors, Fonts, FontSizes, Radius, scale } from '@/constants/theme';
import { api } from '@/services/api';
import type { IngredientEvidenceRecord } from '@/services/api';
import { Eyebrow, SerifH, FilterPills, EvidenceSpectrum } from '@/components/elory';
import type { FilterPillOption } from '@/components/elory';

const STUDY_TYPE_LABEL: Record<string, string> = {
  rct: 'Randomized Controlled Trial',
  systematic_review: 'Systematic Review',
  meta_analysis: 'Meta-Analysis',
  cohort: 'Cohort Study',
  case_control: 'Case-Control Study',
  cross_sectional: 'Cross-Sectional Study',
  in_vitro: 'In Vitro Study',
  animal: 'Animal Study',
  review: 'Review',
  case_report: 'Case Report',
  other: 'Study',
};

const HUMAN_STUDY_TYPES = new Set(['rct', 'cohort', 'case_control', 'cross_sectional', 'case_report']);
const REVIEW_TYPES = new Set(['review', 'systematic_review']);

type FilterKey = 'all' | 'human' | 'reviews' | 'meta';

function matchesFilter(ev: IngredientEvidenceRecord, filter: FilterKey): boolean {
  const type = ev.study_type ?? 'other';
  if (filter === 'all') return true;
  if (filter === 'human') return HUMAN_STUDY_TYPES.has(type);
  if (filter === 'reviews') return REVIEW_TYPES.has(type);
  if (filter === 'meta') return type === 'meta_analysis';
  return true;
}

function confidenceLabel(c: string): string {
  if (c === 'high') return 'Strong';
  if (c === 'moderate') return 'Moderate';
  return 'Preliminary';
}

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={2}>
      <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function ResearchEvidenceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [evidence, setEvidence] = useState<IngredientEvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getIngredientWithFallback(id as string).then((data) => {
      if (data) {
        setName(data.canonical_name);
        setEvidence(data.evidence);
      }
      setLoading(false);
    });
  }, [id]);

  const filtered = evidence.filter((ev) => matchesFilter(ev, filter));

  const options: FilterPillOption[] = [
    { label: 'All evidence', value: 'all', count: evidence.length },
    { label: 'Human studies', value: 'human', count: evidence.filter((e) => matchesFilter(e, 'human')).length },
    { label: 'Reviews', value: 'reviews', count: evidence.filter((e) => matchesFilter(e, 'reviews')).length },
    { label: 'Meta-analyses', value: 'meta', count: evidence.filter((e) => matchesFilter(e, 'meta')).length },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
          style={styles.backBtn}
          hitSlop={12}
        >
          <BackIcon />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.ink} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(48) }]}
          showsVerticalScrollIndicator={false}
        >
          <Eyebrow style={{ marginBottom: 6 }}>Research evidence</Eyebrow>
          <SerifH size={26} style={{ marginBottom: 20 }}>{name}</SerifH>

          <View style={{ marginBottom: 16 }}>
            <FilterPills options={options} value={filter} onChange={(v) => setFilter(v as FilterKey)} />
          </View>

          <Text style={styles.countText}>
            {filtered.length} {filtered.length === 1 ? 'study' : 'studies'}
          </Text>

          {filtered.map((ev) => (
            <View key={ev.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <Text style={styles.studyType}>
                  {ev.study_type ? (STUDY_TYPE_LABEL[ev.study_type] ?? ev.study_type) : 'Study'}
                </Text>
                {ev.year && <Text style={styles.studyYear}>{ev.year}</Text>}
              </View>
              <Text style={styles.finding} numberOfLines={3}>{ev.finding}</Text>
              <View style={styles.cardBottomRow}>
                <View style={{ flex: 1 }}>
                  {ev.pmid && <Text style={styles.metaText}>PMID: {ev.pmid}</Text>}
                </View>
                <EvidenceSpectrum
                  strength={ev.confidence === 'high' ? 5 : ev.confidence === 'moderate' ? 3 : 2}
                  max={5}
                  label={confidenceLabel(ev.confidence)}
                />
              </View>
            </View>
          ))}

          {filtered.length === 0 && (
            <Text style={styles.emptyText}>No studies match this filter.</Text>
          )}

          <Text style={styles.footnote}>
            Elory links to peer-reviewed research. Always consider your personal context and consult professionals.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: scale(24),
    paddingTop: scale(8),
    paddingBottom: scale(4),
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkSecondary,
  },
  scrollContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(16),
  },
  countText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkTertiary,
    marginBottom: scale(12),
  },
  card: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 0.5,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: scale(16),
    marginBottom: scale(10),
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: scale(8),
  },
  studyType: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: Colors.inkSecondary,
    flex: 1,
  },
  studyYear: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
  },
  finding: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.ink,
    marginBottom: scale(10),
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    textAlign: 'center',
    marginTop: scale(24),
  },
  footnote: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
    textAlign: 'center',
    lineHeight: FontSizes.xs * 1.6,
    marginTop: scale(24),
  },
});
