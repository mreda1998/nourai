import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Dumbbell, Moon, Scissors, Sprout, Waves, Zap } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { api } from '@/services/api';
import { Palette, Radius } from '@/constants/theme';
import { PressableScale, ScoreBadge, Screen, Txt } from '@/components/ui';

const DOMAINS: { key: string; title: string; subtitle: string; Icon: LucideIcon }[] = [
  { key: 'skin', title: 'Skin', subtitle: 'Barrier, texture, ageing', Icon: Waves },
  { key: 'sleep', title: 'Sleep', subtitle: 'Rhythm, quality, recovery', Icon: Moon },
  { key: 'gut', title: 'Gut', subtitle: 'Diversity, comfort', Icon: Sprout },
  { key: 'hormonal', title: 'Hormonal', subtitle: 'Energy, stress, metabolism', Icon: Zap },
  { key: 'hair', title: 'Hair', subtitle: 'Density, scalp, nutrition', Icon: Scissors },
  { key: 'fitness', title: 'Fitness', subtitle: 'Strength, cardio, recovery', Icon: Dumbbell },
];

export default function DomainsScreen() {
  const [scores, setScores] = useState<Record<string, number | null>>({});

  useEffect(() => {
    DOMAINS.forEach((d) => {
      api.getHealthDomain(d.key)
        .then((r) => setScores((s) => ({ ...s, [d.key]: r.score })))
        .catch(() => setScores((s) => ({ ...s, [d.key]: null })));
    });
  }, []);

  return (
    <Screen back title="Longevity domains" subtitle="The systems that shape how you feel and age.">
      <View style={styles.grid}>
        {DOMAINS.map((d, i) => (
          <Animated.View key={d.key} entering={FadeInDown.duration(400).delay(i * 50)} style={{ width: '48.4%' }}>
            <PressableScale onPress={() => router.push(`/health/${d.key}` as never)} style={styles.card} accessibilityLabel={d.title}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={styles.icon}><d.Icon size={20} color={Palette.accent} strokeWidth={1.8} /></View>
                <ScoreBadge score={scores[d.key] ?? null} size={36} />
              </View>
              <Txt variant="title2" style={{ marginTop: 'auto' }}>{d.title}</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{d.subtitle}</Txt>
            </PressableScale>
          </Animated.View>
        ))}
      </View>
      <Txt variant="footnote" tone="tertiary" align="center" style={{ marginTop: 20 }}>Scores appear once your stack includes products that affect each area.</Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { height: 164, padding: 16, borderRadius: Radius.xl, borderCurve: 'continuous', backgroundColor: Palette.surface, shadowColor: '#1B2A28', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
