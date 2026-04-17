/**
 * Edit Health Profile screen
 * Lets users update their health concerns and goals after onboarding.
 * Changes are persisted to AsyncStorage + backend and update the auth context
 * so personalization on the product page reflects the new choices immediately.
 */
import { useState } from 'react';
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

import {
  Colors,
  Fonts,
  FontSizes,
  Layout,
  Radius,
  Spacing,
  scale,
  verticalScale,
} from '@/constants/theme';
import { useAuth } from '@/context/auth-context';

// ─── Data (mirrors onboarding.tsx lists) ────────────────────────────────────

const HEALTH_CONCERNS = [
  { id: 'fertility',            label: 'Trying to Conceive',              desc: 'Reproductive health & fertility focus' },
  { id: 'thyroid',              label: 'Thyroid Condition',                desc: "Hypo/hyperthyroid, Hashimoto's" },
  { id: 'hormonal_condition',   label: 'Hormone-Sensitive Condition',      desc: 'PCOS, endometriosis, estrogen sensitivity' },
  { id: 'medications',          label: 'Regular Prescription Medications', desc: "We'll flag potential ingredient interactions" },
  { id: 'infant_proximity',     label: 'Products Near Young Children',     desc: 'Extra infant & child safety filter applied' },
  { id: 'fragrance_sensitivity',label: 'Fragrance Sensitivity',            desc: 'Flags EU allergens & banned fragrance materials' },
  { id: 'atopic_dermatitis',    label: 'Eczema / Atopic Dermatitis',       desc: 'Highlights common eczema triggers in formulas' },
];

const GOALS = [
  { id: 'clear_skin',        label: 'Clear Skin' },
  { id: 'anti_aging',        label: 'Anti-Aging' },
  { id: 'brighter_skin',     label: 'Brighter Skin' },
  { id: 'hair_growth',       label: 'Hair Growth' },
  { id: 'prevent_hair_loss', label: 'Prevent Hair Loss' },
  { id: 'build_muscle',      label: 'Build Muscle' },
  { id: 'fat_loss',          label: 'Fat Loss' },
  { id: 'more_energy',       label: 'More Energy' },
  { id: 'gut_health',        label: 'Gut Health' },
  { id: 'less_inflammation', label: 'Less Inflammation' },
  { id: 'mental_focus',      label: 'Mental Focus' },
  { id: 'reduce_stress',     label: 'Reduce Stress' },
  { id: 'better_sleep',      label: 'Better Sleep' },
  { id: 'recovery',          label: 'Recovery' },
];

const MAX_GOALS = 3;

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EditHealthProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { onboardingProfile, updateOnboardingProfile } = useAuth();

  const [concerns, setConcerns] = useState<string[]>(
    onboardingProfile?.healthConcerns ?? []
  );
  const [goals, setGoals] = useState<string[]>(
    onboardingProfile?.goals ?? []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleConcern = (id: string) => {
    setConcerns((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleGoal = (id: string) => {
    setGoals((prev) => {
      if (prev.includes(id)) return prev.filter((g) => g !== id);
      if (prev.length >= MAX_GOALS) return prev; // cap at 3
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    if (!onboardingProfile) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateOnboardingProfile({ ...onboardingProfile, healthConcerns: concerns, goals });
      router.back();
    } catch {
      setError('Could not save — please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={s.screen}>
      <View style={[s.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnIcon}>‹</Text>
        </Pressable>
        <Text style={s.pageTitle}>Health Profile</Text>
      </View>

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* Concerns */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Health Concerns</Text>
          <Text style={s.sectionSub}>We'll flag relevant ingredients on every product.</Text>
          <View style={s.cardList}>
            {HEALTH_CONCERNS.map((c) => {
              const active = concerns.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  style={[s.card, active && s.cardActive]}
                  onPress={() => toggleConcern(c.id)}
                >
                  <View style={s.cardBody}>
                    <Text style={[s.cardTitle, active && s.cardTitleActive]}>{c.label}</Text>
                    <Text style={[s.cardDesc,  active && s.cardDescActive]}>{c.desc}</Text>
                  </View>
                  {active && (
                    <View style={s.check}>
                      <Text style={s.checkMark}>✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Goals */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Health Goals</Text>
          <Text style={s.sectionSub}>Pick up to {MAX_GOALS}. We'll surface supporting evidence.</Text>
          <View style={s.pillGrid}>
            {GOALS.map((g) => {
              const active = goals.includes(g.id);
              const disabled = !active && goals.length >= MAX_GOALS;
              return (
                <Pressable
                  key={g.id}
                  style={[s.pill, active && s.pillActive, disabled && s.pillDisabled]}
                  onPress={() => toggleGoal(g.id)}
                  disabled={disabled}
                >
                  <Text style={[s.pillText, active && s.pillTextActive]}>{g.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error && <Text style={s.errorText}>{error}</Text>}
      </ScrollView>

      <View style={[s.saveBar, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          style={[s.saveBtn, isSaving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving
            ? <ActivityIndicator color={Colors.bone} />
            : <Text style={s.saveBtnText}>Save Changes</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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
  pageTitle: {
    fontFamily: Fonts.serifMedium,
    fontSize: FontSizes.display,
    color: Colors.ink,
  },
  container: {
    paddingHorizontal: Layout.screenPaddingHorizontal,
    paddingBottom: verticalScale(120),
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.ink,
    marginBottom: 4,
  },
  sectionSub: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    marginBottom: Spacing.md,
  },
  cardList: {
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  cardActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.bodyLarge,
    color: Colors.ink,
  },
  cardTitleActive: {
    color: Colors.bone,
  },
  cardDesc: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginTop: 2,
  },
  cardDescActive: {
    color: 'rgba(233,230,223,0.65)',
  },
  check: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  checkMark: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.bone,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    paddingVertical: scale(10),
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.boneCard,
  },
  pillActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  pillDisabled: {
    opacity: 0.4,
  },
  pillText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  pillTextActive: {
    color: Colors.bone,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
    textAlign: 'center',
    marginBottom: Spacing.md,
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
  saveBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: scale(16),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.bone,
  },
});
