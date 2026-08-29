import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { api, IngredientListItem, ProductListItem, SearchHistoryItem } from '@/services/api';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, FilterPills, ProductThumb, ScreenHeader, SectionHead } from '@/components/elory';

type Mode = 'products' | 'ingredients';
const modes = [{ key: 'products', label: 'Products' }, { key: 'ingredients', label: 'Ingredients' }];
const categories = [{ key: 'all', label: 'All' }, { key: 'supplement', label: 'Supplements' }, { key: 'cosmetic', label: 'Skincare' }, { key: 'food', label: 'Food' }];
const popularIngredients = [
  { id: 'niacinamide', name: 'Niacinamide', category: 'Skin barrier · Vitamin B3', evidence: 'Established' },
  { id: 'creatine', name: 'Creatine monohydrate', category: 'Performance · Amino acid', evidence: 'Established' },
  { id: 'magnesium', name: 'Magnesium glycinate', category: 'Sleep · Mineral', evidence: 'Strong' },
  { id: 'ashwagandha', name: 'Ashwagandha', category: 'Stress · Botanical', evidence: 'Emerging' },
];

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [mode, setMode] = useState<Mode>('products');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState(params.q ?? '');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [ingredients, setIngredients] = useState<IngredientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentSearches, setRecentSearches] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    let alive = true;
    api.getSearchHistory({ limit: 5 }).then((value) => { if (alive) setRecentSearches(value.items); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (mode === 'ingredients') {
          if (query.trim().length >= 2) {
            const value = await api.searchIngredients(query.trim(), 30);
            if (alive) setIngredients(value.ingredients);
            api.addToSearchHistory(query.trim(), 'ingredient').catch(() => {});
          } else if (alive) setIngredients([]);
        } else if (query.trim().length >= 2) {
          const value = await api.searchProducts(query.trim(), { limit: 30, category: category === 'all' ? undefined : category });
          if (alive) setProducts(value.products);
          api.addToSearchHistory(query.trim(), 'product').catch(() => {});
        } else {
          const value = await api.getProducts({ limit: 12, category: category === 'all' ? undefined : category });
          if (alive) setProducts(value.products);
        }
      } catch { /* discovery stays gracefully empty */ } finally { if (alive) setLoading(false); }
    }, query ? 280 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [mode, query, category]);

  const visibleIngredients = useMemo(() => query.trim().length >= 2 ? ingredients.map((i) => ({ id: i.id, name: i.canonical_name, category: i.category, evidence: 'Evidence reviewed' })) : popularIngredients, [ingredients, query]);

  return (
    <EloryScreen header={<ScreenHeader title="Explore" />}>
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Search products, brands or ingredients" placeholderTextColor={Colors.inkTertiary} style={styles.input} />
        {query ? <Pressable onPress={() => setQuery('')}><Text style={styles.clear}>×</Text></Pressable> : null}
      </View>
      <FilterPills options={modes} selected={mode} onSelect={(value) => setMode(value as Mode)} />
      {mode === 'products' ? <View style={{ marginTop: 12 }}><FilterPills options={categories} selected={category} onSelect={setCategory} /></View> : null}
      {loading ? <ActivityIndicator color={Colors.accent} style={{ marginTop: 30 }} /> : null}

      {!loading && !query && recentSearches.length > 0 ? (
        <View style={{ marginTop: 25 }}>
          <SectionHead label="Recent searches" right="See all" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {recentSearches.map((item) => <RecentSearchCard key={item.id} item={item} onPress={() => setQuery(item.query)} />)}
          </ScrollView>
        </View>
      ) : null}

      {!loading && mode === 'products' ? (
        <>
          <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{query ? 'Search results' : 'Recently viewed'}</Text><Text style={styles.sectionLink}>{products.length} products</Text></View>
          {!query && products.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
              {products.slice(0, 6).map((product) => <ProductCard key={product.id} item={product} />)}
            </ScrollView>
          ) : products.map((product) => <ProductRow key={product.id} item={product} />)}

          {!query ? <>
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Popular ingredients</Text><Text style={styles.sectionLink}>See all</Text></View>
            {popularIngredients.slice(0, 3).map((item, index) => <IngredientRow key={item.id} item={item} index={index} />)}
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Trending now</Text></View>
            <View style={styles.trending}><Pressable style={styles.trendingCard} onPress={() => router.push('/newsletter/creatine' as never)}><Text style={styles.trendingKicker}>Research brief</Text><Text style={styles.trendingTitle}>Creatine beyond muscle</Text><Text style={styles.trendingMeta}>7 min read</Text></Pressable><Pressable style={[styles.trendingCard, { backgroundColor: '#E6DDCF' }]} onPress={() => router.push('/newsletter/circadian' as never)}><Text style={styles.trendingKicker}>Protocol</Text><Text style={styles.trendingTitle}>Reset your sleep rhythm</Text><Text style={styles.trendingMeta}>6 min read</Text></Pressable></View>
          </> : null}
        </>
      ) : null}

      {!loading && mode === 'ingredients' ? <View style={{ marginTop: 8 }}>{visibleIngredients.map((item, index) => <IngredientRow key={item.id} item={item} index={index} />)}</View> : null}
    </EloryScreen>
  );
}

