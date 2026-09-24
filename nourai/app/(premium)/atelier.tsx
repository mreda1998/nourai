import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronRight, Clock, Crown, Dna, GitCompareArrows, Layers3, MessageCircle, Newspaper } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { PressableScale, Screen, Txt } from '@/components/ui';

const FEATURES: { title: string; kicker: string; description: string; route: string; Icon: LucideIcon }[] = [
  { title: 'Ask Elory', kicker: 'Conversation', description: 'Ask about timing, interactions and evidence — answered with your stack in mind.', route: '/ask-elory', Icon: MessageCircle },
  { title: 'Timing protocol', kicker: 'Chronobiology', description: 'A dosing sequence aligned to your body clock.', route: '/circadian', Icon: Clock },
  { title: 'Interaction map', kicker: 'Synergies & conflicts', description: 'See which compounds help — or compete with — each other.', route: '/conflict-map', Icon: GitCompareArrows },
  { title: 'Exposure ledger', kicker: 'Cumulative load', description: 'Track synthetic exposure across food, supplements and skincare.', route: '/exposure', Icon: Layers3 },
  { title: 'Evidence pulse', kicker: 'Weekly brief', description: 'New research relevant to what you take.', route: '/pulse', Icon: Newspaper },
  { title: 'Peptides', kicker: 'Research dossiers', description: 'Regulatory status, routes and cycle protocols for 20+ peptides.', route: '/peptides', Icon: Dna },
];

export default function AtelierScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen
      night
      back
      title="Atelier"
      hero={
        <View style={{ height: 340 + insets.top }}>
          <View style={{ position: 'absolute', top: -600, left: 0, right: 0, height: 600, backgroundColor: Palette.night }} />
          <Image source={Imagery.atelier} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['rgba(10,29,28,0.35)', 'rgba(10,29,28,0.55)', Palette.night]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Crown size={16} color={Palette.gold} strokeWidth={2} />
              <Txt variant="overline" tone="gold">Elory Premium</Txt>
            </View>
            <Txt variant="display" tone="inverse" style={{ marginTop: 10 }}>Atelier</Txt>
            <Txt variant="callout" tone="inverse2" style={{ marginTop: 8 }}>
              Tools that read your stack, your timing and the evidence — then tell you something real.
            </Txt>
          </View>
        </View>
      }
    >
      <View style={{ gap: 12, marginTop: 20 }}>
        {FEATURES.map((f, i) => (
          <Animated.View key={f.route} entering={FadeInDown.duration(500).delay(i * 60)}>
            <PressableScale onPress={() => router.push(f.route as never)} style={styles.card} accessibilityLabel={f.title}>
              <View style={styles.icon}><f.Icon size={22} color={Palette.gold} strokeWidth={1.7} /></View>
              <View style={{ flex: 1 }}>
                <Txt variant="caption" tone="inverse3">{f.kicker}</Txt>
                <Txt variant="title2" tone="inverse" style={{ marginTop: 2 }}>{f.title}</Txt>
                <Txt variant="footnote" tone="inverse2" style={{ marginTop: 4 }}>{f.description}</Txt>
              </View>
              <ChevronRight size={20} color={Palette.nightInk3} />
            </PressableScale>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderRadius: Radius.xl, borderCurve: 'continuous', backgroundColor: Palette.nightRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.nightHairline },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(201,164,101,0.12)', alignItems: 'center', justifyContent: 'center' },
});
