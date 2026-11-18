import React, { ReactNode } from 'react';
import { RefreshControl, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, Extrapolation } from 'react-native-reanimated';
import { Layout, Palette } from '@/constants/theme';
import { IconButton } from './IconButton';
import { Txt } from './Txt';

export interface ScreenProps {
  children: ReactNode;
  /** Large serif title that collapses into the nav bar on scroll. */
  title?: string;
  /** Small line above the large title (e.g. date). */
  eyebrow?: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  /** Content rendered edge-to-edge before the padded body (heroes). */
  hero?: ReactNode;
  /** true when this screen sits inside the tab bar. */
  tabbed?: boolean;
  night?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  /** Render `title` only in the collapsed nav bar (the screen draws its own heading). */
  hideLargeTitle?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({
  children, title, eyebrow, subtitle, back, onBack, right, hero, tabbed = false, night = false,
  scroll = true, contentStyle, footer, hideLargeTitle = false, refreshing, onRefresh,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });

  const collapsed = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [hero ? 180 : 28, hero ? 230 : 56], [0, 1], Extrapolation.CLAMP),
  }));
  const barBg = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, hero ? 200 : 40], [0, 1], Extrapolation.CLAMP),
  }));

  const bg = night ? Palette.night : Palette.canvas;
  const bottom = (tabbed ? Layout.bottomPadding : 40) + (footer ? 88 : 0) + insets.bottom * (tabbed ? 0 : 1);
  const showBar = back || right || title;

  const bar = showBar ? (
    <View style={[styles.bar, { paddingTop: insets.top, height: insets.top + 52 }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, barBg]} pointerEvents="none">
        <BlurView tint={night ? 'dark' : 'light'} intensity={70} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: night ? 'rgba(10,29,28,0.72)' : 'rgba(243,240,233,0.78)' }]} />
        <View style={[styles.barRule, { backgroundColor: night ? Palette.nightHairline : Palette.hairline }]} />
      </Animated.View>
      <View style={styles.barRow} pointerEvents="box-none">
        <View style={styles.barSide}>
          {back ? <IconButton icon={ChevronLeft} label="Back" variant={night || hero ? 'night' : 'surface'} iconSize={22} onPress={onBack ?? (() => router.back())} /> : null}
        </View>
        <Animated.View style={[styles.barTitle, collapsed]} pointerEvents="none">
          {title ? <Txt variant="headline" tone={night ? 'inverse' : 'primary'} numberOfLines={1}>{title}</Txt> : null}
        </Animated.View>
        <View style={[styles.barSide, { justifyContent: 'flex-end' }]}>{right}</View>
      </View>
    </View>
  ) : null;

  const largeTitle = title && !hero && !hideLargeTitle ? (
    <View style={{ paddingHorizontal: Layout.gutter, paddingTop: 4, paddingBottom: 20 }}>
      {eyebrow ? <Txt variant="overline" tone={night ? 'inverse2' : 'secondary'} style={{ marginBottom: 6 }}>{eyebrow}</Txt> : null}
      <Txt variant="largeTitle" tone={night ? 'inverse' : 'primary'} accessibilityRole="header">{title}</Txt>
      {subtitle ? <Txt variant="subhead" tone={night ? 'inverse2' : 'secondary'} style={{ marginTop: 6 }}>{subtitle}</Txt> : null}
    </View>
  ) : null;

  const topPad = hero ? 0 : insets.top + (showBar ? 52 : 12);

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={night || hero ? 'light' : 'dark'} />
      {scroll ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: topPad, paddingBottom: bottom }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={night ? Palette.nightInk : Palette.accent} /> : undefined}
        >
          {hero}
          {largeTitle}
          <View style={[{ paddingHorizontal: Layout.gutter }, contentStyle]}>{children}</View>
        </Animated.ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingTop: topPad }, contentStyle]}>
          {largeTitle}
          {children}
        </View>
      )}
      {bar}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <BlurView tint="light" intensity={60} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(243,240,233,0.82)' }]} />
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  barRule: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  barRow: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  barSide: { width: 88, flexDirection: 'row', gap: 8 },
  barTitle: { flex: 1, alignItems: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: Layout.gutter, overflow: 'hidden', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
});
