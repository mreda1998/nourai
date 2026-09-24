import React, { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, FadeIn, FadeInDown, SlideInRight, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  Activity, Baby, Brain, Check, ChevronLeft, Dumbbell, Flame, HeartPulse, Leaf, Moon, Pill, Sparkles, Sprout, Sun, Waves,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Fonts, Palette, Radius } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { useAuth } from '@/context/auth-context';
import type { OnboardingProfile } from '@/services/api';
import { Button, IconButton, PressableScale, Txt } from '@/components/ui';

// ─── Options ──────────────────────────────────────────────────────────────────

type Opt<V extends string> = { value: V; label: string; hint?: string; Icon?: LucideIcon };

const GOALS: Opt<string>[] = [
  { value: 'gut', label: 'Gut health', hint: 'Microbiome, digestion, bloating', Icon: Sprout },
  { value: 'sleep', label: 'Sleep', hint: 'Circadian rhythm & recovery', Icon: Moon },
  { value: 'long', label: 'Longevity', hint: 'Cellular resilience, oxidative load', Icon: HeartPulse },
  { value: 'skin', label: 'Skin', hint: 'Barrier, hydration, sun response', Icon: Waves },
  { value: 'meta', label: 'Metabolic', hint: 'Glucose, insulin, energy', Icon: Flame },
  { value: 'mind', label: 'Cognitive', hint: 'Focus, mood, stress response', Icon: Brain },
];

const AGES: Opt<OnboardingProfile['ageRange']>[] = [
  { value: 'under_25', label: 'Under 25' },
  { value: '25_34', label: '25–34' },
  { value: '35_44', label: '35–44' },
  { value: '45_54', label: '45–54' },
  { value: '55_plus', label: '55+' },
];

const SEXES: Opt<OnboardingProfile['biologicalSex']>[] = [
  { value: 'female', label: 'Female', hint: 'Iron and hormone context applied' },
  { value: 'male', label: 'Male', hint: 'Hormone-related thresholds applied' },
  { value: 'not_specified', label: 'Prefer not to say', hint: 'General population defaults' },
];

const SLEEP: Opt<OnboardingProfile['sleepQuality']>[] = [
  { value: 'excellent', label: 'Excellent', hint: 'Fall asleep easily, wake refreshed' },
  { value: 'good', label: 'Good', hint: 'Generally rested, occasional disruptions' },
  { value: 'fair', label: 'Fair', hint: 'Tired most mornings' },
  { value: 'poor', label: 'Poor', hint: 'Regular trouble falling or staying asleep' },
];

const ACTIVITY: Opt<OnboardingProfile['activityLevel']>[] = [
  { value: 'sedentary', label: 'Mostly sitting', hint: 'Little to no exercise', Icon: Sun },
  { value: 'light', label: 'Light', hint: '1–2 days a week', Icon: Leaf },
  { value: 'moderate', label: 'Moderate', hint: '3–4 days a week', Icon: Activity },
  { value: 'active', label: 'Active', hint: '5+ days a week', Icon: Dumbbell },
  { value: 'athlete', label: 'Athlete', hint: 'Daily or competitive training', Icon: Flame },
];

const CONTEXT: Opt<string>[] = [
  { value: 'preg', label: 'Pregnant', Icon: Baby },
  { value: 'nurs', label: 'Breastfeeding', Icon: Baby },
  { value: 'veg', label: 'Plant-based diet', Icon: Leaf },
  { value: 'sens', label: 'Sensitive skin', Icon: Waves },
  { value: 'rx', label: 'Taking prescription medication', Icon: Pill },
  { value: 'none', label: 'None of these' },
];

const FACTS = [
  {
    headline: 'Most vitamin C supplements hold far more than you can absorb.',
    body: 'Absorption drops sharply above about 200 mg, yet many products contain 500–1000 mg. The excess is excreted within hours — form and timing matter more than the number on the label.',
    source: 'Levine et al., NEJM 1996 · Padayatty et al., Ann Intern Med 2004',
  },
  {
    headline: 'Omega-3 taken without fat is poorly absorbed.',
    body: 'EPA and DHA are fat-soluble. On an empty stomach, bioavailability drops sharply. Label doses assume you took it with a meal — most people don’t.',
    source: 'Lawson & Hughes, BBRC 1988 · Schuchardt & Hahn, PLEFA 2013',
  },
  {
    headline: 'Many probiotics don’t survive stomach acid.',
    body: 'CFU counts are measured at manufacture, not at consumption. Strain selection and protective delivery matter far more than the headline number.',
    source: 'Govinden et al., Beneficial Microbes 2014',
  },
];

