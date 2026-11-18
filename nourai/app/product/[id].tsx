import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { AlertTriangle, Check, CircleSlash, Plus, Sparkles, Target } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import { api, getProductWithFallback, isBarcodeIngestionResponse } from '@/services/api';
import { glanceText, statusTone, userCountry } from '@/utils/rules';
import { deviceRegion } from '@/lib/region';
import type { BarcodeIngestionResponse, Ingredient, LabObservation, Product, ServerPersonalAnalysis, VerdictPillar } from '@/services/api';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { analyzeIngredients, buildPersonalAnalysis } from '@/utils/personalization';
import { categoryLabel, toneColor } from '@/utils/grade';
import { AddToStackSheet, type StackEntry } from '@/components/AddToStackSheet';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { isCatalogueId, track } from '@/lib/insights';
import {
  Button, Card, EmptyState, IconButton, ListGroup, ListRow, Pill, ProductImage,
  Screen, Section, SkeletonCard, Txt,
} from '@/components/ui';
import {
  BenefitsCard, DoseCard, IngredientsCard, LabCard, LegacyNutritionCard, NutritionCard, ProcessingCard, SourceCard, SupportsCard,
} from '@/components/product/ProductSections';
import { VerdictCard } from '@/components/product/VerdictCard';
import { ActivesCard, GoodToKnowCard, ReactionsCard, SunCard } from '@/components/product/SkinSections';

type CardKey = 'nutrition' | 'doses' | 'ingredients' | 'processing' | 'lab' | 'benefits' | 'supports' | 'source'
  | 'sun' | 'actives' | 'reactions' | 'notes';

