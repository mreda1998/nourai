import { useMemo, useState, useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { api, type DomainAnalysis, type IngredientImpact, type MissingIngredient, type DomainEvidenceHighlight, type GoalCoverage } from '@/services/api';

import {
  Colors,
  Fonts,
  FontSizes,
  Layout,
  Radius,
  scale,
  Spacing,
  verticalScale,
} from '@/constants/theme';
import {
  type Domain,
  type TimeSlot,
  DOMAINS,
  DOMAIN_SLUGS,
  SLUG_TO_DOMAIN,
  DOMAIN_RELEVANCE,
  DOMAIN_DESCRIPTIONS,
  DOMAIN_GOALS,
  GOAL_LABELS,
  DOMAIN_KEY_INGREDIENTS,
  DOMAIN_EVIDENCE,
  DOMAIN_TIMING_NOTES,
  CATEGORY_TIMING,
  DOMAIN_RECOMMENDATIONS,
  computeRadarScores,
  domainScoreLabel,
} from '@/constants/domains';
import { useAppState, type Product } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_QUALITY: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
const TIME_SLOTS: TimeSlot[] = ['Morning', 'Afternoon', 'Evening', 'Night'];
const RING_SIZE = scale(84);
const RING_STROKE = scale(5);
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ─── Utility functions ────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 70) return Colors.accentHill;
  if (score >= 40) return Colors.accentClay;
  return Colors.accentAlert;
}

function gradeColor(grade: string) {
  if (grade === 'A') return Colors.accentHill;
  if (grade === 'B') return '#5C7A4E';
  if (grade === 'C') return Colors.accentClay;
  return Colors.accentAlert;
}

function ingredientDirection(
  product: Product,
  domain: Domain
): 'benefit' | 'mixed' | 'risk' {
  const isExposure = domain === 'Exposure Load';
  const grade = product.grade;
  const rel = DOMAIN_RELEVANCE[domain]?.[product.category] ?? 0;
  if (rel === 0) return 'mixed';
  if (isExposure) {
    if (grade === 'A' || grade === 'B') return 'benefit';
    if (grade === 'D') return 'risk';
    return 'mixed';
  }
  if ((grade === 'A' || grade === 'B') && rel >= 0.5) return 'benefit';
  if (grade === 'D') return 'risk';
  return 'mixed';
}

const DIRECTION_CONFIG = {
  benefit: { symbol: '↑', label: 'Benefit',  color: Colors.accentHill  },
  mixed:   { symbol: '→', label: 'Neutral',  color: Colors.accentClay  },
  risk:    { symbol: '↓', label: 'Watch',    color: Colors.accentAlert  },
};

const EVIDENCE_COLORS: Record<string, { bg: string; text: string }> = {
  High:     { bg: Colors.ink,       text: Colors.bone },
  Moderate: { bg: Colors.boneDark,  text: Colors.inkSecondary },
  Emerging: { bg: 'transparent',    text: Colors.inkTertiary },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={sh.sectionHeader}>
      <Text style={sh.sectionLabel}>{label}</Text>
      {hint && <Text style={sh.sectionHint}>{hint}</Text>}
    </View>
  );
}

const sh = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.ink,
  },
  sectionHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
    letterSpacing: 0.3,
  },
});

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, color }: { score: number; color: string }) {
  const fill = (score / 100) * RING_CIRCUMFERENCE;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      {/* Track */}
      <Circle
        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
        stroke={Colors.borderHairline} strokeWidth={RING_STROKE} fill="none"
      />
      {/* Fill */}
      <Circle
        cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
        stroke={color} strokeWidth={RING_STROKE}
        strokeDasharray={`${fill} ${RING_CIRCUMFERENCE}`}
        strokeLinecap="round" fill="none"
        rotation={-90} origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
      />
    </Svg>
  );
}

// ─── Hardcoded fallback helpers ───────────────────────────────────────────────
// Used when the research pipeline hasn't been run yet (no evidence in DB).

function fallbackIngredientRows(
  relevantProducts: Product[],
  domain: Domain,
): Array<{ name: string; direction: 'benefit' | 'mixed' | 'risk'; rel: number; confidence: 'low'; evidence_count: 0; top_finding: null }> {
  const map = new Map<string, { direction: 'benefit' | 'mixed' | 'risk'; rel: number }>();
  relevantProducts.forEach((p) => {
    const dir = ingredientDirection(p, domain);
    const rel = DOMAIN_RELEVANCE[domain][p.category] ?? 0;
    p.ingredients.slice(0, 6).forEach((ing) => {
      const key = ing.toLowerCase().trim();
      const existing = map.get(key);
      if (!existing || rel > existing.rel) map.set(key, { direction: dir, rel });
    });
  });
  const ORDER = { risk: 0, mixed: 1, benefit: 2 };
  return [...map.entries()]
    .sort((a, b) => ORDER[a[1].direction] - ORDER[b[1].direction])
    .slice(0, 10)
    .map(([n, meta]) => ({ name: n, ...meta, confidence: 'low' as const, evidence_count: 0, top_finding: null }));
}

