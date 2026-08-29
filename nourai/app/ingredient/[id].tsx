import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { api, IngredientDetail } from '@/services/api';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, EvidenceSpectrum, ScreenHeader } from '@/components/elory';

type Tab = 'Overview' | 'Evidence' | 'Mechanism' | 'Safety';
const tabs: Tab[] = ['Overview', 'Evidence', 'Mechanism', 'Safety'];

export default function IngredientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<IngredientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('Overview');

  useEffect(() => {
    if (!id) return;
    api.getIngredientWithFallback(id).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>;
  if (!data) return <EloryScreen header={<ScreenHeader back title="Ingredient" />}><Text style={styles.empty}>Ingredient details are not available yet.</Text></EloryScreen>;

  const evidenceCount = data.evidence.length;
  const established = data.evidence.filter((item) => item.confidence === 'high');
  const emerging = data.evidence.filter((item) => item.confidence === 'moderate');
  const preliminary = data.evidence.filter((item) => item.confidence === 'low');

  return (
    <EloryScreen header={<ScreenHeader back title="Ingredient intelligence" />}>
      <View style={styles.lead}>
        <View style={styles.icon}><StructureImage uri={data.structure_image_url} size={62} /></View>
        <View style={{ flex: 1 }}><Text style={styles.category}>{data.category || 'Active ingredient'}</Text><Text style={styles.title}>{data.canonical_name}</Text></View>
      </View>
      <View style={styles.tabs}>{tabs.map((item) => <Pressable key={item} style={[styles.tab, tab === item && styles.tabActive]} onPress={() => setTab(item)}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text></Pressable>)}</View>

      {tab === 'Overview' ? <Overview data={data} established={established.length} emerging={emerging.length} preliminary={preliminary.length} /> : null}
      {tab === 'Evidence' ? <Evidence data={data} /> : null}
      {tab === 'Mechanism' ? <Mechanism data={data} /> : null}
      {tab === 'Safety' ? <Safety data={data} /> : null}

      <Pressable style={styles.researchButton} onPress={() => router.push(`/research/${data.id}` as never)}><Text style={styles.researchButtonText}>View all {evidenceCount || ''} research studies  →</Text></Pressable>
      <Text style={styles.disclaimer}>Evidence summaries are educational and are not a substitute for medical advice.</Text>
    </EloryScreen>
  );
}

function Overview({ data, established, emerging, preliminary }: { data: IngredientDetail; established: number; emerging: number; preliminary: number }) {
  const strength = data.evidence_level?.toLowerCase().includes('strong') ? 5 : data.evidence_level?.toLowerCase().includes('moderate') ? 4 : 3;
  return <>
    <View style={styles.spectrumCard}><View style={styles.spectrumTop}><Text style={styles.spectrumLabel}>Overall evidence</Text><EvidenceSpectrum strength={strength} max={5} label={data.evidence_level || 'Moderate'} /></View><View style={styles.gradient}><View style={styles.gradientFill} /></View><View style={styles.gradientLabels}><Text style={styles.gradientText}>Preliminary</Text><Text style={styles.gradientText}>Emerging</Text><Text style={styles.gradientText}>Established</Text></View></View>
    <View style={styles.summaryCard}><Text style={styles.cardKicker}>What it is</Text><Text style={styles.summary}>{data.description || `${data.canonical_name} is an ingredient reviewed through Elory’s evidence framework.`}</Text></View>
    <Text style={styles.sectionTitle}>What the research says</Text>
    <ResearchSignal tone="established" label="Established" count={established} text={data.evidence_reality || data.evidence[0]?.finding || 'Evidence supports its core use when dose and formulation are appropriate.'} />
    <ResearchSignal tone="emerging" label="Emerging" count={emerging} text={data.evidence[1]?.finding || 'Additional benefits are promising, but the body of evidence is still developing.'} />
    <ResearchSignal tone="uncertain" label="Still uncertain" count={preliminary} text={data.common_belief || 'Long-term outcomes and individual response can vary.'} />
  </>;
}

function Evidence({ data }: { data: IngredientDetail }) {
  return <View style={{ marginTop: 18 }}><Text style={styles.sectionTitle}>Evidence snapshot</Text>{data.evidence.slice(0, 6).map((item) => <View key={item.id} style={styles.study}><View style={styles.studyTop}><Text style={styles.studyType}>{(item.study_type || 'Study').replaceAll('_', ' ')}</Text><Text style={styles.studyYear}>{item.year || ''}</Text></View><Text style={styles.studyFinding}>{item.finding}</Text><EvidenceSpectrum strength={item.confidence === 'high' ? 5 : item.confidence === 'moderate' ? 3 : 2} max={5} label={item.confidence} /></View>)}</View>;
}

function Mechanism({ data }: { data: IngredientDetail }) {
  return <View style={{ marginTop: 18 }}><Text style={styles.sectionTitle}>How it works</Text><View style={styles.diagram}><StructureImage uri={data.structure_image_url} size={104} /><View style={styles.diagramRule} /><Text style={styles.diagramLabel}>{data.structure_image_url ? 'Chemical structure' : 'Cellular pathway'}</Text></View><View style={styles.summaryCard}><Text style={styles.summary}>{data.mechanism_summary || 'The precise mechanism is still being characterized in human studies.'}</Text></View>{data.biodomain_scores.slice(0, 4).map((domain) => <View key={domain.biodomain} style={styles.domainRow}><Text style={styles.domainName}>{domain.biodomain}</Text><EvidenceSpectrum strength={Math.max(1, Math.round(domain.magnitude * 5))} max={5} label={domain.direction} /></View>)}</View>;
}

function Safety({ data }: { data: IngredientDetail }) {
  return <View style={{ marginTop: 18 }}><Text style={styles.sectionTitle}>Dose & safety</Text><View style={styles.safetyGrid}><SafetyItem label="Typical range" value={data.typical_dose_range || 'Varies by use'} /><SafetyItem label="Daily guidance" value={data.recommended_daily || 'Follow label'} /><SafetyItem label="Upper limit" value={data.upper_limit || 'Not established'} /></View><Text style={styles.cardKicker}>Possible side effects</Text>{(data.side_effects.length ? data.side_effects : ['No common side effects are documented in this record.']).map((item) => <Text key={item} style={styles.bullet}>•  {item}</Text>)}{data.drug_interactions.length ? <><Text style={[styles.cardKicker, { marginTop: 20 }]}>Interactions</Text>{data.drug_interactions.map((item) => <Text key={item} style={styles.bullet}>•  {item}</Text>)}</> : null}</View>;
}

function SafetyItem({ label, value }: { label: string; value: string }) { return <View style={styles.safetyItem}><Text style={styles.safetyLabel}>{label}</Text><Text style={styles.safetyValue}>{value}</Text></View>; }

function ResearchSignal({ tone, label, count, text }: { tone: string; label: string; count: number; text: string }) {
  const color = tone === 'established' ? Colors.accent : tone === 'emerging' ? '#B77922' : Colors.inkTertiary;
  return <View style={styles.signal}><View style={[styles.signalIcon, { borderColor: color }]}><View style={[styles.signalDot, { backgroundColor: color }]} /></View><View style={{ flex: 1 }}><View style={styles.signalTop}><Text style={[styles.signalLabel, { color }]}>{label}</Text>{count ? <Text style={styles.signalCount}>{count} studies</Text> : null}</View><Text style={styles.signalText}>{text}</Text></View></View>;
}

function StructureImage({ uri, size }: { uri: string | null; size: number }) {
  if (!uri) return <Molecule large={size > 60} />;
  return <Image source={{ uri }} style={{ width: size, height: size }} contentFit="contain" />;
}

function Molecule({ large = false }: { large?: boolean }) {
  const size = large ? 104 : 48;
  return <Svg width={size} height={size} viewBox="0 0 60 60" fill="none" stroke={Colors.accent} strokeWidth={1.2}><Circle cx={13} cy={18} r={5} /><Circle cx={43} cy={14} r={5} /><Circle cx={31} cy={43} r={5} /><Path d="M18 18l20-3M16 22l12 17M40 19l-7 19" /><Path d="M10 12l4-7M47 10l5-6M34 48l4 7" /></Svg>;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }, empty: { fontFamily: Fonts.serif, fontSize: 20, color: Colors.inkSecondary, textAlign: 'center', marginTop: 80 },
  lead: { flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 4, marginBottom: 18 }, icon: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#E1E9E2', alignItems: 'center', justifyContent: 'center' }, category: { fontFamily: Fonts.sansSemiBold, textTransform: 'uppercase', letterSpacing: 1, color: Colors.inkSecondary, fontSize: 8, marginBottom: 3 }, title: { fontFamily: Fonts.serif, color: Colors.ink, fontSize: 31, lineHeight: 32 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderHairline }, tab: { flex: 1, alignItems: 'center', paddingVertical: 10, marginBottom: -1 }, tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.accent }, tabText: { fontFamily: Fonts.sansMedium, fontSize: 9, color: Colors.inkSecondary }, tabTextActive: { color: Colors.accent },
  spectrumCard: { marginTop: 18, backgroundColor: Colors.surfaceCard, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 15 }, spectrumTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, spectrumLabel: { fontFamily: Fonts.serifMedium, fontSize: 17, color: Colors.ink }, gradient: { height: 7, borderRadius: 4, backgroundColor: '#E3DDD4', overflow: 'hidden', marginTop: 13 }, gradientFill: { width: '75%', height: '100%', backgroundColor: Colors.accent, opacity: .72 }, gradientLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }, gradientText: { fontFamily: Fonts.sans, fontSize: 7.5, color: Colors.inkSecondary },
  summaryCard: { marginTop: 14, padding: 15, borderRadius: Radius.md, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline }, cardKicker: { fontFamily: Fonts.sansSemiBold, fontSize: 8, textTransform: 'uppercase', letterSpacing: 1, color: Colors.inkSecondary, marginBottom: 7 }, summary: { fontFamily: Fonts.serif, color: Colors.ink, fontSize: 17, lineHeight: 23 }, sectionTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 22, marginTop: 23, marginBottom: 7 },
  signal: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderHairline }, signalIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, signalDot: { width: 8, height: 8, borderRadius: 4 }, signalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }, signalLabel: { fontFamily: Fonts.sansSemiBold, textTransform: 'uppercase', letterSpacing: .8, fontSize: 8.5 }, signalCount: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 7.5 }, signalText: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 10, lineHeight: 15 },
  researchButton: { height: 47, marginTop: 22, borderRadius: Radius.pill, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' }, researchButtonText: { fontFamily: Fonts.sansMedium, fontSize: 10, color: Colors.accentInk }, disclaimer: { fontFamily: Fonts.sans, color: Colors.inkTertiary, fontSize: 7.5, lineHeight: 11, textAlign: 'center', marginTop: 12, paddingHorizontal: 30 },
  study: { backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, borderRadius: Radius.md, padding: 14, marginBottom: 9 }, studyTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }, studyType: { fontFamily: Fonts.sansSemiBold, textTransform: 'uppercase', color: Colors.inkSecondary, fontSize: 7.5 }, studyYear: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 8 }, studyFinding: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 16, lineHeight: 20, marginBottom: 10 },
  diagram: { alignItems: 'center', paddingVertical: 24 }, diagramRule: { width: 1, height: 25, backgroundColor: Colors.borderHairline }, diagramLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 8, color: Colors.inkSecondary, textTransform: 'uppercase', letterSpacing: .8, marginTop: 5 }, domainRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.borderHairline }, domainName: { fontFamily: Fonts.sansMedium, fontSize: 10.5, color: Colors.ink },
  safetyGrid: { flexDirection: 'row', gap: 8, marginBottom: 22 }, safetyItem: { flex: 1, minHeight: 85, borderRadius: Radius.md, backgroundColor: Colors.surfaceCard, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderHairline, padding: 10 }, safetyLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 7.5, color: Colors.inkSecondary, textTransform: 'uppercase', letterSpacing: .6 }, safetyValue: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 15, marginTop: 8 }, bullet: { fontFamily: Fonts.sans, color: Colors.inkSecondary, fontSize: 10.5, lineHeight: 16, marginBottom: 5 },
});
