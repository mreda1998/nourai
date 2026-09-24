import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Newspaper } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { api, EvidenceArticle } from '@/services/api';
import { accessToken } from '@/lib/stack-sync';
import { useAppState } from '@/context/app-state';
import { Card, EmptyState, EvidenceMeter, Pill, Screen, Txt } from '@/components/ui';

const tone = (t: string) => (t === 'sage' ? 'strong' : t === 'alert' ? 'weak' : 'moderate') as 'strong' | 'weak' | 'moderate';

export default function EvidencePulseScreen() {
  const { stack } = useAppState();
  const [articles, setArticles] = useState<EvidenceArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState('Add products to your stack to unlock your evidence brief.');

  useEffect(() => {
    (async () => {
      try {
        const token = await accessToken();
        if (!token) {
          setEmpty(stack.length ? 'Sign in to sync your stack and load research for these ingredients.' : 'Add products to your stack to unlock your evidence brief.');
          return;
        }
        const res = await api.getEvidencePulse(token, 10);
        setArticles(res.articles);
        if (!res.articles.length) setEmpty(stack.length ? 'No new research is attached to your ingredients yet. Check back next week.' : 'Add products to your stack to unlock your evidence brief.');
      } catch {
        setEmpty('We couldn’t load the brief right now. Try again shortly.');
      } finally {
        setLoading(false);
      }
    })();
  }, [stack.length]);

  const ingredients = new Set(articles.map((a) => a.ingredient)).size;

  return (
    <Screen back title="Evidence pulse" subtitle={articles.length ? `${articles.length} findings across ${ingredients} ingredient${ingredients === 1 ? '' : 's'} you take` : 'Weekly research relevant to your stack'}>
      {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 32 }} /> : !articles.length ? (
        <EmptyState icon={Newspaper} title="Your brief is empty" message={empty} action={stack.length ? undefined : 'Go to stack'} onAction={() => router.push('/(tabs)/stack' as never)} />
      ) : (
        <View style={{ gap: 12 }}>
          {articles.map((a, i) => (
            <Animated.View key={i} entering={FadeInDown.duration(400).delay(i * 60)}>
              <Card padding={20}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Pill label={a.ingredient} tone={tone(a.tone)} />
                  <EvidenceMeter strength={Math.min(5, Math.round(a.dots * 1.25))} showLabel={false} width={52} />
                </View>
                <Txt variant="title2" style={{ marginTop: 12 }}>{a.headline}</Txt>
                <Txt variant="subhead" tone="secondary" style={{ marginTop: 8 }}>{a.excerpt}</Txt>
                <Txt variant="caption" tone="tertiary" style={{ marginTop: 12 }}>{a.journal}</Txt>
              </Card>
            </Animated.View>
          ))}
        </View>
      )}
    </Screen>
  );
}
