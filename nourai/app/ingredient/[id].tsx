/**
 * Ingredient Deep Dive Screen
 *
 * The core analytical view of NourAI — shows what a molecule actually does,
 * the gap between popular belief and clinical evidence, and every PubMed
 * study we've synthesized for it.
 *
 * Accessible from:
 *   • Product page → tapping any ingredient row (when ingredient_id is present)
 *   • Search tab → ingredient search results
 *   • Any future surface (food log, stack, etc.)
 *
 * Navigation: expo-router dynamic route /ingredient/[id]
 */

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
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Colors, scale, verticalScale } from '@/constants/theme';
import { api } from '@/services/api';
import type { IngredientDetail, IngredientEvidenceRecord } from '@/services/api';

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
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#A34B4B" strokeWidth={2}>
      <Path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <Path d="M12 9v4M12 17h.01" strokeLinecap="round" />
    </Svg>
  );
}

function FlaskIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={Colors.inkSecondary} strokeWidth={2}>
      <Path d="M9 3h6M9 3v8l-4.5 9A1 1 0 005.4 21h13.2a1 1 0 00.9-1.45L15 11V3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Evidence helpers ─────────────────────────────────────────────────────────

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

function confidenceStyle(confidence: string): { bg: string; text: string } {
  switch (confidence) {
    case 'high':     return { bg: Colors.ink,          text: Colors.bone };
    case 'moderate': return { bg: Colors.inkSecondary,  text: Colors.bone };
    default:         return { bg: Colors.boneDark,      text: Colors.inkSecondary };
  }
}

function directionColor(direction: string): string {
  switch (direction) {
    case 'benefit': return '#3B6E52';   // muted forest green
    case 'risk':    return '#A34B4B';   // muted alert red (matches moodboard)
    case 'mixed':   return '#8B6914';   // muted amber
    default:        return Colors.inkTertiary;
  }
}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * The core differentiating section — shows the gap between what people believe
 * this ingredient does and what the clinical evidence actually supports.
 * Visually prominent so it's the first thing users read after the title.
 */
function BeliefRealityCard({ commonBelief, evidenceReality }: {
  commonBelief: string;
  evidenceReality: string;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.beliefCard}>
      {/* Common belief side */}
      <View style={styles.beliefHalf}>
        <Text style={styles.beliefLabel}>Common belief</Text>
        <Text style={styles.beliefText}>{commonBelief}</Text>
      </View>

      {/* Hairline divider */}
      <View style={styles.beliefDivider} />

      {/* Evidence reality side */}
      <View style={styles.beliefHalf}>
        <View style={styles.beliefRealityHeader}>
          <FlaskIcon />
          <Text style={[styles.beliefLabel, styles.beliefRealityLabel]}>
            What research shows
          </Text>
        </View>
        <Text style={[styles.beliefText, styles.beliefRealityText]}>{evidenceReality}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * One synthesized PubMed study — shows the plain-English finding,
 * study type, year, population, and confidence/direction badges.
 */
function EvidenceCard({ ev, index }: { ev: IngredientEvidenceRecord; index: number }) {
  const conf = confidenceStyle(ev.confidence);
  const dirColor = directionColor(ev.direction);
  const studyLabel = ev.study_type ? (STUDY_TYPE_LABEL[ev.study_type] ?? ev.study_type) : null;

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 60).duration(350)}
      style={styles.evidenceCard}
    >
      {/* Top row: study type + year + confidence badge */}
      <View style={styles.evidenceTopRow}>
        <View style={styles.evidenceMeta}>
          {studyLabel && (
            <Text style={styles.studyType}>{studyLabel}</Text>
          )}
          {ev.year && (
            <Text style={styles.studyYear}> · {ev.year}</Text>
          )}
        </View>
        <View style={[styles.confidenceBadge, { backgroundColor: conf.bg }]}>
          <Text style={[styles.confidenceText, { color: conf.text }]}>
            {ev.confidence.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Finding — the core sentence */}
      <Text style={styles.findingText}>{ev.finding}</Text>

      {/* Bottom row: population + direction dot */}
      <View style={styles.evidenceBottomRow}>
        {ev.population && (
          <Text style={styles.populationText} numberOfLines={1}>
            {ev.population}
            {ev.sample_size ? ` (n={ev.sample_size})` : ''}
          </Text>
        )}
        <View style={[styles.directionDot, { backgroundColor: dirColor }]} />
      </View>
    </Animated.View>
  );
}

