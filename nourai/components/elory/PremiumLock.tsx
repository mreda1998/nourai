import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Fonts } from '@/constants/theme';
import { useRouter } from 'expo-router';

interface Props {
  featureName?: string;
}

export function PremiumLock({ featureName = 'This feature' }: Props) {
  const router = useRouter();
  const [bypassed, setBypassed] = useState(false);

  // In development builds, unlock immediately without requiring a subscription.
  if (bypassed) return null;

  const handleUnlock = () => {
    if (__DEV__) {
      setBypassed(true);
    } else {
      router.push('/settings/subscription');
    }
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <BlurView
        tint="dark"
        intensity={40}
        style={[StyleSheet.absoluteFill, styles.container]}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>◆ Atelier</Text>
        </View>
        <Text style={styles.title}>{featureName} is an{'\n'}Atelier feature.</Text>
        <Text style={styles.sub}>
          Unlock circadian dosing, conflict maps, exposure tracking and more.
        </Text>
        <Pressable style={styles.cta} onPress={handleUnlock}>
          <Text style={styles.ctaText}>
            {__DEV__ ? 'Unlock (Dev Mode)' : 'Unlock Atelier'}
          </Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.3)',
    borderRadius: 999,
    marginBottom: 20,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: Colors.sand,
  },
  title: {
    fontFamily: Fonts.serifItalic,
    fontSize: 28,
    lineHeight: 34,
    color: Colors.darkInk,
    textAlign: 'center',
    marginBottom: 16,
  },
  sub: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: 'rgba(241,237,228,0.7)',
    textAlign: 'center',
    marginBottom: 32,
  },
  cta: {
    backgroundColor: Colors.sand,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: Colors.darkSurface,
  },
});