const TOTAL = 12;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);

  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [ageRange, setAgeRange] = useState<OnboardingProfile['ageRange']>('');
  const [biologicalSex, setBiologicalSex] = useState<OnboardingProfile['biologicalSex'] | ''>('');
  const [sleepQuality, setSleepQuality] = useState<OnboardingProfile['sleepQuality']>('');
  const [activityLevel, setActivityLevel] = useState<OnboardingProfile['activityLevel']>('');
  const [flags, setFlags] = useState<string[]>([]);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const toggleFlag = (key: string) => setFlags((prev) => {
    if (key === 'none') return prev.includes('none') ? [] : ['none'];
    const without = prev.filter((k) => k !== 'none');
    return without.includes(key) ? without.filter((k) => k !== key) : [...without, key];
  });

  const buildProfile = (): OnboardingProfile => {
    const healthConcerns: string[] = [];
    if (flags.includes('sens')) healthConcerns.push('sensitive_skin');
    if (flags.includes('rx')) healthConcerns.push('on_rx_meds');
    return {
      biologicalSex: (biologicalSex as OnboardingProfile['biologicalSex']) || 'not_specified',
      ageRange,
      isPregnant: flags.includes('preg'),
      isBreastfeeding: flags.includes('nurs'),
      sleepQuality,
      activityLevel,
      dietaryPattern: flags.includes('veg') ? ['plant_based'] : [],
      environment: '',
      productCategories: [],
      focusAreas,
      healthConcerns,
      goals: [],
    };
  };

  const createAccount = async () => {
    try { await completeOnboarding(buildProfile()); } catch { /* stored locally; continue */ }
    router.push(`/auth?name=${encodeURIComponent(name.trim())}`);
  };

  const guest = async () => {
    try { await completeOnboarding(buildProfile()); } catch { /* continue anyway */ }
    router.replace('/(tabs)');
  };

  if (step === 0) return <Welcome onStart={next} onSignIn={() => router.push('/auth' as never)} />;

  const screens: Record<number, ReactNode> = {
    1: (
      <Question title="What matters to you?" subtitle="Choose any. Your analysis will be tuned to these areas." cta={focusAreas.length ? `Continue · ${focusAreas.length} selected` : 'Select at least one'} canContinue={focusAreas.length > 0} onContinue={next}>
        <Options multi options={GOALS} selected={focusAreas} onPress={(v) => toggle(focusAreas, setFocusAreas, v)} grid />
      </Question>
    ),
    2: <Fact {...FACTS[0]} index={1} onContinue={next} />,
    3: (
      <Question title="What should we call you?" subtitle="Just your first name." canContinue={!!name.trim()} onContinue={next} keyboard>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="First name"
          placeholderTextColor={Palette.ink4}
          autoCapitalize="words"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => name.trim() && next()}
          style={styles.nameInput}
        />
      </Question>
    ),
    4: (
      <Question title="How old are you?" subtitle="Age changes absorption and recommended dose ranges." canContinue={!!ageRange} onContinue={next}>
        <Options options={AGES} selected={[ageRange]} onPress={(v) => setAgeRange(v)} />
      </Question>
    ),
    5: (
      <Question title="Biological sex" subtitle="Used only for ingredient safety thresholds. Never shared." canContinue={!!biologicalSex} onContinue={next}>
        <Options options={SEXES} selected={[biologicalSex]} onPress={(v) => setBiologicalSex(v)} />
      </Question>
    ),
    6: <Fact {...FACTS[1]} index={2} onContinue={next} />,
    7: (
      <Question title="How do you sleep?" subtitle="This shapes your timing protocol." canContinue={!!sleepQuality} onContinue={next}>
        <Options options={SLEEP} selected={[sleepQuality]} onPress={(v) => setSleepQuality(v)} />
      </Question>
    ),
    8: (
      <Question title="How active are you?" subtitle="Affects protein, electrolyte and recovery context." canContinue={!!activityLevel} onContinue={next}>
        <Options options={ACTIVITY} selected={[activityLevel]} onPress={(v) => setActivityLevel(v)} />
      </Question>
    ),
    9: (
      <Question title="Anything we should know?" subtitle="These unlock our most careful safety checks. Stored on this device." canContinue onContinue={next} cta={flags.length ? 'Continue' : 'Skip'}>
        <Options multi options={CONTEXT} selected={flags} onPress={toggleFlag} />
      </Question>
    ),
    10: <Fact {...FACTS[2]} index={3} onContinue={next} />,
    11: (
      <Summary
        name={name}
        tags={[
          ...focusAreas.map((k) => GOALS.find((g) => g.value === k)?.label ?? k),
          AGES.find((a) => a.value === ageRange)?.label,
          SLEEP.find((s) => s.value === sleepQuality)?.label && `${SLEEP.find((s) => s.value === sleepQuality)!.label} sleep`,
          ACTIVITY.find((a) => a.value === activityLevel)?.label,
        ].filter(Boolean) as string[]}
        onCreate={createAccount}
        onGuest={guest}
      />
    ),
  };

  const night = step === 2 || step === 6 || step === 10;

  return (
    <View style={{ flex: 1, backgroundColor: night ? Palette.night : Palette.canvas }}>
      <StatusBar style={night ? 'light' : 'dark'} />
      <TopBar step={step} night={night} onBack={back} />
      <Animated.View
        key={step}
        entering={SlideInRight.duration(380).easing(Easing.bezier(0.16, 1, 0.3, 1))}
        style={{ flex: 1 }}
      >
        {screens[step]}
      </Animated.View>
    </View>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function TopBar({ step, night, onBack }: { step: number; night: boolean; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const fill = useAnimatedStyle(() => ({ width: withTiming(`${(step / (TOTAL - 1)) * 100}%`, { duration: 400 }) }), [step]);
  return (
    <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <IconButton icon={ChevronLeft} label="Back" variant={night ? 'night' : 'surface'} iconSize={22} onPress={onBack} />
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: night ? Palette.nightHairline : Palette.hairline, overflow: 'hidden' }}>
        <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: night ? Palette.nightInk : Palette.accent }, fill]} />
      </View>
      <View style={{ width: 40 }} />
    </View>
  );
}

