import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Clock, GitCompareArrows, Layers, Moon, Plus, ScanLine, Sun, Sunrise, Sunset } from 'lucide-react-native';
import { useAppState, type Product } from '@/context/app-state';
import { MeasureInk, Palette } from '@/constants/theme';
import { api, type StackReview } from '@/services/api';
import { isCatalogueId } from '@/lib/insights';
import { categoryLabel } from '@/utils/grade';
import {
  Button, Card, ChipRow, EmptyState, IconButton, ListGroup, ListRow, ProductImage, Screen, Section, Txt,
} from '@/components/ui';

const SLOTS = [
  { key: 'morning', label: 'Morning', Icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', Icon: Sun },
  { key: 'evening', label: 'Evening', Icon: Sunset },
  { key: 'night', label: 'Night', Icon: Moon },
  { key: 'anytime', label: 'Anytime', Icon: Clock },
] as const;

export default function StackScreen() {
  const { stack, refreshStack, removeFromStack, isStackLoading, stackError } = useAppState();
  const [filter, setFilter] = useState('all');
  const [removing, setRemoving] = useState(false);
  const [review, setReview] = useState<StackReview | null>(null);
  const stackIds = stack.map((p) => p.id).filter(isCatalogueId).join(',');

  // What the research says about the stack as a whole: refreshed whenever it changes.
  useEffect(() => {
    if (!stackIds) { setReview(null); return; }
    let alive = true;
    api.getStackReview(stackIds.split(',')).then((r) => alive && setReview(r)).catch(() => alive && setReview(null));
    return () => { alive = false; };
  }, [stackIds]);

  // "Shares magnesium with Daily Multivitamin", keyed by product name.
  const shared = useMemo(() => {
    const notes = new Map<string, string>();
    for (const o of review?.overlaps ?? []) {
      for (const name of o.products) {
        const others = o.products.filter((n) => n !== name);
        if (!others.length || notes.has(name)) continue;
        notes.set(name, `Shares ${o.ingredient.toLowerCase()} with ${others.join(' and ')}`);
      }
    }
    return notes;
  }, [review]);

  // The server is the record for signed-in accounts; refresh whenever the tab is shown.
  useFocusEffect(useCallback(() => { refreshStack().catch(() => undefined); }, [refreshStack]));

  const categories = useMemo(() => Array.from(new Set(stack.map((p) => p.category))), [stack]);
  const filtered = filter === 'all' ? stack : stack.filter((p) => p.category === filter);
  const groups = SLOTS.map((s) => ({ ...s, items: filtered.filter((p) => (p.timeOfDay ?? 'anytime') === s.key) })).filter((g) => g.items.length);
  const missingAmounts = stack.filter((p) => !p.quantity?.trim()).length;

  // Waits for the server before the row disappears, and says so when it fails.
  const remove = async (item: Product) => {
    if (removing) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setRemoving(true);
    try {
      if (!item.stackEntryId) throw new Error('Refresh your stack before removing this product.');
      await removeFromStack(item.stackEntryId);
    } catch (error) {
      Alert.alert('Product not removed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setRemoving(false); }
  };

  const openActions = (item: Product) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: item.name, options: ['View analysis', 'Remove from stack', 'Cancel'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        (i) => { if (i === 0) router.push(`/product/${item.id}?via=stack` as never); if (i === 1) remove(item); },
      );
    } else {
      Alert.alert(item.name, undefined, [
        { text: 'View analysis', onPress: () => router.push(`/product/${item.id}?via=stack` as never) },
        { text: 'Remove', style: 'destructive', onPress: () => remove(item) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const addButton = <IconButton icon={Plus} label="Add a product" variant="accent" onPress={() => router.push('/(tabs)/explore' as never)} />;

  const status = stackError ? (
    <Card padding={16} style={{ marginTop: 8 }}>
      <Txt variant="callout" tone="secondary">
        {stack.length ? 'We couldn’t refresh your stack. What’s shown may be out of date.' : 'Your stack couldn’t be loaded.'}
      </Txt>
      <Button label="Try again" variant="tertiary" onPress={() => refreshStack().catch(() => undefined)} style={{ marginTop: 4 }} />
    </Card>
  ) : null;

  if (!stack.length && (isStackLoading || stackError)) {
    return (
      <Screen tabbed title="Your stack" right={addButton}>
        {status ?? <ActivityIndicator color={Palette.accent} style={{ marginTop: 48 }} />}
      </Screen>
    );
  }

  if (!stack.length) {
    return (
      <Screen tabbed title="Your stack" right={addButton}>
        <Card padding={8} style={{ marginTop: 8 }}>
          <EmptyState
            icon={Layers}
            title="Build your stack"
            message="Add the products you actually use, with the amount from the label, so you can review the evidence in context."
          />
          <View style={{ gap: 10, padding: 12, paddingTop: 0 }}>
            <Button label="Scan a product" icon={<ScanLine size={19} color={Palette.onAccent} />} onPress={() => router.push('/(tabs)/scan' as never)} />
            <Button label="Search the library" variant="secondary" onPress={() => router.push('/(tabs)/explore' as never)} />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen tabbed title="Your stack" subtitle={`${stack.length} product${stack.length === 1 ? '' : 's'}`} right={addButton}>
      {status}
      <Animated.View entering={FadeInDown.duration(500)}>
        <Card padding={20}>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Tally value={review?.overlaps.length} label="doubled up" tone={review?.overlaps.length ? 'moderate' : undefined} />
            <Tally value={review?.risks.filter((r) => r.tone === 'weak').length} label={review?.risks.filter((r) => r.tone === 'weak').length === 1 ? 'documented risk' : 'documented risks'} tone={review?.risks.some((r) => r.tone === 'weak') ? 'weak' : undefined} />
            <Tally value={review?.supported.filter((f) => f.tone === 'good').length} label="backed by trials" tone={review?.supported.some((f) => f.tone === 'good') ? 'good' : undefined} />
          </View>
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 14 }}>
            {review ? `${review.reviewed_count} of ${review.ingredient_count} ingredients researched so far. ` : ''}
            {missingAmounts ? `${missingAmounts} product${missingAmounts === 1 ? ' has' : 's have'} no amount recorded, so doses can’t be checked. ` : ''}
            Saved isn’t the same as taken.
          </Txt>
        </Card>
      </Animated.View>

      <ListGroup style={{ marginTop: 12 }}>
        <ListRow icon={GitCompareArrows} title="Check interactions" subtitle="Synergies and conflicts across your stack" onPress={() => router.push('/(premium)/conflict-map' as never)} />
        <ListRow icon={Clock} title="Timing plan" subtitle="When to take each product" onPress={() => router.push('/(premium)/circadian' as never)} />
      </ListGroup>

      {categories.length > 1 ? (
        <ChipRow
          style={{ marginTop: 28 }}
          options={[{ key: 'all', label: 'All' }, ...categories.map((c) => ({ key: c, label: categoryLabel(c) }))]}
          value={filter}
          onChange={setFilter}
        />
      ) : null}

      {groups.map((g) => (
        <Animated.View key={g.key} layout={LinearTransition.springify().damping(20)}>
          <Section title={g.label} style={{ marginTop: 28 }}>
            <ListGroup>
              {g.items.map((p) => (
                <ListRow
                  key={p.stackEntryId ?? p.id}
                  leading={<ProductImage uri={p.imageUri} category={p.category} size={44} />}
                  title={p.name}
                  subtitle={[p.brand || categoryLabel(p.category), p.quantity?.trim() || 'Amount not recorded', shared.get(p.name)].filter(Boolean).join(' · ')}
                  chevron={false}
                  onPress={() => openActions(p)}
                />
              ))}
            </ListGroup>
          </Section>
        </Animated.View>
      ))}

      <Txt variant="footnote" tone="tertiary" align="center" style={{ marginTop: 20 }}>Tap a product for options.</Txt>
    </Screen>
  );
}


/** One count in the summary; a dash while the review loads or when we have none. */
function Tally({ value, label, tone }: { value?: number; label: string; tone?: 'good' | 'moderate' | 'weak' }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt variant="metric" color={value && tone ? MeasureInk[tone] : undefined} tone={value ? 'primary' : 'tertiary'}>{value ?? '–'}</Txt>
      <Txt variant="caption" tone="secondary" style={{ marginTop: 2 }}>{label}</Txt>
    </View>
  );
}
