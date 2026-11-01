import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { History as HistoryIcon, Search } from 'lucide-react-native';
import { api, ScanHistoryItem, SearchHistoryItem } from '@/services/api';
import { Palette } from '@/constants/theme';
import { EmptyState, ListGroup, ListRow, ProductImage, Screen, SearchField, Section, SegmentedControl } from '@/components/ui';

type Row =
  | { kind: 'scan'; id: string; at: string; item: ScanHistoryItem }
  | { kind: 'search'; id: string; at: string; item: SearchHistoryItem };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function HistoryScreen() {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [searches, setSearches] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'scan' | 'search'>('all');
  const [query, setQuery] = useState('');

  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.allSettled([api.getScanHistory({ limit: 50 }), api.getSearchHistory({ limit: 50 })]).then(([a, b]) => {
      if (!alive) return;
      setScans(a.status === 'fulfilled' ? a.value.items : []);
      setSearches(b.status === 'fulfilled' ? b.value.items : []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []));

  const groups = useMemo(() => {
    const rows: Row[] = [
      ...scans.map((item): Row => ({ kind: 'scan', id: item.id, at: item.scanned_at, item })),
      ...searches.map((item): Row => ({ kind: 'search', id: item.id, at: item.searched_at, item })),
    ];
    const needle = query.trim().toLowerCase();
    const visible = rows
      .filter((r) => filter === 'all' || r.kind === filter)
      .filter((r) => !needle || (r.kind === 'scan' ? r.item.product_name : r.item.query).toLowerCase().includes(needle))
      .sort((a, b) => +new Date(b.at) - +new Date(a.at));
    const out: { day: string; rows: Row[] }[] = [];
    for (const r of visible) {
      const day = dayLabel(r.at);
      const last = out[out.length - 1];
      if (last?.day === day) last.rows.push(r); else out.push({ day, rows: [r] });
    }
    return out;
  }, [scans, searches, filter, query]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <Screen back title="History">
      <SearchField value={query} onChangeText={setQuery} onClear={() => setQuery('')} placeholder="Search your history" />
      <SegmentedControl
        style={{ marginTop: 12 }}
        options={[{ key: 'all', label: 'All' }, { key: 'scan', label: 'Scans' }, { key: 'search', label: 'Searches' }]}
        value={filter}
        onChange={setFilter}
      />

      {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 32 }} /> : groups.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title={query ? 'No matches' : 'Nothing here yet'}
          message={query ? undefined : 'Products you scan and things you search will show up here.'}
          action={query ? undefined : 'Scan a product'}
          onAction={() => router.push('/(tabs)/scan' as never)}
        />
      ) : groups.map((g) => (
        <Section key={g.day} title={g.day} style={{ marginTop: 28 }}>
          <ListGroup>
            {g.rows.map((r) => r.kind === 'scan' ? (
              <ListRow
                key={r.id}
                leading={<ProductImage uri={r.item.product_image_url} category={r.item.product_category} size={44} />}
                title={r.item.product_name}
                subtitle={`${r.item.product_brand || r.item.product_category} · ${time(r.at)}`}
                onPress={() => router.push(`/product/${r.item.product_id}?via=history` as never)}
              />
            ) : (
              <ListRow
                key={r.id}
                leading={<View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: Palette.sunken, alignItems: 'center', justifyContent: 'center' }}><Search size={18} color={Palette.ink2} /></View>}
                title={r.item.query}
                subtitle={`${r.item.result_type === 'ingredient' ? 'Ingredient' : 'Product'} search · ${time(r.at)}`}
                onPress={() => router.push({ pathname: '/(tabs)/explore', params: { q: r.item.query } } as never)}
              />
            ))}
          </ListGroup>
        </Section>
      ))}
    </Screen>
  );
}
