import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { EloryScreen, FilterPills, ScreenHeader } from '@/components/elory';

const categories = [
  { key: 'latest', label: 'Latest' },
  { key: 'longevity', label: 'Longevity' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'supplements', label: 'Supplements' },
  { key: 'mind', label: 'Mind' },
];

const stories = [
  { id: 'circadian', category: 'Protocols', title: 'The quiet power of a consistent circadian rhythm', read: '6 min read' },
  { id: 'peptides', category: 'Research', title: 'Peptides: promise, evidence and what remains unknown', read: '9 min read' },
  { id: 'creatine', category: 'Nutrition', title: 'Creatine beyond strength: what the data now suggests', read: '7 min read' },
];

export default function JournalScreen() {
  const [category, setCategory] = useState('latest');
  return (
    <EloryScreen header={<ScreenHeader title="ELORY Journal" />}>
      <FilterPills options={categories} selected={category} onSelect={setCategory} />

      <Pressable style={styles.feature} onPress={() => router.push('/newsletter/creatine' as never)}>
        <Image source={require('@/assets/images/elory-architecture-hero.png')} style={styles.featureImage} />
        <View style={styles.featureShade} />
        <View style={styles.featureCopy}>
          <Text style={styles.featureKicker}>The longevity issue</Text>
          <Text style={styles.featureTitle}>Evidence over opinions.</Text>
          <Text style={styles.featureDek}>A calmer way to understand the choices that shape your health.</Text>
        </View>
      </Pressable>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Latest stories</Text>
        <Text style={styles.seeAll}>View all</Text>
      </View>
      {stories.map((story, index) => (
        <Pressable key={story.id} style={[styles.story, index > 0 && styles.storyBorder]} onPress={() => router.push(`/newsletter/${story.id}` as never)}>
          <View style={styles.storyIndex}><Text style={styles.storyIndexText}>0{index + 1}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.storyMeta}>{story.category}  ·  {story.read}</Text>
            <Text style={styles.storyTitle}>{story.title}</Text>
          </View>
          <Text style={styles.arrow}>↗</Text>
        </Pressable>
      ))}
    </EloryScreen>
  );
}

const styles = StyleSheet.create({
  feature: { height: 322, borderRadius: Radius.lg, overflow: 'hidden', marginTop: 18, marginBottom: 28, backgroundColor: Colors.surfaceAlt },
  featureImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  featureShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9,35,34,0.24)' },
  featureCopy: { position: 'absolute', left: 20, right: 20, bottom: 20 },
  featureKicker: { color: '#fff', fontFamily: Fonts.sansSemiBold, textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 9, marginBottom: 8 },
  featureTitle: { color: '#fff', fontFamily: Fonts.serif, fontSize: 31, lineHeight: 33 },
  featureDek: { color: 'rgba(255,255,255,.82)', fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, marginTop: 7, maxWidth: 260 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  sectionTitle: { fontFamily: Fonts.serifMedium, fontSize: 23, color: Colors.ink },
  seeAll: { fontFamily: Fonts.sansMedium, color: Colors.accent, fontSize: 10 },
  story: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  storyBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderHairline },
  storyIndex: { width: 38, height: 50, borderRadius: 19, borderWidth: 1, borderColor: Colors.borderHairline, alignItems: 'center', justifyContent: 'center' },
  storyIndexText: { fontFamily: Fonts.serifItalic, color: Colors.accent, fontSize: 13 },
  storyMeta: { fontFamily: Fonts.sansMedium, color: Colors.inkSecondary, fontSize: 9, textTransform: 'uppercase', letterSpacing: .7, marginBottom: 5 },
  storyTitle: { fontFamily: Fonts.serifMedium, color: Colors.ink, fontSize: 17, lineHeight: 20 },
  arrow: { color: Colors.inkSecondary, fontSize: 16 },
});
