import React, { useCallback, useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { api, DailyScoreResponse, ScanHistoryItem } from '@/services/api';
import { BrandMark, EloryScreen, FactorBar, ProductThumb, ScoreRing } from '@/components/elory';

const hero = require('@/assets/images/elory-architecture-hero.png');

function Header({ name }: { name?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{name?.slice(0, 1).toUpperCase() || 'E'}</Text></View>
      <BrandMark compact />
      <View style={styles.headerActions}><Text style={styles.headerIcon}>⌁</Text><View style={styles.notificationDot} /></View>
    </View>
  );
}

function ReturningHome({ userName }: { userName: string }) {
  const [score, setScore] = useState<DailyScoreResponse | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    api.getDailyScore().then((value) => alive && setScore(value)).catch(() => {});
    return () => { alive = false; };
  }, []));

  const overall = score?.overall ?? 82;
  const categories = score?.categories?.length ? score.categories : [
    { key: 'stack', label: 'Supplement stack', value: 86 },
    { key: 'nutrition', label: 'Nutrition quality', value: 79 },
    { key: 'evidence', label: 'Evidence strength', value: 83 },
  ];

  return (
    <EloryScreen header={<Header name={userName} />}>
      <Text style={styles.greeting}>Good morning, {userName}</Text>
      <Text style={styles.intro}>Here is your longevity overview for today.</Text>
      <View style={styles.scoreCard}>
        <Text style={styles.cardEyebrow}>Daily Longevity Score</Text>
        <View style={styles.scoreLead}>
          <ScoreRing score={overall} qualifier={score?.qualifier ?? 'Excellent'} size={118} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scoreStatement}>{overall >= 70 ? 'Your stack is in strong balance.' : 'A few small changes can help.'}</Text>
            <Text style={styles.bodyMuted}>Built from product quality, evidence strength and your health profile.</Text>
          </View>
        </View>
        {categories.slice(0, 4).map((category) => <FactorBar key={category.key} label={category.label} value={category.value} />)}
      </View>
      <Pressable style={styles.journalCard} onPress={() => router.push('/newsletter/creatine' as never)}>
        <ImageBackground source={hero} style={styles.journalImage} imageStyle={{ borderRadius: Radius.lg }}>
          <View style={styles.journalOverlay} />
          <View style={styles.journalCopy}>
            <Text style={styles.journalKicker}>From the Elory Journal</Text>
            <Text style={styles.journalTitle}>Omega-3s and healthy aging</Text>
            <Text style={styles.journalLink}>Read the latest research  →</Text>
          </View>
        </ImageBackground>
      </Pressable>
      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.actions}>
        <QuickAction icon="scan" label="Scan product" onPress={() => router.push('/(tabs)/scan' as never)} />
        <QuickAction icon="search" label="Search" onPress={() => router.push('/(tabs)/explore' as never)} />
        <QuickAction icon="plus" label="Add to stack" onPress={() => router.push('/(tabs)/stack' as never)} />
      </View>
    </EloryScreen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={Colors.accent} strokeWidth={1.4}>
        {icon === 'search' ? <><Circle cx={10.5} cy={10.5} r={6.5} /><Path d="M16 16l4 4" /></> : icon === 'plus' ? <><Circle cx={12} cy={12} r={8.5} /><Path d="M12 8v8M8 12h8" /></> : <><Path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" /><Path d="M4 12h16" /></>}
      </Svg>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function NewUserHome() {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<ScanHistoryItem[]>([]);
  useFocusEffect(useCallback(() => {
    let alive = true;
    api.getScanHistory({ limit: 3 }).then((value) => alive && setRecent(value.items)).catch(() => {});
    return () => { alive = false; };
  }, []));
  const search = () => query.trim() && router.push({ pathname: '/(tabs)/explore', params: { q: query.trim() } } as never);
  const placeholders = [
    { id: 'demo-1', product_id: 'demo-1', product_name: 'Daily face serum', product_category: 'cosmetic', scanned_at: new Date().toISOString() },
    { id: 'demo-2', product_id: 'demo-2', product_name: 'Magnesium glycinate', product_category: 'supplement', scanned_at: new Date().toISOString() },
  ] as ScanHistoryItem[];

  return (
    <EloryScreen header={<Header />} contentStyle={{ paddingTop: 0 }}>
      <ImageBackground source={hero} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.heroWash} />
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Understand.{`\n`}Don’t guess.</Text>
          <Text style={styles.heroDek}>Scan any product. See the science behind every ingredient.</Text>
        </View>
      </ImageBackground>
      <View style={styles.searchBox}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="Search products or ingredients" placeholderTextColor={Colors.inkTertiary} style={styles.searchInput} />
      </View>
      <Pressable style={styles.scanCard} onPress={() => router.push('/(tabs)/scan' as never)}>
        <View style={styles.scanIcon}><Text style={{ color: '#fff', fontSize: 19 }}>⌗</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.scanTitle}>Scan a product</Text><Text style={styles.bodyMuted}>Point your camera at any barcode or label.</Text></View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Recently scanned</Text><Text style={styles.link}>View all</Text></View>
      {(recent.length ? recent : placeholders).map((item) => (
        <Pressable key={item.id} style={styles.recentRow} onPress={() => !item.id.startsWith('demo') && router.push(`/product/${item.product_id}` as never)}>
          <ProductThumb letter={item.product_name.slice(0, 1)} imageUri={item.product_image_url} size={44} />
          <View style={{ flex: 1 }}><Text style={styles.recentName}>{item.product_name}</Text><Text style={styles.recentMeta}>{item.product_category} · Recently scanned</Text></View>
          <View style={styles.miniScore}><Text style={styles.miniScoreText}>{item.id === 'demo-2' ? '89' : '84'}</Text></View>
        </Pressable>
      ))}
    </EloryScreen>
  );
}

