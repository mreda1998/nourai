/**
 * Ingredient Deep Dive Screen
 *
 * Layered information architecture:
 *   Layer 1 — Verdict (answer in 1 line, above the fold)
 *   Layer 2 — Mechanism image + Belief vs Reality (the "why")
 *   Layer 3 — Evidence snapshot + Dose + Safety (the "how much")
 *   Layer 4 — Found in products (context)
 *
 * Users who want the signal stop at layer 1.
 * Power users expand each section for the full science.
 */

import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Colors, Fonts, FontSizes, Radius, scale, verticalScale, Spacing } from '@/constants/theme';
import { BIODOMAIN_BY_KEY } from '@/constants/biodomains';
import { api } from '@/services/api';
import type { IngredientDetail, IngredientEvidenceRecord, IngredientBioDomainScore } from '@/services/api';
import { useAuth } from '@/context/auth-context';
import { Eyebrow, SerifH, SectionHead, Tag, AlertNote, SpectrumBar } from '@/components/elory';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STUDY_TYPE_LABEL: Record<string, string> = {
  rct:               'RCT',
  systematic_review: 'Systematic Review',
  meta_analysis:     'Meta-Analysis',
  cohort:            'Cohort',
  case_control:      'Case-Control',
  cross_sectional:   'Cross-Sectional',
  in_vitro:          'In Vitro',
  animal:            'Animal',
  review:            'Review',
  case_report:       'Case Report',
  other:             'Study',
};

const EVIDENCE_LEVEL_LABEL: Record<string, string> = {
  strong:       'Strong Evidence',
  moderate:     'Moderate Evidence',
  limited:      'Limited Evidence',
  insufficient: 'Insufficient Evidence',
};

const GOAL_LABELS: Record<string, string> = {
  clear_skin:        'Clear Skin',
  anti_aging:        'Anti-Aging',
  brighter_skin:     'Brighter Skin',
  hair_growth:       'Hair Growth',
  prevent_hair_loss: 'Hair Loss Prevention',
  build_muscle:      'Build Muscle',
  fat_loss:          'Fat Loss',
  more_energy:       'More Energy',
  gut_health:        'Gut Health',
  less_inflammation: 'Less Inflammation',
  mental_focus:      'Mental Focus',
  reduce_stress:     'Reduce Stress',
  better_sleep:      'Better Sleep',
  recovery:          'Recovery',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    vitamin:     'Vitamin',
    mineral:     'Mineral',
    amino_acid:  'Amino Acid',
    herb:        'Herb / Botanical',
    probiotic:   'Probiotic',
    enzyme:      'Enzyme',
    fatty_acid:  'Fatty Acid',
    antioxidant: 'Antioxidant',
    preservative:'Preservative',
    sweetener:   'Sweetener',
    additive:    'Additive',
    other:       'Active Ingredient',
  };
  return map[cat] ?? cat;
}

const STUDY_RANK: Record<string, number> = {
  meta_analysis: 5, systematic_review: 4, rct: 3, cohort: 2, other: 1,
};
const CONF_RANK: Record<string, number> = { high: 3, moderate: 2, low: 1 };

function getBestStudy(ev: IngredientEvidenceRecord[]): IngredientEvidenceRecord | null {
  if (!ev.length) return null;
  return [...ev].sort((a, b) => {
    const cd = (CONF_RANK[b.confidence] ?? 0) - (CONF_RANK[a.confidence] ?? 0);
    if (cd !== 0) return cd;
    const sd = (STUDY_RANK[b.study_type ?? 'other'] ?? 0) - (STUDY_RANK[a.study_type ?? 'other'] ?? 0);
    if (sd !== 0) return sd;
    return (b.sample_size ?? 0) - (a.sample_size ?? 0);
  })[0];
}

function aggregateVerdict(ev: IngredientEvidenceRecord[]): {
  direction: string; confidence: string;
} {
  if (!ev.length) return { direction: 'neutral', confidence: 'low' };
  const counts = { benefit: 0, risk: 0, neutral: 0, mixed: 0 };
  let bestConf = 'low';
  ev.forEach((e) => {
    counts[e.direction as keyof typeof counts] = (counts[e.direction as keyof typeof counts] ?? 0) + 1;
    if ((CONF_RANK[e.confidence] ?? 0) > (CONF_RANK[bestConf] ?? 0)) bestConf = e.confidence;
  });
  const total = ev.length;
  let direction = 'neutral';
  if (counts.benefit / total >= 0.6) direction = 'benefit';
  else if (counts.risk / total >= 0.5) direction = 'risk';
  else if (counts.mixed > 0 || (counts.benefit > 0 && counts.risk > 0)) direction = 'mixed';
  return { direction, confidence: bestConf };
}

