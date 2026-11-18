import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { JournalStory } from '@/constants/journal';
import { Card, Txt } from '@/components/ui';

/** One Journal story in a list. */
export function StoryCard({ story }: { story: JournalStory }) {
  return (
    <Card padding={20} onPress={() => router.push(`/newsletter/${story.id}` as never)} accessibilityLabel={story.title}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Txt variant="overline" tone="accent">{story.kicker}</Txt>
        <Txt variant="caption" tone="tertiary">{story.minutes} min read</Txt>
      </View>
      <Txt variant="title2" style={{ marginTop: 8 }}>{story.title}</Txt>
      <Txt variant="footnote" tone="secondary" style={{ marginTop: 6 }}>{story.dek}</Txt>
      <Txt variant="caption" tone="tertiary" style={{ marginTop: 12 }}>{story.sources.length} {story.sources.length === 1 ? 'source' : 'sources'} cited</Txt>
    </Card>
  );
}
