import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';

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
import { api, type ProductListItem } from '@/services/api';
import ProductListItemComponent from '@/components/ProductListItem';

const DISCOVERY_LIMIT = 50;
const SEARCH_LIMIT = 30;
const DEBOUNCE_MS = 300;

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'food', label: 'Food' },
  { id: 'cosmetic', label: 'Cosmetics' },
  { id: 'supplement', label: 'Supplements' },
  { id: 'otc', label: 'OTC' },
];

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Two separate product lists: discovery (on mount) and search results
  const [discoveryProducts, setDiscoveryProducts] = useState<ProductListItem[]>([]);
  const [searchResults, setSearchResults] = useState<ProductListItem[]>([]);
  const [totalResults, setTotalResults] = useState(0);

  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSearchMode = query.trim().length >= 2;

  // Refs for debounce timer and in-flight request cancellation
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Discovery: reload when category changes ──────────────────────────────
  useEffect(() => {
    loadDiscovery();
  }, [selectedCategory]);

  // ── Search: debounce on query or category change ─────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      // Not enough to search — cancel any in-flight request
      if (abortRef.current) abortRef.current.abort();
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      runSearch(query.trim());
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedCategory]);

  // ── Fetch discovery set ───────────────────────────────────────────────────
  const loadDiscovery = async () => {
    setLoadingDiscovery(true);
    setError(null);
    try {
      const category = selectedCategory !== 'all' ? selectedCategory : undefined;
      const res = await api.getProducts({ limit: DISCOVERY_LIMIT, category });
      setDiscoveryProducts(res.products);
    } catch {
      setError('Failed to load products');
    } finally {
      setLoadingDiscovery(false);
    }
  };

  // ── Server-side search ────────────────────────────────────────────────────
  const runSearch = async (q: string) => {
    // Cancel previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setError(null);
    try {
      const category = selectedCategory !== 'all' ? selectedCategory : undefined;
      const includeUsda = selectedCategory === 'all' || selectedCategory === 'food';

      // Run product DB search and USDA search in parallel
      const [res, usdaRes] = await Promise.all([
        api.searchProducts(q, { limit: SEARCH_LIMIT, category }),
        includeUsda ? api.searchFoods(q, 8) : Promise.resolve({ products: [], total: 0, ai_generated: false }),
      ]);

      // Merge: local DB first, then USDA results not already in local results
      const localIds = new Set(res.products.map((p) => p.id));
      const merged = [
        ...res.products,
        ...usdaRes.products.filter((p) => !localIds.has(p.id)),
      ];

      setSearchResults(merged);
      setTotalResults(merged.length);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Search failed');
    } finally {
      setSearching(false);
    }
  };

  // ── Displayed data ────────────────────────────────────────────────────────
  const displayedProducts = isSearchMode ? searchResults : discoveryProducts;
  const isLoading = isSearchMode ? searching : loadingDiscovery;

  // Section label
  const sectionLabel = isSearchMode
    ? (searching ? 'Searching…' : `${totalResults} result${totalResults !== 1 ? 's' : ''}`)
    : `Top ${discoveryProducts.length} Products`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Discover</Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products, brands…"
              placeholderTextColor={Colors.inkTertiary}
              value={query}
              onChangeText={setQuery}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')}>
                <Text style={styles.clearBtn}>✕</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Category Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.id}
              style={[
                styles.categoryPill,
                selectedCategory === cat.id && styles.categoryPillActive,
              ]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  selectedCategory === cat.id && styles.categoryPillTextActive,
                ]}
              >
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Error */}
        {error && !isLoading && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={loadDiscovery}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Product list */}
        {!error && (
          <View style={styles.productsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{sectionLabel}</Text>
              {isLoading && <ActivityIndicator size="small" color={Colors.ink} />}
            </View>

            {!isLoading && displayedProducts.length === 0 ? (
              <Animated.View entering={FadeIn.duration(400)} style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {isSearchMode ? 'No products found' : 'No products yet'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {isSearchMode ? 'Try a different term or category' : 'Try a different category'}
                </Text>
              </Animated.View>
            ) : (
              <View>
                {displayedProducts.map((product, index) => (
                  <Animated.View
                    key={product.id}
                    entering={FadeInUp.duration(300).delay(index * 40)}
                  >
                    <ProductListItemComponent
                      id={product.id}
                      name={product.name}
                      brand={product.brand}
                      category={product.category}
                      grade={product.grade}
                      onPress={() => router.push(`/product/${product.id}`)}
                    />
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: verticalScale(100) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  container: {
    paddingBottom: Layout.bottomPadding,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  searchContainer: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.lg,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: scale(52),
    gap: Spacing.sm,
  },
  searchBoxFocused: {
    borderColor: Colors.ink,
  },
  searchIcon: {
    fontSize: FontSizes.heading - 4,
    color: Colors.inkTertiary,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
  },
  clearBtn: {
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkTertiary,
    padding: 4,
  },
  categoryScroll: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  categoryPill: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(20),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.boneCard,
    marginRight: Spacing.sm,
  },
  categoryPillActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  categoryPillText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  categoryPillTextActive: {
    color: Colors.bone,
  },
  centered: {
    paddingVertical: verticalScale(60),
    alignItems: 'center',
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.accentAlert,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
  },
  retryBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  productsSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.ink,
  },
  emptyState: {
    paddingVertical: verticalScale(40),
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
});
