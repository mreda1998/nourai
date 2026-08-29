import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAppState, type Product } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { api } from '@/services/api';
import { supabase } from '@/lib/supabase';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, FilterPills, ProductThumb, ScreenHeader } from '@/components/elory';

const filters = [
  { key: 'all', label: 'All' },
  { key: 'supplement', label: 'Supplements' },
  { key: 'cosmetic', label: 'Skincare' },
  { key: 'food', label: 'Food' },
];

const demo: Product[] = [
  { id: 'demo-magnesium', name: 'Magnesium Glycinate', brand: 'Thorne', category: 'supplement', grade: 'A', ingredients: ['Magnesium'], scannedAt: new Date(), quantity: '200 mg', timeOfDay: 'evening' },
  { id: 'demo-omega', name: 'Super Omega-3', brand: 'Life Extension', category: 'supplement', grade: 'A', ingredients: ['EPA', 'DHA'], scannedAt: new Date(), quantity: '2 softgels', timeOfDay: 'morning' },
  { id: 'demo-retinal', name: 'Retinal 0.1%', brand: 'Geek & Gorgeous', category: 'cosmetic', grade: 'B', ingredients: ['Retinal'], scannedAt: new Date(), quantity: '3 nights / week', timeOfDay: 'night' },
];

function StackRow({ item, onRemove }: { item: Product; onRemove: () => void }) {
  const score = item.grade === 'A' ? 91 : item.grade === 'B' ? 82 : item.grade === 'C' ? 70 : 58;
  return (
    <Pressable style={styles.row} onPress={() => !item.id.startsWith('demo-') && router.push(`/product/${item.id}` as never)}>
      <ProductThumb size={45} imageUri={item.imageUri} letter={item.name.slice(0, 1)} />
      <View style={{ flex: 1 }}>
        <Text style={styles.brand}>{item.brand || item.category}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.dose}>{item.quantity || (item.category === 'cosmetic' ? 'Use as directed' : 'Daily')}</Text>
      </View>
      <View style={[styles.score, { borderColor: score >= 85 ? Colors.sage : Colors.sand }]}><Text style={styles.scoreText}>{score}</Text></View>
      <Pressable hitSlop={12} onPress={onRemove}><Text style={styles.more}>•••</Text></Pressable>
    </Pressable>
  );
}

export default function StackScreen() {
  const { stack, hydrateFromServer, removeFromStack } = useAppState();
  const { isSignedIn } = useAuth();
  const [filter, setFilter] = useState('all');

  useFocusEffect(useCallback(() => {
    if (!isSignedIn) return;
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const entries = await api.getStack(session.access_token);
      if (alive) hydrateFromServer(entries);
    })().catch(() => {});
    return () => { alive = false; };
  }, [hydrateFromServer, isSignedIn]));

  const content = stack.length ? stack : demo;
  const filtered = useMemo(() => filter === 'all' ? content : content.filter((item) => item.category === filter), [content, filter]);
  const essentials = filtered.filter((item) => item.timeOfDay !== 'night' || item.category === 'supplement');
  const asNeeded = filtered.filter((item) => item.timeOfDay === 'night' && item.category !== 'supplement');

  const remove = async (item: Product) => {
    if (item.id.startsWith('demo-')) return;
    removeFromStack(item.id);
    if (isSignedIn) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) api.removeFromStack(session.access_token, item.id).catch(() => {});
    }
  };

  return (
    <EloryScreen header={<ScreenHeader title="My Stack" right={<Pressable onPress={() => router.push('/(tabs)/explore' as never)} style={styles.add}><Text style={styles.addText}>＋</Text></Pressable>} />}>
      <Text style={styles.subtitle}>Your daily products, organized around your health.</Text>
      <FilterPills options={filters} selected={filter} onSelect={setFilter} />
      <View style={styles.summary}>
        <View><Text style={styles.summaryValue}>{filtered.length}</Text><Text style={styles.summaryLabel}>products</Text></View>
        <View style={styles.summaryRule} />
        <View><Text style={styles.summaryValue}>86</Text><Text style={styles.summaryLabel}>stack score</Text></View>
        <Pressable style={styles.optimize} onPress={() => router.push('/(premium)/conflict-map' as never)}><Text style={styles.optimizeText}>Optimize stack</Text></Pressable>
      </View>
      <Section title="Daily essentials" caption="Your core routine" items={essentials} onRemove={remove} />
      {asNeeded.length > 0 ? <Section title="As needed" caption="Targeted use" items={asNeeded} onRemove={remove} /> : null}
      <Pressable style={styles.addProduct} onPress={() => router.push('/(tabs)/explore' as never)}><Text style={styles.addProductText}>＋  Add a product</Text></Pressable>
    </EloryScreen>
  );
}

function Section({ title, caption, items, onRemove }: { title: string; caption: string; items: Product[]; onRemove: (item: Product) => void }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionCaption}>{caption}</Text></View>
      {items.map((item) => <StackRow key={item.id} item={item} onRemove={() => onRemove(item)} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 10.5, textAlign: 'center', marginTop: -7, marginBottom: 15 },
  add: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, addText: { color: Colors.accentInk, fontSize: 17, lineHeight: 18 },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, borderRadius: Radius.md, padding: 13, marginTop: 17, marginBottom: 23, gap: 13 }, summaryValue: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 22, lineHeight: 22, textAlign: 'center' }, summaryLabel: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8.5, marginTop: 3 }, summaryRule: { height: 29, width: StyleSheet.hairlineWidth, backgroundColor: Colors.borderHairline }, optimize: { marginLeft: 'auto', backgroundColor: Colors.accent, borderRadius: Radius.pill, paddingVertical: 9, paddingHorizontal: 13 }, optimizeText: { fontFamily: Fonts.sansMedium, color: Colors.accentInk, fontSize: 9.5 },
  section: { marginBottom: 21 }, sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }, sectionTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 20 }, sectionCaption: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8.5 },
  row: { minHeight: 77, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderHairline }, brand: { fontFamily: Fonts.sansSemiBold, textTransform: 'uppercase', color: Colors.inkSecondary, fontSize: 7.5, letterSpacing: .7, marginBottom: 2 }, name: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 12 }, dose: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 9, marginTop: 3 }, score: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, scoreText: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 12 }, more: { fontFamily: Fonts.sansSemiBold, color: Colors.inkTertiary, letterSpacing: 1, transform: [{ rotate: '90deg' }] },
  addProduct: { height: 47, borderRadius: Radius.pill, borderWidth: 1, borderColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, addProductText: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 11 },
});
