import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, ScreenHeader } from '@/components/elory';

const domains = [
  { key: 'skin', title: 'Skin', subtitle: 'Barrier · texture · aging', score: 78 },
  { key: 'sleep', title: 'Sleep', subtitle: 'Rhythm · quality · recovery', score: 74 },
  { key: 'gut', title: 'Gut', subtitle: 'Diversity · comfort · regularity', score: 81 },
  { key: 'hormonal', title: 'Hormonal', subtitle: 'Energy · stress · metabolism', score: 76 },
  { key: 'hair', title: 'Hair', subtitle: 'Density · scalp · nutrition', score: 72 },
  { key: 'fitness', title: 'Fitness', subtitle: 'Strength · cardio · recovery', score: 84 },
];

export default function DomainsScreen() {
  return <EloryScreen header={<ScreenHeader back title="Longevity domains" />}>
    <Text style={styles.intro}>A whole-person view of the systems that shape how you feel and age.</Text>
    <View style={styles.grid}>{domains.map((domain, index) => <Pressable key={domain.key} style={styles.card} onPress={() => router.push(`/health/${domain.key}` as never)}><View style={styles.icon}><DomainIcon index={index} /></View><Text style={styles.title}>{domain.title}</Text><Text style={styles.subtitle}>{domain.subtitle}</Text><View style={styles.score}><Text style={styles.scoreText}>{domain.score}</Text></View><Text style={styles.open}>View domain  →</Text></Pressable>)}</View>
  </EloryScreen>;
}

function DomainIcon({ index }: { index: number }) { return <Svg width={34} height={34} viewBox="0 0 40 40" fill="none" stroke={Colors.accent} strokeWidth={1.2}><Circle cx={20} cy={20} r={8 + (index % 2) * 3} /><Path d={index % 3 === 0 ? 'M20 4v8M20 28v8M4 20h8M28 20h8' : index % 3 === 1 ? 'M11 29c3-12 12-19 20-18-1 10-8 18-20 18z' : 'M8 20c7-11 17-11 24 0-7 11-17 11-24 0z'} /></Svg>; }

const styles = StyleSheet.create({ intro: { fontFamily: Fonts.serif, fontSize: 18, lineHeight: 23, color: Colors.inkSecondary, textAlign: 'center', paddingHorizontal: 25, marginBottom: 20 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, card: { width: '48.5%', minHeight: 205, backgroundColor: Colors.surfaceCard, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 14 }, icon: { width: 49, height: 49, borderRadius: 25, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, title: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 21 }, subtitle: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8.5, lineHeight: 12, marginTop: 3, minHeight: 28 }, score: { position: 'absolute', top: 13, right: 13, width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: Colors.sage, alignItems: 'center', justifyContent: 'center' }, scoreText: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 11 }, open: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 8.5, marginTop: 'auto' } });
