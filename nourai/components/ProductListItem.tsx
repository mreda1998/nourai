/**
 * ProductListItem — moodboard-faithful product row.
 *
 * Design from home_without_calendar.html:
 *  - Arch thumbnail: 64×80, borderRadius 32 32 0 0, category icon inside
 *  - Serif product title 18px
 *  - Brand in uppercase 11px / secondary
 *  - Circular grade badge 28px serif
 *  - Hairline tag pills
 *  - Hairline bottom border separator
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Colors, Fonts, FontSizes, Spacing, scale } from '@/constants/theme';
import CategoryIcon from './CategoryIcon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface ProductListItemProps {
  id: string;
  name: string;
  brand?: string;
  category: string;
  grade: string;
  tags?: string[];
  /** If true, tag pill gets ink border (alert style) */
  alertTags?: string[];
  onPress?: () => void;
}

function GradeBadge({ grade }: { grade: string }) {
  const isA = grade === 'A';
  const isC = grade === 'C' || grade === 'D';
  return (
    <View
      style={[
        styles.gradeBadge,
        isA && styles.gradeBadgeA,
        isC && styles.gradeBadgeC,
      ]}
    >
      <Text
        style={[
          styles.gradeText,
          isA && styles.gradeTextA,
          isC && styles.gradeTextC,
        ]}
      >
        {grade}
      </Text>
    </View>
  );
}

export default function ProductListItem({
  name,
  brand,
  category,
  grade,
  tags = [],
  alertTags = [],
  onPress,
}: ProductListItemProps) {
  const pressScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  return (
    <AnimatedPressable
      style={[styles.item, animatedStyle]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={() => {
        pressScale.value = withSpring(0.98, { damping: 15, stiffness: 220 });
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, { damping: 15, stiffness: 220 });
      }}
    >
      {/* Arch thumbnail */}
      <View style={styles.thumb}>
        <CategoryIcon category={category} size={26} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Brand + Grade row */}
        <View style={styles.metaRow}>
          <Text style={styles.brand} numberOfLines={1}>
            {brand ?? category}
          </Text>
          <GradeBadge grade={grade} />
        </View>

        {/* Product title */}
        <Text style={styles.title} numberOfLines={2}>
          {name}
        </Text>

        {/* Tags */}
        {tags.length > 0 && (
          <View style={styles.tagRow}>
            {tags.slice(0, 3).map((tag) => (
              <View
                key={tag}
                style={[
                  styles.tag,
                  alertTags.includes(tag) && styles.tagAlert,
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    alertTags.includes(tag) && styles.tagTextAlert,
                  ]}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </AnimatedPressable>
  );
}

const THUMB_W = scale(64);
const THUMB_H = scale(80);
const BADGE_SIZE = scale(28);

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
    alignItems: 'flex-start',
  },

  // Arch thumbnail — borderRadius top only
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderTopLeftRadius: scale(32),
    borderTopRightRadius: scale(32),
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    flexShrink: 0,
  },

  // Content area
  content: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  brand: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: Colors.inkSecondary,
    flex: 1,
    marginRight: Spacing.sm,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: scale(18),
    lineHeight: scale(18) * 1.2,
    color: Colors.ink,
    marginBottom: 8,
  },

  // Grade badge — circle
  gradeBadge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeBadgeA: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  gradeBadgeC: {
    borderColor: Colors.inkTertiary,
  },
  gradeText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.ink,
    lineHeight: FontSizes.body * 1.2,
  },
  gradeTextA: {
    color: Colors.bone,
  },
  gradeTextC: {
    color: Colors.inkSecondary,
  },

  // Tags
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: 100,
  },
  tagAlert: {
    borderColor: Colors.ink,
  },
  tagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.xs * 1.4,
  },
  tagTextAlert: {
    color: Colors.ink,
    fontWeight: '600',
  },
});