function directionColor(d: string) {
  switch (d) {
    case 'benefit': return Colors.sage;
    case 'risk':    return Colors.alert;
    case 'mixed':   return '#8B6914';
    default:        return Colors.inkTertiary;
  }
}

function directionIcon(d: string) {
  switch (d) {
    case 'benefit': return '↑';
    case 'risk':    return '↓';
    case 'mixed':   return '↕';
    default:        return '→';
  }
}

function directionLabel(d: string) {
  switch (d) {
    case 'benefit': return 'Benefit';
    case 'risk':    return 'Risk';
    case 'mixed':   return 'Mixed';
    default:        return 'Neutral';
  }
}

function toggle(setFn: React.Dispatch<React.SetStateAction<boolean>>) {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setFn((v) => !v);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={2}>
      <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AlertIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.alert} strokeWidth={2}>
      <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <Path d="M12 9v4M12 17h.01" strokeLinecap="round" />
    </Svg>
  );
}

// ─── Relevance Banner ─────────────────────────────────────────────────────────
// Shows which of the user's goals this ingredient directly supports (via evidence goal_tags).

function RelevanceBanner({
  evidence,
  userGoals,
}: {
  evidence: IngredientEvidenceRecord[];
  userGoals: string[];
}) {
  const matchedGoals = userGoals.filter((g) =>
    evidence.some((ev) => (ev.goal_tags ?? []).includes(g) && ev.direction === 'benefit')
  );
  if (!matchedGoals.length) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.relevanceBanner}>
      <Text style={styles.relevanceIcon}>✦</Text>
      <Text style={styles.relevanceText}>
        Supports your goals:{' '}
        <Text style={styles.relevanceGoals}>
          {matchedGoals.map((g) => GOAL_LABELS[g] ?? g).join(' · ')}
        </Text>
      </Text>
    </Animated.View>
  );
}

// ─── Evidence Grid ────────────────────────────────────────────────────────────
// 2×2 grid: Evidence base, Study count, Consensus, Confidence

function EvidenceGrid({
  evidence,
  evidenceLevel,
}: {
  evidence: IngredientEvidenceRecord[];
  evidenceLevel: string | null;
}) {
  const { direction, confidence } = aggregateVerdict(evidence);
  const levelLabel = evidenceLevel ? EVIDENCE_LEVEL_LABEL[evidenceLevel] : 'Insufficient';

  const cells = [
    { label: 'Evidence base', value: levelLabel },
    { label: 'Studies', value: evidence.length > 0 ? String(evidence.length) : '—' },
    { label: 'Consensus', value: directionLabel(direction) },
    { label: 'Confidence', value: confidence.charAt(0).toUpperCase() + confidence.slice(1) },
  ];

  return (
    <Animated.View entering={FadeIn.delay(80).duration(300)} style={styles.evidenceGrid}>
      {cells.map((cell, i) => (
        <View key={cell.label} style={[styles.evidenceGridCell, i % 2 === 0 && i < 2 && styles.evidenceGridCellBorderR, i < 2 && styles.evidenceGridCellBorderB]}>
          <Eyebrow style={{ marginBottom: 6 }}>{cell.label}</Eyebrow>
          <SerifH size={18}>{cell.value}</SerifH>
        </View>
      ))}
    </Animated.View>
  );
}

// ─── Mechanism Section ────────────────────────────────────────────────────────
// Image when available, placeholder when not. Full mechanism text collapsed by default.

// Local mechanism illustrations (temporary until DB-backed URLs are generated)
const LOCAL_MECHANISM_IMAGES: Record<string, ReturnType<typeof require>> = {
  'creatine monohydrate': require('@/assets/images/creatine-mechanism.png'),
};

