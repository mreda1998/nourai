import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Check } from 'lucide-react-native';
import { Fonts, Palette, Radius } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { Card, Screen, Txt } from '@/components/ui';

/** Journal article. Only "creatine" has content; unknown ids fall back to it. */

interface Article {
  sectionTag: string;
  title: string;
  author: string;
  date: string;
  intro: string;
  pullQuote: string;
  body: string[];
}

const ARTICLES: Record<string, Article> = {
  creatine: {
    sectionTag: 'Metabolic Performance',
    title: 'The Science of Creatine Supplementation',
    author: 'Dr. Marcus Webb',
    date: 'March 3, 2026',
    intro:
      'Creatine monohydrate sits at a rare intersection: it is one of the most studied supplements in human history and simultaneously one of the most misunderstood. Strip away the gym-floor mythology and what remains is a molecule of remarkable biological utility — not merely for athletes, but for anyone who depends on a brain that works well under pressure.',
    pullQuote:
      '"We are not merely what we supplement, but when and how we choose to replenish our most fundamental energy currency."',
    body: [
      "The mechanism is deceptively simple. Creatine is stored in muscle and brain tissue as phosphocreatine, a high-energy compound that rapidly regenerates ATP — the cell's primary fuel — during moments of intense demand. When your neurons are firing in rapid succession, or your legs are climbing a flight of stairs, it is phosphocreatine that bridges the gap between the oxygen-dependent pathways and the urgent need for energy now.",
      "What separates creatine from the graveyard of sports nutrition fads is the consistency of the evidence base. Over 500 randomised controlled trials have examined its safety and efficacy. Meta-analyses in the Journal of the International Society of Sports Nutrition confirm a 10–20% improvement in high-intensity, short-duration performance. More recently, research published in Psychopharmacology has demonstrated cognitive benefits — particularly in sleep-deprived subjects — pointing to its relevance far beyond the weight room.",
      "The dosing question is where most people err. The common protocol — 5g daily — is correct for maintenance, but many users never complete a loading phase (20g per day for 5–7 days, split into 4 doses) to saturate muscle stores. The result is a delayed onset of benefits that many interpret as non-response. It bears noting: vegetarians and vegans, whose dietary creatine intake is near zero, show the most pronounced cognitive and physical gains upon supplementation.",
      "On the safety front, three decades of research have found no credible evidence of kidney or liver damage in healthy individuals at recommended doses. The persistent belief that creatine damages the kidneys stems from a 1998 case report of a single individual with pre-existing renal disease — a sample size that has, nonetheless, proven remarkably durable in popular mythology.",
      "The practical takeaway is straightforward: 3–5g of creatine monohydrate daily, taken consistently with adequate hydration, represents an evidence-backed intervention with a cost-to-benefit ratio that few supplements can match. The form matters too — monohydrate remains superior to buffered or ethyl-ester variants in every head-to-head trial, and it costs a fraction of the price.",
    ],
  },
};

const TAKEAWAYS = [
  'Creatine monohydrate remains the best-supported form.',
  'Consistency matters more than precise timing.',
  'Benefits extend beyond strength into cognitive energy.',
];

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const article = ARTICLES[id] ?? ARTICLES.creatine;

  return (
    <Screen
      back
      title={article.title}
      hero={
        <View style={{ height: 300 + insets.top }}>
          <View style={{ position: 'absolute', top: -600, left: 0, right: 0, height: 600, backgroundColor: '#EDE6DA' }} />
          <Image source={Imagery.journalCover} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={['rgba(10,29,28,0.35)', 'rgba(243,240,233,0)', Palette.canvas]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        </View>
      }
    >
      <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: -40 }}>
        <Txt variant="overline" tone="accent">{article.sectionTag}</Txt>
        <Txt variant="display" style={{ marginTop: 10 }}>{article.title}</Txt>
        <View style={styles.byline}>
          <View style={styles.avatar}><Txt variant="headline" tone="accent">{article.author.slice(0, 1)}</Txt></View>
          <View>
            <Txt variant="subheadStrong">{article.author}</Txt>
            <Txt variant="footnote" tone="secondary">{article.date}</Txt>
          </View>
        </View>
      </Animated.View>

      <Card padding={20} style={{ marginTop: 24 }}>
        <Txt variant="overline" tone="secondary">Key takeaways</Txt>
        <View style={{ gap: 12, marginTop: 14 }}>
          {TAKEAWAYS.map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={styles.tick}><Check size={13} color={Palette.accent} strokeWidth={2.8} /></View>
              <Txt variant="callout" style={{ flex: 1 }}>{t}</Txt>
            </View>
          ))}
        </View>
      </Card>

      <View style={{ marginTop: 32 }}>
        <Txt variant="body" style={styles.para}>
          <Txt variant="display" style={styles.dropCap}>{article.intro.charAt(0)}</Txt>
          {article.intro.slice(1)}
        </Txt>
        {article.body.slice(0, 2).map((p, i) => <Txt key={i} variant="body" style={styles.para}>{p}</Txt>)}
        <View style={styles.quote}>
          <Txt variant="title1" italic>{article.pullQuote}</Txt>
        </View>
        {article.body.slice(2).map((p, i) => <Txt key={i + 2} variant="body" style={styles.para}>{p}</Txt>)}
      </View>

      <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 16 }}>Educational content, not medical advice.</Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  byline: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  para: { lineHeight: 28, marginBottom: 20 },
  dropCap: { fontFamily: Fonts.serif, fontSize: 56, lineHeight: 56, color: Palette.accent },
  quote: { borderLeftWidth: 3, borderLeftColor: Palette.accent, paddingLeft: 18, marginVertical: 12, marginBottom: 28, borderRadius: Radius.xs },
});
