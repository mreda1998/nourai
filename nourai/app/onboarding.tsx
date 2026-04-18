import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Fonts, Radius, scale, FontSizes } from '@/constants/theme';
import { Eyebrow, SerifH, AlertNote } from '@/components/elory';
import { useAuth } from '@/context/auth-context';

// ─── Goal options ─────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
  { key: 'gut',   title: 'Gut health',   sub: 'Microbiome, digestion, bloating' },
  { key: 'sleep', title: 'Sleep',        sub: 'Circadian rhythm & recovery' },
  { key: 'long',  title: 'Longevity',    sub: 'Cellular resilience, oxidative load' },
  { key: 'skin',  title: 'Dermal care',  sub: 'Barrier, hydration, sun response' },
  { key: 'meta',  title: 'Metabolic',    sub: 'Glucose, insulin, energy' },
  { key: 'mind',  title: 'Cognitive',    sub: 'Focus, mood, stress response' },
];

const PROFILE_OPTIONS = [
  { key: 'preg', title: 'Pregnant / nursing' },
  { key: 'veg',  title: 'Plant-based' },
  { key: 'sens', title: 'Sensitive skin' },
  { key: 'rx',   title: 'On prescription meds' },
  { key: 'none', title: 'None of the above' },
];

// ─── Shared button styles ─────────────────────────────────────────────────────

const pillBtn = {
  width: '100%' as const,
  paddingVertical: 16,
  paddingHorizontal: 24,
  backgroundColor: Colors.ink,
  borderRadius: Radius.pill,
  alignItems: 'center' as const,
};

const pillBtnText = {
  fontFamily: Fonts.sansSemiBold,
  fontSize: 11,
  textTransform: 'uppercase' as const,
  letterSpacing: 2.0,
  color: Colors.surface,
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 }}>
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

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: scale(38),
          lineHeight: scale(44),
          color: Colors.ink,
          marginBottom: 16,
        }}
      >
        {'A knowledgeable\nfriend, in your\npocket.'}
      </Text>

      <Text
        style={{
          fontFamily: Fonts.serifItalic,
          fontSize: FontSizes.bodyLarge,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.bodyLarge * 1.6,
          marginBottom: 32,
        }}
      >
        Elory reads ingredient lists the way a trained biochemist would — and tells you what actually matters for your body.
      </Text>

      {/* "What Elory is not" card */}
      <View
        style={{
          backgroundColor: Colors.surfaceCard,
          borderWidth: 1,
          borderColor: Colors.borderHairline,
          borderRadius: Radius.lg,
          padding: 20,
          marginBottom: 40,
        }}
      >
        <Eyebrow style={{ marginBottom: 14 }}>What Elory is not</Eyebrow>
        {[
          'A replacement for your doctor or pharmacist.',
          'A fear-driven list of "toxins" to avoid.',
          'A marketing tool for any brand or product.',
        ].map((item, i) => (
          <Text
            key={i}
            style={{
              fontFamily: Fonts.serifItalic,
              fontSize: FontSizes.bodyLarge,
              color: Colors.inkSecondary,
              lineHeight: FontSizes.bodyLarge * 1.55,
              marginBottom: i < 2 ? 10 : 0,
            }}
          >
            {'— '}{item}
          </Text>
        ))}
      </View>

      <Pressable style={pillBtn} onPress={onNext}>
        <Text style={pillBtnText}>Begin</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Step 1: Focus ────────────────────────────────────────────────────────────

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
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <SerifH size={38} style={{ marginBottom: 8 }}>
        {"What matters\nto you?"}
      </SerifH>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.bodyLarge,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.bodyLarge * 1.5,
          marginBottom: 28,
        }}
      >
        Select all that apply. Your analysis will be tuned to these domains.
      </Text>

      <View style={{ gap: 10, marginBottom: 36 }}>
        {GOAL_OPTIONS.map((opt) => {
          const active = selected.includes(opt.key);
          return (
            <Pressable
              key={opt.key}
              onPress={() => onToggle(opt.key)}
              style={{
                backgroundColor: active ? Colors.ink : Colors.surfaceCard,
                borderWidth: 1,
                borderColor: active ? Colors.ink : Colors.borderHairline,
                borderRadius: Radius.md,
                padding: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: Fonts.serifMedium,
                  fontSize: FontSizes.title,
                  color: active ? Colors.accentInk : Colors.ink,
                  marginBottom: 2,
                }}
              >
                {opt.title}
              </Text>
              <Text
                style={{
                  fontFamily: Fonts.sans,
                  fontSize: FontSizes.caption,
                  color: active ? 'rgba(241,237,228,0.6)' : Colors.inkSecondary,
                  lineHeight: FontSizes.caption * 1.4,
                }}
              >
                {opt.sub}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[pillBtn, selected.length === 0 && { opacity: 0.4 }]}
        onPress={onNext}
      >
        <Text style={pillBtnText}>
          {selected.length === 0
            ? 'Continue · 0 selected'
            : `Continue · ${selected.length} selected`}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Step 2: Context ──────────────────────────────────────────────────────────

function StepContext({
  selected,
  onToggle,
  onFinish,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  onFinish: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      <SerifH size={38} style={{ marginBottom: 8 }}>
        {"Anything we\nshould know?"}
      </SerifH>
      <Text
        style={{
          fontFamily: Fonts.sans,
          fontSize: FontSizes.bodyLarge,
          color: Colors.inkSecondary,
          lineHeight: FontSizes.bodyLarge * 1.5,
          marginBottom: 28,
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
          marginBottom: 24,
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
                i > 0 && {
                  borderTopWidth: 1,
                  borderTopColor: Colors.borderHairline,
                },
              ]}
            >
              {/* Checkbox square */}
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
                  <Text
                    style={{
                      fontFamily: Fonts.sansSemiBold,
                      fontSize: 13,
                      color: Colors.surface,
                      lineHeight: 16,
                    }}
                  >
                    ✓
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontFamily: Fonts.sans,
                  fontSize: FontSizes.subtitle,
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

      <View style={{ marginBottom: 32 }}>
        <AlertNote tone="accent" title="Your privacy">
          Context flags are stored only on this device. They are never shared with third parties or used for advertising.
        </AlertNote>
      </View>

      <Pressable style={pillBtn} onPress={onFinish}>
        <Text style={pillBtnText}>Enter Elory</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAuth();

  const [step, setStep] = useState(0);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string[]>([]);

  const toggleGoal = (key: string) => {
    setSelectedGoals((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleProfile = (key: string) => {
    setSelectedProfile((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleFinish = async () => {
    await completeOnboarding();
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface }}>
      <ProgressBar step={step} total={3} />

      {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
      {step === 1 && (
        <StepFocus
          selected={selectedGoals}
          onToggle={toggleGoal}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <StepContext
          selected={selectedProfile}
          onToggle={toggleProfile}
          onFinish={handleFinish}
        />
      )}
    </SafeAreaView>
  );
}
