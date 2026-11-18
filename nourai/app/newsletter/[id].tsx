import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowUpRight, Check, CircleSlash, FlaskConical } from 'lucide-react-native';
import { Fonts, Palette } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { JOURNAL_BYLINE, journalStory } from '@/constants/journal';
import { api } from '@/services/api';
import { Button, Card, EmptyState, ListGroup, PressableScale, Screen, Section, Txt } from '@/components/ui';

/** A Journal story: takeaways first, then the piece, then every source it rests on. */
export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const story = journalStory(id);
  const [opening, setOpening] = useState(false);

  if (!story) {
    return (
      <Screen back>
        <EmptyState icon={CircleSlash} title="Story not found" message="This story may have been moved or withdrawn." action="Back to the Journal" onAction={() => router.replace('/(tabs)/journal' as never)} />
      </Screen>
    );
  }

  const openIngredient = async () => {
    if (!story.ingredientQuery || opening) return;
    setOpening(true);
    try {
      const found = await api.searchIngredients(story.ingredientQuery, 1);
      if (found.ingredients[0]) router.push(`/ingredient/${found.ingredients[0].id}` as never);
      else router.push({ pathname: '/(tabs)/explore', params: { q: story.ingredientQuery } } as never);
    } catch {
      router.push({ pathname: '/(tabs)/explore', params: { q: story.ingredientQuery } } as never);
    } finally { setOpening(false); }
  };

  const split = Math.min(2, story.body.length);

  return (
    <Screen
      back
      title={story.title}
      hero={
        <View style={{ height: 300 + insets.top }}>
          <View style={{ position: 'absolute', top: -600, left: 0, right: 0, height: 600, backgroundColor: '#EDE6DA' }} />
          <Image source={Imagery.journalCover} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['rgba(10,29,28,0.35)', 'rgba(243,240,233,0)', Palette.canvas]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        </View>
      }
    >
      <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: -40 }}>
        <Txt variant="overline" tone="accent">{story.kicker} · {story.minutes} min read</Txt>
        <Txt variant="display" style={{ marginTop: 10 }} accessibilityRole="header">{story.title}</Txt>
        <Txt variant="callout" tone="secondary" style={{ marginTop: 10 }}>{story.dek}</Txt>
        <View style={styles.byline}>
          <View style={styles.avatar}><Txt variant="headline" tone="accent">E</Txt></View>
          <View style={{ flex: 1 }}>
            <Txt variant="subheadStrong">{JOURNAL_BYLINE}</Txt>
            <Txt variant="footnote" tone="secondary">Checked against {story.sources.length} {story.sources.length === 1 ? 'source' : 'sources'} · {story.reviewed}</Txt>
          </View>
        </View>
      </Animated.View>

      <Card padding={20} style={{ marginTop: 24 }}>
        <Txt variant="overline" tone="secondary">In short</Txt>
        <View style={{ gap: 12, marginTop: 14 }}>
          {story.takeaways.map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={styles.tick}><Check size={13} color={Palette.accent} strokeWidth={2.8} /></View>
              <Txt variant="callout" style={{ flex: 1 }}>{t}</Txt>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ marginTop: 32 }}>
        <Txt variant="body" style={styles.para}>
          <Txt variant="display" style={styles.dropCap}>{story.intro.charAt(0)}</Txt>
          {story.intro.slice(1)}
        </Txt>
        {story.body.slice(0, split).map((p) => <Txt key={p} variant="body" style={styles.para}>{p}</Txt>)}
        <View style={styles.standfirst}>
          <Txt variant="title1" italic>{story.standfirst}</Txt>
        </View>
        {story.body.slice(split).map((p) => <Txt key={p} variant="body" style={styles.para}>{p}</Txt>)}
      </View>

      {story.ingredientQuery ? (
        <Button
          label="See every study in the library"
          variant="secondary"
          icon={<FlaskConical size={18} color={Palette.ink} />}
          loading={opening}
          onPress={openIngredient}
          style={{ marginTop: 4 }}
        />
      ) : null}

      <Section title="Sources" caption="Every factual claim above traces to one of these">
        <ListGroup>
          {story.sources.map((source, i) => (
            <PressableScale key={source.url} pressedScale={0.99} onPress={() => Linking.openURL(source.url)} accessibilityRole="link" accessibilityLabel={`Source ${i + 1}: ${source.citation}`}>
              <View style={styles.source}>
                <Txt variant="numeral" tone="accent" style={{ width: 22 }}>{i + 1}</Txt>
                <Txt variant="footnote" tone="secondary" style={{ flex: 1 }}>{source.citation}</Txt>
                <ArrowUpRight size={16} color={Palette.ink3} />
              </View>
            </PressableScale>
          ))}
        </ListGroup>
      </Section>

      <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 20, paddingHorizontal: 24 }}>
        Educational content, not medical advice. Talk to a clinician before changing medications or treatments.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  byline: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  para: { lineHeight: 28, marginBottom: 20 },
  dropCap: { fontFamily: Fonts.serif, fontSize: 56, lineHeight: 56, color: Palette.accent },
  standfirst: { borderLeftWidth: 3, borderLeftColor: Palette.accent, paddingLeft: 18, marginTop: 4, marginBottom: 28 },
  source: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
});
