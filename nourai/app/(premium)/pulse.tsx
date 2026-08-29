import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Colors, Fonts, FontSizes, scale } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { api, EvidenceArticle } from '@/services/api';
import { useAppState } from '@/context/app-state';

function toneColor(tone: string) {
  if (tone === 'sage') return Colors.sage;
  if (tone === 'alert') return Colors.alert;
  return Colors.sand;
}

function toneIcon(tone: string) {
  if (tone === 'alert') return '◐';
  if (tone === 'sage') return '◉';
  return '◇';
}

function Sparkline({ values }: { values: number[] }) {
  const width = scale(64);
  const height = scale(24);
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => ({
    x: i * stepX,
    y: height - ((v - min) / range) * height,
  }));

  // Smooth the polyline into a cubic-bezier path through the points.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={d} stroke={Colors.sand} strokeWidth={1.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function EvidenceDots({ count, tone }: { count: number; tone: string }) {
  const fill = toneColor(tone);
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: 5, height: 5, borderRadius: 3,
            backgroundColor: i <= count ? fill : 'transparent',
            borderWidth: 1, borderColor: fill,
          }}
        />
      ))}
    </View>
  );
}

export default function PulseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stack } = useAppState();
  const [articles, setArticles] = useState<EvidenceArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptyMessage, setEmptyMessage] = useState('Scan products to build your stack and unlock your evidence feed.');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setEmptyMessage(
            stack.length > 0
              ? 'Sign in to sync your stack and load evidence records for these ingredients.'
              : 'Scan products to build your stack and unlock your evidence feed.',
          );
          return;
        }
        const res = await api.getEvidencePulse(token, 10);
        setArticles(res.articles);
        if (res.articles.length === 0) {
          setEmptyMessage(
            stack.length > 0
              ? 'Your stack is synced, but no curated evidence records are attached to these ingredients yet.'
              : 'Scan products to build your stack and unlock your evidence feed.',
          );
        }
      } catch {
        setEmptyMessage('Could not load the evidence feed right now.');
      } finally {
        setLoading(false);
      }
    })();
  }, [stack.length]);

  const ingredientCount = new Set(articles.map((a) => a.ingredient)).size;
  // Sparkline wave = each article's evidence-strength (`dots`, 1-4) in fetch order,
  // i.e. the recent evidence-strength trend across the digest — a real signal
  // derived from already-fetched data, not a fabricated/random series.
  const dotsSeries = articles.slice(0, 8).map((a) => a.dots);

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + scale(48) }]}
      >
        {/* Editorial header */}
        <View style={{ paddingTop: insets.top + scale(12), paddingHorizontal: scale(24), paddingBottom: scale(20) }}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(18,51,50,0.6)" strokeWidth={2}>
                <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <View style={styles.atelierBadge}>
              <Text style={styles.atelierBadgeText}>ELORY PREMIUM</Text>
            </View>
          </View>
          <Text style={styles.eyebrow}>Premium · Science Brief</Text>
          <Text style={styles.title}>Evidence{'\n'}<Text style={{ fontStyle: 'italic' }}>pulse.</Text></Text>
        </View>

        <View style={{ paddingHorizontal: scale(24) }}>
          {loading ? (
            <ActivityIndicator color={Colors.sand} style={{ marginVertical: scale(32) }} />
          ) : articles.length === 0 ? (
            <Animated.View entering={FadeInUp.duration(300)}>
              <Text style={styles.emptyText}>
                {emptyMessage}
              </Text>
            </Animated.View>
          ) : (
            <>
              <Animated.View entering={FadeInUp.duration(300)}>
                <View style={styles.digestRow}>
                  <Text style={[styles.subtitle, styles.digestText]}>
                    {articles.length} signal{articles.length !== 1 ? 's' : ''} across {ingredientCount} ingredient{ingredientCount !== 1 ? 's' : ''} in your stack.
                  </Text>
                  <Sparkline values={dotsSeries} />
                </View>
                <View style={styles.subtitleDivider} />
              </Animated.View>

              {articles.map((article, i) => (
                <Animated.View
                  key={i}
                  entering={FadeInUp.delay(i * 80 + 80).duration(320)}
                  style={[styles.article, i < articles.length - 1 && styles.articleBorder]}
                >
                  <View style={styles.articleMeta}>
                    <Text style={[styles.ingredientLabel, { color: toneColor(article.tone) }]}>
                      {toneIcon(article.tone)} {article.ingredient}
                    </Text>
                    <EvidenceDots count={article.dots} tone={article.tone} />
                  </View>
                  <Text style={styles.headline}>{article.headline}</Text>
                  <View style={styles.excerpt}>
                    <Text style={styles.excerptText}>{article.excerpt}</Text>
                  </View>
                  <View style={styles.footer}>
                    <Text style={styles.journal}>{article.journal}</Text>
                  </View>
                </Animated.View>
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surface },
  scroll: {},
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(24) },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(18,51,50,0.6)' },
  atelierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(18,51,50,0.22)', borderRadius: 999 },
  atelierBadgeText: { fontFamily: Fonts.sansSemiBold, fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: Colors.sand },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(18,51,50,0.45)', marginBottom: scale(10) },
  title: { fontFamily: Fonts.serif, fontSize: scale(38), lineHeight: scale(40), color: Colors.ink, letterSpacing: -0.5 },
  subtitle: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, lineHeight: FontSizes.subtitle * 1.5, color: 'rgba(18,51,50,0.75)', paddingBottom: scale(20) },
  digestRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: scale(12) },
  digestText: { flex: 1, paddingBottom: 0 },
  subtitleDivider: { height: 1, backgroundColor: 'rgba(18,51,50,0.12)', marginTop: scale(14), marginBottom: scale(24) },
  article: { paddingVertical: scale(20), gap: scale(12) },
  articleBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(18,51,50,0.1)' },
  articleMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ingredientLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.6, fontWeight: '600' },
  headline: { fontFamily: Fonts.serif, fontSize: scale(22), lineHeight: scale(27), color: Colors.ink },
  excerpt: { borderLeftWidth: 1, borderLeftColor: 'rgba(18,51,50,0.2)', paddingLeft: scale(14) },
  excerptText: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, color: 'rgba(18,51,50,0.6)', lineHeight: FontSizes.subtitle * 1.5 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  journal: { fontFamily: Fonts.sansSemiBold, fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(18,51,50,0.4)' },
  emptyText: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, color: 'rgba(18,51,50,0.5)', lineHeight: FontSizes.subtitle * 1.5 },
});