function MechanismSection({
  mechanismSummary,
  imageUrl,
  canonicalName,
}: {
  mechanismSummary: string | null;
  imageUrl: string | null;
  canonicalName?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!mechanismSummary) return null;

  // Caption: first sentence of mechanism summary
  const firstSentence = mechanismSummary.split(/\.\s/)[0].replace(/\.$/, '');
  const hasMore = mechanismSummary.length > firstSentence.length + 2;

  const localImage = canonicalName ? LOCAL_MECHANISM_IMAGES[canonicalName.toLowerCase()] : undefined;

  return (
    <Animated.View entering={FadeInUp.delay(120).duration(350)}>
      <SectionHead label="How it works" />

      {/* Image or placeholder */}
      <View style={styles.mechanismImageWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.mechanismImage}
            resizeMode="contain"
          />
        ) : localImage ? (
          <Image
            source={localImage}
            style={styles.mechanismImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.mechanismPlaceholder}>
            <Text style={styles.mechanismPlaceholderIcon}>⬡</Text>
            <Text style={styles.mechanismPlaceholderText}>Illustration coming soon</Text>
          </View>
        )}
      </View>

      {/* Caption (always visible) */}
      <Text style={styles.mechanismCaption}>{firstSentence}.</Text>

      {/* Full text (collapsed by default) */}
      {hasMore && (
        <>
          {expanded && (
            <Text style={styles.mechanismFull}>{mechanismSummary}</Text>
          )}
          <Pressable onPress={() => toggle(setExpanded)} style={styles.expandBtn}>
            <Text style={styles.expandBtnText}>
              {expanded ? 'Show less ↑' : 'Read full mechanism ↓'}
            </Text>
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}

// ─── Belief vs Reality ────────────────────────────────────────────────────────
// Shown as AlertNote pair — belief (alert) + reality (sage)

function BeliefRealityCard({
  commonBelief,
  evidenceReality,
}: {
  commonBelief: string;
  evidenceReality: string;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(100).duration(400)} style={{ gap: 10 }}>
      <AlertNote tone="alert" title="Common belief">
        {commonBelief}
      </AlertNote>
      <AlertNote tone="sage" title="What research shows">
        {evidenceReality}
      </AlertNote>
    </Animated.View>
  );
}

// ─── Evidence Snapshot ────────────────────────────────────────────────────────
// Distribution bar + best study always visible; rest collapsed behind "See all".

