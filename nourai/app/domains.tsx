import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Dumbbell, Moon, Scissors, Sprout, Waves, Zap } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { api } from '@/services/api';
import { APP_DOMAIN_TO_BIODOMAIN } from '@/constants/biodomains';
import { useAppState } from '@/context/app-state';
import { isCatalogueId } from '@/lib/insights';
import { Palette, Radius } from '@/constants/theme';
import { PressableScale, Screen, Txt } from '@/components/ui';

const DOMAINS: { key: keyof typeof APP_DOMAIN_TO_BIODOMAIN; title: string; subtitle: string; Icon: LucideIcon }[] = [
  { key: 'skin', title: 'Skin', subtitle: 'Barrier, texture, ageing', Icon: Waves },
  { key: 'sleep', title: 'Sleep', subtitle: 'Rhythm, quality, recovery', Icon: Moon },
  { key: 'gut', title: 'Gut', subtitle: 'Diversity, comfort', Icon: Sprout },
  { key: 'hormonal', title: 'Hormonal', subtitle: 'Energy, stress, metabolism', Icon: Zap },
  { key: 'hair', title: 'Hair', subtitle: 'Density, scalp, nutrition', Icon: Scissors },
  { key: 'fitness', title: 'Fitness', subtitle: 'Strength, cardio, recovery', Icon: Dumbbell },
];

export default function DomainsScreen() {
  const { stack } = useAppState();
  // How many ingredients in the stack bear on each area — counts, not scores.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const stackIds = stack.map((p) => p.id).filter(isCatalogueId).join(',');

  useEffect(() => {
    if (!stackIds) { setCounts({}); return; }
    DOMAINS.forEach((d) => {
      const biodomain = APP_DOMAIN_TO_BIODOMAIN[d.key];
      if (!biodomain) return;
      api.getStackDomain(biodomain, stackIds.split(','))
        .then((r) => setCounts((c) => ({ ...c, [d.key]: r.factors.length })))
        .catch(() => undefined);
    });
  }, [stackIds]);

  return (
    <Screen back title="Longevity domains" subtitle="The systems that shape how you feel and age.">
      <View style={styles.grid}>
        {DOMAINS.map((d, i) => (
          <Animated.View key={d.key} entering={FadeInDown.duration(400).delay(i * 50)} style={{ width: '48.4%' }}>
            <PressableScale onPress={() => router.push(`/health/${d.key}` as never)} style={styles.card} accessibilityLabel={d.title}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={styles.icon}><d.Icon size={20} color={Palette.accent} strokeWidth={1.8} /></View>
              </View>
              <Txt variant="title2" style={{ marginTop: 'auto' }}>{d.title}</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{d.subtitle}</Txt>
              {counts[d.key] ? (
                <Txt variant="caption" tone="accent" style={{ marginTop: 6 }}>
                  {counts[d.key]} ingredient{counts[d.key] === 1 ? '' : 's'} in your stack
                </Txt>
              ) : null}
            </PressableScale>
          </Animated.View>
        ))}
      </View>
      <Txt variant="footnote" tone="tertiary" align="center" style={{ marginTop: 20 }}>Each area shows how many ingredients in your stack affect it. Hair is coming soon.</Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { height: 164, padding: 16, borderRadius: Radius.xl, borderCurve: 'continuous', backgroundColor: Palette.surface, shadowColor: '#1B2A28', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
});
