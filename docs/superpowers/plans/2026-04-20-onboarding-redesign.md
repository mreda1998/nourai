# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-step onboarding with a 13-step value-first flow that builds a full `OnboardingProfile`, delivers three ingredient myth-buster cards as rewards, and funnels users into auth at the end.

**Architecture:** All 13 step components live in `app/onboarding.tsx` as local functions driven by a single `step: number` state. Collected data is held in local state and passed to `completeOnboarding(profile)` at step 13. The backend model already has every required field — no migration needed. `app/auth.tsx` reads a `?name=` URL param to pre-fill the name field when pushed from step 13.

**Tech Stack:** React Native, Expo Router (`useLocalSearchParams`), existing design system (`Colors`, `Fonts`, `Radius`, `scale`, `FontSizes` from `@/constants/theme`), `OnboardingProfile` from `@/services/api`, `useAuth` from `@/context/auth-context`.

---

## File Structure

| File | Change |
|------|--------|
| `nourai/app/onboarding.tsx` | Full rewrite — 13 step components + main screen |
| `nourai/app/auth.tsx` | Add `useLocalSearchParams` to pre-fill name |
| `nourai/assets/onboarding/welcome.png` | User provides (Midjourney) |
| `nourai/assets/onboarding/noise.png` | User provides (Midjourney) |
| `nourai/assets/onboarding/vitamin_c.png` | User provides (Midjourney) |
| `nourai/assets/onboarding/fish_oil.png` | User provides (Midjourney) |
| `nourai/assets/onboarding/probiotic.png` | User provides (Midjourney) |

---

### Task 1: Pre-fill name in auth.tsx

**Files:**
- Modify: `nourai/app/auth.tsx`

- [ ] **Step 1: Add `useLocalSearchParams` import and read `name` param**

Open `nourai/app/auth.tsx`. Replace the existing imports and name state initialisation:

```tsx
// Add to existing expo-router import:
import { useRouter, useLocalSearchParams } from 'expo-router';

// Inside AuthScreen(), replace:
//   const [name, setName] = useState('');
// with:
const { name: prefillName } = useLocalSearchParams<{ name?: string }>();
const [name, setName] = useState(prefillName ?? '');
```

- [ ] **Step 2: Verify — open auth screen directly with `?name=Redar`**

In the simulator, navigate to `/auth?name=Redar`. The Name field should show "Redar" pre-filled.

- [ ] **Step 3: Commit**

```bash
git add nourai/app/auth.tsx
git commit -m "feat: pre-fill name in auth from onboarding URL param"
```

---

### Task 2: Shared onboarding primitives

**Files:**
- Modify: `nourai/app/onboarding.tsx` (add shared components at the top, replacing the old file)

These small components are used by multiple steps. Define them once at the top of `onboarding.tsx` and reference them throughout.

- [ ] **Step 1: Replace the top of `onboarding.tsx` with the new imports + shared components**

```tsx
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
import { Colors, Fonts, Radius, scale, FontSizes, Spacing } from '@/constants/theme';
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
      <Image
        source={image}
        style={{ width: '100%', height: scale(280) }}
        resizeMode="cover"
      />
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
```

- [ ] **Step 2: Run the app — confirm it still compiles (no steps wired yet, just primitives)**

```bash
cd nourai && npx expo start
```

Expected: no TypeScript errors, app loads on simulator.

- [ ] **Step 3: Commit**

```bash
git add nourai/app/onboarding.tsx
git commit -m "feat: onboarding — shared primitives (ProgressBar, OptionPill, AhaCard)"
```

---

### Task 3: Steps 1–2 — Brand (Welcome + Noise Problem)

**Files:**
- Modify: `nourai/app/onboarding.tsx`

- [ ] **Step 1: Add StepWelcome and StepNoiseProblem components**

Append after the shared primitives:

