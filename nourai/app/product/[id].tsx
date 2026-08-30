import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import {
  Colors,
  Fonts,
  Radius,
  FontSizes,
  scale,
  verticalScale,
} from '@/constants/theme';
import { api, getProductWithFallback } from '@/services/api';
import type { LabObservation, Product, ServerPersonalAnalysis } from '@/services/api';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { AddToStackModal, type StackEntry } from '@/components/AddToStackModal';
import {
  analyzeIngredients,
  buildPersonalAnalysis,
} from '@/utils/personalization';
import {
  Eyebrow,
  SerifH,
  EvidenceSpectrum,
  Tag,
  AlertNote,
  ProductThumb,
  SectionHead,
  FactorBar,
} from '@/components/elory';

function gradeToScore(grade: string): number {
  switch (grade) {
    case 'A': return 90;
    case 'B': return 72;
    case 'C': return 52;
    case 'D': return 30;
    default: return 50;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryToThumbColor(
  cat: string,
): 'sand' | 'sage' | 'dark' | 'default' {
  if (cat === 'supplement') return 'sand';
  if (cat === 'cosmetic' || cat === 'topical') return 'sage';
  return 'default';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stack, addToStack, removeFromStack } = useAppState();
  const { onboardingProfile, isSignedIn } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [tappingNutrient, setTappingNutrient] = useState<string | null>(null);
  const [labObservations, setLabObservations] = useState<LabObservation[]>([]);
  const [activeTab, setActiveTab] = useState('Overview');

  const [serverAnalysis, setServerAnalysis] =
    useState<ServerPersonalAnalysis | null>(null);

  const isInStack = product ? stack.some((p) => p.id === product.id) : false;

  // ── Client-side fallback ──────────────────────────────────────────────────
  const clientPersonalAnalysis = useMemo(() => {
    if (!product || !onboardingProfile) return null;
    const hasFilters =
      onboardingProfile.healthConcerns.length > 0 ||
      onboardingProfile.goals.length > 0;
    if (!hasFilters) return null;
    return buildPersonalAnalysis(product.ingredients, onboardingProfile);
  }, [product, onboardingProfile]);

  const clientIngredientPersonalization = useMemo(() => {
    if (!product || !onboardingProfile) return null;
    const hasFilters =
      onboardingProfile.healthConcerns.length > 0 ||
      onboardingProfile.goals.length > 0;
    if (!hasFilters) return null;
    return analyzeIngredients(product.ingredients, onboardingProfile);
  }, [product, onboardingProfile]);

  const personalAnalysis = serverAnalysis ?? clientPersonalAnalysis;

  const ingredientPersonalization = useMemo(() => {
    if (serverAnalysis) {
      const map = new Map<
        string,
        {
          concernFlags: { concern: string; label: string }[];
          goalSupports: { goal: string; label: string }[];
        }
      >();
      for (const [name, data] of Object.entries(serverAnalysis.perIngredient)) {
        map.set(name, {
          concernFlags: data.concernFlags,
          goalSupports: data.goalSupports,
        });
      }
      return map;
    }
    return clientIngredientPersonalization;
  }, [serverAnalysis, clientIngredientPersonalization]);

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProductWithFallback(id);
      if (data) {
        setProduct(data);
        if (isSignedIn) {
          api.addToScanHistory(data.id).catch(() => {});
        }
      } else {
        setError('Product not found');
      }
    } catch {
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!product || !onboardingProfile) return;
    const { healthConcerns, goals } = onboardingProfile;
    if (healthConcerns.length === 0 && goals.length === 0) return;
    if (product.id.startsWith('usda-')) return;

    api
      .personalizeProduct(product.id, healthConcerns, goals)
      .then(setServerAnalysis)
      .catch(() => {});
  }, [product?.id, onboardingProfile]);

  useEffect(() => {
    if (!product || product.id.startsWith('usda-')) {
      setLabObservations([]);
      return;
    }
    let active = true;
    api.getProductLabResults(product.id)
      .then((result) => {
        if (active) setLabObservations(result.observations);
      })
      .catch(() => {
        if (active) setLabObservations([]);
      });
    return () => { active = false; };
  }, [product?.id]);

  // ── Nutrient tap ──────────────────────────────────────────────────────────
  const handleNutrientTap = async (nutrient: {
    name: string;
    ingredient_id?: string | null;
  }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (nutrient.ingredient_id) {
      router.push(`/ingredient/${nutrient.ingredient_id}`);
      return;
    }
    setTappingNutrient(nutrient.name);
    try {
      const result = await api.searchIngredients(nutrient.name, 1);
      if (result.ingredients.length > 0) {
        router.push(`/ingredient/${result.ingredients[0].id}`);
      }
    } catch {
      // No match
    } finally {
      setTappingNutrient(null);
    }
  };

  // ── Stack toggle ──────────────────────────────────────────────────────────
  const handleStackToggle = () => {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isInStack) {
      removeFromStack(product.id);
      if (isSignedIn) {
        (async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) return;
          const entries = await api.getStack(session.access_token);
          const entry = entries.find((e) => e.product_id === product.id);
          if (entry) await api.removeFromStack(session.access_token, entry.id);
        })().catch(() => {});
      }
    } else {
      setAddModalVisible(true);
    }
  };

  const handleAddConfirm = (entry: StackEntry) => {
    if (!product) return;
    const validGrades = ['A', 'B', 'C', 'D'] as const;
    const grade = validGrades.includes(product.grade as 'A' | 'B' | 'C' | 'D')
      ? (product.grade as 'A' | 'B' | 'C' | 'D')
      : 'C';
    addToStack({
      id: product.id,
      name: product.name,
      brand: product.brand || 'Unknown',
      category: product.category,
      grade,
      ingredients: product.ingredients.map((i) => i.name),
      scannedAt: entry.loggedAt,
      timeOfDay: entry.timeOfDay,
      protocol: entry.protocol,
      quantity: entry.quantity,
    });
    if (isSignedIn) {
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        await api.addToStack(session.access_token, product.id, entry.timeOfDay, {
          loggedAt: entry.loggedAt,
          notes: entry.quantity,
        });
      })().catch(() => {});
    }
    setAddModalVisible(false);
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: Colors.surface, paddingTop: insets.top },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.ink} />
        <Text style={styles.loadingText}>Loading product...</Text>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: Colors.surface, paddingTop: insets.top },
        ]}
      >
        <Text style={styles.errorText}>{error || 'Product not found'}</Text>
        <Pressable style={styles.fallbackBackBtn} onPress={() => router.back()}>
          <Text style={styles.fallbackBackBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Data helpers ──────────────────────────────────────────────────────────
  const thumbColor = categoryToThumbColor(product.category);
  const thumbLetter = product.name?.[0]?.toUpperCase() ?? '?';

  const nutrients = product.ingredients.filter((i) => i.is_nutrient);
  const regularIngredients = product.ingredients.filter((i) => !i.is_nutrient);

  const BIO_DOMAIN_LABELS = [
    'Body Composition',
    'Energy & Metabolism',
    'Cardiovascular',
    'Gut & Digestive',
    'Inflammation & Immune',
    'Cognitive & Mental',
    'Sleep & Recovery',
    'Bone & Joint',
    'Hormonal & Endocrine',
    'Skin & Appearance',
  ];

  const bioDomains = BIO_DOMAIN_LABELS.map((label) => {
    const found = product.bio_domains.find((d) => d.name === label);
    return found ?? { name: label, value: 0, is_negative: false };
  }).filter((d) => d.value > 0);

  const supportDomains = product.bio_domains
    .filter((d) => d.value > 0 && !d.is_negative)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const hasPersonalData =
    personalAnalysis &&
    (personalAnalysis.hasConcernFlags || personalAnalysis.hasGoalSupports);

  const flaggedCount = regularIngredients.filter(
    (ing) => !!ingredientPersonalization?.get(ing.name)?.concernFlags.length
  ).length;
  const strongCount = regularIngredients.length - flaggedCount;
  const overallScore = gradeToScore(product.grade);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: Colors.surface }}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + scale(16) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        {/* ── Product header ───────────────────────────────────────────── */}
        <View style={styles.headerBlock}>
          <Eyebrow style={{ marginBottom: 10 }}>
            Clinical intelligence report
          </Eyebrow>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
            <ProductThumb
              color={thumbColor}
              letter={thumbLetter}
              size={96}
              imageUri={product.image_url}
              variant="panel"
            />
            <View style={{ flex: 1 }}>
              {product.brand ? (
                <Eyebrow style={{ marginBottom: 4 }}>{product.brand}</Eyebrow>
              ) : null}
              <SerifH size={28} style={{ marginBottom: 4 }}>
                {product.name}
              </SerifH>
              <Text style={styles.metaText}>
                {product.category}
                {product.subcategory ? ` · ${product.subcategory}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.tagRow}>
            <Tag tone="strong">{product.category}</Tag>
            {product.tags?.map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segmentedTabs}
        >
          {[
            'Overview',
            `Ingredients (${regularIngredients.length})`,
            'Nutrition',
            'About',
          ].map((tab) => (
            <Pressable key={tab} style={[styles.segmentedTab, activeTab === tab && styles.segmentedTabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[styles.segmentedTabText, activeTab === tab && styles.segmentedTabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Verdict card ──────────────────────────────────────────────── */}
        <View style={styles.verdictCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 52, color: Colors.ink, lineHeight: 52 }}>
                {overallScore}
              </Text>
              <Text style={{ fontFamily: Fonts.sans, fontSize: 14, color: Colors.inkSecondary, marginBottom: 6 }}>/100</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: Fonts.serifMedium, fontSize: 16, color: Colors.ink, marginBottom: 6 }}>
                {overallScore >= 80 ? 'High' : overallScore >= 60 ? 'Good' : overallScore >= 40 ? 'Moderate' : 'Low'}
              </Text>
              <EvidenceSpectrum strength={Math.round(overallScore / 20)} />
            </View>
          </View>
          <Text style={{ fontFamily: Fonts.sans, fontSize: 12, color: Colors.inkSecondary, marginBottom: 6 }}>
            Ingredient Intelligence Score
          </Text>
          <Text style={styles.metaText}>Evidence quality across all ingredients</Text>

          <View style={{ marginTop: 16 }}>
            <Eyebrow style={{ marginBottom: 6 }}>The short version</Eyebrow>
            {product.description ? (
              <Text style={styles.verdictText}>{product.description}</Text>
            ) : (
              <Text style={styles.verdictText}>
                {product.is_ai_generated
                  ? 'AI-generated analysis. Verify before use.'
                  : `${product.name} contains ${product.ingredients.length} ingredient${product.ingredients.length !== 1 ? 's' : ''}.`}
              </Text>
            )}
          </View>
        </View>

        {/* ── What this product supports ──────────────────────────────── */}
        {supportDomains.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <SectionHead label="What this product supports" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {supportDomains.map((domain) => (
                <View key={domain.name} style={styles.supportPill}>
                  <Text style={styles.supportPillText}>{domain.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Ingredient highlights ────────────────────────────────────── */}
        {regularIngredients.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <SectionHead label="Ingredient highlights" />
            <View style={styles.highlightsCard}>
              <View style={{ flex: 1 }}>
                <Eyebrow style={{ fontSize: 9, marginBottom: 6 }}>No flags</Eyebrow>
                <Text style={styles.statValue}>{strongCount}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={{ flex: 1, paddingHorizontal: 8 }}>
                <Eyebrow style={{ fontSize: 9, marginBottom: 6 }}>Emerging evidence</Eyebrow>
                <Text style={styles.statValue}>0</Text>
                <View style={{ marginTop: 8 }}>
                  <EvidenceSpectrum strength={0} />
                </View>
              </View>
              <View style={styles.statDivider} />
              <View style={{ flex: 1, paddingLeft: 8 }}>
                <Eyebrow style={{ fontSize: 9, marginBottom: 6 }}>Limited / Uncertain</Eyebrow>
                <Text style={styles.statValue}>{flaggedCount}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Allergen warning ──────────────────────────────────────────── */}
        {product.has_allergen_warning && product.allergen_warning ? (
          <View style={{ paddingHorizontal: scale(24), marginBottom: 20 }}>
            <AlertNote title="Allergen warning" tone="alert">
              {product.allergen_warning}
            </AlertNote>
          </View>
        ) : null}

        {/* ── Personalization ───────────────────────────────────────────── */}
        {hasPersonalData ? (
          <View style={{ marginBottom: 24, paddingHorizontal: scale(24) }}>
            {personalAnalysis!.hasConcernFlags ? (
              <AlertNote title="For your profile" tone="alert">
                {personalAnalysis!.concerns.map((item) =>
                  `${item.ingredientName}: ${item.label}`
                ).join(' · ')}
              </AlertNote>
            ) : null}
            {personalAnalysis!.hasGoalSupports ? (
              <AlertNote title="Supports your goals" tone="sage">
                {personalAnalysis!.goals.map((item) =>
                  `${item.ingredientName} → ${item.label}`
                ).join(' · ')}
              </AlertNote>
            ) : null}
          </View>
        ) : null}

        {/* ── Ingredients of note ───────────────────────────────────────── */}
        {regularIngredients.length > 0 ? (
          <View style={{ marginBottom: 28 }}>
            <SectionHead
              label="Ingredients"
              right={`${regularIngredients.length} items`}
            />
            {regularIngredients.map((ingredient) => {
              const personal = ingredientPersonalization?.get(ingredient.name);
              const isFlagged = !!personal?.concernFlags.length;
              const canDive = !!ingredient.ingredient_id;

              const rowContent = (
                <View
                  style={[
                    styles.ingredientRow,
                    isFlagged && styles.ingredientRowFlagged,
                  ]}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', flex: 1, marginRight: 8, alignItems: 'center' }}>
                      <View style={styles.ingredientAvatar}>
                        <Text style={styles.ingredientAvatarText}>
                          {ingredient.name?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                      <Text style={styles.ingredientName}>
                        {ingredient.name}
                        {ingredient.concentration
                          ? `  ${ingredient.concentration}`
                          : ''}
                      </Text>
                    </View>
                    <EvidenceSpectrum strength={isFlagged ? 1 : 3} />
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginBottom: ingredient.description ? 6 : 0,
                    }}
                  >
                    {ingredient.tag ? (
                      <Tag
                        tone={
                          ingredient.tag_type === 'warning' ? 'alert' : 'default'
                        }
                      >
                        {ingredient.tag}
                      </Tag>
                    ) : null}
                    {isFlagged ? <Tag tone="alert">Flagged</Tag> : null}
                    {personal?.goalSupports.length ? (
                      <Tag tone="sage">Supports goals</Tag>
                    ) : null}
                  </View>
                  {ingredient.description ? (
                    <Text style={styles.ingredientDesc}>
                      {ingredient.description}
                    </Text>
                  ) : null}
                </View>
              );

              return canDive ? (
                <Pressable
                  key={ingredient.name}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/ingredient/${ingredient.ingredient_id}`);
                  }}
                >
                  {rowContent}
                </Pressable>
              ) : (
                <View key={ingredient.name}>{rowContent}</View>
              );
            })}
          </View>
        ) : null}

        {/* ── Nutrition facts ───────────────────────────────────────────── */}
        {nutrients.length > 0 ? (
          <View style={{ marginBottom: 28 }}>
            <SectionHead
              label="Nutrition Facts"
              right={`${nutrients.length} items`}
            />
            <View style={styles.nutrientCard}>
              {nutrients.map((n, i) => {
                const isLoading = tappingNutrient === n.name;
                return (
                  <Pressable
                    key={n.name}
                    style={[
                      styles.nutrientRow,
                      i < nutrients.length - 1 && styles.nutrientRowBorder,
                    ]}
                    onPress={() => handleNutrientTap(n)}
                  >
                    <Text style={styles.nutrientName}>{n.name}</Text>
                    <Text style={styles.nutrientValue}>
                      {isLoading ? '…' : n.concentration}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* ── Independent laboratory measurements ─────────────────────── */}
        {labObservations.length > 0 ? (
          <View style={{ marginBottom: 28 }}>
            <SectionHead
              label="Independent lab results"
              right={`${labObservations.length} measurements`}
            />
            <Text style={styles.labNotice}>
              Published measurements are shown separately from Elory's score. Results apply to
              the tested sample or lot and may not represent every unit.
            </Text>
            <View style={styles.labCard}>
              {labObservations.slice(0, 8).map((observation, index) => (
                <View
                  key={observation.observation_id}
                  style={[
                    styles.labRow,
                    index < Math.min(labObservations.length, 8) - 1 && styles.labRowBorder,
                  ]}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.labAnalyte}>{observation.analyte_name}</Text>
                    <Text style={styles.labSource}>
                      {observation.publisher} · {observation.method_name}
                      {observation.lot_number ? ` · Lot ${observation.lot_number}` : ''}
                      {` · Grade ${observation.trust_grade}`}
                    </Text>
                    <Pressable onPress={() => Linking.openURL(observation.source_url)}>
                      <Text style={styles.labSourceLink}>Published source ↗</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.labValue}>
                    {observation.raw_value ?? `${observation.qualifier ?? ''}${observation.value ?? '—'}`}{' '}
                    {observation.unit}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Bio-domain impact ─────────────────────────────────────────── */}
        {bioDomains.length > 0 ? (
          <View style={{ marginBottom: 28 }}>
            <SectionHead label="Bio-domain impact" />
            {bioDomains.map((domain) => (
              <FactorBar key={domain.name} label={domain.name} value={domain.value} />
            ))}
          </View>
        ) : null}

        {product.attribution ? (
          <Pressable
            style={styles.attributionCard}
            onPress={() => Linking.openURL(product.attribution!.source_url)}
          >
            <Text style={styles.attributionText}>
              {product.attribution.attribution_text}
            </Text>
            <Text style={styles.attributionLink}>
              {product.attribution.data_license_name ?? 'Source data'}
              {product.attribution.image_license_name
                ? ` · Images ${product.attribution.image_license_name}`
                : ''}
              {' · View source ↗'}
            </Text>
          </Pressable>
        ) : null}

        {/* ── Add to stack ──────────────────────────────────────────────── */}
        <Pressable
          style={[
            styles.stackBtn,
            isInStack && styles.stackBtnActive,
          ]}
          onPress={handleStackToggle}
        >
          <Text
            style={[
              styles.stackBtnText,
              isInStack && styles.stackBtnTextActive,
            ]}
          >
            {isInStack ? '✓ In Your Stack' : '+ Add to Stack'}
          </Text>
        </Pressable>

        <View style={{ height: verticalScale(40) }} />
      </ScrollView>

      {product && (
        <AddToStackModal
          visible={addModalVisible}
          productName={product.name}
          productCategory={product.category}
          onConfirm={handleAddConfirm}
          onCancel={() => setAddModalVisible(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: scale(24),
    paddingBottom: verticalScale(40),
  },
  centered: {
    flex: 1,
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
    fontSize: FontSizes.bodyLarge,
    color: Colors.alert,
    marginBottom: scale(20),
    textAlign: 'center',
  },
  fallbackBackBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: scale(24),
    paddingVertical: scale(12),
    borderRadius: Radius.pill,
  },
  fallbackBackBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.surface,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  backBtn: {
    marginBottom: scale(24),
  },
  backBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
  },

  // Header
  headerBlock: {
    paddingBottom: 20,
  },
  metaText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: Colors.inkSecondary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  segmentedTabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  segmentedTab: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  segmentedTabActive: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  segmentedTabText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.inkSecondary },
  segmentedTabTextActive: { color: Colors.surface },

  // Verdict card
  verdictCard: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.lg,
    padding: 24,
    marginBottom: 28,
  },
  verdictText: {
    fontFamily: Fonts.serifItalic,
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 14,
    color: Colors.ink,
  },
  highlightsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.lg,
    padding: 20,
    alignItems: 'flex-start',
  },
  statDivider: {
    width: 1,
    height: 44,
    backgroundColor: Colors.borderHairline,
  },
  statValue: {
    fontFamily: Fonts.serifItalic,
    fontSize: 22,
    color: Colors.ink,
  },

  // Support pills
  supportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  supportPillText: { fontFamily: Fonts.sansMedium, fontSize: 13, color: Colors.ink },

  // Allergen
  allergenCard: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.alert,
    paddingLeft: 14,
    paddingVertical: 10,
    marginBottom: 24,
  },
  allergenLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.alert,
    marginBottom: 4,
  },
  allergenText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    lineHeight: FontSizes.body * 1.5,
  },

  // Personal
  personalCard: {
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  personalCardAlert: {
    backgroundColor: 'rgba(196,101,74,0.05)',
    borderColor: 'rgba(196,101,74,0.2)',
  },
  personalCardGoal: {
    backgroundColor: 'rgba(123,174,142,0.05)',
    borderColor: 'rgba(123,174,142,0.25)',
  },
  personalCardTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  personalRow: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderHairline,
  },
  personalIngredient: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  personalLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginTop: 2,
  },

  // Ingredients
  ingredientRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  ingredientRowFlagged: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.alert,
    paddingLeft: 14,
    marginLeft: -14,
  },
  ingredientAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ingredientAvatarText: {
    fontFamily: Fonts.serifItalic,
    fontSize: 13,
    color: Colors.ink,
  },
  ingredientName: {
    fontFamily: Fonts.serif,
    fontSize: 19,
    color: Colors.ink,
    lineHeight: 24,
    flexShrink: 1,
  },
  ingredientDesc: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    color: Colors.inkSecondary,
    lineHeight: 18,
  },

  // Nutrients
  nutrientCard: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  nutrientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: scale(10),
  },
  nutrientRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  nutrientName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    flex: 1,
  },
  nutrientValue: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginLeft: scale(8),
  },

  // Independent laboratory evidence
  labNotice: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    lineHeight: 18,
    color: Colors.inkSecondary,
    marginBottom: 10,
  },
  labCard: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  labRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: scale(12),
  },
  labRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  labAnalyte: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  labSource: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.inkSecondary,
    marginTop: 2,
  },
  labSourceLink: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    color: Colors.accent,
    marginTop: 3,
  },
  labValue: {
    fontFamily: Fonts.serif,
    fontSize: 17,
    color: Colors.ink,
  },

  attributionCard: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderHairline,
    paddingTop: scale(14),
    marginBottom: scale(20),
  },
  attributionText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: Colors.inkSecondary,
  },
  attributionLink: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    color: Colors.accent,
    marginTop: 3,
  },

  // Stack button
  stackBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingVertical: scale(14),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(12),
  },
  stackBtnActive: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.ink,
  },
  stackBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.surface,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stackBtnTextActive: {
    color: Colors.ink,
  },
});
