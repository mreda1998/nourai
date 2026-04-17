import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Privacy & Data</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionTitle}>Your data, your control</Text>
        <Text style={styles.paragraph}>
          NourAI does not sell your personal data to third parties. Your scan history,
          health profile, and stack are stored securely and used only to personalise
          your in-app experience.
        </Text>

        <Text style={styles.sectionTitle}>What we collect</Text>
        <Text style={styles.paragraph}>
          {'• Products you scan\n'}
          {'• Health goals and concerns you provide during onboarding\n'}
          {'• Your supplement and food stack\n'}
          {'• Anonymous usage analytics (no personally identifiable information)'}
        </Text>

        <Text style={styles.sectionTitle}>Deleting your data</Text>
        <Text style={styles.paragraph}>
          You can request full data deletion by contacting us at{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('mailto:privacy@nourai.app')}
          >
            privacy@nourai.app
          </Text>
          . We will process your request within 30 days.
        </Text>

        <Pressable
          style={styles.policyBtn}
          onPress={() => Linking.openURL('https://nourai.app/privacy')}
        >
          <Text style={styles.policyBtnText}>View Full Privacy Policy</Text>
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
  body: { padding: 24, gap: 8 },
  sectionTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#2C2C2C', marginTop: 16 },
  paragraph: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#5C5752', lineHeight: 22 },
  link: { color: '#2C6E49', textDecorationLine: 'underline' },
  policyBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#2C2C2C',
    alignItems: 'center',
  },
  policyBtnText: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: Colors.bone },
});
