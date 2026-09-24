import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Palette, Radius } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { JOURNAL } from '@/constants/journal';
import { Card, ChipRow, EmptyState, Pill, PressableScale, Screen, Txt } from '@/components/ui';

const TOPICS = [
  { key: 'all', label: 'Latest' },
  { key: 'longevity', label: 'Longevity' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'mind', label: 'Mind' },
];

export default function JournalScreen() {
  const [topic, setTopic] = useState('all');
  const [cover, ...rest] = JOURNAL;
  const list = (topic === 'all' ? rest : JOURNAL).filter((s) => topic === 'all' || s.topic === topic);

  return (
    <Screen back title="Journal" subtitle="Evidence over opinion, in plain language.">
      <ChipRow options={TOPICS} value={topic} onChange={setTopic} />

      {topic === 'all' ? (
        <PressableScale onPress={() => router.push(`/newsletter/${cover.id}` as never)} style={styles.cover} accessibilityLabel={cover.title}>
          <Image source={Imagery.journalCover} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['rgba(10,29,28,0)', 'rgba(10,29,28,0.82)']} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
          <View style={{ position: 'absolute', left: 22, right: 22, bottom: 22 }}>
            <Txt variant="overline" tone="inverse2">{cover.kicker} · {cover.minutes} min</Txt>
            <Txt variant="display" tone="inverse" style={{ marginTop: 8 }}>{cover.title}</Txt>
            <Txt variant="subhead" tone="inverse2" style={{ marginTop: 8 }}>{cover.dek}</Txt>
          </View>
        </PressableScale>
      ) : null}

      <View style={{ gap: 12, marginTop: 20 }}>
        {list.length ? list.map((s, i) => (
          <Card key={s.id} padding={18} onPress={s.published ? () => router.push(`/newsletter/${s.id}` as never) : undefined} accessibilityLabel={s.title}>
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Txt variant="title1" tone="accent" italic style={{ width: 34 }}>{String(i + (topic === 'all' ? 2 : 1)).padStart(2, '0')}</Txt>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Txt variant="overline" tone="secondary">{s.kicker}</Txt>
                  {s.published ? <Txt variant="caption" tone="tertiary">{s.minutes} min</Txt> : <Pill label="Coming soon" />}
                </View>
                <Txt variant="title2" style={{ marginTop: 6 }}>{s.title}</Txt>
                <Txt variant="footnote" tone="secondary" style={{ marginTop: 4 }}>{s.dek}</Txt>
              </View>
            </View>
          </Card>
        )) : <EmptyState title="Nothing here yet" message="New stories on this topic are on the way." />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { height: 420, marginTop: 20, borderRadius: Radius.xxl, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: Palette.sunken },
});
