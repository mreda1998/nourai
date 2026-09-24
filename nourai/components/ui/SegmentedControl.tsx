import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Palette, Shadows } from '@/constants/theme';
import { Txt } from './Txt';

/** iOS segmented control with a sliding thumb. */
export function SegmentedControl<T extends string>({ options, value, onChange, style, night = false }: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
  night?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const segW = width / options.length;
  const thumb = useAnimatedStyle(() => ({
    width: segW - 4,
    transform: [{ translateX: withSpring(index * segW + 2, { damping: 22, stiffness: 260 }) }],
  }), [index, segW]);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[{ height: 38, borderRadius: 12, borderCurve: 'continuous', backgroundColor: night ? 'rgba(244,241,234,0.08)' : 'rgba(14,31,30,0.06)', flexDirection: 'row' }, style]}
    >
      {width > 0 ? (
        <Animated.View style={[{ position: 'absolute', top: 2, bottom: 2, borderRadius: 10, borderCurve: 'continuous', backgroundColor: night ? Palette.nightRaised : Palette.surface }, night ? null : Shadows.soft, thumb]} />
      ) : null}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => { if (!active) { Haptics.selectionAsync(); onChange(o.key); } }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Txt variant={active ? 'footnoteStrong' : 'footnote'} tone={night ? (active ? 'inverse' : 'inverse2') : active ? 'primary' : 'secondary'} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