/**
 * Chip for side effects and contraindications — small pill with subtle border.
 */
function SafetyChip({ label, isWarning }: { label: string; isWarning?: boolean }) {
  return (
    <View style={[styles.chip, isWarning && styles.chipWarning]}>
      <Text style={[styles.chipText, isWarning && styles.chipTextWarning]}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function IngredientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [ingredient, setIngredient] = useState<IngredientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadIngredient();
  }, [id]);

  const loadIngredient = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getIngredientWithFallback(id as string);
      if (data) {
        setIngredient(data);
      } else {
        setError('Ingredient not found');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleFoundInProduct = (productId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/product/${productId}`);
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centeredContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.ink} />
        <Text style={styles.loadingText}>Loading ingredient...</Text>
      </View>
    );
  }

  if (error || !ingredient) {
    return (
      <View style={[styles.centeredContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error ?? 'Ingredient not found'}</Text>
        <Pressable onPress={handleBack} style={styles.backButtonFallback}>
          <Text style={styles.backButtonFallbackText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const hasBelief = ingredient.common_belief && ingredient.evidence_reality;
  const hasSafety = (
    ingredient.side_effects.length > 0 ||
    ingredient.contraindications.length > 0 ||
    ingredient.drug_interactions.length > 0
  );
  const evidenceLevelLabel = ingredient.evidence_level
    ? EVIDENCE_LEVEL_LABEL[ingredient.evidence_level]
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

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
          { paddingBottom: insets.bottom + scale(40) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.titleSection}>
          <Text style={styles.categoryLabel}>{categoryLabel(ingredient.category)}</Text>
          <Text style={styles.ingredientName}>{ingredient.canonical_name}</Text>

          {/* Evidence level pill */}
          {evidenceLevelLabel && (
            <View style={styles.evidenceLevelPill}>
              <Text style={styles.evidenceLevelText}>{evidenceLevelLabel}</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Belief vs. Reality — hero section ─────────────────────────── */}
        {hasBelief && (
          <>
            <View style={styles.sectionDivider} />
            <BeliefRealityCard
              commonBelief={ingredient.common_belief!}
              evidenceReality={ingredient.evidence_reality!}
            />
          </>
        )}

        {/* ── Mechanism ─────────────────────────────────────────────────── */}
        {ingredient.mechanism_summary && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>How it works</Text>
            <Text style={styles.mechanismText}>{ingredient.mechanism_summary}</Text>
          </>
        )}

        {/* ── Dose ──────────────────────────────────────────────────────── */}
        {(ingredient.typical_dose_range || ingredient.recommended_daily || ingredient.upper_limit) && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Dosage</Text>
            <View style={styles.doseTable}>
              {ingredient.typical_dose_range && (
                <View style={styles.doseRow}>
                  <Text style={styles.doseKey}>Typical dose</Text>
                  <Text style={styles.doseValue}>{ingredient.typical_dose_range}</Text>
                </View>
              )}
              {ingredient.recommended_daily && (
                <View style={styles.doseRow}>
                  <Text style={styles.doseKey}>Recommended daily</Text>
                  <Text style={styles.doseValue}>{ingredient.recommended_daily}</Text>
                </View>
              )}
              {ingredient.upper_limit && (
                <View style={[styles.doseRow, styles.doseRowLast]}>
                  <Text style={styles.doseKey}>Upper limit</Text>
                  <Text style={[styles.doseValue, { color: '#A34B4B' }]}>{ingredient.upper_limit}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Safety ────────────────────────────────────────────────────── */}
        {hasSafety && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Safety</Text>

            {ingredient.contraindications.length > 0 && (
              <View style={styles.safetyBlock}>
                <View style={styles.safetyHeader}>
                  <AlertIcon />
                  <Text style={styles.safetyTitle}>Contraindications</Text>
                </View>
                <View style={styles.chipRow}>
                  {ingredient.contraindications.map((c) => (
                    <SafetyChip key={c} label={c} isWarning />
                  ))}
                </View>
              </View>
            )}

            {ingredient.drug_interactions.length > 0 && (
              <View style={styles.safetyBlock}>
                <Text style={styles.safetyTitle}>Drug interactions</Text>
                <View style={styles.chipRow}>
                  {ingredient.drug_interactions.map((d) => (
                    <SafetyChip key={d} label={d} isWarning />
                  ))}
                </View>
              </View>
            )}

            {ingredient.side_effects.length > 0 && (
              <View style={styles.safetyBlock}>
                <Text style={styles.safetyTitle}>Possible side effects</Text>
                <View style={styles.chipRow}>
                  {ingredient.side_effects.map((s) => (
                    <SafetyChip key={s} label={s} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* ── Evidence records ──────────────────────────────────────────── */}
        {ingredient.evidence.length > 0 && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>
              Research  ·  {ingredient.evidence.length} {ingredient.evidence.length === 1 ? 'study' : 'studies'}
            </Text>
            <Text style={styles.evidenceNote}>
              Sorted by evidence quality. High = RCT or meta-analysis.
            </Text>
            {ingredient.evidence.map((ev, i) => (
              <EvidenceCard key={ev.id} ev={ev} index={i} />
            ))}
          </>
        )}

        {/* ── Insufficient evidence notice ──────────────────────────────── */}
        {ingredient.research_status === 'complete' && ingredient.evidence.length === 0 && (
          <>
            <View style={styles.sectionDivider} />
            <View style={styles.noEvidenceCard}>
              <Text style={styles.noEvidenceTitle}>No published studies found</Text>
              <Text style={styles.noEvidenceText}>
                We searched PubMed for clinical evidence on this ingredient but found
                nothing meeting our quality threshold. This doesn't mean it's unsafe —
                it may simply be understudied.
              </Text>
            </View>
          </>
        )}

        {/* ── Found in products ─────────────────────────────────────────── */}
        {ingredient.found_in.length > 0 && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>
              Found in {ingredient.found_in.length} product{ingredient.found_in.length !== 1 ? 's' : ''}
            </Text>
            {ingredient.found_in.map((p, i) => (
              <Animated.View
                key={`${p.id}-${i}`}
                entering={FadeInUp.delay(i * 40).duration(300)}
              >
                <Pressable
                  style={styles.foundInRow}
                  onPress={() => handleFoundInProduct(p.id)}
                >
                  <View style={styles.foundInInfo}>
                    <Text style={styles.foundInName} numberOfLines={1}>{p.name}</Text>
                    {p.brand && (
                      <Text style={styles.foundInBrand}>{p.brand}</Text>
                    )}
                  </View>
                  {p.amount && (
                    <Text style={styles.foundInAmount}>{p.amount}</Text>
                  )}
                  <Svg
                    width={14} height={14} viewBox="0 0 24 24"
                    fill="none" stroke={Colors.inkTertiary} strokeWidth={2}
                  >
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
    backgroundColor: Colors.bone,
  },

  // ── Header / back ──────────────────────────────────────────────────────────
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
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(11),
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkSecondary,
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(16),
  },

  // ── Title section ──────────────────────────────────────────────────────────
  titleSection: {
    marginBottom: scale(4),
  },
  categoryLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(10),
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.inkSecondary,
    marginBottom: scale(6),
  },
  ingredientName: {
    fontFamily: 'CormorantGaramond_600SemiBold',
    fontSize: scale(38),
    lineHeight: scale(40),
    color: Colors.ink,
    marginBottom: scale(12),
  },
  evidenceLevelPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.boneCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.inkTertiary,
    borderRadius: 100,
    paddingHorizontal: scale(10),
    paddingVertical: scale(3),
  },
  evidenceLevelText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(10),
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
  },

  // ── Section divider ────────────────────────────────────────────────────────
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.ink,
    marginVertical: scale(28),
  },
  sectionLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(10),
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.inkSecondary,
    marginBottom: scale(14),
  },

  // ── Belief vs. reality card ────────────────────────────────────────────────
  // This is the hero section — the most important part of the screen.
  // Two halves separated by a hairline: folk belief on top, evidence below.
  beliefCard: {
    backgroundColor: Colors.boneCard,
    borderRadius: scale(14),
    overflow: 'hidden',
  },
  beliefHalf: {
    padding: scale(18),
  },
  beliefDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(28,28,28,0.12)',
    marginHorizontal: scale(18),
  },
  beliefLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(10),
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkTertiary,
    marginBottom: scale(8),
  },
  beliefRealityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: scale(8),
  },
  beliefRealityLabel: {
    color: Colors.inkSecondary,
    marginBottom: 0,
  },
  beliefText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(13),
    lineHeight: scale(20),
    color: Colors.inkSecondary,
    fontStyle: 'italic',
  },
  beliefRealityText: {
    fontFamily: 'Manrope_500Medium',
    fontStyle: 'normal',
    color: Colors.ink,
  },

  // ── Mechanism ──────────────────────────────────────────────────────────────
  mechanismText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(13),
    lineHeight: scale(21),
    color: Colors.inkSecondary,
  },

  // ── Dose table ─────────────────────────────────────────────────────────────
  doseTable: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(28,28,28,0.1)',
  },
  doseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: scale(11),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(28,28,28,0.08)',
  },
  doseRowLast: {
    borderBottomWidth: 0,
  },
  doseKey: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(12),
    color: Colors.inkSecondary,
    flex: 1,
  },
  doseValue: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(12),
    color: Colors.ink,
    flex: 1,
    textAlign: 'right',
  },

  // ── Safety ─────────────────────────────────────────────────────────────────
  safetyBlock: {
    marginBottom: scale(16),
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: scale(8),
  },
  safetyTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(12),
    color: Colors.ink,
    marginBottom: scale(8),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
  },
  chip: {
    borderWidth: 1,
    borderColor: 'rgba(28,28,28,0.15)',
    borderRadius: 100,
    paddingHorizontal: scale(10),
    paddingVertical: scale(4),
    backgroundColor: Colors.boneCard,
  },
  chipWarning: {
    borderColor: 'rgba(163,75,75,0.3)',
    backgroundColor: 'rgba(163,75,75,0.04)',
  },
  chipText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: scale(11),
    color: Colors.inkSecondary,
  },
  chipTextWarning: {
    color: '#A34B4B',
  },

  // ── Evidence cards ─────────────────────────────────────────────────────────
  evidenceNote: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(11),
    color: Colors.inkTertiary,
    marginBottom: scale(14),
    marginTop: scale(-8),
  },
  evidenceCard: {
    backgroundColor: Colors.boneCard,
    borderRadius: scale(12),
    padding: scale(14),
    marginBottom: scale(10),
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
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(10),
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkSecondary,
  },
  studyYear: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(10),
    color: Colors.inkTertiary,
  },
  confidenceBadge: {
    paddingHorizontal: scale(7),
    paddingVertical: scale(2),
    borderRadius: 100,
  },
  confidenceText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: scale(9),
    letterSpacing: 0.6,
  },
  findingText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(13),
    lineHeight: scale(20),
    color: Colors.ink,
    marginBottom: scale(8),
  },
  evidenceBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  populationText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(11),
    color: Colors.inkTertiary,
    flex: 1,
    marginRight: scale(8),
  },
  directionDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(4),
  },

  // ── No evidence notice ─────────────────────────────────────────────────────
  noEvidenceCard: {
    backgroundColor: Colors.boneCard,
    borderRadius: scale(12),
    padding: scale(18),
  },
  noEvidenceTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(13),
    color: Colors.ink,
    marginBottom: scale(8),
  },
  noEvidenceText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(12),
    lineHeight: scale(19),
    color: Colors.inkSecondary,
  },

  // ── Found in products ──────────────────────────────────────────────────────
  foundInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(28,28,28,0.08)',
    gap: scale(8),
  },
  foundInInfo: {
    flex: 1,
  },
  foundInName: {
    fontFamily: 'Manrope_500Medium',
    fontSize: scale(13),
    color: Colors.ink,
  },
  foundInBrand: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(11),
    color: Colors.inkTertiary,
    marginTop: scale(2),
  },
  foundInAmount: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(11),
    color: Colors.inkSecondary,
    marginRight: scale(4),
  },

  // ── Loading / error ────────────────────────────────────────────────────────
  centeredContainer: {
    flex: 1,
    backgroundColor: Colors.bone,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(32),
  },
  loadingText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: scale(13),
    color: Colors.inkSecondary,
    marginTop: scale(12),
  },
  errorText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(15),
    color: Colors.ink,
    marginBottom: scale(20),
    textAlign: 'center',
  },
  backButtonFallback: {
    paddingHorizontal: scale(24),
    paddingVertical: scale(12),
    backgroundColor: Colors.ink,
    borderRadius: scale(8),
  },
  backButtonFallbackText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: scale(13),
    color: Colors.bone,
  },
});