function fallbackMissing(domain: Domain, stackNames: Set<string>) {
  return DOMAIN_KEY_INGREDIENTS[domain].filter(
    (ki) =>
      !stackNames.has(ki.name.toLowerCase().trim()) &&
      !ki.name.split(' ').some(
        (word) => word.length > 4 && [...stackNames].some((s) => s.includes(word.toLowerCase()))
      )
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function DomainDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stack } = useAppState();
  const { onboardingProfile } = useAuth();

  // D: Simulator state
  const [simulatedOff, setSimulatedOff] = useState<Set<string>>(new Set());

  // Live API analysis state
  const [analysis, setAnalysis] = useState<DomainAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const domain = SLUG_TO_DOMAIN[name ?? ''] as Domain | undefined;
  const domainIndex = domain ? DOMAINS.indexOf(domain) : -1;

  // Products relevant to this domain
  const relevantProducts = useMemo(() => {
    if (!domain) return [];
    return stack
      .filter((p) => (DOMAIN_RELEVANCE[domain]?.[p.category] ?? 0) > 0)
      .sort(
        (a, b) =>
          DOMAIN_RELEVANCE[domain][b.category] * (GRADE_QUALITY[b.grade] ?? 1) -
          DOMAIN_RELEVANCE[domain][a.category] * (GRADE_QUALITY[a.grade] ?? 1)
      );
  }, [stack, domain]);

  // Fetch real analysis from backend whenever stack or domain changes
  useEffect(() => {
    if (!domain) return;
    const productIds = relevantProducts.map((p) => p.id);
    const goals = onboardingProfile?.goals ?? [];
    setAnalysisLoading(true);
    api
      .analyzeDomain(DOMAIN_SLUGS[domain], productIds, goals)
      .then((data) => setAnalysis(data))
      .catch(() => setAnalysis(null)) // graceful: fall back to hardcoded constants
      .finally(() => setAnalysisLoading(false));
  }, [domain, relevantProducts.map((p) => p.id).join(','), onboardingProfile?.goals?.join(',')]);

  if (!domain) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + Spacing.xl }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.errorText}>Domain not found.</Text>
      </View>
    );
  }

  // Score (always client-side — instant, no API dependency)
  const radarScores = useMemo(() => computeRadarScores(stack), [stack]);
  const score = radarScores[domainIndex] ?? 50;
  const color = scoreColor(score);
  const statusLabel = domainScoreLabel(domain, score);

  // D: Simulated score
  const simulatedScore = useMemo(() => {
    const simulatedStack = stack.filter((p) => !simulatedOff.has(p.id));
    return computeRadarScores(simulatedStack)[domainIndex] ?? 50;
  }, [stack, simulatedOff, domainIndex]);
  const scoreDelta = simulatedScore - score;
  const hasSimulation = simulatedOff.size > 0;

  // ── B: Ingredient impact rows ─────────────────────────────────────────────
  // Prefer live API data (real evidence); fall back to grade-based approximation.
  const ingredientRows: Array<{
    name: string;
    direction: 'benefit' | 'risk' | 'neutral' | 'mixed';
    rel: number;
    confidence: 'high' | 'moderate' | 'low';
    evidence_count: number;
    top_finding: string | null;
    ingredient_id?: string;
  }> = useMemo(() => {
    if (analysis && analysis.ingredient_impacts.length > 0) {
      return analysis.ingredient_impacts.map((imp) => ({
        name: imp.name,
        direction: imp.direction,
        rel: imp.domain_relevance,
        confidence: imp.confidence,
        evidence_count: imp.evidence_count,
        top_finding: imp.top_finding,
        ingredient_id: imp.ingredient_id,
      }));
    }
    return fallbackIngredientRows(relevantProducts, domain);
  }, [analysis, relevantProducts, domain]);

  // ── A: Missing ingredients ────────────────────────────────────────────────
  // Prefer live API data (researched ingredients not in stack).
  const stackIngredientNames = useMemo(() => {
    const s = new Set<string>();
    stack.forEach((p) => p.ingredients.forEach((i) => s.add(i.toLowerCase().trim())));
    return s;
  }, [stack]);

  const missingIngredients = useMemo(() => {
    if (analysis && analysis.missing_ingredients.length > 0) {
      return analysis.missing_ingredients;
    }
    return null; // null = use hardcoded fallback
  }, [analysis]);

  const fallbackMissingList = useMemo(
    () => fallbackMissing(domain, stackIngredientNames),
    [domain, stackIngredientNames]
  );

  // ── E: Evidence highlight ─────────────────────────────────────────────────
  const liveHighlight: DomainEvidenceHighlight | null = analysis?.evidence_highlight ?? null;
  const staticHighlight = DOMAIN_EVIDENCE[domain];

  // ── C: Timing map ─────────────────────────────────────────────────────────
  const timingMap = useMemo(() => {
    const map: Record<TimeSlot, Product[]> = { Morning: [], Afternoon: [], Evening: [], Night: [] };
    relevantProducts.forEach((p) => {
      (CATEGORY_TIMING[p.category] ?? ['Morning']).forEach((slot) => map[slot].push(p));
    });
    return map;
  }, [relevantProducts]);

  // ── Goals ─────────────────────────────────────────────────────────────────
  const domainGoalIds = DOMAIN_GOALS[domain] ?? [];
  const userGoals = onboardingProfile?.goals ?? [];
  const relevantGoals = userGoals.filter((g) => domainGoalIds.includes(g));

  // Prefer live goal_coverage from API; fall back to approximation
  const goalCoverageMap = useMemo(() => {
    const map = new Map<string, GoalCoverage>();
    analysis?.goal_coverage.forEach((gc) => map.set(gc.goal, gc));
    return map;
  }, [analysis]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + Spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back nav */}
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backText}>← Stack</Text>
        </Pressable>

        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(300)} style={styles.hero}>
          <View style={styles.heroLeft}>
            <View style={styles.ringWrapper}>
              <ScoreRing score={score} color={color} />
              <View style={styles.ringCenter}>
                <Text style={[styles.ringScore, { color }]}>{score}</Text>
              </View>
            </View>
            {hasSimulation && (
              <View style={[styles.deltaBadge, { backgroundColor: scoreDelta >= 0 ? 'rgba(47,54,47,0.1)' : 'rgba(163,78,78,0.1)' }]}>
                <Text style={[styles.deltaText, { color: scoreDelta >= 0 ? Colors.accentHill : Colors.accentAlert }]}>
                  {scoreDelta >= 0 ? `+${scoreDelta}` : `${scoreDelta}`} pts
                </Text>
              </View>
            )}
          </View>
          <View style={styles.heroRight}>
            <Text style={styles.heroOverline}>Bio Domain</Text>
            <Text style={styles.heroTitle}>{domain}</Text>
            <View style={[styles.statusPill, { backgroundColor: `${color}18` }]}>
              <Text style={[styles.statusPillText, { color }]}>{statusLabel}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(300).delay(60)} style={styles.descriptionWrap}>
          <Text style={styles.description}>{DOMAIN_DESCRIPTIONS[domain]}</Text>
        </Animated.View>

        {/* ── E: EVIDENCE HIGHLIGHT ──────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.duration(300).delay(80)} style={styles.section}>
          {analysisLoading && !liveHighlight ? (
            <View style={[styles.evidenceCard, styles.evidenceCardLoading]}>
              <ActivityIndicator color="rgba(233,230,223,0.5)" />
              <Text style={styles.evidenceLoadingText}>Loading clinical data…</Text>
            </View>
          ) : liveHighlight ? (
            /* Live data: real PubMed study from the stack */
            <View style={styles.evidenceCard}>
              <View style={styles.evidenceTagRow}>
                <View style={styles.evidenceTag}>
                  <Text style={styles.evidenceTagText}>
                    {liveHighlight.study_type
                      ? liveHighlight.study_type.replace(/_/g, ' ').toUpperCase()
                      : 'STUDY'}{liveHighlight.year ? ` · ${liveHighlight.year}` : ''}
                  </Text>
                </View>
                {liveHighlight.sample_size && (
                  <View style={styles.evidenceTag}>
                    <Text style={styles.evidenceTagText}>n={liveHighlight.sample_size.toLocaleString()}</Text>
                  </View>
                )}
                <View style={[styles.evidenceTag, { borderColor: 'rgba(233,230,223,0.4)' }]}>
                  <Text style={[styles.evidenceTagText, { color: 'rgba(233,230,223,0.8)' }]}>
                    {liveHighlight.confidence.toUpperCase()} CONFIDENCE
                  </Text>
                </View>
              </View>
              <Text style={styles.evidenceIngredient}>{liveHighlight.ingredient_name}</Text>
              <Text style={styles.evidenceQuote}>"{liveHighlight.finding}"</Text>
              {liveHighlight.journal && (
                <View style={styles.evidenceSource}>
                  <View style={styles.evidenceLine} />
                  <Text style={styles.evidenceSourceText}>{liveHighlight.journal}</Text>
                  {liveHighlight.pmid && (
                    <Text style={styles.evidencePmid}>PMID {liveHighlight.pmid}</Text>
                  )}
                </View>
              )}
            </View>
          ) : (
            /* Fallback: curated static highlight */
            <View style={styles.evidenceCard}>
              <View style={styles.evidenceTagRow}>
                <View style={styles.evidenceTag}>
                  <Text style={styles.evidenceTagText}>{staticHighlight.studyType} · {staticHighlight.year}</Text>
                </View>
                <View style={[styles.evidenceTag, styles.evidenceTagCurated]}>
                  <Text style={[styles.evidenceTagText, { color: 'rgba(233,230,223,0.5)' }]}>CURATED</Text>
                </View>
              </View>
              <Text style={styles.evidenceQuote}>"{staticHighlight.quote}"</Text>
              <Text style={styles.evidenceFinding}>{staticHighlight.finding}</Text>
              <View style={styles.evidenceSource}>
                <View style={styles.evidenceLine} />
                <Text style={styles.evidenceSourceText}>{staticHighlight.source}</Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* ── B: INGREDIENT IMPACT ──────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.duration(300).delay(120)} style={styles.section}>
          <SectionHeader
            label="Your Ingredients"
            hint={ingredientRows.length > 0 ? `${ingredientRows.length} active` : undefined}
          />

          {ingredientRows.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No ingredients tracked yet</Text>
              <Text style={styles.emptyBody}>
                Scan products to see how their ingredients affect {domain.toLowerCase()}.
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {ingredientRows.map((ing, i) => {
                const dir = (ing.direction === 'neutral' ? 'mixed' : ing.direction) as keyof typeof DIRECTION_CONFIG;
                const cfg = DIRECTION_CONFIG[dir] ?? DIRECTION_CONFIG.mixed;
                const isLiveData = ing.evidence_count > 0;
                return (
                  <Pressable
                    key={ing.name}
                    style={[styles.ingRow, i < ingredientRows.length - 1 && styles.rowBorder]}
                    onPress={() => ing.ingredient_id && router.push(`/ingredient/${ing.ingredient_id}`)}
                    disabled={!ing.ingredient_id}
                  >
                    {/* Direction badge */}
                    <View style={[styles.directionBadge, { backgroundColor: `${cfg.color}14` }]}>
                      <Text style={[styles.directionSymbol, { color: cfg.color }]}>{cfg.symbol}</Text>
                    </View>
                    {/* Name + evidence bar + finding */}
                    <View style={styles.ingInfo}>
                      <View style={styles.ingNameRow}>
                        <Text style={styles.ingName} numberOfLines={1}>{ing.name}</Text>
                        {isLiveData && (
                          <View style={styles.ingEvidencePill}>
                            <Text style={styles.ingEvidencePillText}>
                              {ing.evidence_count} {ing.evidence_count === 1 ? 'study' : 'studies'}
                            </Text>
                          </View>
                        )}
                      </View>
                      {ing.top_finding ? (
                        <Text style={styles.ingFinding} numberOfLines={2}>{ing.top_finding}</Text>
                      ) : (
                        <View style={styles.relTrack}>
                          <View style={[styles.relFill, { width: `${ing.rel * 100}%`, backgroundColor: cfg.color }]} />
                        </View>
                      )}
                    </View>
                    {/* Label + confidence */}
                    <View style={styles.dirLabelCol}>
                      <Text style={[styles.dirLabel, { color: cfg.color }]}>{cfg.label}</Text>
                      {isLiveData && (
                        <Text style={styles.confLabel}>{ing.confidence}</Text>
                      )}
                    </View>
                    {ing.ingredient_id && <Text style={styles.ingChevron}>›</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Animated.View>

        {/* ── A: WHAT'S MISSING ─────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.duration(300).delay(160)} style={styles.section}>
          <SectionHeader
            label="Strengthen This Domain"
            hint={missingIngredients != null
              ? missingIngredients.length > 0 ? `${missingIngredients.length} not in stack` : 'stack looks complete'
              : fallbackMissingList.length > 0 ? `${fallbackMissingList.length} not in stack` : 'stack looks complete'
            }
          />

          {missingIngredients !== null ? (
            /* Live data from backend — researched ingredients not in stack */
            missingIngredients.length === 0 ? (
              <View style={[styles.card, styles.completeCard]}>
                <Text style={styles.completeText}>
                  Your stack already covers the key ingredients for {domain.toLowerCase()}. Keep it up.
                </Text>
              </View>
            ) : (
              <View style={styles.missingGrid}>
                {missingIngredients.map((ki) => {
                  const ev = EVIDENCE_COLORS[
                    ki.evidence_level === 'strong' ? 'High'
                    : ki.evidence_level === 'moderate' ? 'Moderate'
                    : 'Emerging'
                  ];
                  const evLabel = ki.evidence_level === 'strong' ? 'High'
                    : ki.evidence_level === 'moderate' ? 'Moderate' : 'Emerging';
                  const isEmerging = evLabel === 'Emerging';
                  return (
                    <Pressable
                      key={ki.ingredient_id}
                      style={[styles.missingCard, isEmerging && styles.missingCardDashed]}
                      onPress={() => router.push(`/ingredient/${ki.ingredient_id}`)}
                    >
                      <View style={styles.missingTop}>
                        <Text style={styles.missingName} numberOfLines={1}>{ki.canonical_name}</Text>
                        <View style={[styles.evidenceBadge, { backgroundColor: ev.bg }, isEmerging && styles.evidenceBadgeDashed]}>
                          <Text style={[styles.evidenceBadgeText, { color: ev.text }]}>{evLabel}</Text>
                        </View>
                      </View>
                      <Text style={styles.missingDesc} numberOfLines={2}>
                        {ki.top_finding ?? ki.description ?? ki.mechanism_summary ?? ''}
                      </Text>
                      {ki.typical_dose_range && (
                        <Text style={styles.missingDose}>Dose: {ki.typical_dose_range}</Text>
                      )}
                      <View style={styles.missingFooter}>
                        <Text style={styles.missingAdd}>+ Not in stack · Tap to explore →</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )
          ) : (
            /* Hardcoded fallback — no research data yet */
            fallbackMissingList.length === 0 ? (
              <View style={[styles.card, styles.completeCard]}>
                <Text style={styles.completeText}>
                  Your stack covers the key ingredients for {domain.toLowerCase()}.
                </Text>
              </View>
            ) : (
              <View style={styles.missingGrid}>
                {fallbackMissingList.map((ki) => {
                  const ev = EVIDENCE_COLORS[ki.evidence];
                  const isEmerging = ki.evidence === 'Emerging';
                  return (
                    <View key={ki.name} style={[styles.missingCard, isEmerging && styles.missingCardDashed]}>
                      <View style={styles.missingTop}>
                        <Text style={styles.missingName} numberOfLines={1}>{ki.name}</Text>
                        <View style={[styles.evidenceBadge, { backgroundColor: ev.bg }, isEmerging && styles.evidenceBadgeDashed]}>
                          <Text style={[styles.evidenceBadgeText, { color: ev.text }]}>{ki.evidence}</Text>
                        </View>
                      </View>
                      <Text style={styles.missingDesc} numberOfLines={2}>{ki.description}</Text>
                      <View style={styles.missingFooter}>
                        <Text style={styles.missingAdd}>+ Not in stack</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )
          )}
        </Animated.View>

        {/* ── D: STACK SIMULATOR ────────────────────────────────────────── */}
        {relevantProducts.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(200)} style={styles.section}>
            <SectionHeader label="Stack Simulator" hint="toggle to see impact" />

            {/* Score comparison */}
            <View style={styles.simScoreRow}>
              <View style={styles.simScoreItem}>
                <Text style={styles.simScoreLabel}>Current</Text>
                <Text style={[styles.simScoreVal, { color }]}>{score}</Text>
              </View>
              <View style={styles.simArrow}>
                <Text style={styles.simArrowText}>→</Text>
              </View>
              <View style={styles.simScoreItem}>
                <Text style={styles.simScoreLabel}>Projected</Text>
                <Text style={[styles.simScoreVal, { color: scoreColor(simulatedScore) }]}>
                  {simulatedScore}
                </Text>
              </View>
              {hasSimulation && (
                <View style={[
                  styles.simDeltaPill,
                  { backgroundColor: scoreDelta >= 0 ? 'rgba(47,54,47,0.08)' : 'rgba(163,78,78,0.08)' },
                ]}>
                  <Text style={[
                    styles.simDeltaText,
                    { color: scoreDelta >= 0 ? Colors.accentHill : Colors.accentAlert },
                  ]}>
                    {scoreDelta >= 0 ? `+${scoreDelta}` : `${scoreDelta}`}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              {relevantProducts.map((product, i) => {
                const isOff = simulatedOff.has(product.id);
                const rel = DOMAIN_RELEVANCE[domain][product.category] ?? 0;
                return (
                  <View
                    key={product.id}
                    style={[
                      styles.simRow,
                      i < relevantProducts.length - 1 && styles.rowBorder,
                      isOff && styles.simRowOff,
                    ]}
                  >
                    <View style={[
                      styles.simGradeBadge,
                      { borderColor: isOff ? Colors.boneDark : gradeColor(product.grade) },
                    ]}>
                      <Text style={[
                        styles.simGradeText,
                        { color: isOff ? Colors.inkTertiary : gradeColor(product.grade) },
                      ]}>
                        {product.grade}
                      </Text>
                    </View>
                    <View style={styles.simProductInfo}>
                      <Text
                        style={[styles.simProductName, isOff && styles.simProductNameOff]}
                        numberOfLines={1}
                      >
                        {product.name}
                      </Text>
                      <Text style={styles.simRelevance}>
                        {Math.round(rel * 100)}% domain relevance
                      </Text>
                    </View>
                    <Switch
                      value={!isOff}
                      onValueChange={(val) => {
                        setSimulatedOff((prev) => {
                          const next = new Set(prev);
                          if (val) next.delete(product.id);
                          else next.add(product.id);
                          return next;
                        });
                      }}
                      trackColor={{ false: Colors.boneDark, true: `${color}50` }}
                      thumbColor={isOff ? Colors.inkTertiary : color}
                      ios_backgroundColor={Colors.boneDark}
                    />
                  </View>
                );
              })}
            </View>

            {hasSimulation && (
              <Pressable
                style={styles.simReset}
                onPress={() => setSimulatedOff(new Set())}
              >
                <Text style={styles.simResetText}>Reset simulation</Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        {/* ── C: TIMING MAP ─────────────────────────────────────────────── */}
        {relevantProducts.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(240)} style={styles.section}>
            <SectionHeader label="Timing" />

            <View style={styles.timingGrid}>
              {TIME_SLOTS.map((slot) => {
                const products = timingMap[slot];
                return (
                  <View key={slot} style={styles.timingCol}>
                    <Text style={styles.timingSlotLabel}>{slot}</Text>
                    <View style={styles.timingDivider} />
                    {products.length === 0 ? (
                      <Text style={styles.timingEmpty}>—</Text>
                    ) : (
                      products.map((p) => {
                        const dir = ingredientDirection(p, domain);
                        const cfg = DIRECTION_CONFIG[dir];
                        return (
                          <View key={p.id} style={[styles.timingPill, { borderColor: `${cfg.color}40` }]}>
                            <View style={[styles.timingDot, { backgroundColor: cfg.color }]} />
                            <Text style={styles.timingPillText} numberOfLines={2}>
                              {p.name}
                            </Text>
                          </View>
                        );
                      })
                    )}
                  </View>
                );
              })}
            </View>

            <Text style={styles.timingNote}>{DOMAIN_TIMING_NOTES[domain]}</Text>
          </Animated.View>
        )}

        {/* ── GOALS ─────────────────────────────────────────────────────── */}
        {relevantGoals.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(280)} style={styles.section}>
            <SectionHeader label="Your Goals" />
            <View style={styles.card}>
              {relevantGoals.map((goalId, i) => {
                // Prefer live API coverage data; fall back to grade approximation
                const liveCoverage = goalCoverageMap.get(goalId);
                let status: string;
                let dotColor: string;
                let coveredByText: string | null = null;

                if (liveCoverage) {
                  status = liveCoverage.status === 'covered' ? 'Covered'
                    : liveCoverage.status === 'partial' ? 'Partial' : 'Gap';
                  dotColor = liveCoverage.status === 'covered' ? Colors.accentHill
                    : liveCoverage.status === 'partial' ? Colors.accentClay : Colors.inkTertiary;
                  if (liveCoverage.covered_by.length > 0) {
                    coveredByText = liveCoverage.covered_by.slice(0, 2).join(', ');
                  }
                } else {
                  // Fallback: grade-based approximation
                  const covered = relevantProducts.some(
                    (p) => (p.grade === 'A' || p.grade === 'B') && (DOMAIN_RELEVANCE[domain]?.[p.category] ?? 0) >= 0.5
                  );
                  status = covered ? 'Covered' : relevantProducts.length > 0 ? 'Partial' : 'Gap';
                  dotColor = status === 'Covered' ? Colors.accentHill
                    : status === 'Partial' ? Colors.accentClay : Colors.inkTertiary;
                }

                return (
                  <View key={goalId} style={[styles.goalRow, i < relevantGoals.length - 1 && styles.rowBorder]}>
                    <View style={[styles.goalDot, { backgroundColor: dotColor }]} />
                    <View style={styles.goalInfo}>
                      <Text style={styles.goalLabel}>{GOAL_LABELS[goalId] ?? goalId}</Text>
                      {coveredByText && (
                        <Text style={styles.goalCoveredBy} numberOfLines={1}>{coveredByText}</Text>
                      )}
                    </View>
                    <Text style={[styles.goalStatus, { color: dotColor }]}>{status}</Text>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ── RECOMMENDATIONS ───────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.duration(300).delay(320)} style={styles.section}>
          <SectionHeader label="Clinical Guidance" />
          <View style={styles.card}>
            {DOMAIN_RECOMMENDATIONS[domain].map((rec, i) => (
              <View
                key={i}
                style={[styles.recRow, i < DOMAIN_RECOMMENDATIONS[domain].length - 1 && styles.rowBorder]}
              >
                <View style={styles.recCatPill}>
                  <Text style={styles.recCatText}>{rec.category.toUpperCase()}</Text>
                </View>
                <Text style={styles.recBody}>{rec.suggestion}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bone },
  container: { paddingBottom: Layout.bottomPadding },
  errorText: {
    fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.inkSecondary,
    textAlign: 'center', marginTop: Spacing.xxl,
  },

  // Back
  backBtn: { paddingHorizontal: Layout.screenPaddingHorizontal, paddingVertical: Spacing.sm },
  backText: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.body, color: Colors.inkSecondary },

  // ── Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },
  heroLeft: { alignItems: 'center', gap: Spacing.xs },
  ringWrapper: { width: RING_SIZE, height: RING_SIZE, justifyContent: 'center', alignItems: 'center' },
  ringCenter: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  ringScore: { fontFamily: Fonts.mono, fontSize: FontSizes.title },
  deltaBadge: {
    paddingHorizontal: scale(8), paddingVertical: scale(3),
    borderRadius: Radius.pill,
  },
  deltaText: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs, letterSpacing: 0.5 },
  heroRight: { flex: 1, gap: scale(4) },
  heroOverline: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    textTransform: 'uppercase', letterSpacing: 1.5, color: Colors.inkTertiary,
  },
  heroTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.display, color: Colors.ink },
  statusPill: {
    alignSelf: 'flex-start', paddingHorizontal: scale(10), paddingVertical: scale(3),
    borderRadius: Radius.pill,
  },
  statusPillText: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  descriptionWrap: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
    marginBottom: Spacing.xl,
  },
  description: {
    fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.7,
  },

  // ── Section wrapper
  section: { paddingHorizontal: Layout.screenPaddingHorizontal, marginBottom: Spacing.xl },

  // ── Shared card
  card: {
    backgroundColor: Colors.boneCard, borderWidth: 1,
    borderColor: Colors.borderHairline, borderRadius: Radius.md, overflow: 'hidden',
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderHairline },

  // ── E: Evidence card (dark)
  evidenceCard: {
    backgroundColor: Colors.ink, borderRadius: Radius.md,
    padding: Spacing.lg, gap: Spacing.sm,
  },
  evidenceCardLoading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  evidenceLoadingText: {
    fontFamily: Fonts.sans, fontSize: FontSizes.body, color: 'rgba(233,230,223,0.4)',
  },
  evidenceTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  evidenceTag: {
    alignSelf: 'flex-start', paddingHorizontal: scale(10), paddingVertical: scale(4),
    borderRadius: Radius.pill, borderWidth: 1, borderColor: 'rgba(233,230,223,0.25)',
  },
  evidenceTagCurated: { borderStyle: 'dashed' },
  evidenceTagText: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(233,230,223,0.5)',
  },
  evidenceIngredient: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.caption,
    color: 'rgba(233,230,223,0.6)', textTransform: 'uppercase', letterSpacing: 1,
  },
  evidenceQuote: {
    fontFamily: Fonts.serifItalic, fontSize: FontSizes.bodyLarge,
    color: Colors.bone, lineHeight: FontSizes.bodyLarge * 1.6, marginTop: Spacing.xs,
  },
  evidenceFinding: {
    fontFamily: Fonts.sans, fontSize: FontSizes.caption,
    color: 'rgba(233,230,223,0.6)', lineHeight: FontSizes.caption * 1.6,
  },
  evidenceSource: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },
  evidenceLine: { width: scale(20), height: 1, backgroundColor: 'rgba(233,230,223,0.25)' },
  evidenceSourceText: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    color: 'rgba(233,230,223,0.45)', letterSpacing: 0.8, flex: 1,
  },
  evidencePmid: {
    fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: 'rgba(233,230,223,0.3)',
  },

  // ── B: Ingredient impact rows
  ingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: scale(13), gap: Spacing.sm,
  },
  directionBadge: {
    width: scale(30), height: scale(30), borderRadius: scale(15),
    justifyContent: 'center', alignItems: 'center',
  },
  directionSymbol: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.bodyLarge },
  ingInfo: { flex: 1, gap: scale(4) },
  ingName: { fontFamily: Fonts.sansMedium, fontSize: FontSizes.body, color: Colors.ink },
  relTrack: {
    height: scale(2), backgroundColor: Colors.boneDark,
    borderRadius: scale(1), overflow: 'hidden',
  },
  relFill: { height: '100%', borderRadius: scale(1) },
  ingNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  ingEvidencePill: {
    paddingHorizontal: scale(5), paddingVertical: scale(1),
    backgroundColor: Colors.boneDark, borderRadius: Radius.pill,
  },
  ingEvidencePillText: { fontFamily: Fonts.sans, fontSize: FontSizes.xs, color: Colors.inkTertiary },
  ingFinding: {
    fontFamily: Fonts.sans, fontSize: FontSizes.xs, color: Colors.inkSecondary,
    lineHeight: FontSizes.xs * 1.6, marginTop: scale(2),
  },
  ingChevron: { fontFamily: Fonts.sans, fontSize: FontSizes.bodyLarge, color: Colors.inkTertiary },
  dirLabelCol: { alignItems: 'flex-end', gap: scale(2) },
  dirLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'right',
  },
  confLabel: {
    fontFamily: Fonts.sans, fontSize: FontSizes.xs, color: Colors.inkTertiary,
    textTransform: 'capitalize',
  },

  // ── A: Missing ingredients
  missingGrid: { gap: Spacing.sm },
  missingCard: {
    backgroundColor: Colors.boneCard, borderWidth: 1,
    borderColor: Colors.borderHairline, borderRadius: Radius.md,
    padding: Spacing.md, gap: scale(6),
  },
  missingCardDashed: { borderStyle: 'dashed', borderColor: Colors.boneDark },
  missingTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  missingName: { fontFamily: Fonts.sansMedium, fontSize: FontSizes.body, color: Colors.ink, flex: 1 },
  evidenceBadge: {
    paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: Radius.pill,
  },
  evidenceBadgeDashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.inkTertiary },
  evidenceBadgeText: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs, letterSpacing: 0.5 },
  missingDesc: {
    fontFamily: Fonts.sans, fontSize: FontSizes.caption,
    color: Colors.inkSecondary, lineHeight: FontSizes.caption * 1.6,
  },
  missingDose: {
    fontFamily: Fonts.sans, fontSize: FontSizes.xs, color: Colors.inkTertiary,
    marginTop: scale(2),
  },
  missingFooter: { flexDirection: 'row', alignItems: 'center', marginTop: scale(2) },
  missingAdd: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    color: Colors.inkTertiary, letterSpacing: 0.5,
  },

  // ── Empty / complete states
  emptyCard: {
    backgroundColor: Colors.boneCard, borderWidth: 1, borderColor: Colors.borderHairline,
    borderRadius: Radius.md, padding: Spacing.lg, alignItems: 'center',
  },
  emptyTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.subtitle, color: Colors.ink, marginBottom: Spacing.xs },
  emptyBody: {
    fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.inkSecondary,
    textAlign: 'center', lineHeight: FontSizes.body * 1.6,
  },
  completeCard: { padding: Spacing.md },
  completeText: { fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.inkSecondary, lineHeight: FontSizes.body * 1.6 },

  // ── D: Simulator
  simScoreRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: Spacing.md, gap: Spacing.md,
  },
  simScoreItem: { alignItems: 'center', gap: scale(2) },
  simScoreLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    textTransform: 'uppercase', letterSpacing: 1, color: Colors.inkTertiary,
  },
  simScoreVal: { fontFamily: Fonts.mono, fontSize: FontSizes.heading },
  simArrow: { flex: 1, alignItems: 'center' },
  simArrowText: { fontFamily: Fonts.sans, fontSize: FontSizes.bodyLarge, color: Colors.inkTertiary },
  simDeltaPill: {
    paddingHorizontal: scale(10), paddingVertical: scale(4), borderRadius: Radius.pill,
  },
  simDeltaText: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.sm, letterSpacing: 0.5 },
  simRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: scale(12), gap: Spacing.sm,
  },
  simRowOff: { opacity: 0.45 },
  simGradeBadge: {
    width: scale(28), height: scale(28), borderRadius: scale(14),
    borderWidth: 1.5, justifyContent: 'center', alignItems: 'center',
  },
  simGradeText: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.caption },
  simProductInfo: { flex: 1 },
  simProductName: { fontFamily: Fonts.sansMedium, fontSize: FontSizes.body, color: Colors.ink },
  simProductNameOff: { color: Colors.inkTertiary },
  simRelevance: { fontFamily: Fonts.sans, fontSize: FontSizes.xs, color: Colors.inkTertiary, marginTop: scale(2) },
  simReset: { marginTop: Spacing.sm, alignSelf: 'flex-end' },
  simResetText: {
    fontFamily: Fonts.sans, fontSize: FontSizes.caption,
    color: Colors.inkTertiary, textDecorationLine: 'underline',
  },

  // ── C: Timing
  timingGrid: { flexDirection: 'row', gap: Spacing.sm },
  timingCol: { flex: 1, alignItems: 'center', gap: Spacing.xs },
  timingSlotLabel: {
    fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs,
    textTransform: 'uppercase', letterSpacing: 1, color: Colors.inkSecondary,
  },
  timingDivider: { width: '100%', height: 1, backgroundColor: Colors.borderHairline, marginBottom: Spacing.xs },
  timingEmpty: { fontFamily: Fonts.sans, fontSize: FontSizes.sm, color: Colors.boneDark },
  timingPill: {
    width: '100%', borderWidth: 1, borderRadius: Radius.sm,
    paddingHorizontal: scale(6), paddingVertical: scale(5),
    backgroundColor: Colors.boneCard, gap: scale(3), alignItems: 'flex-start',
  },
  timingDot: { width: scale(5), height: scale(5), borderRadius: scale(3) },
  timingPillText: {
    fontFamily: Fonts.sans, fontSize: FontSizes.xs, color: Colors.ink,
    lineHeight: FontSizes.xs * 1.5,
  },
  timingNote: {
    fontFamily: Fonts.sans, fontSize: FontSizes.caption, color: Colors.inkTertiary,
    marginTop: Spacing.sm, lineHeight: FontSizes.caption * 1.6, paddingHorizontal: Spacing.xs,
  },

  // ── Goals
  goalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: scale(14), gap: Spacing.sm,
  },
  goalDot: { width: scale(7), height: scale(7), borderRadius: scale(4) },
  goalInfo: { flex: 1 },
  goalLabel: { fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.ink },
  goalCoveredBy: {
    fontFamily: Fonts.sans, fontSize: FontSizes.xs, color: Colors.inkTertiary,
    marginTop: scale(2),
  },
  goalStatus: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.caption, textTransform: 'uppercase', letterSpacing: 0.8 },

  // ── Recommendations
  recRow: { padding: Spacing.md, gap: Spacing.xs },
  recCatPill: {
    alignSelf: 'flex-start', paddingHorizontal: scale(8), paddingVertical: scale(3),
    borderRadius: Radius.pill, backgroundColor: Colors.boneDark,
  },
  recCatText: { fontFamily: Fonts.sansSemiBold, fontSize: FontSizes.xs, color: Colors.inkSecondary, letterSpacing: 1 },
  recBody: { fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.ink, lineHeight: FontSizes.body * 1.6 },
});
