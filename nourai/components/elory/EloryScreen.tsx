import React, { ReactNode } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Colors, Fonts, Layout, Spacing } from '@/constants/theme';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <Text style={[styles.brand, compact && { fontSize: 14 }]}>ELORY</Text>;
}

export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable accessibilityLabel="Go back" onPress={onPress ?? (() => router.back())} hitSlop={12} style={styles.iconButton}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.ink} strokeWidth={1.6}>
        <Path d="M19 12H5M11 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

export function ScreenHeader({ title, subtitle, back = false, left, right }: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left ?? (back ? <BackButton /> : null)}</View>
      <View style={styles.headerCenter}>
        {title ? <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text> : <BrandMark compact />}
        {subtitle ? <Text numberOfLines={1} style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

export function EloryScreen({ children, header, scroll = true, contentStyle, bottomInset = 112 }: {
  children: ReactNode;
  header?: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  bottomInset?: number;
}) {
  const insets = useSafeAreaInsets();
  const body = <View style={[styles.content, { paddingBottom: bottomInset + insets.bottom }, contentStyle]}>{children}</View>;
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />
      <View style={{ paddingTop: insets.top }}>{header}</View>
      {scroll ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>{body}</ScrollView> : body}
    </View>
  );
}

export function PageTitle({ children, kicker, style }: { children: ReactNode; kicker?: string; style?: ViewStyle }) {
  return (
    <View style={[{ marginBottom: Spacing.lg }, style]}>
      {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
      <Text style={styles.pageTitle}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { paddingHorizontal: Layout.screenPaddingHorizontal, paddingTop: 12 },
  header: { height: 54, paddingHorizontal: Layout.screenPaddingHorizontal, flexDirection: 'row', alignItems: 'center' },
  headerSide: { width: 56, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: Fonts.serifMedium, fontSize: 20, color: Colors.ink },
  headerSubtitle: { marginTop: 1, fontFamily: Fonts.sans, fontSize: 9, color: Colors.inkSecondary },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  brand: { fontFamily: Fonts.sansSemiBold, fontSize: 16, letterSpacing: 5.2, color: Colors.ink },
  kicker: { fontFamily: Fonts.sansSemiBold, color: Colors.accent, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 7 },
  pageTitle: { fontFamily: Fonts.serif, fontSize: 33, lineHeight: 36, color: Colors.ink },
});
