import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  Layout,
  scale,
  verticalScale,
} from '@/constants/theme';

const SLEEP_QUALITY = [
  { id: 'excellent', name: 'Excellent', description: 'Fall asleep easily, sleep through the night' },
  { id: 'good', name: 'Good', description: 'Generally restful with occasional disruptions' },
  { id: 'fair', name: 'Fair', description: 'Regular difficulty falling or staying asleep' },
  { id: 'poor', name: 'Poor', description: 'Chronic sleep issues affecting daily life' },
];

const SLEEP_CONCERNS = [
  { id: 'falling', name: 'Difficulty Falling Asleep' },
  { id: 'staying', name: 'Waking During Night' },
  { id: 'early', name: 'Waking Too Early' },
  { id: 'quality', name: 'Poor Sleep Quality' },
  { id: 'fatigue', name: 'Daytime Fatigue' },
  { id: 'circadian', name: 'Irregular Schedule' },
];

const SLEEP_AIDS = [
  { id: 'melatonin', name: 'Open to Melatonin' },
  { id: 'magnesium', name: 'Magnesium Based' },
  { id: 'herbal', name: 'Herbal Only' },
  { id: 'none', name: 'No Sleep Aids' },
];

const AVOID_INGREDIENTS = [
  { id: '1', name: 'High-dose Melatonin (>3mg)' },
  { id: '2', name: 'Artificial Dyes' },
];

export default function SleepScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sleepQuality, setSleepQuality] = useState('fair');
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>(['falling', 'quality']);
  const [sleepAidPref, setSleepAidPref] = useState('magnesium');
  const [avoidList, setAvoidList] = useState(AVOID_INGREDIENTS);

  const toggleConcern = (id: string) => {
    setSelectedConcerns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const removeFromAvoid = (id: string) => {
    setAvoidList((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.pageLabel}>Health Profile</Text>
          <Text style={styles.pageTitle}>Sleep & Recovery</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Sleep Quality */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Current Sleep Quality</Text>
          <View style={styles.cardList}>
            {SLEEP_QUALITY.map((quality) => (
              <Pressable
                key={quality.id}
                style={[
                  styles.selectionCard,
                  sleepQuality === quality.id && styles.selectionCardActive,
                ]}
                onPress={() => setSleepQuality(quality.id)}
              >
                <View style={styles.cardInfo}>
                  <Text style={[
                    styles.cardTitle,
                    sleepQuality === quality.id && styles.cardTitleActive,
                  ]}>
                    {quality.name}
                  </Text>
                  <Text style={[
                    styles.cardDescription,
                    sleepQuality === quality.id && styles.cardDescriptionActive,
                  ]}>
                    {quality.description}
                  </Text>
                </View>
                {sleepQuality === quality.id && (
                  <View style={styles.radioActive}>
                    <View style={styles.radioInner} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Sleep Concerns */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sleep Concerns</Text>
          <View style={styles.tagCloud}>
            {SLEEP_CONCERNS.map((concern) => (
              <Pressable
                key={concern.id}
                style={[
                  styles.concernTag,
                  selectedConcerns.includes(concern.id) && styles.concernTagActive,
                ]}
                onPress={() => toggleConcern(concern.id)}
              >
                <Text style={[
                  styles.concernTagText,
                  selectedConcerns.includes(concern.id) && styles.concernTagTextActive,
                ]}>
                  {concern.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Sleep Aid Preference */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sleep Aid Preferences</Text>
          <View style={styles.aidList}>
            {SLEEP_AIDS.map((aid, index) => (
              <Pressable
                key={aid.id}
                style={[
                  styles.aidItem,
                  index < SLEEP_AIDS.length - 1 && styles.aidItemBorder,
                ]}
                onPress={() => setSleepAidPref(aid.id)}
              >
                <Text style={styles.aidName}>{aid.name}</Text>
                <View style={[
                  styles.radio,
                  sleepAidPref === aid.id && styles.radioSelected,
                ]}>
                  {sleepAidPref === aid.id && (
                    <View style={styles.radioInnerSmall} />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Ingredients to Avoid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Avoid in Sleep Products</Text>
            <Text style={styles.sectionAction}>Edit</Text>
          </View>
          <View style={styles.avoidCloud}>
            {avoidList.map((item) => (
              <Pressable
                key={item.id}
                style={styles.avoidTag}
                onPress={() => removeFromAvoid(item.id)}
              >
                <Text style={styles.avoidTagText}>{item.name}</Text>
                <Text style={styles.avoidTagClose}>✕</Text>
              </Pressable>
            ))}
            <Pressable style={styles.addTag}>
              <Text style={styles.addTagText}>+ Add</Text>
            </Pressable>
          </View>
        </View>

        {/* Analysis Note */}
        <View style={styles.analysisNote}>
          <Text style={styles.analysisNoteLabel}>How This Affects Scanning</Text>
          <Text style={styles.analysisNoteText}>
            We'll highlight magnesium-based sleep aids, flag high-dose melatonin products, and suggest supplements with L-theanine, GABA, or valerian root based on your sleep onset concerns.
          </Text>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable style={styles.saveButton} onPress={() => router.back()}>
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bone,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnIcon: {
    fontSize: FontSizes.heading,
    color: Colors.ink,
    marginTop: -2,
  },
  pageLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.inkSecondary,
  },
  pageTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    fontWeight: '500',
    color: Colors.ink,
  },
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: verticalScale(120),
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: Colors.inkSecondary,
    marginBottom: Spacing.md,
  },
  sectionAction: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkSecondary,
    textDecorationLine: 'underline',
    marginBottom: Spacing.md,
  },
  cardList: {
    gap: Spacing.sm,
  },
  selectionCard: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectionCardActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    fontWeight: '500',
    color: Colors.ink,
  },
  cardTitleActive: {
    color: Colors.bone,
  },
  cardDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginTop: 2,
  },
  cardDescriptionActive: {
    color: 'rgba(233, 230, 223, 0.6)',
  },
  radioActive: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    borderWidth: 2,
    borderColor: Colors.bone,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: scale(10),
    height: scale(10),
    borderRadius: scale(5),
    backgroundColor: Colors.bone,
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  concernTag: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.boneCard,
  },
  concernTagActive: {
    backgroundColor: '#4A5568',
    borderColor: '#4A5568',
  },
  concernTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  concernTagTextActive: {
    color: Colors.bone,
  },
  aidList: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
  },
  aidItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  aidItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  aidName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
  },
  radio: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(11),
    borderWidth: 2,
    borderColor: Colors.borderHairline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: Colors.ink,
  },
  radioInnerSmall: {
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: Colors.ink,
  },
  avoidCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  avoidTag: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: '#8B9DC3',
    backgroundColor: 'rgba(74, 85, 104, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avoidTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: '#4A5568',
  },
  avoidTagClose: {
    fontSize: FontSizes.sm,
    color: '#4A5568',
  },
  addTag: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  addTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
  },
  analysisNote: {
    marginTop: Spacing.lg,
    padding: scale(20),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(74, 85, 104, 0.05)',
  },
  analysisNoteLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: Spacing.sm,
  },
  analysisNoteText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.bone,
  },
  saveButton: {
    backgroundColor: Colors.ink,
    paddingVertical: scale(16),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.bone,
  },
});
