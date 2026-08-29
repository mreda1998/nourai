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
        tint="light"
        intensity={72}
        style={[StyleSheet.absoluteFill, styles.container]}
      >
        <View style={styles.badge}>
          <Text style={styles.badgeText}>ELORY PREMIUM</Text>
        </View>
        <Text style={styles.title}>{featureName} is an{'\n'}Elory Premium feature.</Text>
        <Text style={styles.sub}>
          Unlock circadian dosing, conflict maps, exposure tracking and more.
        </Text>
        <Pressable style={styles.cta} onPress={handleUnlock}>
          <Text style={styles.ctaText}>
            {__DEV__ ? 'Preview feature' : 'Unlock Premium'}
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
    borderColor: Colors.borderHairline,
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
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: 16,
  },
  sub: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.inkSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  cta: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
  },
  ctaText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: Colors.accentInk,
  },
});
