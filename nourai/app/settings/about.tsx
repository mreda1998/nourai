import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Colors } from '@/constants/theme';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.title}>About NourAI</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.appName}>NourAI</Text>
        <Text style={styles.tagline}>Ingredient intelligence, in your pocket.</Text>
        <Text style={styles.version}>Version {version}</Text>

        <View style={styles.divider} />

        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://nourai.app/terms')}
        >
          <Text style={styles.linkText}>Terms of Service</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://nourai.app/privacy')}
        >
          <Text style={styles.linkText}>Privacy Policy</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        <Pressable
          style={styles.linkRow}
          onPress={() => Linking.openURL('mailto:support@nourai.app')}
        >
          <Text style={styles.linkText}>Contact Support</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bone },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D4CFC7',
  },
  backBtn: { width: 32 },
  backArrow: { fontSize: 28, color: '#2C2C2C', lineHeight: 32 },
  title: { fontFamily: 'CormorantGaramond_500Medium', fontSize: 22, color: '#2C2C2C' },
  body: { padding: 24, alignItems: 'center' },
  appName: { fontFamily: 'CormorantGaramond_400Regular', fontSize: 36, color: '#2C2C2C', marginTop: 16 },
  tagline: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#5C5752', marginTop: 6 },
  version: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#9C9690', marginTop: 4 },
  divider: {
    width: '100%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D4CFC7',
    marginVertical: 24,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D4CFC7',
  },
  linkText: { fontFamily: 'Manrope_400Regular', fontSize: 15, color: '#2C2C2C' },
  chevron: { fontSize: 20, color: '#9C9690' },
});
