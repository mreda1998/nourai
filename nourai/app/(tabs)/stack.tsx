import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { Swipeable } from 'react-native-gesture-handler';

import {
  Colors,
  Fonts,
  FontSizes,
  Radius,
  scale,
  Spacing,
  verticalScale,
  Layout,
} from '@/constants/theme';
import {
  DOMAINS,
  DOMAIN_SLUGS,
  GOAL_LABELS,
  computeRadarScores,
  type Domain,
} from '@/constants/domains';
import { useAppState, type Product } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { StackAssistant } from '@/components/StackAssistant';
import { MealInputSheet } from '@/components/MealInputSheet';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';
import type { RecognizedFood, StackEntry } from '@/services/api';
import {
  Eyebrow,
  SerifH,
  EvidenceSpectrum,
  SectionHead,
  ProductThumb,
  Tag,
} from '@/components/elory';

// ─── Category → time slot ─────────────────────────────────────────────────────

const CATEGORY_SLOT: Record<string, string> = {
  food:       'Nutrition',
  supplement: 'Supplements',
  cosmetic:   'Topical',
  otc:        'Treatment',
};

// ─── ProductThumb color mapping ───────────────────────────────────────────────

function thumbColor(category: string): 'sand' | 'sage' | 'dark' | 'default' {
  if (category === 'supplement') return 'sand';
  if (category === 'cosmetic') return 'sage';
  if (category === 'otc') return 'dark';
  return 'default';
}

// ─── Swipeable product row (Elory style) ──────────────────────────────────────

