import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { Layers3 } from 'lucide-react-native';
import { Palette } from '@/constants/theme';
import { api, ExposureCategory, ExposureDay } from '@/services/api';
import { accessToken } from '@/lib/stack-sync';
import { useAppState } from '@/context/app-state';
import { Card, EmptyState, Screen, Section, Txt } from '@/components/ui';

const BAR_COLORS = [Palette.weak, Palette.gold, Palette.ink4];

const LOCAL_EXPOSURE_RULES: Record<string, string[]> = {
  'Added caffeine': ['caffeine', 'guarana', 'yerba mate', 'green tea extract'],
  'Added sugars': ['sugar', 'sucrose', 'fructose', 'glucose', 'dextrose', 'corn syrup', 'maltodextrin'],
  'Seed oils': ['canola oil', 'soybean oil', 'sunflower oil', 'safflower oil', 'corn oil', 'cottonseed oil', 'grapeseed oil'],
  'Emulsifiers / thickeners': ['lecithin', 'carrageenan', 'polysorbate', 'diglyceride', 'cellulose gum', 'xanthan gum', 'guar gum'],
  'Artificial sweeteners': ['sucralose', 'aspartame', 'acesulfame', 'saccharin'],
  'Preservatives': ['paraben', 'phenoxyethanol', 'benzoate', 'sorbate', 'bha', 'bht', 'nitrite'],
  'Synthetic fragrance': ['fragrance', 'parfum', 'limonene', 'linalool', 'citral', 'coumarin', 'geraniol'],
};

const LOCAL_EXPOSURE_NOTES: Record<string, string> = {
  'Added caffeine': 'Caffeine-containing ingredients on product labels; this is not a mg dose estimate.',
  'Added sugars': 'Sugar-like ingredients on labels; nutrition-panel grams are not yet integrated here.',
  'Seed oils': 'Common refined seed oils identified from ingredient names.',
  'Emulsifiers / thickeners': 'Functional additives identified from ingredient names.',
  'Artificial sweeteners': 'Non-nutritive sweeteners identified from ingredient names.',
  'Preservatives': 'Preservative ingredients identified from ingredient names.',
  'Synthetic fragrance': 'Fragrance allergens or parfum/fragrance terms identified from cosmetic labels.',
};

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localExposureLedger(stack: ReturnType<typeof useAppState>['stack']) {
  const today = new Date();
  const todayKey = dayKey(today);
  const dailyTotals: Record<string, number> = {};
  const todayScores: Record<string, number> = {};
  const sources: Record<string, Set<string>> = {};

  stack.forEach((product) => {
    const productDay = dayKey(new Date(product.scannedAt));
    const labelText = [product.name, product.brand, ...product.ingredients].join(' ').toLowerCase();
    Object.entries(LOCAL_EXPOSURE_RULES).forEach(([category, terms]) => {
      if (!terms.some((term) => labelText.includes(term))) return;
      dailyTotals[productDay] = (dailyTotals[productDay] ?? 0) + 0.45;
      if (productDay === todayKey) {
        todayScores[category] = (todayScores[category] ?? 0) + 0.45;
        if (!sources[category]) sources[category] = new Set();
        sources[category].add(product.name);
      }
    });
  });

  const chart: ExposureDay[] = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (13 - index));
    const total = dailyTotals[dayKey(date)] ?? 0;
    return {
      date: dayKey(date),
      high: Math.min(1, total / 8),
      moderate: Math.min(1, total / 5),
      low: Math.min(1, total / 3),
    };
  });

  const categories: ExposureCategory[] = Object.entries(todayScores)
    .map(([name, score]) => ({
      name,
      load: Math.min(1, score / 3),
      delta: 'local',
      sources: sources[name]?.size ?? 0,
      alert: score >= 1.4,
      note: LOCAL_EXPOSURE_NOTES[name],
    }))
    .sort((a, b) => b.load - a.load);

  return {
    chart,
    categories,
    summary: categories.length > 0
      ? `Local preview found ${categories.length} label-exposure ${categories.length === 1 ? 'category' : 'categories'} in today's stack.`
      : 'No label-exposure signals found in your local stack today.',
    caveat: 'Local preview: sign in to sync your stack. This is a relative label screen, not a dose, blood-level, toxicity, or clinical-risk estimate.',
  };
}