function EvidenceSnapshot({ evidence }: { evidence: IngredientEvidenceRecord[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!evidence.length) return null;

  const counts = { benefit: 0, risk: 0, neutral: 0, mixed: 0 };
  evidence.forEach((ev) => {
    counts[ev.direction as keyof typeof counts] = (counts[ev.direction as keyof typeof counts] ?? 0) + 1;
  });

  const bestStudy = getBestStudy(evidence);
  const restStudies = evidence.filter((ev) => ev !== bestStudy);

  return (
    <Animated.View entering={FadeInUp.delay(140).duration(350)}>
      <SectionHead
        label="Research"
        right={`${evidence.length} ${evidence.length === 1 ? 'study' : 'studies'}`}
      />

      {/* Distribution bar */}
      <View style={styles.evidenceBarWrap}>
        <View style={styles.evidenceBar}>
          {counts.benefit > 0 && (
            <View style={[styles.evidenceBarSeg, { flex: counts.benefit, backgroundColor: Colors.sage }]} />
          )}
          {counts.mixed > 0 && (
            <View style={[styles.evidenceBarSeg, { flex: counts.mixed, backgroundColor: Colors.sand }]} />
          )}
          {counts.neutral > 0 && (
            <View style={[styles.evidenceBarSeg, { flex: counts.neutral, backgroundColor: Colors.surfaceAlt }]} />
          )}
          {counts.risk > 0 && (
            <View style={[styles.evidenceBarSeg, { flex: counts.risk, backgroundColor: Colors.alert }]} />
          )}
        </View>
        <View style={styles.evidenceBarLabels}>
          {counts.benefit > 0 && (
            <Text style={[styles.evidenceBarLabel, { color: Colors.sage }]}>
              {counts.benefit} benefit
            </Text>
          )}
          {counts.mixed > 0 && (
            <Text style={[styles.evidenceBarLabel, { color: '#8B6914' }]}>
              {counts.mixed} mixed
            </Text>
          )}
          {counts.neutral > 0 && (
            <Text style={[styles.evidenceBarLabel, { color: Colors.inkTertiary }]}>
              {counts.neutral} neutral
            </Text>
          )}
          {counts.risk > 0 && (
            <Text style={[styles.evidenceBarLabel, { color: Colors.alert }]}>
              {counts.risk} risk
            </Text>
          )}
        </View>
      </View>

      {/* Best study — always visible */}
      {bestStudy && <EvidenceCard ev={bestStudy} index={0} />}

      {/* Remaining studies — collapsed */}
      {restStudies.length > 0 && (
        <>
          {expanded && restStudies.map((ev, i) => (
            <EvidenceCard key={ev.id} ev={ev} index={i + 1} />
          ))}
          <Pressable onPress={() => toggle(setExpanded)} style={styles.expandBtn}>
            <Text style={styles.expandBtnText}>
              {expanded
                ? 'Show less ↑'
                : `See all ${restStudies.length} more ${restStudies.length === 1 ? 'study' : 'studies'} ↓`}
            </Text>
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}

// ─── Evidence Card ────────────────────────────────────────────────────────────

function EvidenceCard({ ev, index }: { ev: IngredientEvidenceRecord; index: number }) {
  const dirColor = directionColor(ev.direction);
  const studyLabel = ev.study_type ? (STUDY_TYPE_LABEL[ev.study_type] ?? ev.study_type) : null;
  const confColors = {
    high:     { bg: Colors.ink,          text: Colors.surface },
    moderate: { bg: Colors.inkSecondary, text: Colors.surface },
    low:      { bg: Colors.surfaceAlt,   text: Colors.inkSecondary },
  }[ev.confidence] ?? { bg: Colors.surfaceAlt, text: Colors.inkSecondary };

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 50).duration(300)}
      style={styles.evidenceCard}
    >
      <View style={styles.evidenceTopRow}>
        <View style={styles.evidenceMeta}>
          {studyLabel && <Text style={styles.studyType}>{studyLabel}</Text>}
          {ev.year && <Text style={styles.studyYear}> · {ev.year}</Text>}
        </View>
        <View style={[styles.confidenceBadge, { backgroundColor: confColors.bg }]}>
          <Text style={[styles.confidenceText, { color: confColors.text }]}>
            {ev.confidence.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.findingText}>{ev.finding}</Text>
      <View style={styles.evidenceBottomRow}>
        {ev.population && (
          <Text style={styles.populationText} numberOfLines={1}>
            {ev.population}{ev.sample_size ? ` (n=${ev.sample_size})` : ''}
          </Text>
        )}
        <View style={[styles.directionDot, { backgroundColor: dirColor }]} />
      </View>
    </Animated.View>
  );
}

// ─── Bio-Domain Effects ───────────────────────────────────────────────────────
// Shows how this ingredient affects each of the 6 bio-domains.
// Computed by the research agent; always displayed (shows "—" when no data).

const DOMAIN_ORDER = [
  { slug: 'metabolism',     label: 'Metabolism' },
  { slug: 'cognition',      label: 'Cognition' },
  { slug: 'sleep-recovery', label: 'Sleep & Recovery' },
  { slug: 'gut-health',     label: 'Gut Health' },
  { slug: 'skin',           label: 'Skin' },
  { slug: 'exposure-load',  label: 'Exposure Load' },
] as const;

function BioDomainEffects({
  domainEffects,
}: {
  domainEffects: IngredientDetail['domain_effects'];
}) {
  const hasAnyData = domainEffects && Object.values(domainEffects).some(
    (d) => d.evidence_count > 0
  );
  if (!hasAnyData) return null;

  return (
    <Animated.View entering={FadeInUp.delay(155).duration(350)}>
      <SectionHead label="Bio-Domain Effects" />
      <View style={styles.domainTable}>
        {DOMAIN_ORDER.map(({ slug, label }, i) => {
          const effect = domainEffects?.[slug];
          const hasData = effect && effect.evidence_count > 0;
          const last = i === DOMAIN_ORDER.length - 1;
          const dotColor = hasData ? directionColor(effect.direction) : 'transparent';

          return (
            <View
              key={slug}
              style={[styles.domainRow, !last && styles.domainRowBorder]}
            >
              {/* Domain name */}
              <Text style={[styles.domainRowLabel, !hasData && styles.domainRowLabelDim]}>
                {label}
              </Text>

              {/* Right side */}
              {hasData ? (
                <View style={styles.domainRowRight}>
                  {/* Colored dot — only colored element */}
                  <View style={[styles.domainDot, { backgroundColor: dotColor }]} />
                  <View style={styles.domainRowMeta}>
                    <Text style={styles.domainRowDirection}>
                      {directionLabel(effect.direction)}
                    </Text>
                    <Text style={styles.domainRowCount}>
                      {effect.evidence_count}{' '}
                      {effect.evidence_count === 1 ? 'study' : 'studies'}
                      {'  ·  '}{effect.confidence}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.domainRowEmpty}>—</Text>
              )}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ─── Dose Card ────────────────────────────────────────────────────────────────
// Horizontal 3-cell card replacing the old list table.

function DoseCard({ ingredient }: { ingredient: IngredientDetail }) {
  const cells = [
    { label: 'Typical', value: ingredient.typical_dose_range, warn: false },
    { label: 'Recommended', value: ingredient.recommended_daily, warn: false },
    { label: 'Upper limit', value: ingredient.upper_limit, warn: true },
  ].filter((c) => c.value);

  if (!cells.length) return null;

  return (
    <Animated.View entering={FadeInUp.delay(160).duration(350)}>
      <SectionHead label="Dosage" />
      <View style={styles.doseCard}>
        {cells.map((cell, i) => (
          <View
            key={cell.label}
            style={[styles.doseCell, i < cells.length - 1 && styles.doseCellBorder]}
          >
            <Text style={styles.doseCellLabel}>{cell.label}</Text>
            <Text style={[styles.doseCellValue, cell.warn && styles.doseCellWarn]}>
              {cell.value}
            </Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Safety Section ───────────────────────────────────────────────────────────
// Collapsed by default. Shows a single summary row; expands to chips.

function SafetySection({ ingredient }: { ingredient: IngredientDetail }) {
  const [expanded, setExpanded] = useState(false);

  const interactionCount = ingredient.drug_interactions.length;
  const contrainCount = ingredient.contraindications.length;
  const sideCount = ingredient.side_effects.length;
  const totalFlags = interactionCount + contrainCount;

  const hasSafety = totalFlags > 0 || sideCount > 0;
  if (!hasSafety) return null;

  const summaryText = totalFlags > 0
    ? `${totalFlags} interaction${totalFlags !== 1 ? 's' : ''} · ${sideCount} side effect${sideCount !== 1 ? 's' : ''}`
    : `${sideCount} possible side effect${sideCount !== 1 ? 's' : ''}`;

  return (
    <Animated.View entering={FadeInUp.delay(180).duration(350)}>
      <Pressable style={styles.safetyRow} onPress={() => toggle(setExpanded)}>
        <View style={styles.safetyRowLeft}>
          {totalFlags > 0 ? <AlertIcon /> : null}
          <Text style={[styles.safetyRowText, totalFlags > 0 && styles.safetyRowTextWarn]}>
            Safety · {summaryText}
          </Text>
        </View>
        <Text style={styles.safetyChevron}>{expanded ? '↑' : '↓'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.safetyExpanded}>
          {ingredient.contraindications.length > 0 && (
            <View style={styles.safetyBlock}>
              <Text style={styles.safetyBlockLabel}>Contraindications</Text>
              <View style={styles.chipRow}>
                {ingredient.contraindications.map((c) => (
                  <View key={c} style={[styles.chip, styles.chipWarn]}>
                    <Text style={[styles.chipText, styles.chipTextWarn]}>{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {ingredient.drug_interactions.length > 0 && (
            <View style={styles.safetyBlock}>
              <Text style={styles.safetyBlockLabel}>Drug interactions</Text>
              <View style={styles.chipRow}>
                {ingredient.drug_interactions.map((d) => (
                  <View key={d} style={[styles.chip, styles.chipWarn]}>
                    <Text style={[styles.chipText, styles.chipTextWarn]}>{d}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {ingredient.side_effects.length > 0 && (
            <View style={styles.safetyBlock}>
              <Text style={styles.safetyBlockLabel}>Possible side effects</Text>
              <View style={styles.chipRow}>
                {ingredient.side_effects.map((s) => (
                  <View key={s} style={styles.chip}>
                    <Text style={styles.chipText}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

/**
 * Single biodomain impact row — shows a labeled bar with direction color,
 * dose context, and confidence badge.
 */
function BioDomainRow({ score, index }: { score: IngredientBioDomainScore; index: number }) {
  const def = BIODOMAIN_BY_KEY[score.biodomain];
  const displayName = def?.name ?? score.biodomain;
  const barColor = def?.color ?? Colors.inkSecondary;

  const barWidth = `${Math.round(score.magnitude * 100)}%` as const;

  const directionColor =
    score.direction === 'benefit' ? Colors.sage :
    score.direction === 'harm'    ? Colors.alert :
    score.direction === 'mixed'   ? '#8B6914' :
                                    Colors.inkTertiary;

  const directionLabel =
    score.direction === 'benefit' ? 'benefit' :
    score.direction === 'harm'    ? 'harm' :
    score.direction === 'mixed'   ? 'mixed' : 'neutral';

  const doseNote = score.dose_dependent && score.effective_dose_low
    ? `Effective at ${score.effective_dose_low}${
        score.effective_dose_high && score.effective_dose_high !== score.effective_dose_low
          ? `–${score.effective_dose_high}`
          : ''
      } ${score.dose_unit ?? ''}`
    : null;

  const spectrumTone =
    score.direction === 'benefit' ? 'sage' :
    score.direction === 'harm' ? 'alert' :
    'ink';

  const rightLabel = doseNote ?? `${score.confidence} conf.`;

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 50).duration(300)}
      style={styles.bioDomainRow}
    >
      <SpectrumBar
        position={score.magnitude}
        label={displayName}
        right={rightLabel}
        tone={spectrumTone as 'ink' | 'alert' | 'sage' | 'accent'}
      />
      {score.notes && (
        <Text style={styles.bioDomainNotes}>{score.notes}</Text>
      )}
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function IngredientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { onboardingProfile } = useAuth();

  const [ingredient, setIngredient] = useState<IngredientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userGoals = onboardingProfile?.goals ?? [];

  useEffect(() => {
    if (!id) return;
    loadIngredient();
  }, [id]);

  const loadIngredient = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getIngredientWithFallback(id as string);
      if (data) setIngredient(data);
      else setError('Ingredient not found');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.ink} />
        <Text style={styles.loadingText}>Loading ingredient...</Text>
      </View>
    );
  }

  if (error || !ingredient) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? 'Ingredient not found'}</Text>
        <Pressable onPress={handleBack} style={styles.backBtnFallback}>
          <Text style={styles.backBtnFallbackText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const hasBelief = !!(ingredient.common_belief && ingredient.evidence_reality);
  const evidenceLevelLabel = ingredient.evidence_level
    ? EVIDENCE_LEVEL_LABEL[ingredient.evidence_level]
    : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Back button */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={12}>
          <BackIcon />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + scale(48) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Title ──────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(250)} style={styles.titleSection}>
          <Eyebrow style={{ marginBottom: scale(8) }}>{categoryLabel(ingredient.category)}</Eyebrow>
          <SerifH size={40} style={{ marginBottom: scale(12), lineHeight: scale(42) }}>
            {ingredient.canonical_name}
          </SerifH>
          <View style={styles.tagRow}>
            {evidenceLevelLabel && <Tag tone="sage">{evidenceLevelLabel}</Tag>}
          </View>
        </Animated.View>

        {/* ── Relevance Banner ───────────────────────────────────────────── */}
        {userGoals.length > 0 && (
          <RelevanceBanner evidence={ingredient.evidence} userGoals={userGoals} />
        )}

        {/* ── Evidence Grid ──────────────────────────────────────────────── */}
        <EvidenceGrid
          evidence={ingredient.evidence}
          evidenceLevel={ingredient.evidence_level}
        />

        <View style={styles.divider} />

        {/* ── Mechanism ──────────────────────────────────────────────────── */}
        <MechanismSection
          mechanismSummary={ingredient.mechanism_summary}
          imageUrl={ingredient.mechanism_image_url}
          canonicalName={ingredient.canonical_name}
        />

        {/* ── Belief vs Reality ──────────────────────────────────────────── */}
        {hasBelief && (
          <>
            <View style={styles.divider} />
            <SectionHead label="Belief vs. Reality" />
            <BeliefRealityCard
              commonBelief={ingredient.common_belief!}
              evidenceReality={ingredient.evidence_reality!}
            />
          </>
        )}

        {/* ── Biodomain impact scores ───────────────────────────────────── */}
        {ingredient.biodomain_scores && ingredient.biodomain_scores.length > 0 && (
          <>
            <View style={styles.divider} />
            <SectionHead label="Health domain impact" />
            {ingredient.biodomain_scores
              .slice()
              .sort((a, b) => {
                // Sort: benefit first, then by magnitude desc, harm last
                if (a.direction === b.direction) return b.magnitude - a.magnitude;
                if (a.direction === 'benefit') return -1;
                if (b.direction === 'benefit') return 1;
                if (a.direction === 'harm') return 1;
                if (b.direction === 'harm') return -1;
                return 0;
              })
              .map((score, i) => (
                <BioDomainRow key={score.biodomain} score={score} index={i} />
              ))}
          </>
        )}

        {/* ── Evidence Snapshot ──────────────────────────────────────────── */}
        {ingredient.evidence.length > 0 && (
          <>
            <View style={styles.divider} />
            <EvidenceSnapshot evidence={ingredient.evidence} />
          </>
        )}

        {ingredient.research_status === 'complete' && ingredient.evidence.length === 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.noEvidenceCard}>
              <Text style={styles.noEvidenceTitle}>No published studies found</Text>
              <Text style={styles.noEvidenceBody}>
                We searched PubMed for clinical evidence on this ingredient but found nothing
                meeting our quality threshold. This doesn't mean it's unsafe — it may simply
                be understudied.
              </Text>
            </View>
          </>
        )}

        {/* ── Bio-Domain Effects ─────────────────────────────────────────── */}
        {ingredient.domain_effects && (
          <>
            <View style={styles.divider} />
            <BioDomainEffects domainEffects={ingredient.domain_effects} />
          </>
        )}

        {/* ── Dose ───────────────────────────────────────────────────────── */}
        {(ingredient.typical_dose_range || ingredient.recommended_daily || ingredient.upper_limit) && (
          <>
            <View style={styles.divider} />
            <DoseCard ingredient={ingredient} />
          </>
        )}

        {/* ── Safety ─────────────────────────────────────────────────────── */}
        {(ingredient.side_effects.length > 0 ||
          ingredient.contraindications.length > 0 ||
          ingredient.drug_interactions.length > 0) && (
          <>
            <View style={styles.divider} />
            <SafetySection ingredient={ingredient} />
          </>
        )}

        {/* ── Found in products ──────────────────────────────────────────── */}
        {ingredient.found_in.length > 0 && (
          <>
            <View style={styles.divider} />
            <SectionHead
              label={`Found in ${ingredient.found_in.length} product${ingredient.found_in.length !== 1 ? 's' : ''}`}
            />
            {ingredient.found_in.map((p, i) => (
              <Animated.View
                key={`${p.id}-${i}`}
                entering={FadeInUp.delay(i * 40).duration(280)}
              >
                <Pressable
                  style={styles.foundInRow}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/product/${p.id}`);
                  }}
                >
                  <View style={styles.foundInInfo}>
                    <Text style={styles.foundInName} numberOfLines={1}>{p.name}</Text>
                    {p.brand && <Text style={styles.foundInBrand}>{p.brand}</Text>}
                  </View>
                  {p.amount && <Text style={styles.foundInAmount}>{p.amount}</Text>}
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.inkTertiary} strokeWidth={2}>
                    <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  centered: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(32),
  },
  loadingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginTop: scale(12),
  },
  errorText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
    marginBottom: scale(20),
    textAlign: 'center',
  },
  backBtnFallback: {
    paddingHorizontal: scale(24),
    paddingVertical: scale(12),
    backgroundColor: Colors.ink,
    borderRadius: Radius.md,
  },
  backBtnFallbackText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.surface,
  },

  // ── Nav ─────────────────────────────────────────────────────────────────────
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

  // ── Scroll ──────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(16),
    gap: 0,
  },

  // ── Title ───────────────────────────────────────────────────────────────────
  titleSection: {
    marginBottom: Spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
  },

  // ── Evidence Grid ────────────────────────────────────────────────────────────
  evidenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceCard,
    marginTop: Spacing.sm,
  },
  evidenceGridCell: {
    width: '50%',
    padding: scale(14),
  },
  evidenceGridCellBorderR: {
    borderRightWidth: 1,
    borderRightColor: Colors.borderHairline,
  },
  evidenceGridCellBorderB: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },

  // ── Relevance Banner ────────────────────────────────────────────────────────
  relevanceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: scale(8),
    backgroundColor: Colors.accent + '10',
    borderWidth: 1,
    borderColor: Colors.accent + '25',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  relevanceIcon: {
    fontSize: FontSizes.caption,
    color: Colors.accent,
    marginTop: scale(1),
  },
  relevanceText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.5,
  },
  relevanceGoals: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.accent,
  },


  // ── Divider ─────────────────────────────────────────────────────────────────
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.ink,
    marginVertical: scale(28),
  },

  // ── Section label ───────────────────────────────────────────────────────────
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.inkSecondary,
    marginBottom: scale(14),
  },

  // ── Expand button (shared) ──────────────────────────────────────────────────
  expandBtn: {
    alignSelf: 'flex-start',
    marginTop: scale(10),
    paddingVertical: scale(4),
  },
  expandBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // ── Mechanism ───────────────────────────────────────────────────────────────
  mechanismImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  mechanismImage: {
    width: '100%',
    height: '100%',
  },
  mechanismPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  mechanismPlaceholderIcon: {
    fontSize: scale(32),
    color: Colors.borderHairline,
  },
  mechanismPlaceholderText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  mechanismCaption: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * 1.6,
    color: Colors.inkSecondary,
    fontStyle: 'italic',
    marginBottom: scale(4),
  },
  mechanismFull: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * 1.6,
    color: Colors.inkSecondary,
    marginTop: Spacing.sm,
  },


  // ── Evidence Snapshot ────────────────────────────────────────────────────────
  evidenceBarWrap: {
    marginBottom: Spacing.md,
  },
  evidenceBar: {
    flexDirection: 'row',
    height: scale(4),
    borderRadius: scale(2),
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  evidenceBarSeg: {},
  evidenceBarLabels: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: scale(6),
  },
  evidenceBarLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
  },
  evidenceCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.md,
    padding: scale(14),
    marginBottom: scale(8),
  },
  evidenceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(8),
  },
  evidenceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studyType: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkSecondary,
  },
  studyYear: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
  },
  confidenceBadge: {
    paddingHorizontal: scale(7),
    paddingVertical: scale(2),
    borderRadius: Radius.pill,
  },
  confidenceText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    letterSpacing: 0.6,
  },
  findingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * 1.6,
    color: Colors.ink,
    marginBottom: scale(8),
  },
  evidenceBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  populationText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    flex: 1,
    marginRight: scale(8),
  },
  directionDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(4),
  },

  // ── No evidence ──────────────────────────────────────────────────────────────
  noEvidenceCard: {
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.md,
    padding: scale(18),
  },
  noEvidenceTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
    marginBottom: scale(8),
  },
  noEvidenceBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * 1.6,
    color: Colors.inkSecondary,
  },

  // ── Dose Card ────────────────────────────────────────────────────────────────
  doseCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    overflow: 'hidden',
  },
  doseCell: {
    flex: 1,
    padding: scale(14),
    alignItems: 'center',
  },
  doseCellBorder: {
    borderRightWidth: 1,
    borderRightColor: Colors.borderHairline,
  },
  doseCellLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkTertiary,
    marginBottom: scale(6),
    textAlign: 'center',
  },
  doseCellValue: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.caption,
    color: Colors.ink,
    textAlign: 'center',
  },
  doseCellWarn: {
    color: Colors.alert,
  },

  // ── Safety ───────────────────────────────────────────────────────────────────
  safetyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceCard,
  },
  safetyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    flex: 1,
  },
  safetyRowText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  safetyRowTextWarn: {
    color: Colors.alert,
  },
  safetyChevron: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
  safetyExpanded: {
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  safetyBlock: {},
  safetyBlockLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkSecondary,
    marginBottom: scale(8),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    backgroundColor: Colors.surfaceCard,
  },
  chipWarn: {
    borderColor: 'rgba(196,101,74,0.3)',
    backgroundColor: 'rgba(196,101,74,0.04)',
  },
  chipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  chipTextWarn: {
    color: Colors.alert,
  },

  // ── Bio-Domain Effects ───────────────────────────────────────────────────────
  domainTable: {
    // No card background — clean separator list
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: scale(13),
  },
  domainRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
  },
  domainRowLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
    flex: 1,
  },
  domainRowLabelDim: {
    color: Colors.inkTertiary,
  },
  domainRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  domainDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(4),
  },
  domainRowMeta: {
    alignItems: 'flex-end',
  },
  domainRowDirection: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  domainRowCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
    marginTop: scale(2),
  },
  domainRowEmpty: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
  },

  // ── Found in ─────────────────────────────────────────────────────────────────
  foundInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
    gap: scale(8),
  },
  foundInInfo: { flex: 1 },
  foundInName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  foundInBrand: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    marginTop: scale(2),
  },
  foundInAmount: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginRight: scale(4),
  },

  // ── Biodomain impact rows ──────────────────────────────────────────────────
  bioDomainRow: {
    marginBottom: scale(14),
    paddingHorizontal: scale(24),
  },
  bioDomainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(6),
  },
  bioDomainName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: scale(13),
    color: Colors.ink,
    flex: 1,
    marginRight: scale(8),
  },
  bioDomainBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: scale(7),
    paddingVertical: scale(2),
  },
  bioDomainBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: scale(10),
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bioDomainBarTrack: {
    height: scale(2),
    backgroundColor: Colors.borderHairline,
    borderRadius: scale(1),
    overflow: 'hidden',
    marginBottom: scale(5),
  },
  bioDomainBarFill: {
    height: '100%',
    borderRadius: scale(3),
  },
  bioDomainMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: scale(6),
  },
  bioDomainDoseNote: {
    fontFamily: Fonts.sans,
    fontSize: scale(11),
    color: Colors.inkSecondary,
  },
  bioDomainConfidence: {
    fontFamily: Fonts.sans,
    fontSize: scale(11),
    color: Colors.inkTertiary,
  },
  bioDomainNotes: {
    fontFamily: Fonts.sans,
    fontSize: scale(12),
    color: Colors.inkSecondary,
    marginTop: scale(4),
    lineHeight: scale(17),
    fontStyle: 'italic',
  },

  // ── Loading / error (upstream aliases) ───────────────────────────────────
  centeredContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(32),
  },
  backButtonFallback: {
    paddingHorizontal: scale(24),
    paddingVertical: scale(12),
    backgroundColor: Colors.ink,
    borderRadius: scale(8),
  },
  backButtonFallbackText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: scale(13),
    color: Colors.surface,
  },
});