function StackProductRow({
  product,
  onPress,
  onRemove,
}: {
  product: Product;
  onPress: () => void;
  onRemove: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const renderRightAction = () => (
    <Pressable
      style={styles.deleteAction}
      onPress={() => {
        swipeRef.current?.close();
        onRemove();
      }}
    >
      <Text style={styles.deleteActionText}>Remove</Text>
    </Pressable>
  );

  const letter = product.name.charAt(0).toUpperCase();
  const color = thumbColor(product.category);

  // Derive a coarse evidence strength from grade
  const strengthFromGrade: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
  const strength = strengthFromGrade[product.grade ?? 'C'] ?? 2;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightAction}
      rightThreshold={60}
      overshootRight={false}
    >
      <Pressable onPress={onPress} style={styles.productRow}>
        <ProductThumb color={color} letter={letter} size={54} />
        <View style={styles.productRowInfo}>
          <Eyebrow style={{ marginBottom: 3 }}>
            {product.brand ?? product.category}
          </Eyebrow>
          <Text style={styles.productRowName}>{product.name}</Text>
          <View style={styles.productRowMeta}>
            <EvidenceSpectrum strength={strength} max={4} />
            {product.grade === 'D' && (
              <Tag tone="alert" style={{ marginLeft: 8 }}>Flag</Tag>
            )}
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Swipeable>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function StackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stack, meals, removeFromStack, addMeal } = useAppState();
  const { isSignedIn, onboardingProfile } = useAuth();

  const [chatVisible, setChatVisible] = useState(false);
  const [mealSheetVisible, setMealSheetVisible] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Server-synced stack entries (signed-in only)
  const [serverEntries, setServerEntries] = useState<StackEntry[]>([]);
  const [entryIdMap, setEntryIdMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    const loadServerStack = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      api.getStack(session.access_token)
        .then((entries) => {
          if (cancelled) return;
          setServerEntries(entries);
          setEntryIdMap(Object.fromEntries(entries.map((e) => [e.product_id, e.id])));
        })
        .catch(() => {});
    };
    loadServerStack();
    return () => { cancelled = true; };
  }, [isSignedIn]);

  const radarScores = useMemo(() => computeRadarScores([...stack, ...meals]), [stack, meals]);

  const handleRemoveFromStack = async (productId: string) => {
    removeFromStack(productId);
    if (isSignedIn) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const entryId = entryIdMap[productId];
      if (entryId) {
        try {
          await api.removeFromStack(session.access_token, entryId);
        } catch {}
      }
      api.getStack(session.access_token)
        .then((entries) => {
          setServerEntries(entries);
          setEntryIdMap(Object.fromEntries(entries.map((e) => [e.product_id, e.id])));
        })
        .catch(() => {});
    }
  };

  const handleMealsConfirm = (foods: RecognizedFood[]) => {
    foods.forEach((food) => {
      addMeal({
        id: `meal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: food.name,
        brand: food.estimated_amount ?? '',
        category: 'food',
        grade: food.confidence >= 0.7 ? 'B' : 'C',
        ingredients: [],
        scannedAt: new Date(),
      });
    });
    setMealSheetVisible(false);
  };

  const goals = onboardingProfile?.goals ?? [];

  // Group stack by slot
  const slotGroups = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    const filteredStack = activeFilter === 'all'
      ? stack
      : stack.filter((p) => p.category === activeFilter);
    filteredStack.forEach((p) => {
      const slot = CATEGORY_SLOT[p.category] ?? 'Other';
      if (!groups[slot]) groups[slot] = [];
      groups[slot].push(p);
    });
    return Object.entries(groups);
  }, [stack, activeFilter]);

  // Overlap detection
  const overlapIngredients = useMemo(() => {
    const counts: Record<string, number> = {};
    stack.forEach((p) => {
      p.ingredients.forEach((ing) => {
        const key = ing.toLowerCase().trim();
        counts[key] = (counts[key] ?? 0) + 1;
      });
    });
    return Object.entries(counts)
      .filter(([, c]) => c > 1)
      .map(([name]) => name)
      .slice(0, 4);
  }, [stack]);

  // Stats for subtitle
  const activeCount = stack.length;
  const synergyCount = Math.max(0, stack.length - 1);
  const flagCount = stack.filter((p) => p.grade === 'D').length;

  // Filter categories
  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'supplement', label: 'Supplements' },
    { id: 'cosmetic', label: 'Topical' },
    { id: 'food', label: 'Food' },
    { id: 'otc', label: 'Meds' },
  ];

  if (stack.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={[styles.emptyContainer, { paddingTop: insets.top + Spacing.xxl }]}>
          <Animated.View entering={FadeIn.duration(600)}>
            <SerifH size={32} style={{ textAlign: 'center', marginBottom: Spacing.md }}>
              Your stack is empty
            </SerifH>
            <Text style={styles.emptyBody}>
              Scan a product to start building your regimen.
            </Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push('/(tabs)/scan')}>
              <Text style={styles.emptyBtnText}>Start Scanning</Text>
            </Pressable>
          </Animated.View>
        </View>

        <StackAssistant
          visible={chatVisible}
          onClose={() => setChatVisible(false)}
          stack={stack}
          radarScores={radarScores}
          goals={goals}
        />
        <MealInputSheet
          visible={mealSheetVisible}
          onClose={() => setMealSheetVisible(false)}
          onConfirm={handleMealsConfirm}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: verticalScale(120) }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + scale(24) }]}>
          <Eyebrow style={{ marginBottom: 8 }}>Your regimen</Eyebrow>
          <SerifH size={40} style={{ marginBottom: 6 }}>My Stack</SerifH>
          <Text style={styles.headerSubtitle}>
            {activeCount} active · {synergyCount} synergies · {flagCount} flags
          </Text>
          {/* Header action buttons */}
          <View style={styles.headerActions}>
            <Pressable style={styles.ghostBtn} onPress={() => setMealSheetVisible(true)}>
              <Text style={styles.ghostBtnText}>+ Log Meal</Text>
            </Pressable>
            <Pressable style={styles.solidBtn} onPress={() => setChatVisible(true)}>
              <Text style={styles.solidBtnIcon}>✦</Text>
              <Text style={styles.solidBtnText}>Ask AI</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Synergy card ────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.synergySection}>
          <Pressable
            onPress={() => router.push('/conflict-map')}
            style={styles.synergyCard}
          >
            <Svg width={72} height={72} viewBox="0 0 72 72">
              <Circle cx={36} cy={20} r={4} fill={Colors.accent} />
              <Circle cx={20} cy={48} r={4} fill={Colors.sage} />
              <Circle cx={52} cy={48} r={4} fill={Colors.sand} />
              <Circle cx={36} cy={60} r={3} fill={Colors.alert} />
              <Line x1={36} y1={20} x2={20} y2={48} stroke={Colors.accent} strokeWidth={1} />
              <Line x1={36} y1={20} x2={52} y2={48} stroke={Colors.accent} strokeWidth={1} />
              <Line
                x1={20} y1={48} x2={52} y2={48}
                stroke={Colors.sage} strokeWidth={1}
                strokeDasharray="2 2"
              />
            </Svg>
            <View style={{ flex: 1 }}>
              <Eyebrow style={{ marginBottom: 4 }}>Stack synergy map</Eyebrow>
              <Text style={styles.synergyBody}>
                Tap to view interactions between your supplements.
              </Text>
            </View>
            <Text style={styles.synergyChevron}>›</Text>
          </Pressable>
        </Animated.View>

        {/* ── Filter chips ─────────────────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(400).delay(60)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((f) => {
              const isActive = activeFilter === f.id;
              return (
                <Pressable
                  key={f.id}
                  style={[styles.filterChip, isActive && styles.filterChipActive]}
                  onPress={() => setActiveFilter(f.id)}
                >
                  <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* ── Overlap warning ───────────────────────────────────────────────── */}
        {overlapIngredients.length > 0 && (
          <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.section}>
            <SectionHead label="Overlap Detected" />
            <View style={styles.overlapCard}>
              <Text style={styles.overlapBody}>
                These ingredients appear in multiple products — monitor combined intake:
              </Text>
              <View style={styles.overlapTags}>
                {overlapIngredients.map((ing) => (
                  <Tag key={ing} tone="alert">{ing}</Tag>
                ))}
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── Product list ──────────────────────────────────────────────────── */}
        <Animated.View entering={FadeInUp.duration(400).delay(160)} style={styles.section}>
          {slotGroups.map(([slot, products]) => (
            <View key={slot} style={styles.slotGroup}>
              <SectionHead label={slot} />
              {products.map((product, idx) => (
                <View
                  key={product.id}
                  style={[
                    styles.rowWrapper,
                    idx < products.length - 1 && styles.rowBorder,
                  ]}
                >
                  <StackProductRow
                    product={product}
                    onPress={() => router.push(`/product/${product.id}`)}
                    onRemove={() => handleRemoveFromStack(product.id)}
                  />
                </View>
              ))}
            </View>
          ))}
        </Animated.View>

        {/* ── Add button ───────────────────────────────────────────────────── */}
        <View style={styles.addBtnRow}>
          <Pressable
            style={styles.addBtn}
            onPress={() => router.push('/(tabs)/scan')}
          >
            <Text style={styles.addBtnText}>＋ Add to stack</Text>
          </Pressable>
        </View>
      </ScrollView>

      <StackAssistant
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        stack={stack}
        radarScores={radarScores}
        goals={goals}
      />
      <MealInputSheet
        visible={mealSheetVisible}
        onClose={() => setMealSheetVisible(false)}
        onConfirm={handleMealsConfirm}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    paddingHorizontal: scale(24),
    alignItems: 'center',
  },
  emptyBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.6,
    marginBottom: Spacing.xl,
  },
  emptyBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  emptyBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.surface,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  // Header
  header: {
    paddingHorizontal: scale(24),
    paddingBottom: scale(20),
  },
  headerSubtitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    marginBottom: scale(20),
  },
  headerActions: {
    flexDirection: 'row',
    gap: scale(10),
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: scale(16),
    paddingVertical: scale(9),
    borderRadius: Radius.pill,
  },
  ghostBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.ink,
  },
  solidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    backgroundColor: Colors.ink,
    paddingHorizontal: scale(16),
    paddingVertical: scale(9),
    borderRadius: Radius.pill,
  },
  solidBtnIcon: {
    fontSize: FontSizes.caption,
    color: Colors.surface,
  },
  solidBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.surface,
  },

  // Synergy card
  synergySection: {
    paddingHorizontal: scale(24),
    marginBottom: scale(28),
  },
  synergyCard: {
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.lg,
    padding: 18,
    backgroundColor: Colors.surfaceCard,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  synergyBody: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.ink,
  },
  synergyChevron: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkTertiary,
  },

  // Filter chips
  filterRow: {
    paddingHorizontal: scale(24),
    gap: scale(8),
    marginBottom: scale(20),
  },
  filterChip: {
    paddingVertical: scale(7),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  filterChipText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkSecondary,
  },
  filterChipTextActive: {
    color: Colors.surface,
  },

  // Section / groups
  section: {
    paddingHorizontal: scale(24),
    marginBottom: scale(20),
  },
  slotGroup: {
    marginBottom: scale(24),
  },
  rowWrapper: {},
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderHairline,
  },

  // Product row
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(14),
    paddingVertical: scale(16),
    backgroundColor: Colors.surface,
  },
  productRowInfo: {
    flex: 1,
  },
  productRowName: {
    fontFamily: Fonts.serif,
    fontSize: 17,
    lineHeight: 22,
    color: Colors.ink,
    marginBottom: 4,
  },
  productRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkTertiary,
  },

  // Overlap
  overlapCard: {
    backgroundColor: Colors.surfaceCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: scale(12),
  },
  overlapBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
    marginBottom: Spacing.sm,
  },
  overlapTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },

  // Delete action
  deleteAction: {
    backgroundColor: Colors.alert,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    borderRadius: Radius.md,
    marginVertical: scale(2),
    marginRight: scale(2),
  },
  deleteActionText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#FFFFFF',
  },

  // Add button
  addBtnRow: {
    paddingHorizontal: scale(24),
    paddingVertical: scale(12),
    alignItems: 'center',
  },
  addBtn: {
    borderWidth: 1,
    borderColor: Colors.ink,
    paddingHorizontal: scale(32),
    paddingVertical: scale(14),
    borderRadius: Radius.pill,
  },
  addBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