function StackedBars({ data }: { data: ExposureDay[] }) {
  const [w, setW] = useState(0);
  const H = 120;
  const gap = 4;
  const barW = data.length ? (w - gap * (data.length - 1)) / data.length : 0;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          {data.map((day, i) => {
            let y = H;
            return [day.high, day.moderate, day.low].map((seg, j) => {
              const h = Math.max(seg * H * 0.32, seg > 0 ? 2 : 0);
              y -= h;
              const rect = <Rect key={`${i}-${j}`} x={i * (barW + gap)} y={y} width={barW} height={h} rx={3} fill={BAR_COLORS[j]} />;
              y -= seg > 0 ? 2 : 0;
              return rect;
            });
          })}
          {data.map((_, i) => <Rect key={`b${i}`} x={i * (barW + gap)} y={H - 2} width={barW} height={2} rx={1} fill={Palette.hairline} />)}
        </Svg>
      ) : <View style={{ height: H }} />}
    </View>
  );
}

export default function ExposureScreen() {
  const { stack } = useAppState();
  const [chart, setChart] = useState<ExposureDay[]>([]);
  const [categories, setCategories] = useState<ExposureCategory[]>([]);
  const [summary, setSummary] = useState('');
  const [caveat, setCaveat] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const local = localExposureLedger(stack);
      const apply = (r: { chart: ExposureDay[]; categories: ExposureCategory[]; summary: string; caveat: string }) => {
        setChart(r.chart); setCategories(r.categories); setSummary(r.summary); setCaveat(r.caveat);
      };
      try {
        const token = await accessToken();
        if (!token) { apply(local); return; }
        const res = await api.getExposureLedger(token);
        apply(res.categories.length > 0 || stack.length === 0 ? res : local);
      } catch { apply(local); } finally { setLoading(false); }
    })();
  }, [stack]);

  return (
    <Screen back title="Exposure ledger" subtitle="Additives and synthetics across everything you use">
      {loading ? <ActivityIndicator color={Palette.accent} style={{ marginTop: 32 }} /> : !categories.length ? (
        <EmptyState icon={Layers3} title="Nothing flagged" message={summary || 'No additive signals found in your stack today.'} action={stack.length ? undefined : 'Go to stack'} onAction={() => router.push('/(tabs)/stack' as never)} />
      ) : (
        <>
          <Card padding={20}>
            <Txt variant="callout">{summary}</Txt>
            <Txt variant="overline" tone="secondary" style={{ marginTop: 20, marginBottom: 12 }}>Last 14 days</Txt>
            <StackedBars data={chart} />
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
              {[['Higher', BAR_COLORS[0]], ['Moderate', BAR_COLORS[1]], ['Lower', BAR_COLORS[2]]].map(([l, c]) => (
                <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c }} />
                  <Txt variant="caption" tone="secondary">{l}</Txt>
                </View>
              ))}
            </View>
          </Card>

          <Section title="By category" caption="Today">
            <View style={{ gap: 12 }}>
              {categories.map((c, i) => (
                <Animated.View key={c.name} entering={FadeInDown.duration(350).delay(i * 50)}>
                  <Card padding={18}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <Txt variant="headline" style={{ flex: 1 }}>{c.name}</Txt>
                      <Txt variant="footnoteStrong" tone={c.alert ? 'weak' : 'secondary'}>
                        {c.sources} source{c.sources === 1 ? '' : 's'}{c.delta && c.delta !== 'local' ? ` · ${c.delta}` : ''}
                      </Txt>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: Palette.hairline, marginTop: 12, overflow: 'hidden' }}>
                      <View style={{ height: 6, borderRadius: 3, width: `${Math.max(4, Math.round(c.load * 100))}%`, backgroundColor: c.alert ? Palette.weak : Palette.gold }} />
                    </View>
                    <Txt variant="footnote" tone="secondary" style={{ marginTop: 10 }}>{c.note}</Txt>
                  </Card>
                </Animated.View>
              ))}
            </View>
          </Section>

          {caveat ? <Txt variant="caption" tone="tertiary" style={{ marginTop: 20 }}>{caveat}</Txt> : null}
        </>
      )}
    </Screen>
  );
}
