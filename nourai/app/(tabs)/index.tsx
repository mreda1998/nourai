import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowUpRight, Moon, ScanLine, Search, Sparkles, Sun, Sunrise, Sunset } from 'lucide-react-native';
import { Layout, Palette, Radius } from '@/constants/theme';
import { greeting, Imagery, todayHero } from '@/constants/imagery';
import { useAppState, type Product } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { isCatalogueId } from '@/lib/insights';
import { api, DailyScoreResponse, ScanHistoryItem } from '@/services/api';
import { gradeToScore, scoreQualifier } from '@/utils/grade';
import {
  Button, Card, ContributorBar, IconButton, PressableScale, ProductImage, ScoreBadge,
  ScoreGauge, Screen, Section, Skeleton, Txt,
} from '@/components/ui';

const HERO_H = 380;

export default function TodayScreen() {
  const { stack, isStackLoading, stackError, refreshStack } = useAppState();
  const { user } = useAuth();
  const [score, setScore] = useState<DailyScoreResponse | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [scoreFailed, setScoreFailed] = useState(false);
  const [recent, setRecent] = useState<ScanHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const firstName = user?.name?.trim().split(' ')[0];

  // Score whatever is in the stack right now (guests included).
  const stackIds = stack.map((p) => p.id).filter(isCatalogueId).join(',');
  const load = useCallback(async () => {
    const [s, r] = await Promise.allSettled([
      stackIds ? api.getStackScore(stackIds.split(',')) : Promise.resolve(null),
      api.getScanHistory({ limit: 8 }),
    ]);
    setScore(s.status === 'fulfilled' ? s.value : null);
    setScoreFailed(s.status === 'rejected');
    setRecent(r.status === 'fulfilled' ? r.value.items : []);
    setScoreLoading(false);
  }, [stackIds]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([load(), refreshStack()]);
    setRefreshing(false);
  };
  const hasStack = stack.length > 0;
  // Until the saved stack loads (or if it can't), don't greet a returning user as new.
  const stackUnknown = !hasStack && (isStackLoading || !!stackError);

  return (
    <Screen tabbed hero={<Hero name={firstName} />} refreshing={refreshing} onRefresh={refresh}>
      <View style={{ marginTop: -150 }}>
        {hasStack ? <ScoreCard score={score} loading={scoreLoading} failed={scoreFailed} />
          : stackUnknown ? <StackStatus failed={!!stackError} onRetry={() => refreshStack().catch(() => undefined)} />
            : <WelcomeCard />}
      </View>

      {hasStack ? <Protocol stack={stack} /> : stackUnknown ? null : <HowItWorks />}

      {recent.length > 0 ? (
        <Section title="Recently scanned" action="History" onAction={() => router.push('/(tabs)/history' as never)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {recent.map((item, i) => <RecentCard key={item.id} item={item} index={i} />)}
          </ScrollView>
        </Section>
      ) : null}

      <Section title="From the Journal" action="All stories" onAction={() => router.push('/(tabs)/journal' as never)}>
        <JournalFeature />
      </Section>
    </Screen>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ name }: { name?: string }) {
  const insets = useSafeAreaInsets();
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <View style={{ height: HERO_H + insets.top }}>
      {/* Extends above the fold so pull-to-refresh never reveals a seam. */}
      <View style={{ position: 'absolute', top: -600, left: 0, right: 0, height: 600, backgroundColor: '#EDE6DA' }} />
      <Image source={todayHero()} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" transition={300} />
      <LinearGradient
        colors={['rgba(243,240,233,0.35)', 'rgba(243,240,233,0)', 'rgba(243,240,233,0.2)', Palette.canvas]}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: Layout.gutter }}>
        <View style={styles.heroTop}>
          <PressableScale onPress={() => router.push('/(tabs)/profile' as never)} accessibilityLabel="Your profile" style={styles.avatar}>
            <Txt variant="headline" tone="accent">{(name ?? 'E').slice(0, 1).toUpperCase()}</Txt>
          </PressableScale>
          <IconButton icon={Sparkles} label="Ask Elory" variant="glass" onPress={() => router.push('/(premium)/ask-elory' as never)} />
        </View>
        <Animated.View entering={FadeInDown.duration(600).delay(80)} style={{ marginTop: 28 }}>
          <Txt variant="overline" tone="secondary">{date}</Txt>
          <Txt variant="display" style={{ marginTop: 8, maxWidth: 280 }}>
            {greeting()}{name ? `,\n${name}` : ''}
          </Txt>
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Score ────────────────────────────────────────────────────────────────────

function headline(score: number | null) {
  if (score == null) return 'Your stack at a glance';
  if (score >= 85) return 'Your stack is in excellent balance';
  if (score >= 70) return 'Your stack is working well';
  if (score >= 45) return 'A few changes would help';
  return 'Your stack needs attention';
}

