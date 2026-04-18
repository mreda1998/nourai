import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors, Glass, Fonts, scale } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function HomeIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.ink : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V11z" />
    </Svg>
  );
}

function StackIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.ink : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Path d="M12 3l9 5-9 5-9-5 9-5z" />
      <Path d="M3 13l9 5 9-5" />
      <Path d="M3 18l9 5 9-5" />
    </Svg>
  );
}

function ChatIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.ink : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
    </Svg>
  );
}

function ProfileIcon({ focused }: { focused: boolean }) {
  const c = focused ? Colors.ink : Colors.inkTertiary;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.6}>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21v-1a8 8 0 0116 0v1" />
    </Svg>
  );
}

function ScanIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={Colors.accentInk} strokeWidth={1.8}>
      <Path d="M4 7V5a2 2 0 012-2h2M16 3h2a2 2 0 012 2v2M20 17v2a2 2 0 01-2 2h-2M8 21H6a2 2 0 01-2-2v-2" />
      <Path d="M3 12h18" strokeDasharray="2 2" />
    </Svg>
  );
}

const TAB_CONFIG = [
  { name: 'index',   label: 'Home',    Icon: HomeIcon },
  { name: 'stack',   label: 'Stack',   Icon: StackIcon },
  { name: 'chat',    label: 'Chat',    Icon: ChatIcon },
  { name: 'profile', label: 'Profile', Icon: ProfileIcon },
];

function TabItem({
  tab,
  isFocused,
  onPress,
}: {
  tab: (typeof TAB_CONFIG)[0];
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
    <Pressable onPress={handlePress} style={{ alignItems: 'center', gap: 4 }}>
      <Animated.View style={animatedStyle}>
        <tab.Icon focused={isFocused} />
      </Animated.View>
      <Text
        style={{
          fontFamily: Fonts.sansSemiBold,
          fontSize: scale(9),
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: isFocused ? Colors.ink : Colors.inkTertiary,
        }}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scanScale = useSharedValue(1);
  const focusedRoute = state.routes[state.index];

  const animatedScanStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scanScale.value }],
  }));

  if (focusedRoute?.name === 'scan') return null;

  const leftTabs = TAB_CONFIG.slice(0, 2);   // Home, Stack
  const rightTabs = TAB_CONFIG.slice(2);      // Chat, Profile

  const handleScanPress = () => {
    scanScale.value = withSpring(0.88, { damping: 10, stiffness: 200 }, () => {
      scanScale.value = withSpring(1, { damping: 10, stiffness: 200 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(tabs)/scan');
  };

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
        <View style={styles.side}>
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

        <View style={styles.scanGap} />

        <View style={styles.side}>
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

      <AnimatedPressable style={[styles.scanButton, animatedScanStyle]} onPress={handleScanPress}>
        <ScanIcon />
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
      <Tabs.Screen name="index"   options={{ title: 'Home' }} />
      <Tabs.Screen name="stack"   options={{ title: 'Stack' }} />
      <Tabs.Screen name="scan"    options={{ title: 'Scan' }} />
      <Tabs.Screen name="chat"    options={{ title: 'Chat' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      {/* Keep search/history registered but not in nav */}
      <Tabs.Screen name="search"  options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
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
    justifyContent: 'space-between',
    paddingHorizontal: scale(24),
    paddingTop: scale(16),
    paddingBottom: scale(24),
  },
  side: {
    flexDirection: 'row',
    gap: scale(32),
  },
  scanGap: {
    width: scale(56),
  },
  scanButton: {
    position: 'absolute',
    left: '50%',
    top: -scale(28),
    marginLeft: -scale(28),
    width: scale(56),
    height: scale(56),
    backgroundColor: Colors.accent,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
});
