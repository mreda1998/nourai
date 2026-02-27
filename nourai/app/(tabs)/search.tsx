import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
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
import { api, ProductListItem } from '@/services/api';

// Categories for filtering
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load products on mount
  useEffect(() => {
    loadProducts();
  }, []);

  // Filter products when search or category changes
  useEffect(() => {
    let filtered = products;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.brand && p.brand.toLowerCase().includes(query))
      );
    }

    setFilteredProducts(filtered);
  }, [products, searchQuery, selectedCategory]);

  const loadProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.getProducts();
      setProducts(response.products);
      setFilteredProducts(response.products);
    } catch (err) {
      console.error('Error loading products:', err);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const getGradeStyle = (grade: string) => {
    switch (grade) {
      case 'A':
        return { badge: styles.gradeBadgeA, text: styles.gradeTextA };
      case 'B':
        return { badge: styles.gradeBadgeB, text: styles.gradeTextB };
      default:
        return { badge: {}, text: {} };
    }
  };

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
          <Text style={styles.subtitle}>{products.length} products</Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <View style={[styles.searchBox, isFocused && styles.searchBoxFocused]}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products, brands..."
              placeholderTextColor={Colors.inkTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
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

        {/* Loading State */}
        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.ink} />
            <Text style={styles.loadingText}>Loading products...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !loading && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={loadProducts}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Products Grid */}
        {!loading && !error && (
          <View style={styles.productsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>
                {selectedCategory === 'all' ? 'All Products' : CATEGORIES.find(c => c.id === selectedCategory)?.label}
              </Text>
              <Text style={styles.sectionCount}>{filteredProducts.length}</Text>
            </View>

            {filteredProducts.length === 0 ? (
              <Animated.View entering={FadeIn.duration(400)} style={styles.emptyState}>
                <Text style={styles.emptyText}>No products found</Text>
                <Text style={styles.emptySubtext}>Try a different search or category</Text>
              </Animated.View>
            ) : (
              <View style={styles.productGrid}>
                {filteredProducts.map((product, index) => {
                  const gradeStyle = getGradeStyle(product.grade);
                  return (
                    <Animated.View
                      key={product.id}
                      entering={FadeInUp.duration(400).delay(index * 80)}
                      style={{ width: '47%' }}
                    >
                      <Pressable
                        style={styles.productCard}
                        onPress={() => router.push(`/product/${product.id}`)}
                      >
                        <View style={styles.productImageContainer}>
                          <View style={styles.productImagePlaceholder}>
                            <Text style={styles.productImageIcon}>📦</Text>
                          </View>
                          <View style={[styles.gradeBadge, gradeStyle.badge]}>
                            <Text style={[styles.gradeText, gradeStyle.text]}>
                              {product.grade}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.productInfo}>
                          <Text style={styles.productBrand} numberOfLines={1}>
                            {product.brand || 'Unknown'}
                          </Text>
                          <Text style={styles.productName} numberOfLines={2}>
                            {product.name}
                          </Text>
                          <View style={styles.categoryTag}>
                            <Text style={styles.categoryTagText}>
                              {product.category}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
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
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginTop: 4,
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
    marginBottom: Spacing.md,
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
  sectionCount: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
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
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  productCard: {
    width: '100%',
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  productImageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: Colors.boneDark,
    position: 'relative',
  },
  productImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productImageIcon: {
    fontSize: scale(40),
    opacity: 0.5,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  gradeBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: scale(28),
    height: scale(28),
    borderRadius: scale(4),
    borderWidth: 1,
    borderColor: Colors.ink,
    backgroundColor: Colors.boneCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeBadgeA: {
    backgroundColor: Colors.accentHill,
    borderColor: Colors.accentHill,
  },
  gradeBadgeB: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  gradeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.body,
    fontWeight: '700',
    color: Colors.ink,
  },
  gradeTextA: {
    color: Colors.bone,
  },
  gradeTextB: {
    color: Colors.bone,
  },
  productInfo: {
    padding: Spacing.md,
  },
  productBrand: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    marginBottom: 4,
  },
  productName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
    lineHeight: FontSizes.body * 1.3,
    marginBottom: Spacing.sm,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(28, 28, 28, 0.05)',
  },
  categoryTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkSecondary,
    textTransform: 'capitalize',
  },
});