function ScoreCard({ score, loading, failed }: { score: DailyScoreResponse | null; loading: boolean; failed: boolean }) {
  // A zero across the board means none of the products have scored ingredients yet.
  const noData = !score || score.categories.every((c) => c.value === 0);
  const value = noData ? null : score.overall;
  const weakest = score?.categories?.length ? [...score.categories].sort((a, b) => a.value - b.value)[0] : null;
  return (
    <Animated.View entering={FadeInDown.duration(700).delay(150)}>
      <Card padding={22} style={{ alignItems: 'stretch' }}>
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          {loading ? (
            <View style={{ height: 200, justifyContent: 'center' }}><Skeleton width={180} height={120} radius={60} /></View>
          ) : (
            <ScoreGauge score={value} size={236} label="Stack score" qualifier={value != null ? score?.qualifier ?? scoreQualifier(value) : 'Not enough data'} />
          )}
        </View>
        <Txt variant="title1" align="center" style={{ marginTop: -8 }}>{headline(value)}</Txt>
        <Txt variant="subhead" tone="secondary" align="center" style={{ marginTop: 8, paddingHorizontal: 8 }}>
          {value == null
            ? failed
              ? 'We couldn’t calculate your score. Pull down to try again.'
              : 'We’re still researching the ingredients in your stack, so there’s no score yet.'
            : weakest && weakest.value < 70
              ? `${weakest.label} is holding your score back. Tap it below to see why.`
              : 'Built from product quality, evidence strength and your health profile.'}
        </Txt>

        {!noData && score?.categories?.length ? (
          <View style={{ marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline, paddingTop: 6 }}>
            {score.categories.slice(0, 4).map((c, i) => (
              <ContributorBar key={c.key} label={c.label} value={c.value} valueLabel={`${Math.round(c.value)}`} delay={250 + i * 90} onPress={() => router.push('/domains' as never)} />
            ))}
          </View>
        ) : null}

        <PressableScale style={styles.askPill} onPress={() => router.push('/(premium)/ask-elory' as never)} accessibilityLabel="Ask Elory about your stack">
          <Sparkles size={17} color={Palette.accent} strokeWidth={2} />
          <Txt variant="subhead" tone="secondary" style={{ flex: 1 }}>Ask Elory about your stack…</Txt>
          <ArrowUpRight size={18} color={Palette.ink3} />
        </PressableScale>
      </Card>
    </Animated.View>
  );
}

function StackStatus({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <Card padding={24}>
      {failed ? (
        <>
          <Txt variant="title2">Your stack couldn’t be loaded.</Txt>
          <Txt variant="subhead" tone="secondary" style={{ marginTop: 8 }}>Check your connection and try again.</Txt>
          <Button label="Try again" variant="secondary" style={{ marginTop: 18 }} onPress={onRetry} />
        </>
      ) : (
        <View style={{ gap: 12 }}>
          <Skeleton width={140} height={14} />
          <Skeleton width={220} height={24} />
          <Skeleton width={180} height={14} />
        </View>
      )}
    </Card>
  );
}

// ─── First run ────────────────────────────────────────────────────────────────

function WelcomeCard() {
  return (
    <Animated.View entering={FadeInDown.duration(700).delay(150)}>
      <Card padding={24}>
        <Txt variant="overline" tone="accent">Start here</Txt>
        <Txt variant="title1" style={{ marginTop: 10 }}>Know what’s really{'\n'}in what you take.</Txt>
        <Txt variant="subhead" tone="secondary" style={{ marginTop: 10 }}>
          Scan any supplement, skincare or food. Elory checks every ingredient against published research — and tells you what the evidence actually supports.
        </Txt>
        <View style={{ gap: 10, marginTop: 22 }}>
          <Button label="Scan your first product" icon={<ScanLine size={19} color={Palette.onAccent} />} onPress={() => router.push('/(tabs)/scan' as never)} />
          <Button label="Search instead" variant="secondary" icon={<Search size={18} color={Palette.ink} />} onPress={() => router.push('/(tabs)/explore' as never)} />
        </View>
      </Card>
    </Animated.View>
  );
}

function HowItWorks() {
  const steps = [
    { n: '1', title: 'Scan or search', body: 'Barcode, label, or name — we identify the exact formulation.' },
    { n: '2', title: 'See the evidence', body: 'Every ingredient graded on what studies show, not marketing.' },
    { n: '3', title: 'Build your stack', body: 'Add what you use and Elory scores how it all works together.' },
  ];
  return (
    <Section title="How Elory works">
      <Card padding={6}>
        {steps.map((s, i) => (
          <View key={s.n} style={[styles.step, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline }]}>
            <View style={styles.stepNum}><Txt variant="title2" tone="accent">{s.n}</Txt></View>
            <View style={{ flex: 1 }}>
              <Txt variant="headline">{s.title}</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginTop: 3 }}>{s.body}</Txt>
            </View>
          </View>
        ))}
      </Card>
    </Section>
  );
}