function RecentSearchCard({ item, onPress }: { item: SearchHistoryItem; onPress: () => void }) {
  return (
    <Pressable style={styles.recentCard} onPress={onPress}>
      <ProductThumb size={40} letter={item.query.slice(0, 1).toUpperCase()} color={item.result_type === 'ingredient' ? 'sage' : 'default'} />
      <Text style={styles.recentName} numberOfLines={1}>{item.query}</Text>
      <Text style={styles.recentMeta} numberOfLines={1}>{item.result_type === 'ingredient' ? 'Ingredient' : 'Product'}</Text>
    </Pressable>
  );
}

function ProductCard({ item }: { item: ProductListItem }) {
  return <Pressable style={styles.card} onPress={() => router.push(`/product/${item.id}` as never)}><ProductThumb size={67} imageUri={item.image_url} letter={item.name.slice(0, 1)} /><Text style={styles.cardBrand}>{item.brand || item.category}</Text><Text style={styles.cardName} numberOfLines={2}>{item.name}</Text><View style={styles.cardScore}><Text style={styles.cardScoreText}>{item.grade === 'A' ? 91 : item.grade === 'B' ? 82 : 70}</Text></View></Pressable>;
}

function ProductRow({ item }: { item: ProductListItem }) {
  return <Pressable style={styles.productRow} onPress={() => router.push(`/product/${item.id}` as never)}><ProductThumb size={43} imageUri={item.image_url} letter={item.name.slice(0, 1)} /><View style={{ flex: 1 }}><Text style={styles.cardBrand}>{item.brand || item.category}</Text><Text style={styles.rowName}>{item.name}</Text></View><View style={styles.rowScore}><Text style={styles.cardScoreText}>{item.grade === 'A' ? 91 : item.grade === 'B' ? 82 : 70}</Text></View></Pressable>;
}

function IngredientRow({ item, index }: { item: { id: string; name: string; category: string; evidence: string }; index: number }) {
  return <Pressable style={styles.ingredientRow} onPress={() => router.push(`/ingredient/${item.id}` as never)}><View style={styles.molecule}><Svg width={40} height={40} viewBox="0 0 40 40" fill="none" stroke={Colors.accent} strokeWidth={1}><Circle cx={10 + index * 2} cy={13} r={3} /><Circle cx={28} cy={11 + index} r={3} /><Circle cx={20} cy={28} r={3} /><Path d="M13 14l12-2M12 16l7 10M26 14l-5 11" /></Svg></View><View style={{ flex: 1 }}><Text style={styles.ingredientName}>{item.name}</Text><Text style={styles.ingredientMeta}>{item.category}</Text></View><View><View style={styles.dots}>{[0,1,2,3,4].map((dot) => <View key={dot} style={[styles.dot, dot > 3 && { backgroundColor: 'transparent' }]} />)}</View><Text style={styles.evidence}>{item.evidence}</Text></View></Pressable>;
}

const styles = StyleSheet.create({
  searchBox: { height: 49, borderRadius: Radius.pill, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 9, marginBottom: 12 }, searchIcon: { color: Colors.inkSecondary, fontSize: 20 }, input: { flex: 1, fontFamily: Fonts.sans, fontSize: 11, color: Colors.ink }, clear: { color: Colors.inkSecondary, fontSize: 19 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 25, marginBottom: 10 }, sectionTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 21 }, sectionLink: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 9 }, cards: { gap: 10, paddingRight: 20 },
  recentCard: { width: 110, borderRadius: Radius.md, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 10, gap: 6 }, recentName: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 11 }, recentMeta: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8.5 }, card: { width: 135, height: 203, borderRadius: Radius.md, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 11, alignItems: 'center' }, cardBrand: { alignSelf: 'stretch', fontFamily: Fonts.sansSemiBold, color: Colors.inkSecondary, textTransform: 'uppercase', fontSize: 7.5, letterSpacing: .65, marginTop: 6 }, cardName: { alignSelf: 'stretch', fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 15, lineHeight: 17, marginTop: 3 }, cardScore: { position: 'absolute', right: 9, top: 9, width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceCard, borderWidth: 2, borderColor: Colors.sage, alignItems: 'center', justifyContent: 'center' }, cardScoreText: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 11 },
  productRow: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', gap: 11 }, rowName: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 12, marginTop: 2 }, rowScore: { width: 33, height: 33, borderRadius: 17, borderWidth: 2, borderColor: Colors.sage, alignItems: 'center', justifyContent: 'center' },
  ingredientRow: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', gap: 11 }, molecule: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }, ingredientName: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 16 }, ingredientMeta: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8.5, marginTop: 2 }, dots: { flexDirection: 'row', justifyContent: 'flex-end', gap: 2.5 }, dot: { width: 6, height: 6, borderRadius: 3, borderWidth: .7, borderColor: Colors.accent, backgroundColor: Colors.accent }, evidence: { fontFamily: Fonts.sans, fontSize: 7.5, color: Colors.inkSecondary, marginTop: 4 },
  trending: { flexDirection: 'row', gap: 10 }, trendingCard: { flex: 1, minHeight: 134, borderRadius: Radius.md, backgroundColor: '#D8E2DC', padding: 13, justifyContent: 'flex-end' }, trendingKicker: { fontFamily: Fonts.sansSemiBold, fontSize: 7.5, textTransform: 'uppercase', letterSpacing: .7, color: Colors.inkSecondary }, trendingTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 17, lineHeight: 18, marginTop: 5 }, trendingMeta: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8, marginTop: 8 },
});