const PILLAR_CARD: Record<VerdictPillar['key'], CardKey> = {
  nutrition: 'nutrition', processing: 'processing', dose: 'doses', evidence: 'benefits', ingredients: 'ingredients',
  sun: 'sun', actives: 'actives', reactions: 'reactions',
};

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
  const [savingStack, setSavingStack] = useState(false);
  // A catalog product loading for the first time: what the index knows, while details arrive.
  const [pending, setPending] = useState<BarcodeIngestionResponse | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const inStack = product ? stack.some((p) => p.id === product.id) : false;

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setPending(null);
    try {
      const data = await getProductWithFallback(id, userCountry(deviceRegion()));
      if (!data) { setError('We couldn’t find this product.'); return; }
      if (isBarcodeIngestionResponse(data)) { await waitForDetails(data); return; }
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

  const waitForDetails = async (initial: BarcodeIngestionResponse) => {
    setPending(initial);
    let job = initial;
    for (let attempt = 0; attempt < 45 && alive.current; attempt += 1) {
      if (job.status === 'complete' && job.product_id) {
        router.replace(`/product/${job.product_id}?via=${via ?? 'other'}` as never);
        return;
      }
      if (job.status === 'needs_review' || job.status === 'dead') {
        setPending(null);
        setError('We couldn’t load this product’s details yet.');
        return;
      }
      await new Promise((r) => setTimeout(r, job.poll_after_ms));
      job = { ...job, ...(await api.getIngestionStatus(job.job_id)) };
    }
    if (alive.current) {
      setPending(null);
      setError('This is taking longer than usual. Try again in a moment.');
    }
  };

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
    if (ing.rule_substance_id) { router.push(`/substance/${ing.rule_substance_id}` as never); return; }
    setResolving(ing.name);
    try {
      const r = await api.searchIngredients(ing.name, 1);
      if (r.ingredients[0]) router.push(`/ingredient/${r.ingredients[0].id}` as never);
    } catch { /* no match */ } finally { setResolving(null); }
  };

  const onStackPress = () => {
    if (!product || savingStack) return;
    if (!inStack) { sheet.current?.present(); return; }
    const entries = stack.filter((p) => p.id === product.id);
    // Several saved entries (different times or amounts): choose which one on the stack tab.
    if (entries.length !== 1 || !entries[0].stackEntryId) { router.push('/(tabs)/stack' as never); return; }
    const entryId = entries[0].stackEntryId;
    Alert.alert('Remove from stack?', `${product.name} will be removed from your stack.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setSavingStack(true);
          try { await removeFromStack(entryId); }
          catch (e) { Alert.alert('Product not removed', e instanceof Error ? e.message : 'Please try again.'); }
          finally { setSavingStack(false); }
        },
      },
    ]);
  };

  // The stack only changes once the account (or the device, for guests) has saved it.
  const onAdd = async (entry: StackEntry) => {
    if (!product || savingStack) return;
    const grade = (['A', 'B', 'C', 'D'] as const).find((g) => g === product.grade) ?? 'C';
    setSavingStack(true);
    try {
      await addToStack({
        id: product.id, name: product.name, brand: product.brand || '', category: product.category, grade,
        ingredients: product.ingredients.map((i) => i.name), imageUri: product.image_url,
        scannedAt: entry.loggedAt, timeOfDay: entry.timeOfDay, protocol: entry.protocol, quantity: entry.quantity,
      });
      sheet.current?.dismiss();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Product not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally { setSavingStack(false); }
  };

  const askRight = <IconButton icon={Sparkles} label="Ask Elory about this product" onPress={() => router.push('/(premium)/ask-elory' as never)} />;

  // ── States ──────────────────────────────────────────────────────────────────
  if (pending) {
    const preview = pending.preview;
    return (
      <Screen back>
        <View style={{ alignItems: 'center', marginTop: -8 }}>
          <ProductImage uri={preview?.image_url} category={preview?.category} size={148} radius={40} />
          {preview?.brand ? <Txt variant="overline" tone="secondary" style={{ marginTop: 20 }}>{preview.brand}</Txt> : null}
          <Txt variant="title1" align="center" style={{ marginTop: 8, paddingHorizontal: 12 }}>{preview?.name ?? 'Loading product'}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <ActivityIndicator color={Palette.accent} />
            <Txt variant="footnote" tone="secondary">Loading details…</Txt>
          </View>
        </View>
        <SkeletonCard lines={2} /><SkeletonCard lines={4} />
      </Screen>
    );
  }
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
  const linked = ingredients.filter((i) => i.ingredient_id).length;
  // A flag is a personal concern or a risk the research supports — never an unknown ingredient.
  const isFlagged = (ing: Ingredient) => !!perIngredient?.get(ing.name)?.concernFlags.length
    || (ing.standing ? ing.standing === 'risk' : ing.tag_type === 'warning' && !!ing.ingredient_id);
  const backed = ingredients.filter((i) => i.benefit_label && i.ingredient_id);
  const flagged = product.additives
    ? product.additives.avoid.length + product.additives.watch.length
    : ingredients.filter(isFlagged).length;
  const supports = product.bio_domains.filter((d) => d.value > 0 && !d.is_negative).sort((a, b) => b.value - a.value);
  const doses = product.doses ?? [];
  const skin = product.skin ?? null;
  const pillarFor = (key: VerdictPillar['key']) => product.verdict?.pillars.find((p) => p.key === key);

  // The first card with something to measure starts open; the rest read as verdicts.
  const defaultOpen: CardKey = product.nutrition || nutrients.length ? 'nutrition' : doses.length ? 'doses'
    : skin?.sun ? 'sun' : skin?.actives.length ? 'actives' : 'ingredients';
  const open = openCards ?? new Set<CardKey>([defaultOpen]);
  const toggleCard = (key: CardKey) => setOpenCards(() => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const cardProps = (key: CardKey) => ({ open: open.has(key), onToggle: () => toggleCard(key) });
  // A check in the verdict opens the card that shows its working.
  const openPillar = (pillar: VerdictPillar) => {
    Haptics.selectionAsync();
    setOpenCards(new Set<CardKey>([...open, PILLAR_CARD[pillar.key]]));
  };

  const describe = (ing: Ingredient) => {
    const p = perIngredient?.get(ing.name);
    const flaggedHere = isFlagged(ing);
    const helps = !!p?.goalSupports.length;
    const rule = ing.rule_note;
    const reviewed = ing.standing ? ing.standing !== 'unreviewed' : !!ing.ingredient_id;
    const dot = flaggedHere ? Palette.weak
      : rule ? toneColor(statusTone(rule.status))
        : ing.standing === 'caution' ? Palette.moderate
          : helps || ing.benefit_tone === 'good' ? Palette.strong
            : reviewed ? Palette.accent : Palette.ink4;
    // One line of "why": your own concern first, then what the research says.
    const note = p?.concernFlags[0]?.label
      ?? (ing.standing === 'risk' || ing.standing === 'caution' ? [ing.standing_label, ing.standing_note].filter(Boolean).join(': ') : undefined)
      ?? (helps ? `Supports ${p!.goalSupports[0].label.toLowerCase()}` : undefined)
      ?? (ing.benefit_label && ing.benefit_tone !== 'weak' ? [ing.benefit_label, ing.benefit_note].filter(Boolean).join(': ') : undefined)
      ?? (flaggedHere ? ing.tag : undefined);
    const law = rule ? `${rule.text}${rule.more ? ` +${rule.more} more` : ''}` : undefined;
    // Cosmetics: what the ingredient does in the formula, when there's nothing more pressing to say.
    const role = !note && !law ? ing.role ?? undefined : undefined;
    return { dot, subtitle: [ing.concentration, note, law, role].filter(Boolean).join(' · ') || undefined };
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
            loading={savingStack}
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
      <Animated.View entering={FadeInDown.duration(500).delay(100)} style={{ marginTop: 24 }}>
        {product.verdict ? (
          <VerdictCard verdict={product.verdict} onOpenPillar={openPillar} />
        ) : (
          // Older servers send no verdict: say what we know about the label instead.
          <Card padding={20}>
            <Txt variant="overline" tone="secondary">At a glance</Txt>
            <Txt variant="title2" style={{ marginTop: 6 }}>{glance(ingredients.length, linked, flagged)}</Txt>
            <View style={styles.stats}>
              <Stat value={ingredients.length} label="Ingredients" />
              <View style={styles.statRule} />
              <Stat value={linked} label="With research" />
              <View style={styles.statRule} />
              <Stat value={flagged} label="Flagged" tone={flagged ? 'weak' : undefined} />
            </View>
          </Card>
        )}
        {product.description ? (
          <Txt variant="callout" tone="secondary" style={{ marginTop: 16, paddingHorizontal: 4 }}>{product.description}</Txt>
        ) : null}
        {product.verdict && glanceText(product.rules_glance) ? (
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 12, paddingHorizontal: 4 }}>{glanceText(product.rules_glance)}</Txt>
        ) : null}
        {product.is_ai_generated ? <Pill label="AI-generated analysis" icon={Sparkles} style={{ marginTop: 14 }} /> : null}
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
          <NutritionCard panel={product.nutrition} pillar={product.verdict?.pillars.find((p) => p.key === 'nutrition')} {...cardProps('nutrition')} />
        ) : nutrients.length ? (
          <LegacyNutritionCard nutrients={nutrients} {...cardProps('nutrition')} />
        ) : null}
        {doses.length ? <DoseCard doses={doses} {...cardProps('doses')} /> : null}
        {skin?.sun ? <SunCard sun={skin.sun} {...cardProps('sun')} /> : null}
        {skin?.actives.length ? <ActivesCard skin={skin} pillar={pillarFor('actives')} {...cardProps('actives')} /> : null}
        {skin ? <ReactionsCard skin={skin} pillar={pillarFor('reactions')} {...cardProps('reactions')} /> : null}
        <IngredientsCard
          ingredients={ingredients}
          additives={product.additives}
          describe={describe}
          resolving={resolving}
          onOpenIngredient={openIngredient}
          ruleExtras={product.rule_extras}
          onePercentIndex={skin?.one_percent_index}
          skinChecked={!!skin}
          pillar={pillarFor('ingredients') ?? (skin
            ? { key: 'ingredients', label: 'Ingredients', tone: 'neutral', verdict: `${ingredients.length} listed` }
            : undefined)}
          {...cardProps('ingredients')}
        />
        {product.processing ? <ProcessingCard processing={product.processing} {...cardProps('processing')} /> : null}
        {skin?.notes.length ? <GoodToKnowCard skin={skin} {...cardProps('notes')} /> : null}
        {lab.length ? <LabCard lab={lab} {...cardProps('lab')} /> : null}
        {backed.length ? <BenefitsCard ingredients={backed} {...cardProps('benefits')} /> : null}
        {!product.verdict && supports.length ? <SupportsCard supports={supports} {...cardProps('supports')} /> : null}
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

/** The verdict line: what we know about the label, never a made-up rating. */
function glance(count: number, researched: number, flagged: number): string {
  if (!count) return 'No ingredient list yet';
  if (flagged) return `${flagged} ingredient${flagged === 1 ? '' : 's'} worth a look`;
  if (researched) return `${researched} of ${count} ingredients have research`;
  return 'Not yet reviewed by our research team';
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
