import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/auth-context';

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

const GUT_SENSITIVITIES = [
  { id: 'lactose', name: 'Lactose Intolerance', description: 'Difficulty digesting dairy products' },
  { id: 'gluten', name: 'Gluten Sensitivity', description: 'Adverse reactions to wheat and gluten' },
  { id: 'fodmap', name: 'FODMAP Sensitive', description: 'Reacts to fermentable carbohydrates' },
  { id: 'histamine', name: 'Histamine Intolerance', description: 'Reactions to high-histamine foods' },
];

const DIETARY_PREFERENCES = [
  { id: 'vegetarian', name: 'Vegetarian' },
  { id: 'vegan', name: 'Vegan' },
  { id: 'keto', name: 'Keto' },
  { id: 'paleo', name: 'Paleo' },
  { id: 'lowcarb', name: 'Low Carb' },
];

const INGREDIENT_ALERTS = [
  { id: '1', name: 'Carrageenan' },
  { id: '2', name: 'Artificial Sweeteners' },
  { id: '3', name: 'Emulsifiers (E471, E472)' },
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

export default function GutHealthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { onboardingProfile, updateOnboardingProfile } = useAuth();

  const [selectedSensitivities, setSelectedSensitivities] = useState<string[]>(['lactose']);
  const [selectedDiet, setSelectedDiet] = useState<string[]>(
    onboardingProfile?.dietaryPattern ?? []
  );
  const [alerts, setAlerts] = useState(INGREDIENT_ALERTS);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved dietary pattern on mount
  useEffect(() => {
    if (onboardingProfile?.dietaryPattern?.length) {
      setSelectedDiet(onboardingProfile.dietaryPattern);
    }
  }, []);

  const toggleSensitivity = (id: string) => {
    setSelectedSensitivities((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleDiet = (id: string) => {
    setSelectedDiet((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const removeAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.pageLabel}>Health Profile</Text>
          <Text style={styles.pageTitle}>Gut Health</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <InsightCard
          title="Hidden in your daily staples"
          fact="Carboxymethylcellulose (CMC) and polysorbate 80 — emulsifiers in most processed foods — have been shown to thin the protective mucus layer separating gut bacteria from intestinal epithelial cells. This structural change precedes the low-grade inflammation found in metabolic syndrome, independent of calorie intake."
        />

        {/* Digestive Sensitivities */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Digestive Sensitivities</Text>
          <View style={styles.cardList}>
            {GUT_SENSITIVITIES.map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.selectionCard,
                  selectedSensitivities.includes(item.id) && styles.selectionCardActive,
                ]}
                onPress={() => toggleSensitivity(item.id)}
              >
                <View style={styles.cardInfo}>
                  <Text style={[
                    styles.cardTitle,
                    selectedSensitivities.includes(item.id) && styles.cardTitleActive,
                  ]}>
                    {item.name}
                  </Text>
                  <Text style={[
                    styles.cardDescription,
                    selectedSensitivities.includes(item.id) && styles.cardDescriptionActive,
                  ]}>
                    {item.description}
                  </Text>
                </View>
                {selectedSensitivities.includes(item.id) && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Dietary Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Dietary Preferences</Text>
          <View style={styles.tagCloud}>
            {DIETARY_PREFERENCES.map((diet) => (
              <Pressable
                key={diet.id}
                style={[
                  styles.dietTag,
                  selectedDiet.includes(diet.id) && styles.dietTagActive,
                ]}
                onPress={() => toggleDiet(diet.id)}
              >
                <Text style={[
                  styles.dietTagText,
                  selectedDiet.includes(diet.id) && styles.dietTagTextActive,
                ]}>
                  {diet.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Ingredient Alerts */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Ingredient Alerts</Text>
            <Text style={styles.sectionAction}>Edit</Text>
          </View>
          <View style={styles.alertCloud}>
            {alerts.map((item) => (
              <Pressable
                key={item.id}
                style={styles.alertTag}
                onPress={() => removeAlert(item.id)}
              >
                <Text style={styles.alertTagText}>{item.name}</Text>
                <Text style={styles.alertTagClose}>✕</Text>
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
            Products containing emulsifiers, artificial sweeteners, or ingredients conflicting with your sensitivities will be flagged. Gut-friendly alternatives will be suggested.
          </Text>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={[styles.saveBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={[styles.saveButton, isSaving && { opacity: 0.6 }]}
          onPress={async () => {
            if (!onboardingProfile) { router.back(); return; }
            setIsSaving(true);
            await updateOnboardingProfile({ ...onboardingProfile, dietaryPattern: selectedDiet });
            setIsSaving(false);
            router.back();
          }}
          disabled={isSaving}
        >
          {isSaving
            ? <ActivityIndicator color={Colors.darkInk} />
            : <Text style={styles.saveButtonText}>Save Changes</Text>
          }
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
  checkmark: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: 'rgba(241,237,228,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    fontSize: FontSizes.body,
    color: Colors.darkInk,
    fontWeight: '700',
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  dietTag: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(232,213,176,0.3)',
    backgroundColor: 'rgba(232,213,176,0.15)',
  },
  dietTagActive: {
    backgroundColor: 'rgba(232,213,176,0.25)',
    borderColor: Colors.sand,
  },
  dietTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.sand,
  },
  dietTagTextActive: {
    color: Colors.sand,
  },
  alertCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  alertTag: {
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
  alertTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.sand,
  },
  alertTagClose: {
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
    backgroundColor: 'transparent',
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
