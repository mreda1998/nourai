import React, { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Clock, GitCompareArrows, Layers, Moon, Plus, ScanLine, Sun, Sunrise, Sunset } from 'lucide-react-native';
import { useAppState, type Product } from '@/context/app-state';
import { Palette } from '@/constants/theme';
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
          <View style={{ flexDirection: 'row', gap: 28 }}>
            <View>
              <Txt variant="title1">{stack.length}</Txt>
              <Txt variant="footnote" tone="secondary">saved product{stack.length === 1 ? '' : 's'}</Txt>
            </View>
            <View>
              <Txt variant="title1">{missingAmounts}</Txt>
              <Txt variant="footnote" tone="secondary">missing amount{missingAmounts === 1 ? '' : 's'}</Txt>
            </View>
          </View>
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 12 }}>
            {categories.map((c) => `${stack.filter((p) => p.category === c).length} ${categoryLabel(c).toLowerCase()}`).join(' · ')}
            {' · '}Saved isn’t the same as taken — actual use may vary.
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
                  subtitle={[p.brand || categoryLabel(p.category), p.quantity?.trim() || 'Amount not recorded'].join(' · ')}
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