// ─── Protocol timeline ────────────────────────────────────────────────────────

const SLOTS: { key: NonNullable<Product['timeOfDay']> | 'anytime'; label: string; Icon: typeof Sun }[] = [
  { key: 'morning', label: 'Morning', Icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', Icon: Sun },
  { key: 'evening', label: 'Evening', Icon: Sunset },
  { key: 'night', label: 'Night', Icon: Moon },
  { key: 'anytime', label: 'Anytime', Icon: Sun },
];

function Protocol({ stack }: { stack: Product[] }) {
  const groups = useMemo(() => SLOTS.map((slot) => ({
    ...slot,
    items: stack.filter((p) => (p.timeOfDay ?? 'anytime') === slot.key),
  })).filter((g) => g.items.length), [stack]);

  return (
    <Section title="Your routine" caption={`${stack.length} saved product${stack.length === 1 ? '' : 's'} · actual use may vary`} action="Edit" onAction={() => router.push('/(tabs)/stack' as never)}>
      <Card padding={18}>
        {groups.map((g, gi) => (
          <View key={g.key} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ alignItems: 'center', width: 28 }}>
              <View style={styles.slotIcon}><g.Icon size={15} color={Palette.accent} strokeWidth={2} /></View>
              {gi < groups.length - 1 ? <View style={styles.rail} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: gi < groups.length - 1 ? 18 : 0 }}>
              <Txt variant="overline" tone="secondary" style={{ marginTop: 7, marginBottom: 8 }}>{g.label}</Txt>
              {g.items.map((p) => (
                <PressableScale key={p.stackEntryId ?? p.id} onPress={() => router.push(`/product/${p.id}?via=stack` as never)} style={styles.protoRow} accessibilityLabel={p.name}>
                  <ProductImage uri={p.imageUri} category={p.category} size={40} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="subheadStrong" numberOfLines={1}>{p.name}</Txt>
                    <Txt variant="footnote" tone="secondary" numberOfLines={1}>{[p.brand, p.quantity].filter(Boolean).join(' · ')}</Txt>
                  </View>
                  <ScoreBadge score={gradeToScore(p.grade)} size={34} />
                </PressableScale>
              ))}
            </View>
          </View>
        ))}
      </Card>
    </Section>
  );
}

// ─── Rails ────────────────────────────────────────────────────────────────────

function RecentCard({ item, index }: { item: ScanHistoryItem; index: number }) {
  return (
    <Animated.View entering={FadeInDown.duration(500).delay(80 * index)}>
      <Card padding={14} style={{ width: 156 }} onPress={() => router.push(`/product/${item.product_id}?via=history` as never)} accessibilityLabel={item.product_name}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <ProductImage uri={item.product_image_url} category={item.product_category} size={56} />
          <ScoreBadge score={gradeToScore(item.product_grade)} size={32} />
        </View>
        <Txt variant="caption" tone="secondary" numberOfLines={1} style={{ marginTop: 14 }}>{item.product_brand || item.product_category}</Txt>
        <Txt variant="subheadStrong" numberOfLines={2} style={{ marginTop: 2, minHeight: 40 }}>{item.product_name}</Txt>
      </Card>
    </Animated.View>
  );
}

function JournalFeature() {
  return (
    <PressableScale onPress={() => router.push('/newsletter/creatine' as never)} style={styles.journal} accessibilityLabel="Read: Creatine beyond strength">
      <Image source={Imagery.journalCover} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={['rgba(10,29,28,0)', 'rgba(10,29,28,0.78)']} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20 }}>
        <Txt variant="overline" tone="inverse2">Research brief · 7 min</Txt>
        <Txt variant="title1" tone="inverse" style={{ marginTop: 8 }}>Creatine beyond strength</Txt>
        <Txt variant="footnote" tone="inverse2" style={{ marginTop: 6 }}>What the newest trials say about memory, mood and ageing.</Txt>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(252,251,248,0.82)', alignItems: 'center', justifyContent: 'center' },
  askPill: { marginTop: 18, height: 50, borderRadius: 25, backgroundColor: 'rgba(14,31,30,0.05)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  step: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14 },
  stepNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
  slotIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rail: { flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: Palette.hairline, marginTop: 4 },
  protoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  journal: { height: 280, borderRadius: Radius.xl, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: Palette.sunken },
});
