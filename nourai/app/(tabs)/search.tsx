import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Apple, Droplet, FlaskConical, History, Pill as PillIcon, SearchX } from 'lucide-react-native';
import { api, IngredientListItem, ProductListItem, SearchHistoryItem } from '@/services/api';
import { deviceRegion } from '@/lib/region';
import { track } from '@/lib/insights';
import { Palette, Radius } from '@/constants/theme';
import { JOURNAL } from '@/constants/journal';
import { categoryLabel, evidenceStrength } from '@/utils/grade';
import {
  Button, Card, Chip, EmptyState, EvidenceMeter, ListGroup, ListRow, Pill, PressableScale, ProductImage,
  Screen, SearchField, Section, SegmentedControl, Txt,
} from '@/components/ui';

type Mode = 'products' | 'ingredients';

const CATEGORIES = [
  { key: 'supplement', label: 'Supplements', Icon: PillIcon, colors: ['#EFE3CC', '#E2CFA9'] as const },
  { key: 'cosmetic', label: 'Skincare', Icon: Droplet, colors: ['#E2ECE6', '#C9DDD2'] as const },
  { key: 'food', label: 'Food', Icon: Apple, colors: ['#F2E4D8', '#E6CDB6'] as const },
  { key: 'otc', label: 'Over the counter', Icon: FlaskConical, colors: ['#E4E6EE', '#CFD4E2'] as const },
];

