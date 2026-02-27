import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  Layout,
  scale,
  verticalScale,
} from '@/constants/theme';
import { api, getProductWithFallback } from '@/services/api';
import type { Product, ServerPersonalAnalysis } from '@/services/api';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import {
  analyzeIngredients,
  buildPersonalAnalysis,
  displayConcern,
  displayGoal,
} from '@/utils/personalization';

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon({ size = 18, color = Colors.bone }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path d="M12 4v16m8-8H4" strokeLinecap="round" />
    </Svg>
  );
}

function CheckIcon({ size = 18, color = Colors.bone }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
      <Path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Grade helpers ────────────────────────────────────────────────────────────

function getGradeStyle(grade: string): { bg: string; text: string; label: string } {
  switch (grade) {
    case 'A': return { bg: Colors.accentHill, text: Colors.bone, label: 'Excellent' };
    case 'B': return { bg: Colors.ink, text: Colors.bone, label: 'Good' };
    case 'C': return { bg: Colors.inkSecondary, text: Colors.bone, label: 'Average' };
    case 'D': return { bg: Colors.accentAlert, text: Colors.bone, label: 'Below Average' };
    default:  return { bg: Colors.boneDark, text: Colors.ink, label: 'Not Rated' };
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stack, addToStack, removeFromStack } = useAppState();
  const { onboardingProfile } = useAuth();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // ── Server-side personalization ────────────────────────────────────────────
  // Fires after the product loads. Server result is preferred; the client-side
  // keyword engine runs immediately as a fallback while the request is in-flight
  // or if the server is unreachable.
  const [serverAnalysis, setServerAnalysis] = useState<ServerPersonalAnalysis | null>(null);

  const isInStack = product ? stack.some((p) => p.id === product.id) : false;

  // ── Client-side fallback (instant, keyword-based) ─────────────────────────
  const clientPersonalAnalysis = useMemo(() => {
    if (!product || !onboardingProfile) return null;
    const hasFilters = onboardingProfile.healthConcerns.length > 0 || onboardingProfile.goals.length > 0;
    if (!hasFilters) return null;
    return buildPersonalAnalysis(product.ingredients, onboardingProfile);
  }, [product, onboardingProfile]);

  const clientIngredientPersonalization = useMemo(() => {
    if (!product || !onboardingProfile) return null;
    const hasFilters = onboardingProfile.healthConcerns.length > 0 || onboardingProfile.goals.length > 0;
    if (!hasFilters) return null;
    return analyzeIngredients(product.ingredients, onboardingProfile);
  }, [product, onboardingProfile]);

  // ── Resolved: server wins when available, client is the fallback ──────────
  const personalAnalysis = serverAnalysis ?? clientPersonalAnalysis;

  const ingredientPersonalization = useMemo(() => {
    if (serverAnalysis) {
      const map = new Map<string, { concernFlags: { concern: string; label: string }[]; goalSupports: { goal: string; label: string }[] }>();
      for (const [name, data] of Object.entries(serverAnalysis.perIngredient)) {
        map.set(name, { concernFlags: data.concernFlags, goalSupports: data.goalSupports });
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
    setImageError(false);
    try {
      const data = await getProductWithFallback(id);
      if (data) {
        setProduct(data);
      } else {
        setError('Product not found');
      }
    } catch (err) {
      setError('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  // Fire personalization request once product is loaded and profile has tags.
  useEffect(() => {
    if (!product || !onboardingProfile) return;
    const { healthConcerns, goals } = onboardingProfile;
    if (healthConcerns.length === 0 && goals.length === 0) return;

    api.personalizeProduct(product.id, healthConcerns, goals)
      .then(setServerAnalysis)
      .catch(() => {
        // Server unreachable — client fallback already showing, nothing to do.
      });
  }, [product?.id, onboardingProfile]);

  // ── Stack toggle ───────────────────────────────────────────────────────────

  const handleStackToggle = () => {
    if (!product) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isInStack) {
      removeFromStack(product.id);
    } else {
      const validGrades = ['A', 'B', 'C', 'D'] as const;
      const grade = validGrades.includes(product.grade as any)
        ? (product.grade as 'A' | 'B' | 'C' | 'D')
        : 'C';
      addToStack({
        id: product.id,
        name: product.name,
        brand: product.brand || 'Unknown',
        category: product.category,
        grade,
        ingredients: product.ingredients.map((i) => i.name),
        scannedAt: new Date(),
      });
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View className="flex-1 bg-bone justify-center items-center">
        <ActivityIndicator size="large" color={Colors.ink} />
        <Text style={styles.loadingText}>Loading product...</Text>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View className="flex-1 bg-bone justify-center items-center">
        <Text style={styles.errorText}>{error || 'Product not found'}</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const gradeStyle = getGradeStyle(product.grade);
  const hasPersonalData =
    personalAnalysis && (personalAnalysis.hasConcernFlags || personalAnalysis.hasGoalSupports);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-bone">
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        {/* Hero: image + grade */}
        <View style={styles.heroSection}>
          <View style={styles.imageContainer}>
            {product.image_url && !imageError ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImage}
                resizeMode="contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Text style={styles.imagePlaceholderIcon}>📦</Text>
              </View>
            )}
          </View>

          {product.grade && (
            <View style={styles.gradeContainer}>
              <View style={[styles.gradeBadge, { backgroundColor: gradeStyle.bg }]}>
                <Text style={[styles.gradeText, { color: gradeStyle.text }]}>
                  {product.grade}
                </Text>
              </View>
              <Text style={styles.gradeLabel}>{gradeStyle.label}</Text>
            </View>
          )}
        </View>

        {/* AI badge */}
        {product.is_ai_generated && (
          <View className="bg-accent-alert/8 border border-accent-alert/30 rounded-md p-md flex-row gap-md mb-lg">
            <Text style={styles.aiBadgeIcon}>✦</Text>
            <View style={styles.aiBadgeContent}>
              <Text style={styles.aiBadgeLabel}>AI-Generated Analysis</Text>
              <Text style={styles.aiBadgeText}>
                This product was not found in our database. The analysis is AI-generated and should be verified.
              </Text>
            </View>
          </View>
        )}

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.reportLabel}>Clinical Intelligence Report</Text>
          <Text style={styles.productName}>{product.name}</Text>
          {product.brand && <Text style={styles.brandName}>{product.brand}</Text>}
          <View style={styles.tagRow}>
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{product.category}</Text>
            </View>
            {product.tags?.map((tag, index) => (
              <Animated.View key={tag} entering={FadeInUp.duration(300).delay(index * 60)}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Add to stack */}
        <Pressable
          className={`flex-row items-center justify-center gap-sm rounded-pill py-md mb-xl ${
            isInStack ? 'bg-bone-card border border-ink' : 'bg-ink'
          }`}
          onPress={handleStackToggle}
        >
          {isInStack ? (
            <>
              <CheckIcon color={Colors.ink} />
              <Text className="font-sans-semibold text-ink uppercase" style={{ fontSize: FontSizes.body, letterSpacing: 1 }}>
                In Your Stack
              </Text>
            </>
          ) : (
            <>
              <PlusIcon />
              <Text className="font-sans-semibold text-bone uppercase" style={{ fontSize: FontSizes.body, letterSpacing: 1 }}>Add to Stack</Text>
            </>
          )}
        </Pressable>

        {/* Allergen warning */}
        {product.has_allergen_warning && product.allergen_warning && (
          <View style={styles.allergenAlert}>
            <Text style={styles.allergenIcon}>⚠</Text>
            <View style={styles.allergenContent}>
              <Text style={styles.allergenLabel}>Allergen Warning</Text>
              <Text style={styles.allergenText}>{product.allergen_warning}</Text>
            </View>
          </View>
        )}

        {/* ── For You section ─────────────────────────────────────────────── */}
        {hasPersonalData && (
          <Animated.View entering={FadeIn.duration(500)} style={styles.forYouSection}>
            <View style={styles.sectionDivider} />
            <View style={styles.forYouHeader}>
              <Text style={styles.sectionLabel}>For You</Text>
              <View style={styles.forYouBadge}>
                <Text style={styles.forYouBadgeText}>Personalized</Text>
              </View>
            </View>

            {/* Concern warnings */}
            {personalAnalysis!.hasConcernFlags && (
              <View className="bg-accent-alert/5 border border-accent-alert/30 rounded-md mb-sm" style={{ overflow: 'hidden' }}>
                <View style={styles.forYouCardHeader}>
                  <Text style={styles.forYouCardIcon}>⚠</Text>
                  <Text style={styles.forYouCardTitle}>Personal Warnings</Text>
                </View>
                {personalAnalysis!.concerns.map((item, i) => (
                  <View
                    key={`${item.ingredientName}-${item.concern}`}
                    style={[
                      styles.forYouRow,
                      i < personalAnalysis!.concerns.length - 1 && styles.forYouRowBorder,
                    ]}
                  >
                    <View style={styles.forYouRowLeft}>
                      <Text style={styles.forYouIngredientName}>{item.ingredientName}</Text>
                      <Text style={styles.forYouRowLabel}>{item.label}</Text>
                    </View>
                    <View style={styles.concernPill}>
                      <Text style={styles.concernPillText}>{displayConcern(item.concern)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Goal alignments */}
            {personalAnalysis!.hasGoalSupports && (
              <View className="bg-accent-moss/5 border border-accent-moss/30 rounded-md mb-sm" style={{ overflow: 'hidden' }}>
                <View style={styles.forYouCardHeader}>
                  <Text style={styles.goalCardIcon}>✓</Text>
                  <Text style={[styles.forYouCardTitle, styles.goalCardTitle]}>Supports Your Goals</Text>
                </View>
                {personalAnalysis!.goals.map((item, i) => (
                  <View
                    key={`${item.ingredientName}-${item.goal}`}
                    style={[
                      styles.forYouRow,
                      i < personalAnalysis!.goals.length - 1 && styles.forYouRowBorder,
                      styles.goalRowBorder,
                    ]}
                  >
                    <View style={styles.forYouRowLeft}>
                      <Text style={styles.forYouIngredientName}>{item.ingredientName}</Text>
                      <Text style={styles.forYouRowLabel}>{item.label}</Text>
                    </View>
                    <View style={styles.goalPill}>
                      <Text style={styles.goalPillText}>{displayGoal(item.goal)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* Ingredient Deep-Dive */}
        {product.ingredients.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Ingredient Deep-Dive</Text>

            {product.ingredients.map((ingredient, index) => {
              const personal = ingredientPersonalization?.get(ingredient.name);
              return (
                <Animated.View key={ingredient.name} entering={FadeInUp.duration(400).delay(index * 80)}>
                  <View style={[
                    styles.ingredientCard,
                    !!personal?.concernFlags.length && styles.ingredientCardFlagged,
                    !personal?.concernFlags.length && !!personal?.goalSupports.length && styles.ingredientCardGoal,
                  ]}>
                    <View style={styles.ingredientHeader}>
                      <Text style={styles.ingredientName}>
                        {ingredient.name}
                        {ingredient.concentration && ` (${ingredient.concentration})`}
                      </Text>
                      {ingredient.tag && (
                        <View style={[
                          styles.ingredientTag,
                          ingredient.tag_type === 'warning' && styles.ingredientTagWarning,
                        ]}>
                          <Text style={[
                            styles.ingredientTagText,
                            ingredient.tag_type === 'warning' && styles.ingredientTagTextWarning,
                          ]}>
                            {ingredient.tag}
                          </Text>
                        </View>
                      )}
                    </View>

                    {ingredient.description && (
                      <Text style={styles.ingredientDesc}>{ingredient.description}</Text>
                    )}

                    {/* Personal badges on this specific ingredient */}
                    {personal && (
                      <View style={styles.personalBadgeRow}>
                        {personal.concernFlags.map(({ concern, label }) => (
                          <View key={concern} style={styles.personalConcernBadge}>
                            <Text style={styles.personalConcernBadgeText}>
                              ⚠ {displayConcern(concern)}
                            </Text>
                          </View>
                        ))}
                        {personal.goalSupports.map(({ goal, label }) => (
                          <View key={goal} style={styles.personalGoalBadge}>
                            <Text style={styles.personalGoalBadgeText}>
                              ✓ {displayGoal(goal)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Bio-Domain Impact */}
        {product.bio_domains.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Bio-Domain Impact</Text>

            {product.bio_domains.map((domain) => (
              <View key={domain.name} style={styles.chartRow}>
                <Text style={styles.chartLabel}>{domain.name}</Text>
                <View style={styles.chartBarContainer}>
                  <View
                    className={`h-full ${domain.is_negative ? 'bg-accent-alert' : 'bg-ink'}`}
                    style={{ width: `${domain.value}%` }}
                  />
                </View>
                <Text style={styles.chartValue}>
                  {domain.is_negative ? '-' : '+'}{Math.round(domain.value / 10)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Clinical Recommendations */}
        {product.recommendations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Clinical Recommendations</Text>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>Context</Text>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>Protocol</Text>
              </View>
              {product.recommendations.map((rec, index) => (
                <View
                  key={rec.context}
                  style={[
                    styles.tableRow,
                    index < product.recommendations.length - 1 && styles.tableRowBorder,
                  ]}
                >
                  <Text style={[styles.tableCell, styles.tableCellContext, { flex: 1 }]}>
                    {rec.context}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{rec.protocol}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Research Citations */}
        {product.citations.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Research Citations</Text>

            {product.citations.map((citation, index) => (
              <View key={index} style={styles.citation}>
                <Text style={styles.citationText}>
                  "{citation.text}"{citation.journal && (
                    <Text style={styles.citationJournal}> {citation.journal}</Text>
                  )}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: verticalScale(40) }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: verticalScale(40),
  },
  loadingText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginTop: Spacing.md,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.accentAlert,
    marginBottom: Spacing.lg,
  },
  backButton: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
  },
  backButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  backBtn: {
    marginBottom: Spacing.lg,
  },
  backBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
  },
  heroSection: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  imageContainer: {
    width: scale(140),
    height: scale(140),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.boneDark,
  },
  imagePlaceholderIcon: {
    fontSize: scale(48),
    opacity: 0.5,
  },
  gradeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeBadge: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(8),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  gradeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.display,
    fontWeight: '700',
  },
  gradeLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryTag: {
    paddingVertical: scale(4),
    paddingHorizontal: scale(12),
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
  },
  categoryTagText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiBadgeIcon: {
    fontSize: FontSizes.title,
    color: Colors.accentAlert,
  },
  aiBadgeContent: {
    flex: 1,
  },
  aiBadgeLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.accentAlert,
    marginBottom: 4,
  },
  aiBadgeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.4,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  reportLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    marginBottom: Spacing.sm,
  },
  productName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.hero,
    lineHeight: FontSizes.hero * 1.1,
    color: Colors.ink,
    marginBottom: 4,
  },
  brandName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginBottom: Spacing.md,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    paddingVertical: scale(2),
    paddingHorizontal: scale(8),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
  },
  tagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.ink,
  },
  allergenAlert: {
    backgroundColor: Colors.alertBg,
    borderWidth: 1,
    borderColor: Colors.alertBorder,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  allergenIcon: {
    fontSize: FontSizes.title,
    color: Colors.accentAlert,
  },
  allergenContent: {
    flex: 1,
  },
  allergenLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.accentAlert,
    marginBottom: 4,
  },
  allergenText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.alertText,
    lineHeight: FontSizes.body * 1.5,
  },

  // ── For You section ─────────────────────────────────────────────────────────
  forYouSection: {
    marginBottom: Spacing.lg,
  },
  forYouHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  forYouBadge: {
    paddingVertical: scale(2),
    paddingHorizontal: scale(8),
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
  },
  forYouBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  forYouCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: scale(14),
    paddingVertical: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: Colors.alertBorder,
  },
  forYouCardIcon: {
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
  },
  goalCardIcon: {
    fontSize: FontSizes.body,
    color: Colors.accentMoss,
  },
  forYouCardTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.accentAlert,
  },
  goalCardTitle: {
    color: Colors.accentMoss,
  },
  forYouRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: scale(10),
    gap: scale(10),
  },
  forYouRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.alertBorder,
  },
  goalRowBorder: {
    borderBottomColor: 'rgba(92, 110, 92, 0.15)',
  },
  forYouRowLeft: {
    flex: 1,
    gap: 2,
  },
  forYouIngredientName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  forYouRowLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.4,
  },
  concernPill: {
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    backgroundColor: 'rgba(163, 78, 78, 0.15)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(163, 78, 78, 0.3)',
    flexShrink: 0,
  },
  concernPillText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.accentAlert,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  goalPill: {
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    backgroundColor: 'rgba(92, 110, 92, 0.15)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(92, 110, 92, 0.3)',
    flexShrink: 0,
  },
  goalPillText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.accentMoss,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Sections ────────────────────────────────────────────────────────────────
  section: {
    marginBottom: Spacing.lg,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.borderStrong,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    marginBottom: Spacing.md,
  },

  // ── Ingredient cards ────────────────────────────────────────────────────────
  ingredientCard: {
    backgroundColor: 'rgba(28, 28, 28, 0.03)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  ingredientCardFlagged: {
    backgroundColor: 'rgba(163, 78, 78, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(163, 78, 78, 0.18)',
  },
  ingredientCardGoal: {
    backgroundColor: 'rgba(92, 110, 92, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(92, 110, 92, 0.18)',
  },
  ingredientHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  ingredientName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.bodyLarge,
    color: Colors.ink,
    flex: 1,
  },
  ingredientTag: {
    paddingVertical: scale(2),
    paddingHorizontal: scale(8),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
  },
  ingredientTagWarning: {
    borderColor: Colors.accentAlert,
    backgroundColor: 'rgba(163, 75, 75, 0.05)',
  },
  ingredientTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.ink,
  },
  ingredientTagTextWarning: {
    color: Colors.accentAlert,
  },
  ingredientDesc: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
  },
  personalBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
    marginTop: Spacing.sm,
  },
  personalConcernBadge: {
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    backgroundColor: 'rgba(163, 78, 78, 0.12)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(163, 78, 78, 0.25)',
  },
  personalConcernBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.accentAlert,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  personalGoalBadge: {
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    backgroundColor: 'rgba(92, 110, 92, 0.12)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(92, 110, 92, 0.25)',
  },
  personalGoalBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.accentMoss,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Bio-domain bars ─────────────────────────────────────────────────────────
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  chartLabel: {
    width: scale(60),
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    color: Colors.ink,
  },
  chartBarContainer: {
    flex: 1,
    height: scale(24),
    backgroundColor: 'rgba(28, 28, 28, 0.05)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  chartValue: {
    width: scale(30),
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
    textAlign: 'right',
  },

  // ── Table ───────────────────────────────────────────────────────────────────
  table: {
    marginTop: Spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  tableHeaderText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  tableCell: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    lineHeight: FontSizes.body * 1.5,
  },
  tableCellContext: {
    fontFamily: Fonts.sansSemiBold,
  },

  // ── Citations ───────────────────────────────────────────────────────────────
  citation: {
    paddingLeft: Spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: Colors.borderHairline,
    marginBottom: Spacing.sm,
  },
  citationText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.5,
  },
  citationJournal: {
    fontFamily: Fonts.serifItalic,
    color: Colors.ink,
  },
});
