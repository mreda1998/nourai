import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, ScanHistoryItem, SearchHistoryItem } from '@/services/api';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, FilterPills, ProductThumb, ScreenHeader } from '@/components/elory';

type Row = { id: string; type: 'scan' | 'search'; title: string; meta: string; at: string; productId?: string; category?: string; grade?: string; imageUri?: string | null };
const filters = [{ key: 'all', label: 'All' }, { key: 'scan', label: 'Scans' }, { key: 'search', label: 'Searches' }];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export default function HistoryScreen() {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([api.getScanHistory({ limit: 50 }), api.getSearchHistory({ limit: 50 })]).then(([a, b]) => {
      if (alive) { setScans(a.items); setSearches(b.items); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []));

  const rows = useMemo<Row[]>(() => {
    const scanRows = scans.map((item): Row => ({ id: item.id, type: 'scan', title: item.product_name, meta: `${item.product_brand || item.product_category} · Product scan`, at: item.scanned_at, productId: item.product_id, category: item.product_category, grade: item.product_grade, imageUri: item.product_image_url }));
    const searchRows = searches.map((item): Row => ({ id: item.id, type: 'search', title: item.query, meta: `${item.result_type || 'Product'} search`, at: item.searched_at }));
    const fallback: Row[] = [
      { id: 'demo-1', type: 'scan', title: 'Magnesium Glycinate', meta: 'Thorne · Product scan', at: new Date().toISOString(), category: 'supplement', grade: 'A' },
      { id: 'demo-2', type: 'search', title: 'niacinamide', meta: 'Ingredient search', at: new Date(Date.now() - 3600000).toISOString() },
      { id: 'demo-3', type: 'scan', title: 'Daily Hydrating Lotion', meta: 'CeraVe · Product scan', at: new Date(Date.now() - 86400000).toISOString(), category: 'cosmetic', grade: 'B' },
    ];
    return [...scanRows, ...searchRows].length ? [...scanRows, ...searchRows] : fallback;
  }, [scans, searches]);

  const visible = rows.filter((item) => (filter === 'all' || item.type === filter) && item.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const groups = visible.reduce<Record<string, Row[]>>((acc, item) => { const key = dayLabel(item.at); (acc[key] ||= []).push(item); return acc; }, {});

  return (
    <EloryScreen header={<ScreenHeader title="History" />}>
      <View style={styles.search}><Text style={styles.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search your history" placeholderTextColor={Colors.inkTertiary} style={styles.searchInput} /></View>
      <FilterPills options={filters} selected={filter} onSelect={setFilter} />
      {Object.entries(groups).map(([day, items]) => (
        <View key={day} style={styles.group}>
          <Text style={styles.day}>{day}</Text>
          {items.map((item) => (
            <Pressable key={item.id} style={styles.row} onPress={() => item.productId && router.push(`/product/${item.productId}` as never)}>
              {item.type === 'scan' ? <ProductThumb size={42} letter={item.title.slice(0, 1)} imageUri={item.imageUri} /> : <View style={styles.searchThumb}><Text style={styles.searchThumbIcon}>⌕</Text></View>}
              <View style={{ flex: 1 }}><Text style={styles.title}>{item.title}</Text><Text style={styles.meta}>{item.meta} · {new Date(item.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View>
              {item.type === 'scan' ? <View style={[styles.grade, { borderColor: item.grade === 'A' ? Colors.sage : Colors.sand }]}><Text style={styles.gradeText}>{item.grade === 'A' ? '91' : '82'}</Text></View> : <Text style={styles.arrow}>›</Text>}
            </Pressable>
          ))}
        </View>
      ))}
    </EloryScreen>
  );
}

const styles = StyleSheet.create({
  search: { height: 48, borderRadius: Radius.pill, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 9, marginBottom: 14 }, searchIcon: { color: Colors.inkSecondary, fontSize: 20 }, searchInput: { flex: 1, color: Colors.ink, fontFamily: Fonts.sans, fontSize: 11 },
  group: { marginTop: 23 }, day: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 20, marginBottom: 4 },
  row: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', gap: 12 }, searchThumb: { width: 42, height: 52, borderRadius: 21, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }, searchThumbIcon: { color: Colors.accent, fontSize: 18 }, title: { fontFamily: Fonts.sansMedium, fontSize: 12, color: Colors.ink }, meta: { fontFamily: Fonts.sans, fontSize: 8.5, color: Colors.inkSecondary, marginTop: 4 }, grade: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, gradeText: { fontFamily: Fonts.serifMedium, fontSize: 12, color: Colors.ink }, arrow: { color: Colors.inkSecondary, fontSize: 22 },
});