function Question({ title, subtitle, children, canContinue, onContinue, cta = 'Continue', keyboard }: {
  title: string; subtitle?: string; children: ReactNode; canContinue: boolean; onContinue: () => void; cta?: string; keyboard?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 28, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Txt variant="largeTitle">{title}</Txt>
        {subtitle ? <Txt variant="callout" tone="secondary" style={{ marginTop: 10 }}>{subtitle}</Txt> : null}
        <View style={{ marginTop: 28 }}>{children}</View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 16) + 4, paddingTop: 8 }}>
        <Button label={cta} disabled={!canContinue} onPress={onContinue} />
      </View>
    </>
  );
  return keyboard
    ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{body}</KeyboardAvoidingView>
    : <View style={{ flex: 1 }}>{body}</View>;
}

function Options<V extends string>({ options, selected, onPress, multi, grid }: {
  options: Opt<V>[]; selected: string[]; onPress: (v: V) => void; multi?: boolean; grid?: boolean;
}) {
  return (
    <View style={grid ? { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } : { gap: 10 }}>
      {options.map((o, i) => {
        const active = selected.includes(o.value);
        return (
          <Animated.View key={o.value} entering={FadeInDown.duration(400).delay(60 + i * 40)} style={grid ? { width: '48.4%' } : undefined}>
            <PressableScale
              haptic="selection"
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: active }}
              accessibilityLabel={o.label}
              onPress={() => onPress(o.value)}
              style={[styles.option, grid && styles.optionGrid, active && styles.optionActive]}
            >
              {o.Icon ? (
                <View style={[styles.optIcon, active && { backgroundColor: 'rgba(247,245,239,0.16)' }]}>
                  <o.Icon size={20} color={active ? Palette.onAccent : Palette.accent} strokeWidth={1.8} />
                </View>
              ) : null}
              <View style={grid ? { marginTop: 14 } : { flex: 1 }}>
                <Txt variant="headline" color={active ? Palette.onAccent : Palette.ink}>{o.label}</Txt>
                {o.hint ? <Txt variant="footnote" color={active ? 'rgba(247,245,239,0.72)' : Palette.ink2} style={{ marginTop: 2 }}>{o.hint}</Txt> : null}
              </View>
              {!grid ? (
                <View style={[styles.check, multi ? { borderRadius: 7 } : null, active && styles.checkActive]}>
                  {active ? <Check size={14} color={Palette.accent} strokeWidth={3} /> : null}
                </View>
              ) : null}
            </PressableScale>
          </Animated.View>
        );
      })}
    </View>
  );
}