export default function DiscoverScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [mode, setMode] = useState<Mode>('products');
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState(params.q ?? '');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [ingredients, setIngredients] = useState<IngredientListItem[]>([]);
  const [popular, setPopular] = useState<IngredientListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<SearchHistoryItem[]>([]);

  useEffect(() => { if (params.q) setQuery(params.q); }, [params.q]);

  useEffect(() => {
    api.getSearchHistory({ limit: 6 }).then((v) => setRecent(v.items)).catch(() => {});
    // Seed "popular" from real library entries rather than hardcoded ids.
    Promise.all(['creatine', 'magnesium', 'niacinamide', 'omega'].map((q) => api.searchIngredients(q, 1).then((r) => r.ingredients[0]).catch(() => undefined)))
      .then((list) => setPopular(list.filter((x): x is IngredientListItem => !!x)));
  }, []);

  const q = query.trim();
  const searching = q.length >= 2 || !!category;

  useEffect(() => {
    if (!searching) { setProducts([]); setIngredients([]); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        if (mode === 'ingredients' && q.length >= 2) {
          const v = await api.searchIngredients(q, 30);
          if (alive) setIngredients(v.ingredients);
          api.addToSearchHistory(q, 'ingredient').catch(() => {});
        } else if (q.length >= 2) {
          const v = await api.searchProducts(q, { limit: 30, category: category ?? undefined, country: deviceRegion() });
          if (alive) setProducts(v.products);
          api.addToSearchHistory(q, 'product').catch(() => {});
        } else if (category) {
          const v = await api.getProducts({ limit: 30, category });
          if (alive) setProducts(v.products);
        }
      } catch {
        if (alive) { setProducts([]); setIngredients([]); }
      } finally {
        if (alive) setLoading(false);
      }
    }, q ? 280 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [mode, q, category, searching]);

  const results = mode === 'ingredients' ? ingredients.length : products.length;
  const activeCategory = CATEGORIES.find((c) => c.key === category);

  // Record a search once the person stops typing, so "cer" → "cerave" is one event.
  useEffect(() => {
    if (q.length < 2 || loading) return;
    const t = setTimeout(() => track('search', { query: q, meta: { mode, results, category } }), 1200);
    return () => clearTimeout(t);
  }, [q, loading, results, mode, category]);

  return (
    <Screen tabbed title="Discover">
      <SearchField
        value={query}
        onChangeText={setQuery}
        onClear={() => setQuery('')}
        onScan={() => router.push('/(tabs)/scan' as never)}
        placeholder={mode === 'products' ? 'Products and brands' : 'Ingredients'}
      />
      <SegmentedControl
        style={{ marginTop: 12 }}
        options={[{ key: 'products', label: 'Products' }, { key: 'ingredients', label: 'Ingredients' }]}
        value={mode}
        onChange={(m) => { setMode(m); if (m === 'ingredients') setCategory(null); }}
      />

      {activeCategory && mode === 'products' ? (
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Chip label={`${activeCategory.label}  ✕`} selected onPress={() => setCategory(null)} />
        </View>
      ) : null}

      {searching ? (
        <View style={{ marginTop: 20 }}>
          {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 24 }} /> : results === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No matches"
              message={q ? `Nothing found for “${q}”. Try a brand name, or scan the barcode.` : 'Nothing in this category yet.'}
              action="Scan instead"
              onAction={() => router.push('/(tabs)/scan' as never)}
              secondary={q && mode === 'products' ? (
                <Button
                  label="Can’t find it? Help add it"
                  variant="tertiary"
                  size="md"
                  fullWidth={false}
                  style={{ marginTop: 6 }}
                  onPress={() => router.push({ pathname: '/submit-product', params: { name: q } } as never)}
                />
              ) : undefined}
            />
          ) : mode === 'products' ? (
            <Animated.View entering={FadeIn}>
              <Txt variant="footnote" tone="secondary" style={{ marginBottom: 10 }}>{products.length} result{products.length === 1 ? '' : 's'}</Txt>
              <ListGroup>
                {products.map((p) => (
                  <ListRow
                    key={p.id}
                    leading={<ProductImage uri={p.image_url} category={p.category} size={48} />}
                    title={p.name}
                    subtitle={p.brand || categoryLabel(p.category)}
                    onPress={() => router.push(`/product/${p.id}?via=search` as never)}
                  />
                ))}
              </ListGroup>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn}>
              <ListGroup>
                {ingredients.map((i) => <IngredientRow key={i.id} item={i} />)}
              </ListGroup>
            </Animated.View>
          )}
        </View>
      ) : (
        <>
          {recent.length ? (
            <Section title="Recent">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
                {recent.map((r) => (
                  <Chip key={r.id} icon={History} label={r.query} onPress={() => { setMode(r.result_type === 'ingredient' ? 'ingredients' : 'products'); setQuery(r.query); }} />
                ))}
              </ScrollView>
            </Section>
          ) : null}

          {mode === 'products' ? (
            <Section title="Browse">
              <View style={styles.grid}>
                {CATEGORIES.map(({ key, label, Icon, colors }) => (
                  <PressableScale key={key} onPress={() => setCategory(key)} style={styles.tile} accessibilityLabel={`Browse ${label}`}>
                    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    <Icon size={26} color="rgba(14,31,30,0.7)" strokeWidth={1.5} />
                    <Txt variant="headline" style={{ marginTop: 'auto' }}>{label}</Txt>
                  </PressableScale>
                ))}
              </View>
            </Section>
          ) : null}

          {popular.length ? (
            <Section title="Popular ingredients" caption="Tap to see what the evidence really says">
              <ListGroup>{popular.map((i) => <IngredientRow key={i.id} item={i} />)}</ListGroup>
            </Section>
          ) : null}

          <Section title="Journal" action="All stories" onAction={() => router.push('/(tabs)/journal' as never)}>
            <View style={{ gap: 12 }}>
              {JOURNAL.slice(0, 2).map((s) => (
                <Card key={s.id} padding={18} onPress={s.published ? () => router.push(`/newsletter/${s.id}` as never) : undefined} accessibilityLabel={s.title}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Txt variant="overline" tone="accent">{s.kicker}</Txt>
                    {s.published ? <Txt variant="caption" tone="tertiary">{s.minutes} min read</Txt> : <Pill label="Coming soon" />}
                  </View>
                  <Txt variant="title2" style={{ marginTop: 8 }}>{s.title}</Txt>
                  <Txt variant="footnote" tone="secondary" style={{ marginTop: 4 }}>{s.dek}</Txt>
                </Card>
              ))}
            </View>
          </Section>
        </>
      )}
    </Screen>
  );
}

function IngredientRow({ item }: { item: IngredientListItem }) {
  return (
    <ListRow
      title={item.canonical_name}
      subtitle={item.category}
      trailing={<EvidenceMeter strength={evidenceStrength(item.evidence_level)} showLabel={false} width={52} />}
      onPress={() => router.push(`/ingredient/${item.id}` as never)}
    />
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.5%', height: 116, borderRadius: Radius.xl, borderCurve: 'continuous', overflow: 'hidden', padding: 16 },
});
