import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api, HealthDomainResponse } from '@/services/api';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, ScreenHeader } from './EloryScreen';
import { EvidenceSpectrum } from './EvidenceSpectrum';
import { ScoreRing } from './ScoreRing';

export interface HealthDomainConfig {
  key: 'skin' | 'sleep' | 'gut' | 'hormonal' | 'hair' | 'fitness';
  title: string;
  score: number;
  qualifier: string;
  metrics: { label: string; value: number }[];
  factors: { name: string; note: string; strength: number; status: string }[];
  recommendations: string[];
}

export function HealthDomainScreen({ config }: { config: HealthDomainConfig }) {
  const [remote, setRemote] = useState<HealthDomainResponse | null>(null);
  useEffect(() => { api.getHealthDomain(config.key).then(setRemote).catch(() => {}); }, [config.key]);
  const score = remote?.score ?? config.score;
  const qualifier = remote?.qualifier ?? config.qualifier;
  const factors = remote?.factors?.length ? remote.factors.map((item) => ({ name: item.ingredient_name, note: item.direction === 'benefit' ? 'Supports this domain' : item.direction === 'harm' ? 'Worth monitoring' : 'Mixed signal', strength: item.strength === 'Strong' ? 5 : item.strength === 'Moderate' ? 3 : 2, status: item.strength })) : config.factors;

  return (
    <EloryScreen header={<ScreenHeader back title={config.title} right={<Pressable onPress={() => router.push('/health/edit-profile' as never)}><Text style={styles.edit}>Edit</Text></Pressable>} />}>
      <View style={styles.overview}>
        <ScoreRing score={score} qualifier={qualifier} size={121} />
        <View style={styles.metrics}>{config.metrics.slice(0, 4).map((metric, index) => <View key={metric.label} style={[styles.metric, index > 1 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline }]}><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.metricLabel}>{metric.label}</Text></View>)}</View>
      </View>
      <View style={styles.scoreNote}><Text style={styles.scoreNoteTitle}>Your {config.title.toLowerCase()} score is {qualifier.toLowerCase()}.</Text><Text style={styles.scoreNoteText}>Based on your profile, daily stack and the evidence behind each active ingredient.</Text></View>

      <Text style={styles.sectionTitle}>Top factors</Text>
      <View style={styles.factorCard}>{factors.slice(0, 4).map((factor, index) => <View key={`${factor.name}-${index}`} style={[styles.factor, index > 0 && styles.factorBorder]}><View style={styles.factorIcon}><Text style={styles.factorLetter}>{factor.name.slice(0, 1)}</Text></View><View style={{ flex: 1 }}><Text style={styles.factorName}>{factor.name}</Text><Text style={styles.factorNote}>{factor.note}</Text></View><View style={{ alignItems: 'flex-end' }}><EvidenceSpectrum strength={factor.strength} max={5} /><Text style={styles.factorStatus}>{factor.status}</Text></View></View>)}</View>

      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Recommendations</Text><Text style={styles.link}>View plan</Text></View>
      {config.recommendations.map((item, index) => <View key={item} style={styles.recommendation}><View style={styles.number}><Text style={styles.numberText}>0{index + 1}</Text></View><Text style={styles.recommendationText}>{item}</Text><Text style={styles.arrow}>›</Text></View>)}
    </EloryScreen>
  );
}

const styles = StyleSheet.create({
  edit: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 10 }, overview: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 7, marginBottom: 16 }, metrics: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' }, metric: { width: '50%', minHeight: 52, alignItems: 'center', justifyContent: 'center' }, metricValue: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 19 }, metricLabel: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 7.5, marginTop: 2, textAlign: 'center' }, scoreNote: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 13, marginBottom: 22 }, scoreNoteTitle: { fontFamily: Fonts.serifItalic, fontSize: 16, color: Colors.ink }, scoreNoteText: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 9, lineHeight: 13, marginTop: 4 }, sectionTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 21, marginBottom: 7 }, factorCard: { backgroundColor: Colors.surfaceCard, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, paddingHorizontal: 12, marginBottom: 23 }, factor: { minHeight: 67, flexDirection: 'row', gap: 10, alignItems: 'center' }, factorBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline }, factorIcon: { width: 37, height: 37, borderRadius: 19, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }, factorLetter: { fontFamily: Fonts.serifItalic, color: Colors.accent, fontSize: 16 }, factorName: { fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 10.5 }, factorNote: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8.5, marginTop: 2 }, factorStatus: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 7.5, marginTop: 4 }, sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }, link: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 9 }, recommendation: { minHeight: 65, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline, flexDirection: 'row', alignItems: 'center', gap: 11 }, number: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderHairline, alignItems: 'center', justifyContent: 'center' }, numberText: { fontFamily: Fonts.serifItalic, color: Colors.accent, fontSize: 11 }, recommendationText: { flex: 1, fontFamily: Fonts.sansMedium, color: Colors.ink, fontSize: 10.5, lineHeight: 14 }, arrow: { color: Colors.inkSecondary, fontSize: 22 },
});
