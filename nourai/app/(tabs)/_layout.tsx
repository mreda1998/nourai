import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Colors, Glass, scale } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Tab icons
function HomeIcon({ focused }: { focused: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={focused ? Colors.ink : 'none'} stroke={focused ? Colors.ink : Colors.inkTertiary} strokeWidth={2}>
      <Path d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 0 0 .707-1.707l-9-9a1 1 0 0 0-1.414 0l-9 9A1 1 0 0 0 3 13zm7 7v-5h4v5h-4z" />
    </Svg>
  );
}

function SearchIcon({ focused }: { focused: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={focused ? Colors.ink : Colors.inkTertiary} strokeWidth={2}>
      <Circle cx={11} cy={11} r={8} />
      <Path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </Svg>
  );
}

function HistoryIcon({ focused }: { focused: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={focused ? Colors.ink : Colors.inkTertiary} strokeWidth={2}>
      <Path d="M12 20v-6M6 20V10M18 20V4" strokeLinecap="round" />
    </Svg>
  );
}

function SettingsIcon({ focused }: { focused: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={focused ? Colors.ink : Colors.inkTertiary} strokeWidth={2}>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={Colors.bone} strokeWidth={2.5}>
      <Path d="M12 4v16m8-8H4" strokeLinecap="round" />
    </Svg>
  );
}

const TAB_CONFIG = [
  { name: 'index', label: 'Home', icon: HomeIcon },
  { name: 'search', label: 'Search', icon: SearchIcon },
  { name: 'history', label: 'History', icon: HistoryIcon },
  { name: 'stack', label: 'Stack', icon: SettingsIcon },
];

function TabItem({ tab, isFocused, onPress }: { tab: typeof TAB_CONFIG[0]; isFocused: boolean; onPress: () => void }) {
  const iconScale = useSharedValue(1);
  const IconComponent = tab.icon;

  const animatedIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  const handlePress = () => {
    iconScale.value = withSpring(0.82, { damping: 12, stiffness: 220 }, () => {
      iconScale.value = withSpring(1, { damping: 12, stiffness: 220 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable onPress={handlePress} className="items-center" style={{ gap: scale(4) }}>
      <Animated.View style={animatedIconStyle}>
        <IconComponent focused={isFocused} />
      </Animated.View>
      <Text
        className="font-sans-semibold uppercase"
        style={{
          fontSize: scale(9),
          letterSpacing: 1.5,
          color: isFocused ? Colors.ink : Colors.inkTertiary,
        }}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const focusedRoute = state.routes[state.index];
  const scanScale = useSharedValue(1);

  const animatedScanStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: '45deg' }, { scale: scanScale.value }],
  }));

  // Hide tab bar on scan screen (after all hooks)
  if (focusedRoute?.name === 'scan') {
    return null;
  }

  const leftTabs = TAB_CONFIG.slice(0, 2);
  const rightTabs = TAB_CONFIG.slice(2);

  const handleScanPress = () => {
    scanScale.value = withSpring(0.88, { damping: 10, stiffness: 200 }, () => {
      scanScale.value = withSpring(1, { damping: 10, stiffness: 200 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/scan');
  };

  return (
    <View className="absolute bottom-0 left-0 right-0" style={{ paddingBottom: insets.bottom }}>
      {/*
       * Glass background layer.
       * overflow: 'hidden' clips the BlurView to the tab bar bounds.
       * The scan button lives as a sibling — outside this wrapper — so it
       * can float above without being clipped.
       */}
      <View style={styles.glassWrapper}>
        {Platform.OS === 'ios' ? (
          <BlurView
            tint={Glass.tint}
            intensity={Glass.intensity}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          // Android: solid fallback — no true blur support
          <View style={[StyleSheet.absoluteFill, styles.androidFallback]} />
        )}
        {/* Warm bone overlay — anchors the blur to the app palette */}
        <View style={[StyleSheet.absoluteFill, styles.glassOverlay]} />
        {/* Top hairline — the "glass edge" that catches light */}
        <View style={styles.glassTopBorder} />
      </View>

      {/* Tab content sits on top of the glass layer */}
      <View
        className="flex-row items-center justify-between"
        style={{ paddingHorizontal: scale(24), paddingTop: scale(16), paddingBottom: scale(24) }}
      >
        {/* Left tabs */}
        <View className="flex-row" style={{ gap: scale(32) }}>
          {leftTabs.map((tab) => {
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

        {/* Center gap for the floating scan button */}
        <View style={styles.scanGap} />

        {/* Right tabs */}
        <View className="flex-row" style={{ gap: scale(32) }}>
          {rightTabs.map((tab) => {
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

      {/* Diamond scan button — floats above the glass bar */}
      <AnimatedPressable
        style={[styles.scanButton, animatedScanStyle]}
        onPress={handleScanPress}
      >
        <View style={styles.scanButtonInner}>
          <PlusIcon />
        </View>
      </AnimatedPressable>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="stack" options={{ title: 'Stack' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // ── Glass background ────────────────────────────────────────────────────────
  glassWrapper: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden', // clips BlurView and overlays to the tab bar bounds
  },
  glassOverlay: {
    backgroundColor: Glass.overlayBone,
  },
  glassTopBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Glass.border,
  },
  androidFallback: {
    backgroundColor: Glass.androidFallback,
  },

  // Placeholder that reserves space for the floating scan button
  scanGap: {
    width: scale(56),
  },

  // ── Floating scan (diamond) button ─────────────────────────────────────────
  scanButton: {
    position: 'absolute',
    left: '50%',
    top: -scale(28),
    marginLeft: -scale(28),
    width: scale(56),
    height: scale(56),
    backgroundColor: Colors.inkWarm,
    borderRadius: scale(16),
    justifyContent: 'center',
    alignItems: 'center',
    // Refined shadow — diffuse glow rather than hard drop
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
    // Subtle light-catching border (white edge, like anodised aluminium)
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  scanButtonInner: {
    // Counter-rotate so the '+' stays upright inside the rotated diamond
    transform: [{ rotate: '-45deg' }],
  },
});
