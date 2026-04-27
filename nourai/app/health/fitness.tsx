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

const ACTIVITY_LEVELS = [
  { id: 'sedentary', name: 'Sedentary', description: 'Little to no regular exercise' },
  { id: 'light', name: 'Lightly Active', description: '1-3 days/week of light activity' },
  { id: 'moderate', name: 'Moderately Active', description: '3-5 days/week of moderate exercise' },
  { id: 'active', name: 'Very Active', description: '6-7 days/week of intense training' },
  { id: 'athlete', name: 'Athlete', description: 'Professional or competitive training' },
];

const FITNESS_GOALS = [
  { id: 'strength', name: 'Build Strength' },
  { id: 'endurance', name: 'Improve Endurance' },
  { id: 'recovery', name: 'Optimize Recovery' },
  { id: 'performance', name: 'Peak Performance' },
  { id: 'weight', name: 'Weight Management' },
  { id: 'flexibility', name: 'Flexibility & Mobility' },
];

const SUPPLEMENT_FOCUS = [
  { id: 'protein', name: 'Protein Quality' },
  { id: 'preworkout', name: 'Pre-Workout Safety' },
  { id: 'recovery', name: 'Recovery Compounds' },
  { id: 'hydration', name: 'Electrolytes' },
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

export default function FitnessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { onboardingProfile, updateOnboardingProfile } = useAuth();

  const [activityLevel, setActivityLevel] = useState(
    onboardingProfile?.activityLevel || 'moderate'
  );
  const [selectedGoals, setSelectedGoals] = useState<string[]>(['recovery', 'strength']);
  const [supplementFocus, setSupplementFocus] = useState<string[]>(['protein']);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved activityLevel from profile on mount
  useEffect(() => {
    if (onboardingProfile?.activityLevel) {
      setActivityLevel(onboardingProfile.activityLevel);
    }
  }, []);

  const toggleGoal = (id: string) => {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const toggleSupplement = (id: string) => {
    setSupplementFocus((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnIcon}>← Back</Text>
        </Pressable>
        <View>
          <Text style={styles.pageLabel}>Health Profile</Text>
          <Text style={styles.pageTitle}>Fitness & Recovery</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <InsightCard
          title="What's in your pre-workout"
          fact="Sodium benzoate reacts with ascorbic acid (vitamin C) — common co-ingredients in pre-workouts and sports drinks — to form benzene, a Group 1 IARC carcinogen. The reaction rate is accelerated by heat and light, making stored bottles a higher risk than freshly opened ones."
        />

        {/* Activity Level */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Activity Level</Text>
          <View style={styles.cardList}>
            {ACTIVITY_LEVELS.map((level) => (
              <Pressable
                key={level.id}
                style={[
                  styles.selectionCard,
                  activityLevel === level.id && styles.selectionCardActive,
                ]}
                onPress={() => setActivityLevel(level.id)}
              >
                <View style={styles.cardInfo}>
                  <Text style={[
                    styles.cardTitle,
                    activityLevel === level.id && styles.cardTitleActive,
                  ]}>
                    {level.name}
                  </Text>
                  <Text style={[
                    styles.cardDescription,
                    activityLevel === level.id && styles.cardDescriptionActive,
                  ]}>
                    {level.description}
                  </Text>
                </View>
                {activityLevel === level.id && (
                  <View style={styles.radioActive}>
                    <View style={styles.radioInner} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>

        {/* Fitness Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fitness Goals</Text>
          <Text style={styles.sectionHint}>Select all that apply</Text>
          <View style={styles.tagCloud}>
            {FITNESS_GOALS.map((goal) => (
              <Pressable
                key={goal.id}
                style={[
                  styles.goalTag,
                  selectedGoals.includes(goal.id) && styles.goalTagActive,
                ]}
                onPress={() => toggleGoal(goal.id)}
              >
                <Text style={[
                  styles.goalTagText,
                  selectedGoals.includes(goal.id) && styles.goalTagTextActive,
                ]}>
                  {goal.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Supplement Scanning Focus */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Supplement Scanning Focus</Text>
          <Text style={styles.sectionHint}>Prioritize analysis for these areas</Text>
          <View style={styles.focusList}>
            {SUPPLEMENT_FOCUS.map((item, index) => (
              <Pressable
                key={item.id}
                style={[
                  styles.focusItem,
                  index < SUPPLEMENT_FOCUS.length - 1 && styles.focusItemBorder,
                ]}
                onPress={() => toggleSupplement(item.id)}
              >
                <Text style={styles.focusName}>{item.name}</Text>
                <View style={[
                  styles.checkbox,
                  supplementFocus.includes(item.id) && styles.checkboxActive,
                ]}>
                  {supplementFocus.includes(item.id) && (
                    <Text style={styles.checkboxText}>✓</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Analysis Note */}
        <View style={styles.analysisNote}>
          <Text style={styles.analysisNoteLabel}>How This Affects Scanning</Text>
          <Text style={styles.analysisNoteText}>
            Based on your moderate activity level and recovery focus, we'll prioritize checking for banned substances, protein quality scores, and recovery-boosting compounds in supplements.
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
            await updateOnboardingProfile({ ...onboardingProfile, activityLevel: activityLevel as any });
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
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    fontWeight: '600',
    color: 'rgba(241,237,228,0.45)',
    marginBottom: 4,
  },
  sectionHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: 'rgba(241,237,228,0.45)',
    marginBottom: Spacing.md,
  },
  cardList: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
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
    borderColor: Colors.darkInk,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: scale(10),
    height: scale(10),
    borderRadius: scale(5),
    backgroundColor: Colors.darkInk,
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  goalTag: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(16),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(232,213,176,0.3)',
    backgroundColor: 'rgba(232,213,176,0.15)',
  },
  goalTagActive: {
    backgroundColor: 'rgba(232,213,176,0.25)',
    borderColor: Colors.sand,
  },
  goalTagText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.sand,
  },
  goalTagTextActive: {
    color: Colors.sand,
  },
  focusList: {
    backgroundColor: 'rgba(241,237,228,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.1)',
    borderRadius: Radius.md,
  },
  focusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  focusItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(241,237,228,0.1)',
  },
  focusName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.darkInk,
  },
  checkbox: {
    width: scale(24),
    height: scale(24),
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: 'rgba(241,237,228,0.2)',
    borderColor: Colors.sand,
  },
  checkboxText: {
    color: Colors.darkInk,
    fontWeight: '700',
    fontSize: FontSizes.caption,
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
