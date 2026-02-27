import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInRight, FadeIn } from 'react-native-reanimated';

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
import { useAppState } from '@/context/app-state';

function getGradeStyle(grade: string): { bg: string; text: string } {
  switch (grade) {
    case 'A': return { bg: Colors.accentHill, text: Colors.bone };
    case 'B': return { bg: 'transparent', text: Colors.ink };
    default: return { bg: 'transparent', text: Colors.inkTertiary };
  }
}

export default function StackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stack, removeFromStack } = useAppState();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.sectionLabel}>Your Collection</Text>
            <Text style={styles.title}>Stack</Text>
          </View>
          <Text style={styles.countBadge}>{stack.length}</Text>
        </View>

        {stack.length === 0 ? (
          <View style={styles.emptyState}>
            <Animated.View entering={FadeIn.duration(400)} style={styles.emptyIcon}>
              <View style={styles.emptyIconInner} />
            </Animated.View>
            <Text style={styles.emptyTitle}>No Products Yet</Text>
            <Text style={styles.emptyDescription}>
              Scan a product to begin building your personalized stack.
            </Text>
            <Pressable
              style={styles.scanButton}
              onPress={() => router.push('/(tabs)/scan')}
            >
              <Text style={styles.scanButtonText}>Start Scanning</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.stackList}>
            {stack.map((product, index) => {
              const gradeStyle = getGradeStyle(product.grade);
              return (
                <Animated.View
                  key={product.id}
                  entering={FadeInRight.duration(400).delay(index * 100)}
                >
                  <Pressable
                    style={[
                      styles.stackItem,
                      index < stack.length - 1 && styles.stackItemBorder,
                    ]}
                    onPress={() => router.push(`/product/${product.id}`)}
                  >
                    <View style={styles.itemThumb} />
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemBrand}>{product.brand}</Text>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {product.name}
                      </Text>
                      <Text style={styles.itemCategory}>{product.category}</Text>
                    </View>
                    <View style={[styles.gradeBadge, { backgroundColor: gradeStyle.bg }]}>
                      <Text style={[styles.gradeText, { color: gradeStyle.text }]}>
                        {product.grade}
                      </Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Analysis Summary - only show if there are products */}
        {stack.length > 0 && (
          <View style={styles.analysisSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.analysisSectionLabel}>Stack Analysis</Text>
            </View>
            <View style={styles.analysisCard}>
              <View style={styles.analysisRow}>
                <Text style={styles.analysisLabel}>Total Products</Text>
                <Text style={styles.analysisValue}>{stack.length}</Text>
              </View>
              <View style={styles.analysisDivider} />
              <View style={styles.analysisRow}>
                <Text style={styles.analysisLabel}>Grade A Products</Text>
                <Text style={styles.analysisValue}>
                  {stack.filter(p => p.grade === 'A').length}
                </Text>
              </View>
              <View style={styles.analysisDivider} />
              <View style={styles.analysisRow}>
                <Text style={styles.analysisLabel}>Categories</Text>
                <Text style={styles.analysisValue}>
                  {new Set(stack.map(p => p.category)).size}
                </Text>
              </View>
            </View>
          </View>
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.inkSecondary,
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  countBadge: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyLarge,
    fontWeight: '600',
    color: Colors.ink,
    backgroundColor: Colors.boneDark,
    paddingHorizontal: scale(12),
    paddingVertical: scale(6),
    borderRadius: Radius.pill,
  },
  emptyState: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingVertical: verticalScale(60),
    alignItems: 'center',
  },
  emptyIcon: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: Colors.boneDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyIconInner: {
    width: scale(32),
    height: scale(32),
    borderWidth: 2,
    borderColor: Colors.inkTertiary,
    borderRadius: 4,
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  emptyDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.bodyLarge * 1.5,
    maxWidth: scale(280),
    marginBottom: Spacing.xl,
  },
  scanButton: {
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
  },
  scanButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stackList: {
    marginHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  stackItem: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stackItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  itemThumb: {
    width: scale(56),
    height: scale(56),
    backgroundColor: Colors.boneDark,
  },
  itemDetails: {
    flex: 1,
  },
  itemBrand: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    marginBottom: 2,
  },
  itemName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
    marginBottom: 2,
  },
  itemCategory: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
  },
  gradeBadge: {
    width: scale(32),
    height: scale(32),
    borderWidth: 1,
    borderColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyLarge,
    fontWeight: '700',
  },
  analysisSection: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginTop: Spacing.xl,
  },
  sectionHeader: {
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    marginBottom: Spacing.md,
  },
  analysisSectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.ink,
  },
  analysisCard: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    padding: Spacing.md,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  analysisDivider: {
    height: 1,
    backgroundColor: Colors.borderHairline,
  },
  analysisLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  analysisValue: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.subtitle,
    fontWeight: '600',
    color: Colors.ink,
  },
});
