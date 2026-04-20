import React, { useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius, scale, FontSizes } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import type { OnboardingProfile } from '@/services/api';

// ─── Shared button styles ─────────────────────────────────────────────────────

const s = StyleSheet.create({
  pillBtn: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  pillBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 2.0,
    color: Colors.surface,
  },
  pillBtnDisabled: {
    opacity: 0.35,
  },
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
});

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 2,
            borderRadius: 1,
            backgroundColor: i <= step ? Colors.ink : Colors.borderHairline,
          }}
        />
      ))}
    </View>
  );
}

// ─── Option pill (single/multi select) ───────────────────────────────────────

function OptionPill({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: selected ? Colors.ink : Colors.surfaceCard,
        borderWidth: 1,
        borderColor: selected ? Colors.ink : Colors.borderHairline,
        borderRadius: Radius.md,
        paddingVertical: 14,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: Fonts.sansSemiBold,
            fontSize: FontSizes.body,
            color: selected ? Colors.accentInk : Colors.ink,
          }}
        >
          {label}
        </Text>
        {hint ? (
          <Text
            style={{
              fontFamily: Fonts.sans,
              fontSize: FontSizes.caption,
              color: selected ? 'rgba(241,237,228,0.6)' : Colors.inkSecondary,
              marginTop: 2,
            }}
          >
            {hint}
          </Text>
        ) : null}
      </View>
      {selected && (
        <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 14, color: Colors.accentInk }}>
          ✓
        </Text>
      )}
    </Pressable>
  );
}

// ─── AhaCard ─────────────────────────────────────────────────────────────────

function AhaCard({
  image,
  headline,
  body,
  source,
  cta,
  onNext,
}: {
  image: any;
  headline: string;
  body: string;
  source: string;
  cta: string;
  onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
    >
      {image ? (
        <Image source={image} style={{ width: '100%', height: scale(280) }} resizeMode="cover" />
      ) : (
        <View style={{ width: '100%', height: scale(280), backgroundColor: Colors.surfaceCard }} />
      )}
      <View style={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: 60 }}>
        <Text
          style={{
            fontFamily: Fonts.sansSemiBold,
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: 2,
            color: Colors.inkSecondary,
            marginBottom: 14,
          }}
        >
          ◆ Evidence Brief
        </Text>
        <Text
          style={{
            fontFamily: Fonts.serifItalic,
            fontSize: scale(28),
            lineHeight: scale(34),
            color: Colors.ink,
            marginBottom: 20,
          }}
        >
          {headline}
        </Text>
        <Text
          style={{
            fontFamily: Fonts.sans,
            fontSize: FontSizes.body,
            color: Colors.inkSecondary,
            lineHeight: FontSizes.body * 1.6,
            marginBottom: 16,
          }}
        >
          {body}
        </Text>
        <Text
          style={{
            fontFamily: Fonts.sans,
            fontSize: FontSizes.caption,
            color: Colors.inkTertiary,
            lineHeight: FontSizes.caption * 1.5,
            marginBottom: 36,
          }}
        >
          {source}
        </Text>
        <Pressable style={s.pillBtn} onPress={onNext}>
          <Text style={s.pillBtnText}>{cta}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: '100%', height: scale(320), backgroundColor: Colors.surfaceCard }} />
      <View style={{ paddingHorizontal: 24, paddingTop: 28 }}>
        <Text
          style={{
            fontFamily: Fonts.serifItalic,
            fontSize: scale(34),
            lineHeight: scale(40),
            color: Colors.ink,
            marginBottom: 16,
          }}
        >
          {'A knowledgeable\nfriend, in your\npocket.'}
        </Text>
        <Text
          style={{
            fontFamily: Fonts.sans,
            fontSize: FontSizes.bodyLarge,
            color: Colors.inkSecondary,
            lineHeight: FontSizes.bodyLarge * 1.6,
            marginBottom: 28,
          }}
        >
          Elory reads ingredient lists the way a trained biochemist would — and tells you what actually matters for your body.
        </Text>
        <View
          style={{
            backgroundColor: Colors.surfaceCard,
            borderWidth: 1,
            borderColor: Colors.borderHairline,
            borderRadius: Radius.lg,
            padding: 20,
            marginBottom: 36,
          }}
        >
          <Text
            style={{
              fontFamily: Fonts.sansSemiBold,
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: 1.6,
              color: Colors.inkSecondary,
              marginBottom: 14,
            }}
          >
            What Elory is not
          </Text>
          {[
            'A replacement for your doctor or pharmacist.',
            'A fear-driven list of "toxins" to avoid.',
            'A marketing tool for any brand or product.',
          ].map((item, i) => (
            <Text
              key={i}
              style={{
                fontFamily: Fonts.serifItalic,
                fontSize: FontSizes.body,
                color: Colors.inkSecondary,
                lineHeight: FontSizes.body * 1.55,
                marginBottom: i < 2 ? 8 : 0,
              }}
            >
              {'— '}{item}
            </Text>
          ))}
        </View>
        <Pressable style={s.pillBtn} onPress={onNext}>
          <Text style={s.pillBtnText}>Begin</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── Step 2: Noise Problem ────────────────────────────────────────────────────

