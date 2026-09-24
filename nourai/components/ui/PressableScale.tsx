import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Motion } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** How far the element shrinks on press. 0.97 for cards, 0.94 for buttons. */
  pressedScale?: number;
  haptic?: 'light' | 'medium' | 'selection' | false;
}

/** Base for every tappable surface: spring scale + optional haptic. */
export function PressableScale({ style, pressedScale = 0.97, haptic = 'light', onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps) {
  const s = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      onPressIn={(e) => {
        s.value = withSpring(pressedScale, Motion.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, Motion.press);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        else if (haptic === 'selection') Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={[style, animated, disabled && { opacity: 0.45 }]}
    />
  );
}
