import React from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Line } from 'react-native-svg';
import { Colors, Fonts, FontSizes, Radius, scale } from '@/constants/theme';

const FEATURES = [
  {
    eyebrow: 'Conversational AI',
    title: 'Ask Elory.',
    description: 'Chat with your stack. Ask about timing, interactions, and evidence.',
    route: '/ask-elory',
  },
  {
    eyebrow: 'Chronobiology',
    title: 'Circadian Protocol.',
    description: 'Your personalised dosing sequence aligned to your biological clock.',
    route: '/circadian',
  },
  {
    eyebrow: 'Interactions',
    title: 'Conflict Map.',
    description: 'Visualise synergies and competitions across your active compounds.',
    route: '/conflict-map',
  },
  {
    eyebrow: 'Cumulative Exposure',
    title: 'Exposure Ledger.',
    description: 'Track synthetic loads across food, supplements, and cosmetics over time.',
    route: '/exposure',
  },
  {
    eyebrow: 'Science Brief',
    title: 'Evidence Pulse.',
    description: 'Weekly digest of new research relevant to your stack.',
    route: '/pulse',
  },
  {
    eyebrow: 'Gray Zone Research',
    title: 'Peptides.',
    description: 'Research dossiers for 20+ peptides — regulatory status, admin routes, and cycle protocols.',
    route: '/peptides',
  },
];

function ArrowIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(241,237,228,0.45)" strokeWidth={1.8}>
      <Path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function DiamondIcon() {
  return (
    <Svg width={8} height={8} viewBox="0 0 12 12" fill={Colors.sand}>
      <Path d="M6 0 L12 6 L6 12 L0 6 Z" />
    </Svg>
  );
}

export default function AtelierScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badge}>
            <DiamondIcon />
            <Text style={styles.badgeText}>Atelier</Text>
          </View>
        </View>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Premium · Intelligence</Text>
          <Text style={styles.title}>The Atelier.</Text>
          <Text style={styles.subtitle}>
            Intelligence tools that know your stack. Each feature reads your compounds,
            your timing, and the evidence — then tells you something real.
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Feature cards */}
        <View style={styles.cards}>
          {FEATURES.map((f, i) => (
            <Pressable
              key={f.route}
              onPress={() => router.push(f.route as any)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardEyebrow}>{f.eyebrow}</Text>
                <ArrowIcon />
              </View>
              <Text style={styles.cardTitle}>{f.title}</Text>
              <Text style={styles.cardDescription}>{f.description}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkSurface,
  },
  scroll: {
    paddingHorizontal: scale(24),
    paddingTop: scale(16),
    paddingBottom: scale(48),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: scale(28),
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.22)',
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: Colors.sand,
  },
  titleBlock: {
    marginBottom: scale(28),
  },
  eyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(241,237,228,0.45)',
    marginBottom: scale(10),
  },
  title: {
    fontFamily: Fonts.serifItalic,
    fontSize: scale(42),
    lineHeight: scale(44),
    color: Colors.darkInk,
    marginBottom: scale(14),
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.subtitle,
    lineHeight: FontSizes.subtitle * 1.55,
    color: 'rgba(241,237,228,0.65)',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(241,237,228,0.15)',
    marginBottom: scale(24),
  },
  cards: {
    gap: scale(12),
  },
  card: {
    backgroundColor: 'rgba(241,237,228,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.1)',
    borderRadius: Radius.lg,
    padding: scale(20),
  },
  cardPressed: {
    backgroundColor: 'rgba(241,237,228,0.08)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(8),
  },
  cardEyebrow: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(241,237,228,0.45)',
  },
  cardTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: scale(22),
    lineHeight: scale(26),
    color: Colors.darkInk,
    marginBottom: scale(6),
  },
  cardDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    lineHeight: FontSizes.caption * 1.55,
    color: 'rgba(241,237,228,0.5)',
  },
});
