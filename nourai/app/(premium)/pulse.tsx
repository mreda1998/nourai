import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';
import { PremiumLock, SectionHead } from '@/components/elory';

const ARTICLES = [
  {
    ingredient: 'Creatine Monohydrate',
    tone: 'sage',
    evidenceDots: 4,
    headline: 'Creatine supplementation improves working memory in older adults',
    excerpt: 'A new systematic review of 14 RCTs found consistent improvements in working memory and processing speed among adults over 55 receiving 3–5g/day creatine monohydrate over 4–12 weeks.',
    journal: 'Neuroscience & Biobehavioral Reviews · Mar 2026',
  },
  {
    ingredient: 'Ashwagandha KSM-66',
    tone: 'sage',
    evidenceDots: 3,
    headline: 'KSM-66 reduces morning cortisol by 28% in stressed professionals',
    excerpt: 'Double-blind RCT (n=240) confirms significant cortisol reduction and subjective stress scores after 60 days of 600mg KSM-66 daily. Effect size greater in those with baseline high cortisol.',
    journal: 'Journal of Ethnopharmacology · Feb 2026',
  },
  {
    ingredient: 'Magnesium Glycinate',
    tone: 'alert',
    evidenceDots: 2,
    headline: 'High-dose magnesium may interfere with zinc absorption in older populations',
    excerpt: 'A pharmacokinetic study suggests supplemental magnesium above 400mg/day reduces zinc bioavailability by 15–22% when co-administered. Relevant to stacks containing both minerals.',
    journal: 'American Journal of Clinical Nutrition · Jan 2026',
  },
];

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.darkInk} strokeWidth={2}>
      <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function EvidenceDots({ count, tone }: { count: number; tone: string }) {
  const fill = tone === 'sage' ? Colors.sage : tone === 'alert' ? Colors.alert : Colors.sand;
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i <= count ? fill : 'rgba(241,237,228,0.15)',
          }}
        />
      ))}
    </View>
  );
}

export default function PulseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + scale(8) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <BackIcon />
        </Pressable>
        <Text style={styles.headerEyebrow}>Atelier</Text>
        <View style={{ width: scale(36) }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(48) }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(300)}>
          <Text style={styles.title}>Evidence pulse.</Text>
          <Text style={styles.subtitle}>
            {ARTICLES.length} new signals this week across ingredients in your stack
          </Text>
        </Animated.View>

        <SectionHead label="This week" dark />

        {ARTICLES.map((article, i) => (
          <Animated.View
            key={i}
            entering={FadeInUp.delay(i * 80).duration(320)}
            style={styles.articleCard}
          >
            <View style={styles.articleMeta}>
              <Text style={[
                styles.ingredientEyebrow,
                {
                  color: article.tone === 'sage' ? Colors.sage
                    : article.tone === 'alert' ? Colors.alert
                    : Colors.sand,
                },
              ]}>
                {article.ingredient}
              </Text>
              <EvidenceDots count={article.evidenceDots} tone={article.tone} />
            </View>

            <Text style={styles.headline}>{article.headline}</Text>

            <View style={styles.excerpt}>
              <Text style={styles.excerptText}>{article.excerpt}</Text>
            </View>

            <View style={styles.footer}>
              <Text style={styles.journal}>{article.journal}</Text>
              <Text style={styles.readLink}>Read brief →</Text>
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      <PremiumLock featureName="Evidence Pulse" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(24),
    paddingBottom: scale(8),
  },
  backBtn: {
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: 'rgba(241,237,228,0.4)',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(8),
  },
  title: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.heading,
    color: Colors.darkInk,
    lineHeight: FontSizes.heading * 1.1,
    marginBottom: scale(8),
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.55)',
    marginBottom: scale(24),
  },
  articleCard: {
    marginBottom: scale(24),
    paddingBottom: scale(24),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,237,228,0.08)',
    gap: scale(10),
  },
  articleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ingredientEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  headline: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.darkInk,
    lineHeight: FontSizes.title * 1.2,
  },
  excerpt: {
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(241,237,228,0.2)',
    paddingLeft: scale(12),
  },
  excerptText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.65)',
    lineHeight: FontSizes.body * 1.6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  journal: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: 'rgba(241,237,228,0.3)',
    flex: 1,
    marginRight: scale(8),
  },
  readLink: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.sand,
  },
});
