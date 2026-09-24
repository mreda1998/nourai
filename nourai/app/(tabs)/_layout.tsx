import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Compass, Layers, ScanLine, Sun, UserRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Palette, Shadows } from '@/constants/theme';
import { PressableScale, Txt } from '@/components/ui';

/**
 * Floating tab bar (Bevel / Oura pattern): a frosted pill holding the four
 * destinations, and a separate accent button for the app's primary action —
 * scanning. The set of tabs never changes, so muscle memory holds.
 */
const TABS: { name: string; label: string; Icon: LucideIcon }[] = [
  { name: 'index', label: 'Today', Icon: Sun },
  { name: 'stack', label: 'Stack', Icon: Layers },
  { name: 'explore', label: 'Discover', Icon: Compass },
  { name: 'profile', label: 'You', Icon: UserRound },
];

const HIDE_BAR_ON = new Set(['scan']);

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const active = state.routes[state.index]?.name;
  const activeIndex = TABS.findIndex((t) => t.name === active);
  const itemW = 72;
  const indicator = useAnimatedStyle(() => ({
    opacity: activeIndex < 0 ? 0 : 1,
    transform: [{ translateX: withSpring(Math.max(0, activeIndex) * itemW, { damping: 20, stiffness: 240 }) }],
  }), [activeIndex]);

  if (HIDE_BAR_ON.has(active)) return null;

  return (
    <Animated.View entering={FadeIn.duration(200)} style={[styles.wrap, { bottom: Math.max(insets.bottom - 6, 12) }]} pointerEvents="box-none">
      <View style={[styles.pill, Shadows.medium]}>
        <View style={styles.pillClip}>
          {Platform.OS === 'ios' ? <BlurView tint="systemChromeMaterialLight" intensity={90} style={StyleSheet.absoluteFill} /> : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Platform.OS === 'ios' ? 'rgba(252,251,248,0.72)' : Palette.surface }]} />
        </View>
        <Animated.View style={[styles.indicator, { width: itemW - 8 }, indicator]} />
        {TABS.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const focused = active === tab.name;
          const color = focused ? Palette.ink : Palette.ink3;
          return (
            <Pressable
              key={tab.name}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                Haptics.selectionAsync();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(tab.name);
              }}
              style={[styles.item, { width: itemW }]}
            >
              <tab.Icon size={21} color={color} strokeWidth={focused ? 2.1 : 1.8} />
              <Txt variant="caption" color={color} style={{ fontSize: 10.5, marginTop: 3 }}>{tab.label}</Txt>
            </Pressable>
          );
        })}
      </View>

      <PressableScale
        accessibilityLabel="Scan a product"
        haptic="medium"
        pressedScale={0.9}
        onPress={() => navigation.navigate('scan')}
        style={[styles.scan, Shadows.scanButton]}
      >
        <ScanLine size={24} color={Palette.onAccent} strokeWidth={2} />
      </PressableScale>
    </Animated.View>
  );
}

export default function TabLayout() {
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false, animation: 'shift' }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="stack" options={{ title: 'Stack' }} />
      <Tabs.Screen name="explore" options={{ title: 'Discover' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', animation: 'fade' }} />
      {/* Registered for deep links / internal pushes; not destinations in the bar. */}
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="journal" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  pill: { height: 64, borderRadius: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.9)' },
  pillClip: { ...StyleSheet.absoluteFillObject, borderRadius: 32, overflow: 'hidden' },
  indicator: { position: 'absolute', left: 8, height: 54, borderRadius: 27, backgroundColor: 'rgba(14,31,30,0.07)' },
  item: { height: 64, alignItems: 'center', justifyContent: 'center' },
  scan: { width: 64, height: 64, borderRadius: 32, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
});
