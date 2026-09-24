import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Crown, GitCompareArrows, MessageCircle, Clock, Newspaper, X } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import { Button, IconButton, Txt } from '@/components/ui';

const PERKS = [
  { Icon: MessageCircle, text: 'Ask Elory — answers grounded in your stack' },
  { Icon: GitCompareArrows, text: 'Interaction map across every product' },
  { Icon: Clock, text: 'Timing protocol for your routine' },
  { Icon: Newspaper, text: 'Weekly evidence brief' },
];

/** Paywall overlay for premium routes. In dev builds it offers a preview. */
export function PremiumLock({ featureName }: { featureName?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bypassed, setBypassed] = useState(false);
  if (bypassed) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,29,28,0.55)' }]} />
      <View style={{ position: 'absolute', top: insets.top + 8, left: 16 }}>
        <IconButton icon={X} label="Close" variant="night" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never))} />
      </View>
      <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.card, { marginBottom: insets.bottom + 16 }]}>
        <View style={styles.crown}><Crown size={22} color={Palette.gold} strokeWidth={2} /></View>
        <Txt variant="overline" tone="gold" style={{ marginTop: 16 }}>Elory Premium</Txt>
        <Txt variant="title1" tone="inverse" style={{ marginTop: 8 }}>{featureName ? `${featureName} is part of Premium` : 'Go deeper with Atelier'}</Txt>
        <View style={{ gap: 12, marginTop: 20 }}>
          {PERKS.map(({ Icon, text }) => (
            <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon size={18} color={Palette.nightInk2} strokeWidth={1.8} />
              <Txt variant="subhead" tone="inverse2" style={{ flex: 1 }}>{text}</Txt>
            </View>
          ))}
        </View>
        <Button
          label={__DEV__ ? 'Preview (dev build)' : 'See plans'}
          variant="night"
          style={{ marginTop: 24 }}
          onPress={() => (__DEV__ ? setBypassed(true) : router.push('/settings/subscription'))}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 16, right: 16, bottom: 0, padding: 24, borderRadius: Radius.xxl, borderCurve: 'continuous', backgroundColor: Palette.nightRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.nightHairline },
  crown: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(201,164,101,0.14)', alignItems: 'center', justifyContent: 'center' },
});