export default function HomeScreen() {
  const { stack } = useAppState();
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] ?? 'Salung';
  return stack.length ? <ReturningHome userName={firstName} /> : <NewUserHome />;
}

const styles = StyleSheet.create({
  header: { height: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#D8C4A7', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 16 },
  headerActions: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: Colors.borderHairline, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { color: Colors.ink, fontSize: 17 }, notificationDot: { position: 'absolute', top: 5, right: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.alert },
  greeting: { fontFamily: Fonts.serif, color: Colors.ink, fontSize: 31, lineHeight: 34, marginTop: 4 },
  intro: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.inkSecondary, marginTop: 4, marginBottom: 22 },
  scoreCard: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 17, marginBottom: 20 },
  cardEyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 9, letterSpacing: 1.15, textTransform: 'uppercase', color: Colors.inkSecondary, marginBottom: 14 },
  scoreLead: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 16 },
  scoreStatement: { fontFamily: Fonts.serifItalic, fontSize: 18, lineHeight: 21, color: Colors.ink, marginBottom: 7 },
  bodyMuted: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 10.5, lineHeight: 15 },
  journalCard: { marginBottom: 24 }, journalImage: { height: 174, justifyContent: 'flex-end' },
  journalOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: Radius.lg, backgroundColor: 'rgba(11,42,40,.25)' }, journalCopy: { padding: 17 },
  journalKicker: { fontFamily: Fonts.sansSemiBold, fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 1.1, color: '#fff', marginBottom: 6 },
  journalTitle: { fontFamily: Fonts.serif, color: '#fff', fontSize: 23 }, journalLink: { fontFamily: Fonts.sansMedium, color: 'rgba(255,255,255,.86)', fontSize: 9.5, marginTop: 6 },
  sectionTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 21 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 }, action: { flex: 1, height: 84, borderRadius: Radius.md, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, alignItems: 'center', justifyContent: 'center', gap: 8 }, actionText: { fontFamily: Fonts.sansMedium, fontSize: 9.5, color: Colors.ink },
  hero: { height: 344, marginHorizontal: -20, marginBottom: -19, justifyContent: 'flex-start' }, heroImage: { resizeMode: 'cover' }, heroWash: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(247,244,238,.08)' }, heroCopy: { paddingHorizontal: 20, paddingTop: 32, width: '72%' },
  heroTitle: { fontFamily: Fonts.serif, color: Colors.ink, fontSize: 39, lineHeight: 38 }, heroDek: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, color: Colors.inkSecondary, marginTop: 9, maxWidth: 220 },
  searchBox: { height: 51, backgroundColor: Colors.surfaceCard, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, gap: 9, marginBottom: 12 }, searchGlyph: { fontSize: 21, color: Colors.inkSecondary }, searchInput: { flex: 1, fontFamily: Fonts.sans, fontSize: 12, color: Colors.ink },
  scanCard: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 24 }, scanIcon: { width: 43, height: 43, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, scanTitle: { fontFamily: Fonts.serifMedium, fontSize: 16, color: Colors.ink, marginBottom: 2 }, arrow: { color: Colors.inkSecondary, fontSize: 24 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }, link: { fontFamily: Fonts.sansMedium, fontSize: 9.5, color: Colors.accent }, recentRow: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline }, recentName: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.ink }, recentMeta: { fontFamily: Fonts.sans, fontSize: 9.5, color: Colors.inkSecondary, marginTop: 3 }, miniScore: { width: 35, height: 35, borderRadius: 18, borderWidth: 2, borderColor: Colors.sage, alignItems: 'center', justifyContent: 'center' }, miniScoreText: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 13 },
});
