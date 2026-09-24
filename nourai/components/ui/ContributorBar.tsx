import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { scoreQualifier, scoreTone, toneColor } from '@/utils/grade';
import { PressableScale } from './PressableScale';
import { Txt } from './Txt';

/**
 * Oura "Contributors" row: label left, qualifier right, thin bar beneath.
 * Bar colour follows the evidence scale so weak contributors stand out.
 */
export function ContributorBar({ label, value, valueLabel, onPress, delay = 0, night = false }: {
  label: string;
  value: number;
  valueLabel?: string;
  onPress?: () => void;
  delay?: number;
  night?: boolean;
}) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(delay, withTiming(Math.max(0, Math.min(100, value)), { duration: 900, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
  }, [value, delay]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  const tone = scoreTone(value);
  const attention = tone !== 'strong';
  const barColor = night ? (attention ? '#E3A07F' : Palette.nightInk) : toneColor(tone);

  const body = (
    <View style={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <Txt variant="subhead" tone={night ? 'inverse' : 'primary'} style={{ flex: 1 }}>{label}</Txt>
        <Txt variant="subheadStrong" color={attention ? (night ? '#E3A07F' : Palette.weak) : undefined} tone={night ? 'inverse2' : 'secondary'}>
          {valueLabel ?? scoreQualifier(value)}
        </Txt>
        {onPress ? <ChevronRight size={16} color={night ? Palette.nightInk3 : Palette.ink3} style={{ marginLeft: 4 }} /> : null}
      </View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: night ? Palette.nightHairline : Palette.hairline, overflow: 'hidden' }}>
        <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: barColor }, fill]} />
      </View>
    </View>
  );
  return onPress ? <PressableScale pressedScale={0.99} onPress={onPress} accessibilityLabel={`${label}, ${valueLabel ?? scoreQualifier(value)}`}>{body}</PressableScale> : body;
}
