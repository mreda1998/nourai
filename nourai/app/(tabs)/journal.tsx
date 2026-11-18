import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Palette, Radius } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { JOURNAL, JOURNAL_TOPICS, type JournalStory } from '@/constants/journal';
import { StoryCard } from '@/components/StoryCard';
import { ChipRow, PressableScale, Screen, Txt } from '@/components/ui';

type Filter = 'all' | JournalStory['topic'];

export default function JournalScreen() {
  const [topic, setTopic] = useState<Filter>('all');
  // Only topics that have a story: a filter that leads nowhere is a broken promise.
  const topics = JOURNAL_TOPICS.filter((t) => JOURNAL.some((s) => s.topic === t.key));
  const [cover, ...rest] = JOURNAL;
  const list = topic === 'all' ? rest : JOURNAL.filter((s) => s.topic === topic);

  return (
    <Screen back title="Journal" subtitle="Evidence over opinion, in plain language. Every story lists its sources.">
      {topics.length > 1 ? (
        <ChipRow<Filter> options={[{ key: 'all', label: 'Latest' }, ...topics]} value={topic} onChange={setTopic} />
      ) : null}

      {topic === 'all' && cover ? (
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
        {list.map((s) => <StoryCard key={s.id} story={s} />)}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { height: 420, marginTop: 20, borderRadius: Radius.xxl, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: Palette.sunken },
});
