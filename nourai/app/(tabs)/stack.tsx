import React, { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Clock, GitCompareArrows, Layers, Moon, Plus, ScanLine, Sun, Sunrise, Sunset } from 'lucide-react-native';
import { useAppState, type Product } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { api } from '@/services/api';
import { accessToken, syncRemoveFromStack } from '@/lib/stack-sync';
import { Palette } from '@/constants/theme';
import { categoryLabel, gradeToScore, scoreQualifier } from '@/utils/grade';
import {
  Button, Card, ChipRow, EmptyState, IconButton, ListGroup, ListRow, ProductImage, ScoreBadge, Screen, Section, Txt,
} from '@/components/ui';

const SLOTS = [
  { key: 'morning', label: 'Morning', Icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', Icon: Sun },
  { key: 'evening', label: 'Evening', Icon: Sunset },
  { key: 'night', label: 'Night', Icon: Moon },
  { key: 'anytime', label: 'Anytime', Icon: Clock },
] as const;

export default function StackScreen() {
  const { stack, hydrateFromServer, removeFromStack } = useAppState();
  const { isSignedIn } = useAuth();
  const [filter, setFilter] = useState('all');

  useFocusEffect(useCallback(() => {
    if (!isSignedIn) return;
    let alive = true;
    (async () => {
      const token = await accessToken();
      if (!token) return;
      const entries = await api.getStack(token);
      if (alive) hydrateFromServer(entries);
    })().catch(() => {});
    return () => { alive = false; };
  }, [hydrateFromServer, isSignedIn]));

  const categories = useMemo(() => Array.from(new Set(stack.map((p) => p.category))), [stack]);
  const filtered = filter === 'all' ? stack : stack.filter((p) => p.category === filter);
  const groups = SLOTS.map((s) => ({ ...s, items: filtered.filter((p) => (p.timeOfDay ?? 'anytime') === s.key) })).filter((g) => g.items.length);

  const scores = stack.map((p) => gradeToScore(p.grade)).filter((s): s is number => s != null);
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const remove = (item: Product) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    removeFromStack(item.id);
    if (isSignedIn) syncRemoveFromStack(item.id);
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

  if (!stack.length) {
    return (
      <Screen tabbed title="Your stack" right={addButton}>
        <Card padding={8} style={{ marginTop: 8 }}>
          <EmptyState
            icon={Layers}
            title="Build your stack"
            message="Add the supplements, skincare and foods you use. Elory scores how they work together and flags conflicts."
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
      <Animated.View entering={FadeInDown.duration(500)}>
        <Card padding={20}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <ScoreBadge score={average} size={68} />
            <View style={{ flex: 1 }}>
              <Txt variant="overline" tone="secondary">Average product score</Txt>
              <Txt variant="title2" style={{ marginTop: 2 }}>{scoreQualifier(average)}</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>
                {categories.map((c) => `${stack.filter((p) => p.category === c).length} ${categoryLabel(c).toLowerCase()}`).join(' · ')}
              </Txt>
            </View>
          </View>
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
                  key={p.id}
                  leading={<ProductImage uri={p.imageUri} category={p.category} size={44} />}
                  title={p.name}
                  subtitle={[p.brand, p.quantity].filter(Boolean).join(' · ') || categoryLabel(p.category)}
                  trailing={<ScoreBadge score={gradeToScore(p.grade)} size={36} />}
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