```tsx
// ─── Step 1: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Image
        source={require('../assets/onboarding/welcome.png')}
        style={{ width: '100%', height: scale(320) }}
        resizeMode="cover"
      />
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
      <Image
        source={require('../assets/onboarding/noise.png')}
        style={{ width: '100%', height: scale(280) }}
        resizeMode="cover"
      />
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
```

- [ ] **Step 2: Wire steps 1–2 in OnboardingScreen (temporary)**

Find the existing `OnboardingScreen` component. Replace its return with:

```tsx
export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);

  const next = () => setStep((s) => s + 1);

  return (
    <SafeAreaView style={s.screen}>
      <ProgressBar step={step} total={13} />
      {step === 0 && <StepWelcome onNext={next} />}
      {step === 1 && <StepNoiseProblem onNext={next} />}
      {step >= 2 && <Text style={{ padding: 24 }}>Steps 3–13 coming soon</Text>}
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Verify steps 1–2 render and advance**

Run app, go through onboarding. Step 1 shows Welcome, tapping Begin goes to step 2 Noise Problem, tapping Continue advances. Progress bar fills 2/13.

- [ ] **Step 4: Commit**

```bash
git add nourai/app/onboarding.tsx
git commit -m "feat: onboarding steps 1-2 — Welcome and Noise Problem"
```

---

### Task 4: Steps 3–4 — Goals + AHA #1

**Files:**
- Modify: `nourai/app/onboarding.tsx`

- [ ] **Step 1: Add GOAL_OPTIONS constant and StepFocus component**

```tsx
const GOAL_OPTIONS = [
  { key: 'gut',   title: 'Gut health',  sub: 'Microbiome, digestion, bloating' },
  { key: 'sleep', title: 'Sleep',       sub: 'Circadian rhythm & recovery' },
  { key: 'long',  title: 'Longevity',   sub: 'Cellular resilience, oxidative load' },
  { key: 'skin',  title: 'Dermal care', sub: 'Barrier, hydration, sun response' },
  { key: 'meta',  title: 'Metabolic',   sub: 'Glucose, insulin, energy' },
  { key: 'mind',  title: 'Cognitive',   sub: 'Focus, mood, stress response' },
];

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
      >
        <Text style={s.pillBtnText}>
          {selected.length === 0 ? 'Select at least one' : `Continue · ${selected.length} selected`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Add StepAha1 component**

```tsx
function StepAha1({ onNext }: { onNext: () => void }) {
  return (
    <AhaCard
      image={require('../assets/onboarding/vitamin_c.png')}
      headline="Most supplements contain 5× the dose your body can actually absorb."
      body="Vitamin C absorption drops sharply above 200mg — yet most supplements contain 500–1000mg. The excess is excreted within hours. Dose timing and form matter more than the number on the label."
      source="Levine et al., NEJM 1996 · Padayatty et al., Annals of Internal Medicine 2004"
      cta="Interesting →"
      onNext={onNext}
    />
  );
}
```

- [ ] **Step 3: Add `focusAreas` state to OnboardingScreen and wire steps 3–4**

In the `OnboardingScreen` component add:

```tsx
const [focusAreas, setFocusAreas] = useState<string[]>([]);

const toggleFocus = (key: string) => {
  setFocusAreas((prev) =>
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
  );
};
```

Add to the render:

```tsx
{step === 2 && <StepFocus selected={focusAreas} onToggle={toggleFocus} onNext={next} />}
{step === 3 && <StepAha1 onNext={next} />}
```

- [ ] **Step 4: Verify steps 3–4**

Tap through. Goals page shows 6 options, multi-select works, Continue button shows count. AHA card shows after goals.

- [ ] **Step 5: Commit**

```bash
git add nourai/app/onboarding.tsx
git commit -m "feat: onboarding steps 3-4 — goals and AHA #1 (dose myth)"
```

---

### Task 5: Steps 5–8 — About You + AHA #2

**Files:**
- Modify: `nourai/app/onboarding.tsx`

- [ ] **Step 1: Add StepName component**

```tsx
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
```

- [ ] **Step 2: Add StepAgeRange component**

```tsx
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
```

- [ ] **Step 3: Add StepBiologicalSex component**

```tsx
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
```

- [ ] **Step 4: Add StepAha2 component**

```tsx
function StepAha2({ onNext }: { onNext: () => void }) {
  return (
    <AhaCard
      image={require('../assets/onboarding/fish_oil.png')}
      headline="Omega-3 taken without fat shows 300% lower absorption."
      body="EPA and DHA are fat-soluble. Taken on an empty stomach, bioavailability drops dramatically. The dose on the label assumes you took it with a fatty meal — most people don't."
      source="Lawson & Hughes, JLRM 1988 · Schuchardt & Hahn, Nutrients 2013"
      cta="Got it →"
      onNext={onNext}
    />
  );
}
```

- [ ] **Step 5: Add `name`, `ageRange`, `biologicalSex` state to OnboardingScreen and wire steps 5–8**

Add state:

```tsx
const [name, setName] = useState('');
const [ageRange, setAgeRange] = useState<OnboardingProfile['ageRange']>('');
const [biologicalSex, setBiologicalSex] = useState<OnboardingProfile['biologicalSex'] | ''>('');
```

Add to render:

```tsx
{step === 4 && <StepName value={name} onChange={setName} onNext={next} />}
{step === 5 && <StepAgeRange value={ageRange} onSelect={setAgeRange} onNext={next} />}
{step === 6 && <StepBiologicalSex value={biologicalSex} onSelect={setBiologicalSex} onNext={next} />}
{step === 7 && <StepAha2 onNext={next} />}
```

- [ ] **Step 6: Verify steps 5–8**

Tap through: name input, age selector, sex selector, AHA fish oil card. Each advances correctly.

- [ ] **Step 7: Commit**

```bash
git add nourai/app/onboarding.tsx
git commit -m "feat: onboarding steps 5-8 — name, age, sex, AHA #2 (omega-3 myth)"
```

---

### Task 6: Steps 9–10 — Lifestyle

**Files:**
- Modify: `nourai/app/onboarding.tsx`

- [ ] **Step 1: Add StepSleepQuality component**

```tsx
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
```

- [ ] **Step 2: Add StepActivityLevel component**

```tsx
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
```

- [ ] **Step 3: Add `sleepQuality`, `activityLevel` state and wire steps 9–10**

Add state:

```tsx
const [sleepQuality, setSleepQuality] = useState<OnboardingProfile['sleepQuality']>('');
const [activityLevel, setActivityLevel] = useState<OnboardingProfile['activityLevel']>('');
```

Add to render:

```tsx
{step === 8 && <StepSleepQuality value={sleepQuality} onSelect={setSleepQuality} onNext={next} />}
{step === 9 && <StepActivityLevel value={activityLevel} onSelect={setActivityLevel} onNext={next} />}
```

- [ ] **Step 4: Verify steps 9–10**

Sleep quality and activity level pickers render, single-select works, Continue advances.

- [ ] **Step 5: Commit**

```bash
git add nourai/app/onboarding.tsx
git commit -m "feat: onboarding steps 9-10 — sleep quality and activity level"
```

---

### Task 7: Steps 11–12 — Health Context + AHA #3

**Files:**
- Modify: `nourai/app/onboarding.tsx`

- [ ] **Step 1: Add PROFILE_OPTIONS and StepHealthContext component**

```tsx
const PROFILE_OPTIONS = [
  { key: 'preg',  title: 'Pregnant' },
  { key: 'nurs',  title: 'Breastfeeding / nursing' },
  { key: 'veg',   title: 'Plant-based diet' },
  { key: 'sens',  title: 'Sensitive skin' },
  { key: 'rx',    title: 'On prescription medication' },
  { key: 'none',  title: 'None of the above' },
];

function StepHealthContext({
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
        Anything we{'\n'}should know?
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
        These flags unlock the highest-sensitivity ingredient filters.
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: Colors.borderHairline,
          borderRadius: Radius.md,
          overflow: 'hidden',
          marginBottom: 20,
        }}
      >
        {PROFILE_OPTIONS.map((opt, i) => {
          const active = selected.includes(opt.key);
          return (
            <Pressable
              key={opt.key}
              onPress={() => onToggle(opt.key)}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  backgroundColor: Colors.surfaceCard,
                  gap: 14,
                },
                i > 0 && { borderTopWidth: 1, borderTopColor: Colors.borderHairline },
              ]}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  backgroundColor: active ? Colors.ink : 'transparent',
                  borderWidth: 1,
                  borderColor: active ? Colors.ink : Colors.borderHairline,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {active && (
                  <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 12, color: Colors.surface }}>
                    ✓
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontFamily: Fonts.sans,
                  fontSize: FontSizes.body,
                  color: Colors.ink,
                  flex: 1,
                }}
              >
                {opt.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.caption,
          color: Colors.inkTertiary,
          textAlign: 'center',
          lineHeight: FontSizes.caption * 1.5,
          marginBottom: 24,
        }}
      >
        Context flags are stored only on this device. Never shared or used for advertising.
      </Text>
      <Pressable style={s.pillBtn} onPress={onNext}>
        <Text style={s.pillBtnText}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Add StepAha3 component**

```tsx
function StepAha3({ onNext }: { onNext: () => void }) {
  return (
    <AhaCard
      image={require('../assets/onboarding/probiotic.png')}
      headline="Most probiotics don't survive your stomach acid."
      body="The CFU count on the label is measured at manufacturing — not at consumption. Without enteric coating, the majority of bacteria are destroyed before reaching the gut. Strain selection and packaging matter far more than the headline number."
      source="Govinden et al., Beneficial Microbes 2014 · Corcoran et al., Applied Microbiology 2008"
      cta="One last step →"
      onNext={onNext}
    />
  );
}
```

- [ ] **Step 3: Add `profileFlags` state and wire steps 11–12**

Add state:

```tsx
const [profileFlags, setProfileFlags] = useState<string[]>([]);

const toggleFlag = (key: string) => {
  setProfileFlags((prev) =>
    prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
  );
};
```

Add to render:

```tsx
{step === 10 && <StepHealthContext selected={profileFlags} onToggle={toggleFlag} onNext={next} />}
{step === 11 && <StepAha3 onNext={next} />}
```

- [ ] **Step 4: Verify steps 11–12**

Health context checkboxes work, none-of-the-above is selectable, AHA probiotic card renders and advances.

- [ ] **Step 5: Commit**

```bash
git add nourai/app/onboarding.tsx
git commit -m "feat: onboarding steps 11-12 — health context and AHA #3 (probiotic myth)"
```

---

### Task 8: Step 13 — Profile Summary + Convert

**Files:**
- Modify: `nourai/app/onboarding.tsx`

- [ ] **Step 1: Add StepProfileSummary component**

```tsx
function StepProfileSummary({
  name,
  focusAreas,
  ageRange,
  sleepQuality,
  activityLevel,
  profileFlags,
  onCreateAccount,
  onContinueAsGuest,
}: {
  name: string;
  focusAreas: string[];
  ageRange: OnboardingProfile['ageRange'];
  sleepQuality: OnboardingProfile['sleepQuality'];
  activityLevel: OnboardingProfile['activityLevel'];
  profileFlags: string[];
  onCreateAccount: () => void;
  onContinueAsGuest: () => void;
}) {
  const ageLabel: Record<string, string> = {
    under_25: 'Under 25', '25_34': '25–34', '35_44': '35–44',
    '45_54': '45–54', '55_plus': '55+',
  };
  const sleepLabel: Record<string, string> = {
    excellent: 'Excellent sleep', good: 'Good sleep',
    fair: 'Fair sleep', poor: 'Poor sleep',
  };
  const activityLabel: Record<string, string> = {
    sedentary: 'Sedentary', light: 'Light activity', moderate: 'Moderate activity',
    active: 'Active', athlete: 'Athlete',
  };
  const goalLabels: Record<string, string> = {
    gut: 'Gut health', sleep: 'Sleep', long: 'Longevity',
    skin: 'Dermal care', meta: 'Metabolic', mind: 'Cognitive',
  };

  const tags = [
    ...focusAreas.map((k) => goalLabels[k] ?? k),
    ageRange ? ageLabel[ageRange] : null,
    sleepQuality ? sleepLabel[sleepQuality] : null,
    activityLevel ? activityLabel[activityLevel] : null,
  ].filter(Boolean) as string[];

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(34),
          lineHeight: scale(40),
          color: Colors.ink,
          marginBottom: 8,
        }}
      >
        {name ? `${name}'s\nElory profile.` : 'Your\nElory profile.'}
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
        Save your profile to sync across devices and unlock your full analysis.
      </Text>

      {/* Profile summary card */}
      <View
        style={{
          backgroundColor: Colors.surfaceCard,
          borderWidth: 1,
          borderColor: Colors.borderHairline,
          borderRadius: Radius.lg,
          padding: 20,
          marginBottom: 32,
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
          Profile built
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tags.map((tag) => (
            <View
              key={tag}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: Colors.borderHairline,
                borderRadius: Radius.pill,
              }}
            >
              <Text
                style={{
                  fontFamily: Fonts.sans,
                  fontSize: FontSizes.caption,
                  color: Colors.ink,
                }}
              >
                {tag}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable style={s.pillBtn} onPress={onCreateAccount}>
        <Text style={s.pillBtnText}>Create Account</Text>
      </Pressable>

      <Pressable
        style={{ paddingVertical: 16, alignItems: 'center', marginTop: 8 }}
        onPress={onContinueAsGuest}
      >
        <Text
          style={{
            fontFamily: Fonts.sans,
            fontSize: FontSizes.body,
            color: Colors.inkSecondary,
          }}
        >
          Continue as Guest
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Verify StepProfileSummary renders — wire it temporarily at step 12**

Add to render temporarily:

```tsx
{step === 12 && (
  <StepProfileSummary
    name={name}
    focusAreas={focusAreas}
    ageRange={ageRange}
    sleepQuality={sleepQuality}
    activityLevel={activityLevel}
    profileFlags={profileFlags}
    onCreateAccount={() => {}}
    onContinueAsGuest={() => {}}
  />
)}
```

Skip through steps to confirm the summary card shows collected tags.

- [ ] **Step 3: Commit**

```bash
git add nourai/app/onboarding.tsx
git commit -m "feat: onboarding step 13 — profile summary and convert screen"
```

---

### Task 9: Wire OnboardingScreen — state, handleFinish, navigation

**Files:**
- Modify: `nourai/app/onboarding.tsx`

- [ ] **Step 1: Replace OnboardingScreen with the complete wired version**

```tsx
export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAuth();

  const [step, setStep] = useState(0);

  // Collected state
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [ageRange, setAgeRange] = useState<OnboardingProfile['ageRange']>('');
  const [biologicalSex, setBiologicalSex] = useState<OnboardingProfile['biologicalSex'] | ''>('');
  const [sleepQuality, setSleepQuality] = useState<OnboardingProfile['sleepQuality']>('');
  const [activityLevel, setActivityLevel] = useState<OnboardingProfile['activityLevel']>('');
  const [profileFlags, setProfileFlags] = useState<string[]>([]);

  const next = () => setStep((s) => s + 1);

  const toggleFocus = (key: string) =>
    setFocusAreas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const toggleFlag = (key: string) =>
    setProfileFlags((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  // Build OnboardingProfile from collected state
  const buildProfile = (): OnboardingProfile => {
    const isPregnant = profileFlags.includes('preg');
    const isBreastfeeding = profileFlags.includes('nurs');
    const dietaryPattern = profileFlags.includes('veg') ? ['plant_based'] : [];
    const healthConcerns: string[] = [];
    if (profileFlags.includes('sens')) healthConcerns.push('sensitive_skin');
    if (profileFlags.includes('rx')) healthConcerns.push('on_rx_meds');

    return {
      biologicalSex: (biologicalSex as OnboardingProfile['biologicalSex']) || 'not_specified',
      ageRange,
      isPregnant,
      isBreastfeeding,
      sleepQuality,
      activityLevel,
      dietaryPattern,
      environment: '',
      productCategories: [],
      focusAreas,
      healthConcerns,
      goals: [],
    };
  };

  const handleCreateAccount = async () => {
    const profile = buildProfile();
    await completeOnboarding(profile);
    router.push(`/auth?name=${encodeURIComponent(name.trim())}`);
  };

  const handleContinueAsGuest = async () => {
    const profile = buildProfile();
    await completeOnboarding(profile);
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={s.screen}>
      <ProgressBar step={step} total={13} />

      {step === 0  && <StepWelcome onNext={next} />}
      {step === 1  && <StepNoiseProblem onNext={next} />}
      {step === 2  && <StepFocus selected={focusAreas} onToggle={toggleFocus} onNext={next} />}
      {step === 3  && <StepAha1 onNext={next} />}
      {step === 4  && <StepName value={name} onChange={setName} onNext={next} />}
      {step === 5  && <StepAgeRange value={ageRange} onSelect={setAgeRange} onNext={next} />}
      {step === 6  && <StepBiologicalSex value={biologicalSex} onSelect={setBiologicalSex} onNext={next} />}
      {step === 7  && <StepAha2 onNext={next} />}
      {step === 8  && <StepSleepQuality value={sleepQuality} onSelect={setSleepQuality} onNext={next} />}
      {step === 9  && <StepActivityLevel value={activityLevel} onSelect={setActivityLevel} onNext={next} />}
      {step === 10 && <StepHealthContext selected={profileFlags} onToggle={toggleFlag} onNext={next} />}
      {step === 11 && <StepAha3 onNext={next} />}
      {step === 12 && (
        <StepProfileSummary
          name={name}
          focusAreas={focusAreas}
          ageRange={ageRange}
          sleepQuality={sleepQuality}
          activityLevel={activityLevel}
          profileFlags={profileFlags}
          onCreateAccount={handleCreateAccount}
          onContinueAsGuest={handleContinueAsGuest}
        />
      )}
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Full end-to-end walkthrough**

Run app from fresh install (or clear AsyncStorage). Tap through all 13 steps:
- Step 1: Welcome image + Begin
- Step 2: Noise Problem + Continue
- Step 3: Select 2 goals + Continue
- Step 4: AHA vitamin C card
- Step 5: Enter name
- Step 6: Select age range
- Step 7: Select biological sex
- Step 8: AHA fish oil card
- Step 9: Select sleep quality
- Step 10: Select activity level
- Step 11: Check health flags
- Step 12: AHA probiotic card
- Step 13: Profile summary shows collected tags. "Create Account" opens auth with name pre-filled. "Continue as Guest" goes to home.

Progress bar fills correctly across all 13 steps.

- [ ] **Step 3: Verify profile syncs after sign-up**

On step 13, tap "Create Account". In auth screen, complete sign-up. After sign-up, check that the app's home screen shows the user's real name. In backend logs (or Supabase dashboard), confirm `focus_areas`, `sleep_quality`, `activity_level`, `age_range` are saved on the `user_profiles` row.

- [ ] **Step 4: Final commit**

```bash
git add nourai/app/onboarding.tsx nourai/app/auth.tsx
git commit -m "feat: 13-step value-first onboarding — profile + 3 aha moments + auth convert"
```

---

## Image Placeholder Note

Until the 5 Midjourney images are generated, the `Image` components will show a blank area. You can use a temporary coloured placeholder by replacing:

```tsx
<Image source={require('../assets/onboarding/welcome.png')} ... />
```

with:

```tsx
<View style={{ width: '100%', height: scale(280), backgroundColor: Colors.surfaceCard }} />
```

Add the real images to `nourai/assets/onboarding/` and the `require()` calls will resolve automatically.
