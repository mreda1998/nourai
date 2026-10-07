import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AlertTriangle, Check, CircleSlash, Plus, Sparkles, Target } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import { api, getProductWithFallback } from '@/services/api';
import type { Ingredient, LabObservation, Product, ServerPersonalAnalysis } from '@/services/api';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { analyzeIngredients, buildPersonalAnalysis } from '@/utils/personalization';
import { categoryLabel, gradeToScore, scoreQualifier, scoreTone, toneColor } from '@/utils/grade';
import { AddToStackSheet, type StackEntry } from '@/components/AddToStackSheet';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { isCatalogueId, track } from '@/lib/insights';
import { syncAddToStack, syncRemoveFromStack } from '@/lib/stack-sync';
import {
  Button, Card, EmptyState, IconButton, ListGroup, ListRow, Pill, ProductImage,
  ScoreBadge, Screen, Section, SkeletonCard, Txt,
} from '@/components/ui';
import {
  DoseCard, IngredientsCard, LabCard, LegacyNutritionCard, NutritionCard, ProcessingCard, SourceCard, SupportsCard,
} from '@/components/product/ProductSections';

type CardKey = 'nutrition' | 'doses' | 'ingredients' | 'processing' | 'lab' | 'supports' | 'source';

export default function ProductDetailScreen() {
  const { id, via } = useLocalSearchParams<{ id: string; via?: string }>();
  const { stack, addToStack, removeFromStack } = useAppState();
  const { onboardingProfile, isSignedIn } = useAuth();
  const sheet = useRef<BottomSheetModal>(null);
  const feedback = useRef<BottomSheetModal>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverAnalysis, setServerAnalysis] = useState<ServerPersonalAnalysis | null>(null);
  const [lab, setLab] = useState<LabObservation[]>([]);
  const [openCards, setOpenCards] = useState<Set<CardKey> | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const inStack = product ? stack.some((p) => p.id === product.id) : false;

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProductWithFallback(id);
      if (!data) { setError('We couldn’t find this product.'); return; }
      setProduct(data);
      if (isSignedIn) api.addToScanHistory(data.id).catch(() => {});
      track('product_view', isCatalogueId(data.id)
        ? { product_id: data.id, meta: { via: via ?? 'other' } }
        : { meta: { via: via ?? 'other', ref: data.id } });
    } catch {
      setError('Something went wrong loading this product.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const hasProfile = !!onboardingProfile && (onboardingProfile.healthConcerns.length > 0 || onboardingProfile.goals.length > 0);

  useEffect(() => {
    if (!product || !hasProfile || product.id.startsWith('usda-')) return;
    api.personalizeProduct(product.id, onboardingProfile!.healthConcerns, onboardingProfile!.goals).then(setServerAnalysis).catch(() => {});
  }, [product?.id, onboardingProfile]);

  useEffect(() => {
    if (!product || product.id.startsWith('usda-')) return;
    let alive = true;
    api.getProductLabResults(product.id).then((r) => alive && setLab(r.observations)).catch(() => {});
    return () => { alive = false; };
  }, [product?.id]);

  // ── Personalisation (server first, client fallback) ─────────────────────────
  const personal = useMemo(() => {
    if (serverAnalysis) return serverAnalysis;
    if (!product || !hasProfile) return null;
    return buildPersonalAnalysis(product.ingredients, onboardingProfile!);
  }, [serverAnalysis, product, hasProfile]);

  const perIngredient = useMemo(() => {
    if (serverAnalysis) return new Map(Object.entries(serverAnalysis.perIngredient).map(([k, v]) => [k, { concernFlags: v.concernFlags, goalSupports: v.goalSupports }]));
    if (!product || !hasProfile) return null;
    return analyzeIngredients(product.ingredients, onboardingProfile!);
  }, [serverAnalysis, product, hasProfile]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const openIngredient = async (ing: Ingredient) => {
    if (ing.ingredient_id) { router.push(`/ingredient/${ing.ingredient_id}` as never); return; }
    setResolving(ing.name);
    try {
      const r = await api.searchIngredients(ing.name, 1);
      if (r.ingredients[0]) router.push(`/ingredient/${r.ingredients[0].id}` as never);
    } catch { /* no match */ } finally { setResolving(null); }
  };

  const onStackPress = () => {
    if (!product) return;
    if (!inStack) { sheet.current?.present(); return; }
    Alert.alert('Remove from stack?', `${product.name} will no longer count toward your stack score.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          removeFromStack(product.id);
          if (isSignedIn) syncRemoveFromStack(product.id);
        },
      },
    ]);
  };

  const onAdd = (entry: StackEntry) => {
    if (!product) return;
    const grade = (['A', 'B', 'C', 'D'] as const).find((g) => g === product.grade) ?? 'C';
    addToStack({
      id: product.id, name: product.name, brand: product.brand || '', category: product.category, grade,
      ingredients: product.ingredients.map((i) => i.name), imageUri: product.image_url,
      scannedAt: entry.loggedAt, timeOfDay: entry.timeOfDay, protocol: entry.protocol, quantity: entry.quantity,
    });
    if (isSignedIn) syncAddToStack(product.id, entry.timeOfDay, entry.loggedAt, entry.quantity);
    sheet.current?.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const askRight = <IconButton icon={Sparkles} label="Ask Elory about this product" onPress={() => router.push('/(premium)/ask-elory' as never)} />;

  // ── States ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Screen back right={askRight}>
        <View style={{ alignItems: 'center', paddingVertical: 24 }}><ActivityIndicator color={Palette.accent} /></View>
        <SkeletonCard lines={2} /><SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (error || !product) {
    return (
      <Screen back>
        <EmptyState icon={CircleSlash} title="Product unavailable" message={error ?? undefined} action="Try again" onAction={load} />
      </Screen>
    );
  }

  const ingredients = product.ingredients.filter((i) => !i.is_nutrient);
  const nutrients = product.ingredients.filter((i) => i.is_nutrient);
  const score = gradeToScore(product.grade);
  const linked = ingredients.filter((i) => i.ingredient_id).length;
  // Unmatched ingredients default to "watch" at ingestion — only library matches count as flagged.
  const isFlagged = (ing: Ingredient) => !!perIngredient?.get(ing.name)?.concernFlags.length || (ing.tag_type === 'warning' && !!ing.ingredient_id);
  const flagged = product.additives
    ? product.additives.avoid.length + product.additives.watch.length
    : ingredients.filter(isFlagged).length;
  const supports = product.bio_domains.filter((d) => d.value > 0 && !d.is_negative).sort((a, b) => b.value - a.value);
  const doses = product.doses ?? [];

  // The first card with something to measure starts open; the rest read as verdicts.
  const defaultOpen: CardKey = product.nutrition || nutrients.length ? 'nutrition' : doses.length ? 'doses' : 'ingredients';
  const open = openCards ?? new Set<CardKey>([defaultOpen]);
  const toggleCard = (key: CardKey) => setOpenCards(() => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const cardProps = (key: CardKey) => ({ open: open.has(key), onToggle: () => toggleCard(key) });

  const describe = (ing: Ingredient) => {
    const p = perIngredient?.get(ing.name);
    const flaggedHere = isFlagged(ing);
    const helps = !!p?.goalSupports.length;
    const dot = flaggedHere ? Palette.weak : helps ? Palette.strong : ing.ingredient_id ? Palette.accent : Palette.ink4;
    const note = flaggedHere ? (p?.concernFlags[0]?.label ?? ing.tag) : helps ? `Supports ${p!.goalSupports[0].label.toLowerCase()}` : undefined;
    return { dot, subtitle: [ing.concentration, note].filter(Boolean).join(' · ') || undefined };
  };

  return (
    <Screen
      back
      title={product.name}
      hideLargeTitle
      right={askRight}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={inStack ? 'In your stack' : 'Add to stack'}
            variant={inStack ? 'secondary' : 'primary'}
            icon={inStack ? <Check size={19} color={Palette.strong} strokeWidth={2.4} /> : <Plus size={19} color={Palette.onAccent} strokeWidth={2.4} />}
            onPress={onStackPress}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      {/* Identity */}
      <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center', marginTop: -8 }}>
        <ProductImage uri={product.image_url} category={product.category} size={148} radius={40} />
        <Txt variant="overline" tone="secondary" style={{ marginTop: 20 }}>{product.brand || categoryLabel(product.category)}</Txt>
        <Txt variant="title1" align="center" style={{ marginTop: 8, paddingHorizontal: 12 }}>{product.name}</Txt>
        <Txt variant="footnote" tone="secondary" style={{ marginTop: 6 }}>
          {categoryLabel(product.category)}{product.subcategory ? ` · ${product.subcategory}` : ''}
        </Txt>
      </Animated.View>

      {/* Verdict */}
      <Animated.View entering={FadeInDown.duration(500).delay(100)}>
        <Card style={{ marginTop: 24 }} padding={20}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <ScoreBadge score={score} size={72} />
            <View style={{ flex: 1 }}>
              <Txt variant="overline" tone="secondary">Elory score</Txt>
              <Txt variant="title2" color={toneColor(scoreTone(score))} style={{ marginTop: 2 }}>{scoreQualifier(score)}</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>Based on ingredient evidence and safety</Txt>
            </View>
          </View>
          <Txt variant="callout" style={{ marginTop: 16 }}>
            {product.description || (product.is_ai_generated
              ? 'This analysis was generated automatically from the label. Verify anything important with a professional.'
              : `${product.name} contains ${ingredients.length} ingredient${ingredients.length === 1 ? '' : 's'}, ${linked} of which link to our research library.`)}
          </Txt>
          <View style={styles.stats}>
            <Stat value={ingredients.length} label="Ingredients" />
            <View style={styles.statRule} />
            <Stat value={linked} label="With research" />
            <View style={styles.statRule} />
            <Stat value={flagged} label="Flagged" tone={flagged ? 'weak' : undefined} />
          </View>
          {product.is_ai_generated ? <Pill label="AI-generated analysis" icon={Sparkles} style={{ marginTop: 14 }} /> : null}
        </Card>
      </Animated.View>

      {/* Allergen */}
      {product.has_allergen_warning && product.allergen_warning ? (
        <Card variant="flat" style={[styles.alert, { marginTop: 12 }]} padding={16}>
          <AlertTriangle size={20} color={Palette.weak} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Txt variant="subheadStrong" tone="weak">Allergen warning</Txt>
            <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{product.allergen_warning}</Txt>
          </View>
        </Card>
      ) : null}

      {/* For you */}
      {personal && (personal.hasConcernFlags || personal.hasGoalSupports) ? (
        <Section title="For you" caption="Based on your health profile">
          <ListGroup>
            {personal.concerns.map((c, i) => (
              <ListRow key={`c${i}`} icon={AlertTriangle} iconTint={Palette.weak} title={c.ingredientName} subtitle={c.label} />
            ))}
            {personal.goals.map((g, i) => (
              <ListRow key={`g${i}`} icon={Target} iconTint={Palette.strong} title={g.ingredientName} subtitle={`Supports ${g.label.toLowerCase()}`} />
            ))}
          </ListGroup>
        </Section>
      ) : !hasProfile ? (
        <Card variant="sunken" style={{ marginTop: 12 }} padding={16} onPress={() => router.push('/health/edit-profile' as never)}>
          <Txt variant="subheadStrong">Personalise this analysis</Txt>
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>Add your goals and concerns to see what matters for you.</Txt>
        </Card>
      ) : null}

      {/* Stacked summary cards */}
      <View style={{ marginTop: 28, gap: 12 }}>
        {product.nutrition ? (
          <NutritionCard panel={product.nutrition} {...cardProps('nutrition')} />
        ) : nutrients.length ? (
          <LegacyNutritionCard nutrients={nutrients} {...cardProps('nutrition')} />
        ) : null}
        {doses.length ? <DoseCard doses={doses} {...cardProps('doses')} /> : null}
        <IngredientsCard
          ingredients={ingredients}
          additives={product.additives}
          describe={describe}
          resolving={resolving}
          onOpenIngredient={openIngredient}
          {...cardProps('ingredients')}
        />
        {product.processing ? <ProcessingCard processing={product.processing} {...cardProps('processing')} /> : null}
        {lab.length ? <LabCard lab={lab} {...cardProps('lab')} /> : null}
        {supports.length ? <SupportsCard supports={supports} {...cardProps('supports')} /> : null}
        {product.attribution ? <SourceCard attribution={product.attribution} {...cardProps('source')} /> : null}
      </View>

      <Button
        label="Something look wrong?"
        variant="tertiary"
        size="sm"
        fullWidth={false}
        style={{ alignSelf: 'center', marginTop: 24 }}
        onPress={() => feedback.current?.present()}
      />

      <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 12, paddingHorizontal: 24 }}>
        Educational information, not medical advice. Talk to a clinician before changing medications or treatments.
      </Txt>

      <AddToStackSheet ref={sheet} productName={product.name} productCategory={product.category} onConfirm={onAdd} />
      <FeedbackSheet ref={feedback} productId={product.id} productName={product.name} />
    </Screen>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'weak' }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Txt variant="metric" tone={tone ?? 'primary'}>{value}</Txt>
      <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  statRule: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: Palette.hairline },
  alert: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: Palette.weakSoft, borderColor: 'transparent', borderRadius: Radius.lg },
});
