/**
 * Newsletter article screen.
 *
 * Design from moodboard/newsletter/newsletter.html:
 *  - Dark hero image area
 *  - Section tag, serif article title (42px), byline
 *  - Drop-cap first paragraph
 *  - Pull-quote with ink borders
 *  - Serif body 20px
 *
 * Route: /newsletter/[id]
 * Currently only the "creatine" article is populated.
 */

import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Pressable,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Path, Circle, Line } from 'react-native-svg';

import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  Layout,
  scale,
  verticalScale,
} from '@/constants/theme';

// ─── Article data ──────────────────────────────────────────────────────────────

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

// ─── Decorative hero icon (molecule-style) ─────────────────────────────────────

function MoleculeHero() {
  return (
    <ImageBackground source={require('@/assets/images/elory-architecture-hero.png')} style={heroStyles.container} imageStyle={{ borderRadius: 14 }}>
      <View style={heroStyles.noise} />
    </ImageBackground>
  );
}

const heroStyles = StyleSheet.create({
  container: {
    width: '100%',
    height: verticalScale(260),
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  noise: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.ink,
    opacity: 0.08,
  },
});

// ─── Back button ───────────────────────────────────────────────────────────────

function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      style={styles.backBtn}
      onPress={() => router.back()}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
        <Path
          d="M19 12H5M12 19l-7-7 7-7"
          stroke={Colors.ink}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NewsletterArticle() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const article = ARTICLES[id] ?? ARTICLES.creatine;

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Floating back button */}
        <View style={[styles.navOverlay, { top: insets.top + Spacing.md }]}>
          <BackButton />
        </View>

        {/* Article */}
        <Animated.View entering={FadeInDown.duration(500).delay(100)} style={[styles.article, { paddingTop: insets.top + 64 }]}>
          {/* Section tag */}
          <Text style={styles.sectionTag}>{article.sectionTag}</Text>

          {/* Title */}
          <Text style={styles.articleTitle}>{article.title}</Text>

          {/* Byline */}
          <View style={styles.byline}>
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{article.author}</Text>
              <Text style={styles.pubDate}>{article.date}</Text>
            </View>
            <View style={styles.authorAvatar} />
          </View>

          <Animated.View entering={FadeIn.duration(400)} style={{ marginBottom: 22 }}>
            <MoleculeHero />
          </Animated.View>

          <View style={styles.contentsCard}>
            <Text style={styles.contentsTitle}>In this article</Text>
            {['Why the evidence stands out', 'Dose, timing and formulation', 'Safety and practical takeaways'].map((item, index) => (
              <View key={item} style={[styles.contentsRow, index > 0 && styles.contentsBorder]}><Text style={styles.contentsNumber}>0{index + 1}</Text><Text style={styles.contentsText}>{item}</Text></View>
            ))}
          </View>

          <View style={styles.takeawayCard}>
            <Text style={styles.takeawayKicker}>Key takeaways</Text>
            <Text style={styles.takeawayText}>•  Creatine monohydrate remains the best-supported form.</Text>
            <Text style={styles.takeawayText}>•  Consistency matters more than precise timing.</Text>
            <Text style={styles.takeawayText}>•  Benefits extend beyond strength into cognitive energy.</Text>
          </View>

          {/* Article body */}
          <View style={styles.body}>
            {/* First paragraph with drop cap */}
            <Text style={[styles.dropCapText, styles.dropCapParagraph]}>
              <Text style={styles.dropCap}>{article.intro.charAt(0)}</Text>
              {article.intro.slice(1)}
            </Text>

            {/* First two body paragraphs */}
            {article.body.slice(0, 2).map((para, i) => (
              <Text key={i} style={styles.bodyParagraph}>{para}</Text>
            ))}

            {/* Pull quote */}
            <View style={styles.pullQuote}>
              <Text style={styles.pullQuoteText}>{article.pullQuote}</Text>
            </View>

            {/* Remaining body paragraphs */}
            {article.body.slice(2).map((para, i) => (
              <Text key={i + 2} style={styles.bodyParagraph}>{para}</Text>
            ))}
          </View>
        </Animated.View>

        {/* Bottom padding */}
        <View style={{ height: Layout.bottomPadding }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },

  // Floating nav
  navOverlay: {
    position: 'absolute',
    left: Spacing.md,
  },
  backBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: 'rgba(233, 230, 223, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Article container
  article: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },

  // Section tag
  sectionTag: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkTertiary,
    marginBottom: 8,
  },

  // Title
  articleTitle: {
    fontFamily: Fonts.serif,
    fontSize: scale(38),
    lineHeight: scale(38) * 1.05,
    color: Colors.ink,
    letterSpacing: -0.5,
    marginBottom: Spacing.md,
  },

  // Byline
  byline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
    marginBottom: Spacing.lg,
  },
  authorInfo: { gap: 2 },
  authorName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.ink,
  },
  pubDate: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  authorAvatar: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: Colors.boneDark,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  contentsCard: { backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, borderRadius: 12, paddingHorizontal: 14, marginBottom: 14 },
  contentsTitle: { fontFamily: Fonts.serifMedium, fontSize: 18, color: Colors.ink, paddingVertical: 12 },
  contentsRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 11 },
  contentsBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline },
  contentsNumber: { fontFamily: Fonts.serifItalic, fontSize: 10, color: Colors.accent },
  contentsText: { fontFamily: Fonts.sans, fontSize: 9.5, color: Colors.inkSecondary },
  takeawayCard: { borderLeftWidth: 2, borderLeftColor: Colors.accent, backgroundColor: 'rgba(15,86,82,.05)', padding: 14, marginBottom: 24 },
  takeawayKicker: { fontFamily: Fonts.sansSemiBold, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: Colors.accent, marginBottom: 7 },
  takeawayText: { fontFamily: Fonts.sans, fontSize: 9.5, color: Colors.inkSecondary, lineHeight: 15, marginBottom: 3 },

  // Body
  body: { gap: 0 },

  // Drop cap first paragraph (inline approach — no CSS float in RN)
  dropCapParagraph: {
    marginBottom: Spacing.lg,
  },
  dropCapText: {
    fontFamily: Fonts.serif,
    fontSize: scale(19),
    lineHeight: scale(19) * 1.65,
    color: Colors.ink,
  },
  dropCap: {
    fontFamily: Fonts.serif,
    fontSize: scale(58),
    lineHeight: scale(58) * 0.85,
    color: Colors.ink,
  },

  // Regular paragraphs
  bodyParagraph: {
    fontFamily: Fonts.serif,
    fontSize: scale(19),
    lineHeight: scale(19) * 1.65,
    color: Colors.ink,
    marginBottom: Spacing.lg,
  },

  // Pull quote
  pullQuote: {
    marginVertical: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderStrong,
  },
  pullQuoteText: {
    fontFamily: Fonts.serifItalic,
    fontSize: scale(22),
    lineHeight: scale(22) * 1.35,
    color: Colors.ink,
    textAlign: 'center',
  },
});
