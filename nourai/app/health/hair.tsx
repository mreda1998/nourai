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

const HAIR_TYPES = [
  { id: 'straight', name: 'Straight', description: 'Type 1 - Naturally straight with little wave' },
  { id: 'wavy', name: 'Wavy', description: 'Type 2 - S-shaped waves, can be fine to coarse' },
  { id: 'curly', name: 'Curly', description: 'Type 3 - Defined curls from loose to tight' },
  { id: 'coily', name: 'Coily/Kinky', description: 'Type 4 - Tight coils, requires moisture' },
];

const HAIR_CONCERNS = [
  { id: 'thinning', name: 'Thinning/Hair Loss' },
  { id: 'dryness', name: 'Dryness & Brittleness' },
  { id: 'oily', name: 'Oily Scalp' },
  { id: 'dandruff', name: 'Dandruff/Flaking' },
  { id: 'frizz', name: 'Frizz Control' },
  { id: 'damage', name: 'Heat/Color Damage' },
];

const AVOID_INGREDIENTS = [
  { id: '1', name: 'Sulfates (SLS/SLES)' },
  { id: '2', name: 'Silicones' },
  { id: '3', name: 'Parabens' },
];

// ─── InsightCard ──────────────────────────────────────────────────────────────

function InsightCard({ title, fact }: { title: string; fact: string }) {
  return (
    <View style={insightStyles.card}>
      <View style={insightStyles.header}>
        <Text style={insightStyles.icon}>🔬</Text>
        <Text style={insightStyles.label}>HIDDEN INSIGHT</Text>
      </View>
      <Text style={insightStyles.title}>{title}</Text>
      <Text style={insightStyles.fact}>{fact}</Text>
    </View>
  );
}

const insightStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(194, 147, 85, 0.12)',
    borderLeftWidth: 2,
    borderLeftColor: '#C29355',
    borderRadius: Radius.md,
    padding: scale(14),
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: scale(6),
  },
  icon: {
    fontSize: scale(13),
  },
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    color: '#C29355',
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.ink,
    marginBottom: scale(4),
  },
  fact: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.body,
    color: Colors.ink,
    lineHeight: FontSizes.body * 1.5,
  },
});

export default function HairScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [hairType, setHairType] = useState('wavy');
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>(['dryness', 'frizz']);
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
          <Text style={styles.pageTitle}>Hair & Scalp</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <InsightCard
          title="The 'gentle' ingredient myth"
          fact="Cocamidopropyl betaine (CAPB) — marketed as a mild, plant-derived cleanser in nearly all 'sulphate-free' shampoos — is among the top 10 contact sensitisers identified by dermatology patch test studies. Scalp sensitisation from CAPB typically takes 18–24 months to manifest, making it hard to trace back to the product."
        />

        {/* Hair Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hair Type</Text>
          <View style={styles.cardList}>
            {HAIR_TYPES.map((type) => (
              <Pressable
                key={type.id}
                style={[
                  styles.selectionCard,
                  hairType === type.id && styles.selectionCardActive,
                ]}
                onPress={() => setHairType(type.id)}
              >
                <View style={styles.cardInfo}>
                  <Text style={[
                    styles.cardTitle,
                    hairType === type.id && styles.cardTitleActive,
                  ]}>
                    {type.name}
                  </Text>
                  <Text style={[
                    styles.cardDescription,
                    hairType === type.id && styles.cardDescriptionActive,
                  ]}>
                    {type.description}
                  </Text>
                </View>
                {hairType === type.id && (
                  <View style={styles.radioActive}>
                    <View style={styles.radioInner} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Hair Concerns */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Hair Concerns</Text>
          <View style={styles.tagCloud}>
            {HAIR_CONCERNS.map((concern) => (
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

        {/* Ingredients to Avoid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Ingredients to Avoid</Text>
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
              <Text style={styles.addTagText}>+ Add Ingredient</Text>
            </Pressable>
          </View>
        </View>

        {/* Analysis Note */}
        <View style={styles.analysisNote}>
          <Text style={styles.analysisNoteLabel}>How This Affects Scanning</Text>
          <Text style={styles.analysisNoteText}>
            For wavy hair with dryness concerns, we'll flag stripping sulfates and highlight moisturizing ingredients like argan oil, shea butter, and glycerin.
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
    backgroundColor: '#6B5B4F',
    borderColor: '#6B5B4F',
  },
  concernTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  concernTagTextActive: {
    color: Colors.bone,
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
    borderColor: '#D28E8E',
    backgroundColor: 'rgba(210, 142, 142, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avoidTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: '#8E3A3A',
  },
  avoidTagClose: {
    fontSize: FontSizes.sm,
    color: '#8E3A3A',
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
    backgroundColor: 'rgba(107, 91, 79, 0.05)',
  },
  analysisNoteLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: '#6B5B4F',
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
