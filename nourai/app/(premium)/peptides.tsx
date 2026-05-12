import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { Colors, Fonts, FontSizes, Radius, scale } from '@/constants/theme';
import { api, PeptideListItem } from '@/services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'fda_approved' | 'research_chemical' | 'wada_safe';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fda_approved', label: 'FDA Approved' },
  { key: 'research_chemical', label: 'Research Chemical' },
  { key: 'wada_safe', label: 'WADA Safe' },
];

const US_STATUS_LABEL: Record<string, string> = {
  fda_approved: 'FDA Approved',
  compounded: 'Compounded',
  research_chemical: 'Research Chemical',
  unapproved_drug: 'Unapproved Drug',
};

const WADA_PROHIBITED = new Set(['prohibited_in_competition', 'prohibited_all']);

// ─── Badge Components ─────────────────────────────────────────────────────────

function USStatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const label = US_STATUS_LABEL[status] ?? status;
  const color =
    status === 'fda_approved'
      ? Colors.accentHill
      : status === 'compounded'
      ? Colors.inkSecondary
      : Colors.accentAlert;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function WADABadge({ status }: { status: string | null }) {
  if (!status) return null;
  const prohibited = WADA_PROHIBITED.has(status);
  const color = prohibited ? Colors.accentAlert : Colors.accentHill;
  const label = prohibited ? 'WADA ✗' : 'WADA ✓';
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Peptide Card ─────────────────────────────────────────────────────────────

function PeptideCard({ item, onPress }: { item: PeptideListItem; onPress: () => void }) {
  const levelLabel = item.evidence_level
    ? item.evidence_level.charAt(0).toUpperCase() + item.evidence_level.slice(1)
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{item.canonical_name}</Text>
        {levelLabel && <Text style={styles.cardLevel}>{levelLabel}</Text>}
      </View>
      <View style={styles.badgeRow}>
        <USStatusBadge status={item.us_regulatory_status} />
        <WADABadge status={item.wada_status} />
      </View>
      {item.mechanism_summary && (
        <Text style={styles.cardMechanism} numberOfLines={2}>
          {item.mechanism_summary}
        </Text>
      )}
    </Pressable>
  );
}

// ─── Filter Chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PeptidesScreen() {
  const router = useRouter();

  const [allPeptides, setAllPeptides] = useState<PeptideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getPeptides();
        setAllPeptides(data.peptides);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load peptides.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = allPeptides;

    if (search.trim().length >= 2) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.canonical_name.toLowerCase().includes(q));
    }

    if (activeFilter === 'fda_approved') {
      list = list.filter((p) => p.us_regulatory_status === 'fda_approved');
    } else if (activeFilter === 'research_chemical') {
      list = list.filter((p) => p.us_regulatory_status === 'research_chemical');
    } else if (activeFilter === 'wada_safe') {
      list = list.filter((p) => !WADA_PROHIBITED.has(p.wada_status ?? ''));
    }

    return list;
  }, [allPeptides, search, activeFilter]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Peptides</Text>
          <Text style={styles.subtitle}>Research-grade evidence for the gray zone.</Text>
        </Animated.View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search peptides..."
            placeholderTextColor={Colors.inkTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterRowContent}
        >
          {FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              selected={activeFilter === f.key}
              onPress={() => setActiveFilter(f.key)}
            />
          ))}
        </ScrollView>

        {/* Content */}
        {loading ? (
          <ActivityIndicator style={styles.loader} color={Colors.ink} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>No peptides match your search.</Text>
        ) : (
          <View style={styles.list}>
            {filtered.map((item, i) => (
              <Animated.View key={item.id} entering={FadeInUp.delay(i * 30).duration(250)}>
                <PeptideCard
                  item={item}
                  onPress={() => router.push(`/ingredient/${item.id}` as any)}
                />
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  scroll: {
    paddingHorizontal: scale(24),
    paddingTop: scale(20),
    paddingBottom: scale(48),
  },
  header: {
    marginBottom: scale(20),
  },
  backButton: {
    marginBottom: scale(12),
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: scale(32),
    color: Colors.ink,
    marginBottom: scale(6),
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  searchContainer: {
    marginBottom: scale(12),
  },
  searchInput: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  filterRow: {
    marginBottom: scale(20),
  },
  filterRowContent: {
    gap: scale(8),
  },
  filterChip: {
    paddingHorizontal: scale(14),
    paddingVertical: scale(7),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.boneCard,
  },
  filterChipSelected: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  filterChipText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    letterSpacing: 0.4,
  },
  filterChipTextSelected: {
    color: Colors.bone,
  },
  list: {
    gap: scale(12),
  },
  card: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.lg,
    padding: scale(16),
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: scale(8),
  },
  cardName: {
    fontFamily: Fonts.serif,
    fontSize: scale(18),
    color: Colors.ink,
    flex: 1,
    marginRight: scale(8),
  },
  cardLevel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: scale(6),
    marginBottom: scale(8),
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  cardMechanism: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.5,
  },
  loader: {
    marginTop: scale(48),
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
    textAlign: 'center',
    marginTop: scale(48),
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
    textAlign: 'center',
    marginTop: scale(48),
  },
});
