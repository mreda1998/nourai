/**
 * Edit health profile — concerns and goals after onboarding. Persists via
 * updateOnboardingProfile so product personalisation updates immediately.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Check } from 'lucide-react-native';
import { Palette, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { Button, Chip, ListGroup, ListRow, PressableScale, Screen, Section, Txt } from '@/components/ui';

const HEALTH_CONCERNS = [
  { id: 'fertility', label: 'Trying to conceive', desc: 'Reproductive health and fertility' },
  { id: 'thyroid', label: 'Thyroid condition', desc: 'Hypo/hyperthyroid, Hashimoto’s' },
  { id: 'hormonal_condition', label: 'Hormone-sensitive condition', desc: 'PCOS, endometriosis, oestrogen sensitivity' },
  { id: 'medications', label: 'Regular prescription medication', desc: 'We’ll flag possible interactions' },
  { id: 'infant_proximity', label: 'Used near young children', desc: 'Adds an infant and child safety filter' },
  { id: 'fragrance_sensitivity', label: 'Fragrance sensitivity', desc: 'Flags EU-listed fragrance allergens' },
  { id: 'atopic_dermatitis', label: 'Eczema / atopic dermatitis', desc: 'Highlights common eczema triggers' },
];

const GOALS = [
  { id: 'clear_skin', label: 'Clear skin' },
  { id: 'anti_aging', label: 'Healthy ageing' },
  { id: 'brighter_skin', label: 'Brighter skin' },
  { id: 'hair_growth', label: 'Hair growth' },
  { id: 'prevent_hair_loss', label: 'Prevent hair loss' },
  { id: 'build_muscle', label: 'Build muscle' },
  { id: 'fat_loss', label: 'Fat loss' },
  { id: 'more_energy', label: 'More energy' },
  { id: 'gut_health', label: 'Gut health' },
  { id: 'less_inflammation', label: 'Less inflammation' },
  { id: 'mental_focus', label: 'Mental focus' },
  { id: 'reduce_stress', label: 'Reduce stress' },
  { id: 'better_sleep', label: 'Better sleep' },
  { id: 'recovery', label: 'Recovery' },
];

const MAX_GOALS = 3;
const pretty = (v?: string) => (v ? v.replace(/_/g, ' ').replace(/^(\d+) (\d+)$/, '$1–$2').replace(/ plus$/, '+').replace(/^\w/, (c) => c.toUpperCase()) : 'Not set');

export default function EditHealthProfileScreen() {
  const router = useRouter();
  const { onboardingProfile, updateOnboardingProfile } = useAuth();
  const [concerns, setConcerns] = useState<string[]>(onboardingProfile?.healthConcerns ?? []);
  const [goals, setGoals] = useState<string[]>(onboardingProfile?.goals ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleConcern = (id: string) => setConcerns((p) => (p.includes(id) ? p.filter((c) => c !== id) : [...p, id]));
  const toggleGoal = (id: string) => setGoals((p) => {
    if (p.includes(id)) return p.filter((g) => g !== id);
    if (p.length >= MAX_GOALS) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); return p; }
    return [...p, id];
  });

  const save = async () => {
    if (!onboardingProfile) return;
    setSaving(true);
    setError(null);
    try {
      await updateOnboardingProfile({ ...onboardingProfile, healthConcerns: concerns, goals });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      setError('Couldn’t save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      back
      title="Health profile"
      subtitle="Helps Elory personalise every analysis."
      footer={<Button label="Save changes" loading={saving} disabled={!onboardingProfile} onPress={save} />}
    >
      <Section title="Goals" caption={`Choose up to ${MAX_GOALS} — ${goals.length} selected`} style={{ marginTop: 8 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GOALS.map((g) => <Chip key={g.id} label={g.label} selected={goals.includes(g.id)} onPress={() => toggleGoal(g.id)} />)}
        </View>
      </Section>

      <Section title="Health context" caption="We’ll flag relevant ingredients on every product">
        <View style={{ gap: 8 }}>
          {HEALTH_CONCERNS.map((c) => {
            const active = concerns.includes(c.id);
            return (
              <PressableScale
                key={c.id}
                haptic="selection"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                accessibilityLabel={c.label}
                onPress={() => toggleConcern(c.id)}
                style={[styles.option, active && styles.optionActive]}
              >
                <View style={{ flex: 1 }}>
                  <Txt variant="headline">{c.label}</Txt>
                  <Txt variant="footnote" tone="secondary" style={{ marginTop: 2 }}>{c.desc}</Txt>
                </View>
                <View style={[styles.box, active && styles.boxActive]}>{active ? <Check size={14} color={Palette.onAccent} strokeWidth={3} /> : null}</View>
              </PressableScale>
            );
          })}
        </View>
      </Section>

      <Section title="About you" caption="Set during onboarding">
        <ListGroup>
          <ListRow title="Age range" value={pretty(onboardingProfile?.ageRange)} chevron={false} />
          <ListRow title="Biological sex" value={pretty(onboardingProfile?.biologicalSex)} chevron={false} />
          <ListRow title="Activity" value={pretty(onboardingProfile?.activityLevel)} chevron={false} />
          <ListRow title="Sleep" value={pretty(onboardingProfile?.sleepQuality)} chevron={false} />
        </ListGroup>
      </Section>

      {error ? (
        <View style={styles.error}>
          <AlertCircle size={18} color={Palette.weak} />
          <Txt variant="footnote" tone="weak">{error}</Txt>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: Radius.lg, borderCurve: 'continuous', backgroundColor: Palette.surface, borderWidth: 1.5, borderColor: 'transparent' },
  optionActive: { borderColor: Palette.accent, backgroundColor: Palette.accentSoft },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: Palette.ink4, alignItems: 'center', justifyContent: 'center' },
  boxActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  error: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, padding: 14, borderRadius: Radius.md, backgroundColor: Palette.weakSoft },
});