function StepNoiseProblem({ onNext }: { onNext: () => void }) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: '100%', height: scale(280), backgroundColor: Colors.surfaceCard }} />
      <View style={{ paddingHorizontal: 24, paddingTop: 28 }}>
        <Text
          style={{
            fontFamily: Fonts.serifItalic,
            fontSize: scale(32),
            lineHeight: scale(38),
            color: Colors.ink,
            marginBottom: 20,
          }}
        >
          {'Most wellness apps\nsell you certainty.'}
        </Text>
        <Text
          style={{
            fontFamily: Fonts.sans,
            fontSize: FontSizes.bodyLarge,
            color: Colors.inkSecondary,
            lineHeight: FontSizes.bodyLarge * 1.6,
            marginBottom: 36,
          }}
        >
          Elory sells you evidence. Every insight is sourced from peer-reviewed studies. We show you what the science actually says — not what a brand wants you to believe.
        </Text>
        <Pressable style={s.pillBtn} onPress={onNext}>
          <Text style={s.pillBtnText}>Continue →</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ─── Goal options ────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { key: 'gut',   title: 'Gut health',  sub: 'Microbiome, digestion, bloating' },
  { key: 'sleep', title: 'Sleep',       sub: 'Circadian rhythm & recovery' },
  { key: 'long',  title: 'Longevity',   sub: 'Cellular resilience, oxidative load' },
  { key: 'skin',  title: 'Dermal care', sub: 'Barrier, hydration, sun response' },
  { key: 'meta',  title: 'Metabolic',   sub: 'Glucose, insulin, energy' },
  { key: 'mind',  title: 'Cognitive',   sub: 'Focus, mood, stress response' },
];

// ─── Step 3: Focus / Goals ────────────────────────────────────────────────────

