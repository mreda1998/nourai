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
        <Text style={insightStyles.label}>◆ HIDDEN INSIGHT</Text>
      </View>
      <Text style={insightStyles.title}>{title}</Text>
      <Text style={insightStyles.fact}>{fact}</Text>
    </View>
  );
}

const insightStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(241,237,228,0.06)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.sand,
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
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    color: Colors.sand,
  },
  title: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.darkInk,
    marginBottom: scale(4),
  },
  fact: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.65)',
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
          <Text style={styles.backBtnIcon}>← Back</Text>
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
    backgroundColor: Colors.darkSurface,
  },
  header: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: scale(4),
  },
  backBtnIcon: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.55)',
  },
  pageLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.sand,
  },
  pageTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.display,
    fontWeight: '500',
    color: Colors.darkInk,
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
    letterSpacing: 1.8,
    fontWeight: '600',
    color: 'rgba(241,237,228,0.45)',
    marginBottom: Spacing.md,
  },
  sectionAction: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(241,237,228,0.45)',
    textDecorationLine: 'underline',
    marginBottom: Spacing.md,
  },
  cardList: {
    gap: Spacing.sm,
  },
  selectionCard: {
    backgroundColor: 'rgba(241,237,228,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.1)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectionCardActive: {
    backgroundColor: 'rgba(241,237,228,0.14)',
    borderColor: Colors.sand,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    fontWeight: '500',
    color: Colors.darkInk,
  },
  cardTitleActive: {
    color: Colors.darkInk,
  },
  cardDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.65)',
    marginTop: 2,
  },
  cardDescriptionActive: {
    color: 'rgba(241,237,228,0.65)',
  },
  radioActive: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    borderWidth: 2,
    borderColor: Colors.darkSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: scale(10),
    height: scale(10),
    borderRadius: scale(5),
    backgroundColor: Colors.darkSurface,
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
    borderColor: 'rgba(232,213,176,0.3)',
    backgroundColor: 'rgba(232,213,176,0.15)',
  },
  concernTagActive: {
    backgroundColor: 'rgba(232,213,176,0.25)',
    borderColor: 'rgba(232,213,176,0.3)',
  },
  concernTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.sand,
  },
  concernTagTextActive: {
    color: Colors.sand,
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
    borderColor: 'rgba(232,213,176,0.3)',
    backgroundColor: 'rgba(232,213,176,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avoidTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.sand,
  },
  avoidTagClose: {
    fontSize: FontSizes.sm,
    color: Colors.sand,
  },
  addTag: {
    paddingVertical: scale(8),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.25)',
    borderStyle: 'dashed',
  },
  addTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.4)',
  },
  analysisNote: {
    marginTop: Spacing.lg,
    padding: scale(20),
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.1)',
    borderRadius: Radius.md,
    backgroundColor: 'rgba(241,237,228,0.04)',
  },
  analysisNoteLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
    color: 'rgba(241,237,228,0.45)',
    marginBottom: Spacing.sm,
  },
  analysisNoteText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(241,237,228,0.65)',
    lineHeight: FontSizes.body * 1.5,
  },
  saveBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingTop: Spacing.lg,
    backgroundColor: Colors.darkSurface,
  },
  saveButton: {
    backgroundColor: Colors.darkInk,
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
    color: Colors.darkSurface,
  },
});
