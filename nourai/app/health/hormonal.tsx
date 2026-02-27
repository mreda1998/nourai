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

const HORMONAL_CONCERNS = [
  { id: 'thyroid', name: 'Thyroid Health', description: 'Thyroid function and metabolism support' },
  { id: 'cortisol', name: 'Stress & Cortisol', description: 'Adrenal health and stress response' },
  { id: 'estrogen', name: 'Estrogen Balance', description: 'Estrogen levels and metabolism' },
  { id: 'testosterone', name: 'Testosterone', description: 'Natural testosterone optimization' },
  { id: 'insulin', name: 'Blood Sugar', description: 'Insulin sensitivity and glucose' },
  { id: 'menstrual', name: 'Menstrual Health', description: 'Cycle regularity and PMS support' },
];

const ENDOCRINE_DISRUPTORS = [
  { id: '1', name: 'BPA/BPS' },
  { id: '2', name: 'Phthalates' },
  { id: '3', name: 'Parabens' },
  { id: '4', name: 'Triclosan' },
];

const LIFE_STAGES = [
  { id: 'general', name: 'General Wellness' },
  { id: 'fertility', name: 'Fertility Focus' },
  { id: 'pregnancy', name: 'Pregnancy' },
  { id: 'postpartum', name: 'Postpartum' },
  { id: 'perimenopause', name: 'Perimenopause' },
  { id: 'menopause', name: 'Menopause' },
];

export default function HormonalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>(['cortisol', 'thyroid']);
  const [disruptors, setDisruptors] = useState(ENDOCRINE_DISRUPTORS);
  const [lifeStage, setLifeStage] = useState('general');

  const toggleConcern = (id: string) => {
    setSelectedConcerns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const removeDisruptor = (id: string) => {
    setDisruptors((prev) => prev.filter((d) => d.id !== id));
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>‹</Text>
        </Pressable>
        <View>
          <Text style={styles.pageLabel}>Health Profile</Text>
          <Text style={styles.pageTitle}>Hormonal Balance</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Life Stage */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Life Stage</Text>
          <View style={styles.stageCloud}>
            {LIFE_STAGES.map((stage) => (
              <Pressable
                key={stage.id}
                style={[
                  styles.stageTag,
                  lifeStage === stage.id && styles.stageTagActive,
                ]}
                onPress={() => setLifeStage(stage.id)}
              >
                <Text style={[
                  styles.stageTagText,
                  lifeStage === stage.id && styles.stageTagTextActive,
                ]}>
                  {stage.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Hormonal Concerns */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Areas of Focus</Text>
          <View style={styles.cardList}>
            {HORMONAL_CONCERNS.map((concern) => (
              <Pressable
                key={concern.id}
                style={[
                  styles.selectionCard,
                  selectedConcerns.includes(concern.id) && styles.selectionCardActive,
                ]}
                onPress={() => toggleConcern(concern.id)}
              >
                <View style={styles.cardInfo}>
                  <Text style={[
                    styles.cardTitle,
                    selectedConcerns.includes(concern.id) && styles.cardTitleActive,
                  ]}>
                    {concern.name}
                  </Text>
                  <Text style={[
                    styles.cardDescription,
                    selectedConcerns.includes(concern.id) && styles.cardDescriptionActive,
                  ]}>
                    {concern.description}
                  </Text>
                </View>
                {selectedConcerns.includes(concern.id) && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Endocrine Disruptors to Flag */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Endocrine Disruptors</Text>
            <Text style={styles.sectionAction}>Edit</Text>
          </View>
          <Text style={styles.sectionHint}>
            These chemicals can interfere with hormone function
          </Text>
          <View style={styles.disruptorCloud}>
            {disruptors.map((item) => (
              <Pressable
                key={item.id}
                style={styles.disruptorTag}
                onPress={() => removeDisruptor(item.id)}
              >
                <Text style={styles.disruptorTagText}>{item.name}</Text>
                <Text style={styles.disruptorTagClose}>✕</Text>
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
            We'll flag known endocrine disruptors in personal care and food products, highlight adaptogens and hormone-supporting nutrients, and warn about ingredients that may affect cortisol or thyroid function.
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
    marginBottom: 4,
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
  sectionHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    marginBottom: Spacing.md,
  },
  stageCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  stageTag: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.boneCard,
  },
  stageTagActive: {
    backgroundColor: '#7A6B8A',
    borderColor: '#7A6B8A',
  },
  stageTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  stageTagTextActive: {
    color: Colors.bone,
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
  checkmark: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: Colors.bone,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    fontSize: FontSizes.body,
    color: Colors.ink,
    fontWeight: '700',
  },
  disruptorCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  disruptorTag: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: '#B08AAB',
    backgroundColor: 'rgba(122, 107, 138, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  disruptorTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: '#5D4E6B',
  },
  disruptorTagClose: {
    fontSize: FontSizes.sm,
    color: '#5D4E6B',
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
    backgroundColor: 'rgba(122, 107, 138, 0.05)',
  },
  analysisNoteLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: '#7A6B8A',
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
