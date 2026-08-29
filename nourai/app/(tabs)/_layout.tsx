import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Glass, Fonts, scale } from '@/constants/theme';
import { useAppState } from '@/context/app-state';

function HomeIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.accent : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V11z" />
    </Svg>
  );
}

function ScanIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.accent : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Path d="M4 7V5a2 2 0 012-2h2M16 3h2a2 2 0 012 2v2M20 17v2a2 2 0 01-2 2h-2M8 21H6a2 2 0 01-2-2v-2" />
      <Path d="M3 12h18" strokeDasharray="2 2" />
    </Svg>
  );
}

function StackIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.accent : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Path d="M12 3l9 5-9 5-9-5 9-5z" />
      <Path d="M3 13l9 5 9-5" />
      <Path d="M3 18l9 5 9-5" />
    </Svg>
  );
}

function ExploreIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.accent : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M20 20l-4.3-4.3" strokeLinecap="round" />
    </Svg>
  );
}

function JournalIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.accent : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Path d="M5 4.5A2.5 2.5 0 017.5 2H20v17H7.5A2.5 2.5 0 005 21.5v-17z" />
      <Path d="M5 4.5v17M9 7h7M9 11h7" />
    </Svg>
  );
}

function HistoryIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.accent : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7v5l3.5 2M4 5v4h4" />
    </Svg>
  );
}

function ProfileIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.accent : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21v-1a8 8 0 0116 0v1" />
    </Svg>
  );
}

const MAIN_TAB_CONFIG = [
  { name: 'index',   label: 'Home',    Icon: HomeIcon },
  { name: 'scan',    label: 'Scan',    Icon: ScanIcon },
  { name: 'journal', label: 'Journal', Icon: JournalIcon },
  { name: 'explore', label: 'Explore', Icon: ExploreIcon },
  { name: 'profile', label: 'Profile', Icon: ProfileIcon },
];

const STACK_TAB_CONFIG = [
  { name: 'index',   label: 'Home',    Icon: HomeIcon },
  { name: 'scan',    label: 'Scan',    Icon: ScanIcon },
  { name: 'stack',   label: 'Stack',   Icon: StackIcon },
  { name: 'history', label: 'History', Icon: HistoryIcon },
  { name: 'profile', label: 'Profile', Icon: ProfileIcon },
];

function TabItem({
  tab,
  isFocused,
  onPress,
}: {
  tab: (typeof MAIN_TAB_CONFIG)[0];
  isFocused: boolean;
  onPress: () => void;
}) {
  const iconScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  const handlePress = () => {
    iconScale.value = withSpring(0.82, { damping: 12, stiffness: 220 }, () => {
      iconScale.value = withSpring(1, { damping: 12, stiffness: 220 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <Animated.View style={animatedStyle}>
        <tab.Icon focused={isFocused} />
      </Animated.View>
      <Text
        style={{
          fontFamily: Fonts.sansSemiBold,
          fontSize: scale(9),
          letterSpacing: 1.0,
          textTransform: 'uppercase',
          color: isFocused ? Colors.accent : Colors.inkTertiary,
        }}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { stack } = useAppState();
  const activeName = state.routes[state.index]?.name;
  const config = stack.length > 0 || activeName === 'stack' || activeName === 'history'
    ? STACK_TAB_CONFIG
    : MAIN_TAB_CONFIG;

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom }]}>
      <View style={styles.glassWrapper}>
        {Platform.OS === 'ios' ? (
          <BlurView tint={Glass.tint} intensity={Glass.intensity} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Glass.androidFallback }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Glass.overlayBone }]} />
        <View style={styles.topBorder} />
      </View>

      <View style={styles.row}>
        {config.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const isFocused = state.index === state.routes.indexOf(route);
          return (
            <TabItem
              key={tab.name}
              tab={tab}
              isFocused={isFocused}
              onPress={() => navigation.navigate(tab.name)}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index"   options={{ title: 'Home' }} />
      <Tabs.Screen name="scan"    options={{ title: 'Scan' }} />
      <Tabs.Screen name="stack"   options={{ title: 'Stack' }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      {/* Kept registered so deep links / internal pushes still resolve, but not in the nav bar */}
      <Tabs.Screen name="chat"    options={{ href: null }} />
      <Tabs.Screen name="search"  options={{ href: null }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  glassWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Glass.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(12),
    paddingTop: scale(11),
    paddingBottom: scale(16),
    backgroundColor: 'rgba(252,250,246,0.75)',
  },
});