function Fact({ headline, body, source, index, onContinue }: { headline: string; body: string; source: string; index: number; onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, padding: 20, paddingBottom: Math.max(insets.bottom, 16) + 4 }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Animated.View entering={FadeIn.duration(600).delay(150)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color={Palette.gold} strokeWidth={2} />
          <Txt variant="overline" tone="gold">Did you know · {index} of 3</Txt>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(700).delay(250)}>
          <Txt variant="display" tone="inverse" style={{ marginTop: 18 }}>{headline}</Txt>
          <Txt variant="callout" tone="inverse2" style={{ marginTop: 18 }}>{body}</Txt>
          <Txt variant="caption" tone="inverse3" style={{ marginTop: 18 }}>{source}</Txt>
        </Animated.View>
      </View>
      <Button label="Continue" variant="night" onPress={onContinue} />
    </View>
  );
}

function Welcome({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: Palette.canvas }}>
      <StatusBar style="dark" />
      <Image source={Imagery.welcome} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="right center" />
      <LinearGradient colors={['rgba(243,240,233,0)', 'rgba(243,240,233,0.6)', Palette.canvas]} locations={[0.25, 0.55, 0.72]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, justifyContent: 'flex-end', padding: 20, paddingBottom: Math.max(insets.bottom, 16) + 4 }}>
        <Animated.View entering={FadeInDown.duration(800).delay(150)}>
          <Txt variant="overline" tone="accent">Elory</Txt>
          <Txt variant="hero" style={{ marginTop: 10 }}>Evidence{'\n'}over opinion.</Txt>
          <Txt variant="callout" tone="secondary" style={{ marginTop: 14, maxWidth: 320 }}>
            Scan anything you eat, take or put on your skin. See what the research actually says about every ingredient.
          </Txt>
        </Animated.View>
        <Animated.View entering={FadeIn.duration(600).delay(500)} style={{ gap: 10, marginTop: 32 }}>
          <Button label="Get started" onPress={onStart} />
          <Button label="I already have an account" variant="tertiary" onPress={onSignIn} />
        </Animated.View>
      </View>
    </View>
  );
}

function Summary({ name, tags, onCreate, onGuest }: { name: string; tags: string[]; onCreate: () => void; onGuest: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, padding: 20, paddingBottom: Math.max(insets.bottom, 16) + 4 }}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Animated.View entering={FadeInDown.duration(600)} style={styles.summaryCard}>
          <View style={styles.summaryMark}><Check size={26} color={Palette.onAccent} strokeWidth={2.6} /></View>
          <Txt variant="overline" tone="accent" style={{ marginTop: 20 }}>Profile ready</Txt>
          <Txt variant="largeTitle" style={{ marginTop: 8 }}>{name.trim() ? `Welcome, ${name.trim()}.` : 'You’re all set.'}</Txt>
          <Txt variant="callout" tone="secondary" style={{ marginTop: 10 }}>Every product you scan will now be analysed for you.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
            {tags.map((t) => <View key={t} style={styles.tag}><Txt variant="footnoteStrong" tone="accent">{t}</Txt></View>)}
          </View>
        </Animated.View>
      </View>
      <Txt variant="footnote" tone="secondary" align="center" style={{ marginBottom: 12 }}>Save your profile to sync it and use Ask Elory.</Txt>
      <Button label="Create account" onPress={onCreate} />
      <Button label="Continue as guest" variant="tertiary" onPress={onGuest} style={{ marginTop: 6 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  nameInput: { fontFamily: Fonts.serif, fontSize: 40, lineHeight: 48, color: Palette.ink, borderBottomWidth: 1.5, borderBottomColor: Palette.accent, paddingVertical: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingHorizontal: 16, paddingVertical: 14, borderRadius: Radius.lg, borderCurve: 'continuous', backgroundColor: Palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.hairline },
  optionGrid: { flexDirection: 'column', alignItems: 'flex-start', minHeight: 132, gap: 0 },
  optionActive: { backgroundColor: Palette.accent, borderColor: Palette.accent },
  optIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: Palette.ink4, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: Palette.onAccent, borderColor: Palette.onAccent },
  summaryCard: { backgroundColor: Palette.surface, borderRadius: Radius.xxl, borderCurve: 'continuous', padding: 24 },
  summaryMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  tag: { paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: Palette.accentSoft },
});