function StepFocus({
  selected,
  onToggle,
  onNext,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(32),
          lineHeight: scale(38),
          color: Colors.ink,
          marginBottom: 8,
        }}
      >
        What matters{'\n'}to you?
      </Text>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.body,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.body * 1.5,
          marginBottom: 24,
        }}
      >
        Select all that apply. Your analysis will be tuned to these domains.
      </Text>
      <View style={{ gap: 10, marginBottom: 32 }}>
        {GOAL_OPTIONS.map((opt) => (
          <OptionPill
            key={opt.key}
            label={opt.title}
            hint={opt.sub}
            selected={selected.includes(opt.key)}
            onPress={() => onToggle(opt.key)}
          />
        ))}
      </View>
      <Pressable
        style={[s.pillBtn, selected.length === 0 && s.pillBtnDisabled]}
        onPress={onNext}
        disabled={selected.length === 0}
      >
        <Text style={s.pillBtnText}>
          {selected.length === 0 ? 'Select at least one' : `Continue · ${selected.length} selected`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Step 4: AHA #1 — Dose Myth ───────────────────────────────────────────────

function StepAha1({ onNext }: { onNext: () => void }) {
  return (
    <AhaCard
      image={null}
      headline="Most supplements contain 5× the dose your body can actually absorb."
      body="Vitamin C absorption drops sharply above 200mg — yet most supplements contain 500–1000mg. The excess is excreted within hours. Dose timing and form matter more than the number on the label."
      source="Levine et al., NEJM 1996 · Padayatty et al., Annals of Internal Medicine 2004"
      cta="Interesting →"
      onNext={onNext}
    />
  );
}

// ─── Step 5: Name ─────────────────────────────────────────────────────────────

function StepName({
  value,
  onChange,
  onNext,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(32),
          lineHeight: scale(38),
          color: Colors.ink,
          marginBottom: 8,
        }}
      >
        What should{'\n'}we call you?
      </Text>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.body,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.body * 1.5,
          marginBottom: 28,
        }}
      >
        Used to personalise your experience.
      </Text>
      <TextInput
        style={{
          backgroundColor: Colors.surfaceCard,
          borderWidth: 1,
          borderColor: Colors.borderHairline,
          borderRadius: Radius.md,
          paddingHorizontal: 18,
          paddingVertical: 16,
          fontFamily: Fonts.sans,
          fontSize: FontSizes.subtitle,
          color: Colors.ink,
          marginBottom: 32,
        }}
        placeholder="Your first name"
        placeholderTextColor={Colors.inkTertiary}
        value={value}
        onChangeText={onChange}
        autoCapitalize="words"
        autoFocus
        returnKeyType="next"
        onSubmitEditing={() => value.trim() && onNext()}
      />
      <Pressable
        style={[s.pillBtn, !value.trim() && s.pillBtnDisabled]}
        onPress={onNext}
        disabled={!value.trim()}
      >
        <Text style={s.pillBtnText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Step 6: Age Range ────────────────────────────────────────────────────────

const AGE_OPTIONS: { value: OnboardingProfile['ageRange']; label: string; hint: string }[] = [
  { value: 'under_25', label: 'Under 25',  hint: 'Higher absorption rates, lower dosing thresholds' },
  { value: '25_34',    label: '25 – 34',   hint: 'Peak metabolic window' },
  { value: '35_44',    label: '35 – 44',   hint: 'Hormonal shifts begin affecting nutrient needs' },
  { value: '45_54',    label: '45 – 54',   hint: 'Recovery and cellular resilience focus' },
  { value: '55_plus',  label: '55 +',      hint: 'Absorption efficiency and micronutrient gaps' },
];

function StepAgeRange({
  value,
  onSelect,
  onNext,
}: {
  value: OnboardingProfile['ageRange'];
  onSelect: (v: OnboardingProfile['ageRange']) => void;
  onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(32),
          lineHeight: scale(38),
          color: Colors.ink,
          marginBottom: 8,
        }}
      >
        How old are you?
      </Text>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.body,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.body * 1.5,
          marginBottom: 24,
        }}
      >
        Age affects absorption rates and recommended dose ranges.
      </Text>
      <View style={{ gap: 10, marginBottom: 32 }}>
        {AGE_OPTIONS.map((opt) => (
          <OptionPill
            key={opt.value}
            label={opt.label}
            hint={opt.hint}
            selected={value === opt.value}
            onPress={() => onSelect(opt.value)}
          />
        ))}
      </View>
      <Pressable
        style={[s.pillBtn, !value && s.pillBtnDisabled]}
        onPress={onNext}
        disabled={!value}
      >
        <Text style={s.pillBtnText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Step 7: Biological Sex ───────────────────────────────────────────────────

const SEX_OPTIONS: { value: OnboardingProfile['biologicalSex']; label: string; hint: string }[] = [
  { value: 'male',          label: 'Male',              hint: 'Testosterone-related thresholds applied' },
  { value: 'female',        label: 'Female',            hint: 'Oestrogen and iron context applied' },
  { value: 'not_specified', label: 'Prefer not to say', hint: 'General population defaults used' },
];

function StepBiologicalSex({
  value,
  onSelect,
  onNext,
}: {
  value: OnboardingProfile['biologicalSex'] | '';
  onSelect: (v: OnboardingProfile['biologicalSex']) => void;
  onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(32),
          lineHeight: scale(38),
          color: Colors.ink,
          marginBottom: 8,
        }}
      >
        Biological sex
      </Text>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.body,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.body * 1.5,
          marginBottom: 24,
        }}
      >
        Affects hormone-related ingredient flags and safety thresholds.
      </Text>
      <View style={{ gap: 10, marginBottom: 20 }}>
        {SEX_OPTIONS.map((opt) => (
          <OptionPill
            key={opt.value}
            label={opt.label}
            hint={opt.hint}
            selected={value === opt.value}
            onPress={() => onSelect(opt.value)}
          />
        ))}
      </View>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.caption,
          color: Colors.inkTertiary,
          textAlign: 'center',
          marginBottom: 24,
        }}
      >
        Never shared. Used only for ingredient safety context.
      </Text>
      <Pressable
        style={[s.pillBtn, !value && s.pillBtnDisabled]}
        onPress={onNext}
        disabled={!value}
      >
        <Text style={s.pillBtnText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Step 8: AHA #2 — Omega-3 Myth ───────────────────────────────────────────

function StepAha2({ onNext }: { onNext: () => void }) {
  return (
    <AhaCard
      image={null}
      headline="Omega-3 taken without fat shows 300% lower absorption."
      body="EPA and DHA are fat-soluble. Taken on an empty stomach, bioavailability drops dramatically. The dose on the label assumes you took it with a fatty meal — most people don't."
      source="Lawson & Hughes, JLRM 1988 · Schuchardt & Hahn, Nutrients 2013"
      cta="Got it →"
      onNext={onNext}
    />
  );
}

// ─── Step 9: Sleep Quality ────────────────────────────────────────────────────

const SLEEP_OPTIONS: { value: OnboardingProfile['sleepQuality']; label: string; hint: string }[] = [
  { value: 'excellent', label: 'Excellent', hint: 'Fall asleep easily, wake refreshed' },
  { value: 'good',      label: 'Good',      hint: 'Generally rested, occasional disruptions' },
  { value: 'fair',      label: 'Fair',      hint: 'Tired most mornings, irregular rhythm' },
  { value: 'poor',      label: 'Poor',      hint: 'Chronic difficulty sleeping or staying asleep' },
];

function StepSleepQuality({
  value,
  onSelect,
  onNext,
}: {
  value: OnboardingProfile['sleepQuality'];
  onSelect: (v: OnboardingProfile['sleepQuality']) => void;
  onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(32),
          lineHeight: scale(38),
          color: Colors.ink,
          marginBottom: 8,
        }}
      >
        How would you{'\n'}rate your sleep?
      </Text>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.body,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.body * 1.5,
          marginBottom: 24,
        }}
      >
        This unlocks your personalised Circadian Protocol — a time-ordered supplement schedule.
      </Text>
      <View style={{ gap: 10, marginBottom: 32 }}>
        {SLEEP_OPTIONS.map((opt) => (
          <OptionPill
            key={opt.value}
            label={opt.label}
            hint={opt.hint}
            selected={value === opt.value}
            onPress={() => onSelect(opt.value)}
          />
        ))}
      </View>
      <Pressable
        style={[s.pillBtn, !value && s.pillBtnDisabled]}
        onPress={onNext}
        disabled={!value}
      >
        <Text style={s.pillBtnText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Step 10: Activity Level ──────────────────────────────────────────────────

const ACTIVITY_OPTIONS: { value: OnboardingProfile['activityLevel']; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Desk job, little to no exercise' },
  { value: 'light',     label: 'Light',     hint: '1–2 days/week of light activity' },
  { value: 'moderate',  label: 'Moderate',  hint: '3–4 days/week, moderate intensity' },
  { value: 'active',    label: 'Active',    hint: '5+ days/week, consistent training' },
  { value: 'athlete',   label: 'Athlete',   hint: 'Daily training, competitive sport' },
];

function StepActivityLevel({
  value,
  onSelect,
  onNext,
}: {
  value: OnboardingProfile['activityLevel'];
  onSelect: (v: OnboardingProfile['activityLevel']) => void;
  onNext: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(32),
          lineHeight: scale(38),
          color: Colors.ink,
          marginBottom: 8,
        }}
      >
        How active{'\n'}are you?
      </Text>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.body,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.body * 1.5,
          marginBottom: 24,
        }}
      >
        Affects protein, electrolyte, and recovery-related ingredient context.
      </Text>
      <View style={{ gap: 10, marginBottom: 32 }}>
        {ACTIVITY_OPTIONS.map((opt) => (
          <OptionPill
            key={opt.value}
            label={opt.label}
            hint={opt.hint}
            selected={value === opt.value}
            onPress={() => onSelect(opt.value)}
          />
        ))}
      </View>
      <Pressable
        style={[s.pillBtn, !value && s.pillBtnDisabled]}
        onPress={onNext}
        disabled={!value}
      >
        <Text style={s.pillBtnText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Onboarding Screen ────────────────────────────────────────────────────────

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

  const next = () => setStep((s) => s + 1);

  const toggleFocus = (key: string) => {
    setFocusAreas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <SafeAreaView style={s.screen}>
      <ProgressBar step={step} total={13} />
      {step === 0 && <StepWelcome onNext={next} />}
      {step === 1 && <StepNoiseProblem onNext={next} />}
      {step === 2 && <StepFocus selected={focusAreas} onToggle={toggleFocus} onNext={next} />}
      {step === 3 && <StepAha1 onNext={next} />}
      {step === 4 && <StepName value={name} onChange={setName} onNext={next} />}
      {step === 5 && <StepAgeRange value={ageRange} onSelect={setAgeRange} onNext={next} />}
      {step === 6 && <StepBiologicalSex value={biologicalSex} onSelect={setBiologicalSex} onNext={next} />}
      {step === 7 && <StepAha2 onNext={next} />}
      {step === 8 && <StepSleepQuality value={sleepQuality} onSelect={setSleepQuality} onNext={next} />}
      {step === 9 && <StepActivityLevel value={activityLevel} onSelect={setActivityLevel} onNext={next} />}
      {step >= 10 && <Text style={{ padding: 24 }}>Steps 11–13 coming soon</Text>}
    </SafeAreaView>
  );
}
