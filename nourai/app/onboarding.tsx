import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  Animated as RNAnimated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import {
  Colors,
  Fonts,
  Spacing,
  Radius,
  FontSizes,
  scale,
  verticalScale,
} from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import type { OnboardingProfile } from '@/services/api';

const { width: W, height: H } = Dimensions.get('window');

// ─── Data ─────────────────────────────────────────────────────────────────────

const INTRO_SLIDES = [
  {
    id: '1',
    image: require('@/assets/onboarding/wellness.png'),
    title: 'Know What You\nPut In Your Body',
    subtitle: 'Scan any product to reveal its true biological impact.',
  },
  {
    id: '2',
    image: require('@/assets/onboarding/biodata.png'),
    title: 'Personalized to\nYour Biology',
    subtitle: 'Two minutes to set up. A lifetime of analysis tailored to you.',
  },
];

const SEX_OPTIONS = [
  { id: 'male' as const, label: 'Male' },
  { id: 'female' as const, label: 'Female' },
  { id: 'not_specified' as const, label: 'Prefer\nnot to say' },
];

const AGE_OPTIONS = [
  { id: 'under_25' as const, label: 'Under 25' },
  { id: '25_34' as const, label: '25–34' },
  { id: '35_44' as const, label: '35–44' },
  { id: '45_54' as const, label: '45–54' },
  { id: '55_plus' as const, label: '55+' },
];

const FOCUS_AREAS = [
  { id: 'skin', label: 'Skin &\nAppearance', desc: 'Skincare, cosmetics, topicals' },
  { id: 'performance', label: 'Body &\nPerformance', desc: 'Supplements, protein, training' },
  { id: 'gut', label: 'Gut &\nDigestion', desc: 'Food, probiotics, gut health' },
  { id: 'hormonal', label: 'Hormonal &\nFertility', desc: 'Endocrine, reproductive health' },
  { id: 'hair', label: 'Hair &\nScalp', desc: 'Growth, loss prevention' },
  { id: 'wellness', label: 'General\nWellness', desc: 'Broad health, no specific focus' },
];

const HEALTH_CONCERNS = [
  {
    id: 'fertility',
    label: 'Trying to Conceive',
    desc: 'Reproductive health & fertility focus',
  },
  {
    id: 'thyroid',
    label: 'Thyroid Condition',
    desc: "Hypo/hyperthyroid, Hashimoto's",
  },
  {
    id: 'hormonal_condition',
    label: 'Hormone-Sensitive Condition',
    desc: 'PCOS, endometriosis, estrogen sensitivity',
  },
  {
    id: 'medications',
    label: 'Regular Prescription Medications',
    desc: "We'll flag potential ingredient interactions",
  },
  {
    id: 'infant_proximity',
    label: 'Products Near Young Children',
    desc: 'Extra infant & child safety filter applied',
  },
];

const GOALS = [
  { id: 'clear_skin', label: 'Clear Skin' },
  { id: 'anti_aging', label: 'Anti-Aging' },
  { id: 'brighter_skin', label: 'Brighter Skin' },
  { id: 'hair_growth', label: 'Hair Growth' },
  { id: 'prevent_hair_loss', label: 'Prevent Hair Loss' },
  { id: 'build_muscle', label: 'Build Muscle' },
  { id: 'fat_loss', label: 'Fat Loss' },
  { id: 'more_energy', label: 'More Energy' },
  { id: 'gut_health', label: 'Gut Health' },
  { id: 'less_inflammation', label: 'Less Inflammation' },
  { id: 'mental_focus', label: 'Mental Focus' },
];

const STEP_META = [
  { label: 'About You', hint: 'Step 1 of 4' },
  { label: 'Your Focus', hint: 'Step 2 of 4' },
  { label: 'Health Concerns', hint: 'Step 3 of 4' },
  { label: 'Your Goals', hint: 'Step 4 of 4' },
];

const DEFAULT_PROFILE: OnboardingProfile = {
  biologicalSex: 'not_specified',
  ageRange: '',
  isPregnant: false,
  isBreastfeeding: false,
  focusAreas: [],
  healthConcerns: [],
  goals: [],
};

// ─── Step Component Types ─────────────────────────────────────────────────────

type ProfileChange = (updates: Partial<OnboardingProfile>) => void;

// ─── Step 1: Biological Context ───────────────────────────────────────────────

function StepBiological({
  profile,
  onChange,
}: {
  profile: OnboardingProfile;
  onChange: ProfileChange;
}) {
  const tap = <T,>(field: keyof OnboardingProfile, value: T) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange({ [field]: value });
  };

  const toggleBool = (field: 'isPregnant' | 'isBreastfeeding') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange({ [field]: !profile[field] });
  };

  return (
    <ScrollView
      contentContainerStyle={s.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Animated.Text entering={FadeInDown.duration(400)} style={s.stepTitle}>
        {"Let's personalize\nyour analysis."}
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.duration(400).delay(80)}
        style={s.stepSubtitle}
      >
        Accurate safety thresholds and evidence filtering depend on biological
        context.
      </Animated.Text>

      {/* ── Sex ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(160)}>
        <Text style={s.sectionLabel}>You Are</Text>
        <View style={s.sexRow}>
          {SEX_OPTIONS.map((opt) => {
            const active = profile.biologicalSex === opt.id;
            return (
              <Pressable
                key={opt.id}
                style={[s.sexCard, active && s.activeCard]}
                onPress={() => tap('biologicalSex', opt.id)}
              >
                <Text style={[s.sexCardText, active && s.activeCardText]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* ── Age ── */}
      <Animated.View entering={FadeInDown.duration(400).delay(240)}>
        <Text style={s.sectionLabel}>Your Age</Text>
        <View style={s.pillWrap}>
          {AGE_OPTIONS.map((opt) => {
            const active = profile.ageRange === opt.id;
            return (
              <Pressable
                key={opt.id}
                style={[s.agePill, active && s.activeAgePill]}
                onPress={() => tap('ageRange', opt.id)}
              >
                <Text style={[s.agePillText, active && s.activeAgePillText]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* ── Life stage — only visible when sex = female ── */}
      {profile.biologicalSex === 'female' && (
        <Animated.View entering={FadeInDown.duration(300)}>
          <Text style={s.sectionLabel}>Life Stage</Text>
          <View style={s.toggleBlock}>
            {(['isPregnant', 'isBreastfeeding'] as const).map((field, i) => {
              const label =
                field === 'isPregnant'
                  ? 'Currently pregnant'
                  : 'Currently breastfeeding';
              const active = profile[field];
              return (
                <Pressable
                  key={field}
                  style={[
                    s.toggleRow,
                    i === 0 && s.toggleRowBorder,
                  ]}
                  onPress={() => toggleBool(field)}
                >
                  <Text style={s.toggleLabel}>{label}</Text>
                  <View style={[s.track, active && s.trackActive]}>
                    <View style={[s.knob, active && s.knobActive]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

// ─── Step 2: Focus Areas ──────────────────────────────────────────────────────

function StepFocus({
  profile,
  onChange,
}: {
  profile: OnboardingProfile;
  onChange: ProfileChange;
}) {
  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = profile.focusAreas;
    if (current.includes(id)) {
      onChange({ focusAreas: current.filter((a) => a !== id) });
    } else if (current.length < 2) {
      onChange({ focusAreas: [...current, id] });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={s.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Animated.Text entering={FadeInDown.duration(400)} style={s.stepTitle}>
        {'What matters\nmost to you?'}
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.duration(400).delay(80)}
        style={s.stepSubtitle}
      >
        Select up to two. Your analysis will prioritize these domains.
      </Animated.Text>

      <Animated.View entering={FadeInDown.duration(400).delay(160)} style={s.focusGrid}>
        {FOCUS_AREAS.map((area) => {
          const active = profile.focusAreas.includes(area.id);
          const maxed = !active && profile.focusAreas.length >= 2;
          return (
            <Pressable
              key={area.id}
              style={[s.focusCard, active && s.activeCard, maxed && s.dimmed]}
              onPress={() => toggle(area.id)}
              disabled={maxed}
            >
              <Text style={[s.focusCardLabel, active && s.activeCardText]}>
                {area.label}
              </Text>
              <Text style={[s.focusCardDesc, active && s.activeCardDesc]}>
                {area.desc}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {profile.focusAreas.length === 2 && (
        <Animated.Text entering={FadeInDown.duration(300)} style={s.limitNote}>
          Maximum selected — deselect one to change.
        </Animated.Text>
      )}
    </ScrollView>
  );
}

// ─── Step 3: Health Concerns ──────────────────────────────────────────────────

function StepConcerns({
  profile,
  onChange,
}: {
  profile: OnboardingProfile;
  onChange: ProfileChange;
}) {
  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = profile.healthConcerns;
    if (current.includes(id)) {
      onChange({ healthConcerns: current.filter((c) => c !== id) });
    } else {
      onChange({ healthConcerns: [...current, id] });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={s.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Animated.Text entering={FadeInDown.duration(400)} style={s.stepTitle}>
        {'Any concerns\nwe should flag?'}
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.duration(400).delay(80)}
        style={s.stepSubtitle}
      >
        These trigger personalized safety warnings on products that may affect
        you.
      </Animated.Text>

      <Animated.View entering={FadeInDown.duration(400).delay(160)} style={s.concernList}>
        {HEALTH_CONCERNS.map((concern) => {
          const active = profile.healthConcerns.includes(concern.id);
          return (
            <Pressable
              key={concern.id}
              style={[s.concernCard, active && s.concernCardActive]}
              onPress={() => toggle(concern.id)}
            >
              <View style={s.concernBody}>
                <Text style={[s.concernLabel, active && s.concernLabelActive]}>
                  {concern.label}
                </Text>
                <Text style={[s.concernDesc, active && s.concernDescActive]}>
                  {concern.desc}
                </Text>
              </View>
              <View style={[s.checkCircle, active && s.checkCircleActive]}>
                {active && <Text style={s.checkMark}>✓</Text>}
              </View>
            </Pressable>
          );
        })}
      </Animated.View>

      <Animated.Text
        entering={FadeInDown.duration(400).delay(500)}
        style={s.optionalNote}
      >
        Nothing selected is also valid — no special flags will be applied.
      </Animated.Text>
    </ScrollView>
  );
}

// ─── Step 4: Goals ────────────────────────────────────────────────────────────

function StepGoals({
  profile,
  onChange,
}: {
  profile: OnboardingProfile;
  onChange: ProfileChange;
}) {
  const toggle = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = profile.goals;
    if (current.includes(id)) {
      onChange({ goals: current.filter((g) => g !== id) });
    } else if (current.length < 3) {
      onChange({ goals: [...current, id] });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={s.stepContent}
      showsVerticalScrollIndicator={false}
    >
      <Animated.Text entering={FadeInDown.duration(400)} style={s.stepTitle}>
        {'What are you\nworking toward?'}
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.duration(400).delay(80)}
        style={s.stepSubtitle}
      >
        Select up to three. We'll highlight supporting evidence for each.
      </Animated.Text>

      <Animated.View entering={FadeInDown.duration(400).delay(160)} style={s.goalCloud}>
        {GOALS.map((goal) => {
          const active = profile.goals.includes(goal.id);
          const maxed = !active && profile.goals.length >= 3;
          return (
            <Pressable
              key={goal.id}
              style={[s.goalPill, active && s.activeGoalPill, maxed && s.dimmed]}
              onPress={() => toggle(goal.id)}
              disabled={maxed}
            >
              <Text style={[s.goalPillText, active && s.activeGoalPillText]}>
                {goal.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {profile.goals.length === 3 && (
        <Animated.Text entering={FadeInDown.duration(300)} style={s.limitNote}>
          Maximum selected — deselect one to change.
        </Animated.Text>
      )}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

type Phase = 'slides' | 'profiling' | 'complete';

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useAuth();

  const [phase, setPhase] = useState<Phase>('slides');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [profile, setProfile] = useState<OnboardingProfile>(DEFAULT_PROFILE);

  // ── Animations ────────────────────────────────────────────────────────────

  const flatListRef = useRef<FlatList>(null);
  const slidesScrollX = useRef(new RNAnimated.Value(0)).current;

  // Fades step content in/out during transitions
  const stepOpacity = useSharedValue(1);
  const stepAnimStyle = useAnimatedStyle(() => ({ opacity: stepOpacity.value }));

  // Progress bar — React Native Animated (needs useNativeDriver:false for width)
  const progressAnim = useRef(new RNAnimated.Value(0.25)).current;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleProfileChange = useCallback(
    (updates: Partial<OnboardingProfile>) => {
      setProfile((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const animateProgress = (step: number) => {
    RNAnimated.timing(progressAnim, {
      toValue: (step + 1) / 4,
      duration: 420,
      useNativeDriver: false,
    }).start();
  };

  const crossFadeTo = (nextStep: number) => {
    stepOpacity.value = withTiming(0, { duration: 140 }, () => {
      runOnJS(setCurrentStep)(nextStep);
      runOnJS(animateProgress)(nextStep);
      stepOpacity.value = withTiming(1, { duration: 220 });
    });
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStartProfiling = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentStep(0);
    animateProgress(0);
    setPhase('profiling');
  };

  const handleNextStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep < 3) {
      crossFadeTo(currentStep + 1);
    } else {
      // Final step → completion
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      stepOpacity.value = withTiming(0, { duration: 180 }, () => {
        runOnJS(setPhase)('complete');
        stepOpacity.value = 1;
      });
    }
  };

  const handlePrevStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep > 0) {
      crossFadeTo(currentStep - 1);
    } else {
      // Step 0 ← return to intro slides
      setPhase('slides');
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/auth');
  };

  const handleCreateAccount = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await completeOnboarding(profile);
    router.replace('/auth');
  };

  const handleSlideNext = () => {
    if (currentSlide < INTRO_SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentSlide + 1 });
    } else {
      handleStartProfiling();
    }
  };

  const viewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]) setCurrentSlide(viewableItems[0].index ?? 0);
    }
  ).current;
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // ── Render: Completion ────────────────────────────────────────────────────

  if (phase === 'complete') {
    const selFocus = FOCUS_AREAS.filter((a) => profile.focusAreas.includes(a.id));
    const selConcerns = HEALTH_CONCERNS.filter((c) =>
      profile.healthConcerns.includes(c.id)
    );
    const selGoals = GOALS.filter((g) => profile.goals.includes(g.id));
    const hasData = selFocus.length > 0 || selConcerns.length > 0 || selGoals.length > 0;

    return (
      <View style={[s.screen, s.boneScreen]}>
        <ScrollView
          contentContainerStyle={[
            s.completionScroll,
            { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + verticalScale(140) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.Text entering={FadeInDown.duration(500)} style={s.completionTitle}>
            {'Your profile\nis set.'}
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.duration(500).delay(100)}
            style={s.completionSubtitle}
          >
            Every product you scan is now analyzed through your personal lens.
          </Animated.Text>

          {hasData ? (
            <Animated.View
              entering={FadeInDown.duration(500).delay(220)}
              style={s.summaryCard}
            >
              {selFocus.length > 0 && (
                <View style={s.summarySection}>
                  <Text style={s.summarySectionLabel}>Analyzing For</Text>
                  <View style={s.summaryTagRow}>
                    {selFocus.map((a) => (
                      <View key={a.id} style={s.tagFocus}>
                        <Text style={s.tagFocusText}>
                          {a.label.replace('\n', ' ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {selConcerns.length > 0 && (
                <View style={[s.summarySection, s.sectionDivider]}>
                  <Text style={s.summarySectionLabel}>Watching For</Text>
                  <View style={s.summaryTagRow}>
                    {selConcerns.map((c) => (
                      <View key={c.id} style={s.tagConcern}>
                        <Text style={s.tagConcernText}>⚠ {c.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {selGoals.length > 0 && (
                <View
                  style={[
                    s.summarySection,
                    (selFocus.length > 0 || selConcerns.length > 0) && s.sectionDivider,
                  ]}
                >
                  <Text style={s.summarySectionLabel}>Supporting</Text>
                  <View style={s.summaryTagRow}>
                    {selGoals.map((g) => (
                      <View key={g.id} style={s.tagGoal}>
                        <Text style={s.tagGoalText}>{g.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeInDown.duration(500).delay(220)}
              style={s.noProfileNote}
            >
              <Text style={s.noProfileNoteText}>
                No preferences set. You can update them any time from your
                Profile Hub.
              </Text>
            </Animated.View>
          )}
        </ScrollView>

        <Animated.View
          entering={FadeInDown.duration(500).delay(380)}
          style={[s.completionFooter, { paddingBottom: insets.bottom + Spacing.lg }]}
        >
          <Pressable style={s.createBtn} onPress={handleCreateAccount}>
            <Text style={s.createBtnText}>Create My Account</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // ── Render: Profiling steps ───────────────────────────────────────────────

  if (phase === 'profiling') {
    const steps = [
      <StepBiological profile={profile} onChange={handleProfileChange} />,
      <StepFocus profile={profile} onChange={handleProfileChange} />,
      <StepConcerns profile={profile} onChange={handleProfileChange} />,
      <StepGoals profile={profile} onChange={handleProfileChange} />,
    ];
    const isLastStep = currentStep === 3;

    return (
      <View style={[s.screen, s.boneScreen]}>
        {/* ── Header: back + step label + progress ── */}
        <View style={[s.profilingHeader, { paddingTop: insets.top + Spacing.sm }]}>
          <View style={s.profilingHeaderRow}>
            <Pressable style={s.backBtn} onPress={handlePrevStep}>
              <Text style={s.backBtnIcon}>‹</Text>
            </Pressable>

            <View style={s.stepMeta}>
              <Text style={s.stepMetaLabel}>
                {STEP_META[currentStep].label}
              </Text>
              <Text style={s.stepMetaHint}>{STEP_META[currentStep].hint}</Text>
            </View>

            {/* Spacer — mirrors back button width for visual balance */}
            <View style={{ width: scale(40) }} />
          </View>

          {/* Thin animated progress bar */}
          <View style={s.progressTrack}>
            <RNAnimated.View style={[s.progressFill, { width: progressWidth }]} />
          </View>
        </View>

        {/* ── Step content (cross-fades on transition) ── */}
        <Animated.View style={[s.stepWrapper, stepAnimStyle]}>
          {steps[currentStep]}
        </Animated.View>

        {/* ── Footer button ── */}
        <View
          style={[s.profilingFooter, { paddingBottom: insets.bottom + Spacing.lg }]}
        >
          <Pressable style={s.continueBtn} onPress={handleNextStep}>
            <Text style={s.continueBtnText}>
              {isLastStep ? 'Build My Profile' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Render: Intro slides ──────────────────────────────────────────────────

  const isLastSlide = currentSlide === INTRO_SLIDES.length - 1;

  return (
    <View style={s.screen}>
      <FlatList
        ref={flatListRef}
        data={INTRO_SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={s.slide}>
            <Image source={item.image} style={s.slideImage} resizeMode="cover" />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.88)']}
              style={s.gradient}
              locations={[0, 0.45, 1]}
            />
            <View
              style={[
                s.slideContent,
                { paddingBottom: insets.bottom + verticalScale(140) },
              ]}
            >
              <Text style={s.slideTitle}>{item.title}</Text>
              <Text style={s.slideSubtitle}>{item.subtitle}</Text>
            </View>
          </View>
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={RNAnimated.event(
          [{ nativeEvent: { contentOffset: { x: slidesScrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={viewableItemsChanged}
        viewabilityConfig={viewConfig}
      />

      {/* Skip */}
      <Pressable
        style={[s.skipBtn, { top: insets.top + Spacing.md }]}
        onPress={handleSkip}
      >
        <Text style={s.skipText}>Skip</Text>
      </Pressable>

      {/* Pagination + CTA */}
      <View style={[s.slidesFooter, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={s.pagination}>
          {INTRO_SLIDES.map((_, i) => {
            const range = [(i - 1) * W, i * W, (i + 1) * W];
            const dotW = slidesScrollX.interpolate({
              inputRange: range,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const op = slidesScrollX.interpolate({
              inputRange: range,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <RNAnimated.View key={i} style={[s.dot, { width: dotW, opacity: op }]} />
            );
          })}
        </View>

        <Pressable
          style={[s.nextBtn, isLastSlide && s.nextBtnPrimary]}
          onPress={handleSlideNext}
        >
          <Text style={[s.nextBtnText, isLastSlide && s.nextBtnTextPrimary]}>
            {isLastSlide ? 'Build My Profile' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_GAP = scale(10);
const FOCUS_CARD_W = (W - 2 * scale(24) - CARD_GAP) / 2;

const s = StyleSheet.create({
  // ── Shared ─────────────────────────────────────────────────────────────────
  screen: {
    flex: 1,
    backgroundColor: Colors.ink,
  },
  boneScreen: {
    backgroundColor: Colors.bone,
  },

  // ── Intro slides ───────────────────────────────────────────────────────────
  slide: {
    width: W,
    height: H,
  },
  slideImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '72%',
  },
  slideContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: scale(32),
  },
  slideTitle: {
    fontFamily: Fonts.serif,
    fontSize: scale(40),
    lineHeight: scale(46),
    color: Colors.bone,
    marginBottom: Spacing.md,
  },
  slideSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: 'rgba(233, 230, 223, 0.75)',
    lineHeight: FontSizes.bodyLarge * 1.55,
  },
  skipBtn: {
    position: 'absolute',
    right: scale(24),
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  skipText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: 'rgba(233, 230, 223, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  slidesFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: scale(32),
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.bone,
  },
  nextBtn: {
    backgroundColor: 'rgba(233, 230, 223, 0.18)',
    paddingVertical: verticalScale(18),
    borderRadius: Radius.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233, 230, 223, 0.25)',
  },
  nextBtnPrimary: {
    backgroundColor: Colors.bone,
    borderColor: Colors.bone,
  },
  nextBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  nextBtnTextPrimary: {
    color: Colors.ink,
  },

  // ── Profiling shell ────────────────────────────────────────────────────────
  profilingHeader: {
    paddingHorizontal: scale(24),
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.bone,
  },
  profilingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
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
  stepMeta: {
    alignItems: 'center',
    gap: 2,
  },
  stepMetaLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
  },
  stepMetaHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkTertiary,
  },
  progressTrack: {
    height: 2,
    backgroundColor: Colors.borderHairline,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
    backgroundColor: Colors.ink,
    borderRadius: 1,
  },
  stepWrapper: {
    flex: 1,
  },
  profilingFooter: {
    paddingHorizontal: scale(24),
    paddingTop: Spacing.md,
    backgroundColor: Colors.bone,
  },
  continueBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: verticalScale(18),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  continueBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.bone,
  },

  // ── Step shared content ────────────────────────────────────────────────────
  stepContent: {
    paddingHorizontal: scale(24),
    paddingTop: Spacing.xl,
    paddingBottom: verticalScale(40),
  },
  stepTitle: {
    fontFamily: Fonts.serif,
    fontSize: scale(36),
    lineHeight: scale(42),
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.bodyLarge * 1.55,
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.inkTertiary,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },

  // ── Active states (shared) ─────────────────────────────────────────────────
  activeCard: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  activeCardText: {
    color: Colors.bone,
  },
  activeCardDesc: {
    color: 'rgba(233, 230, 223, 0.6)',
  },
  dimmed: {
    opacity: 0.35,
  },
  limitNote: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },

  // ── Step 1: Sex ────────────────────────────────────────────────────────────
  sexRow: {
    flexDirection: 'row',
    gap: scale(8),
  },
  sexCard: {
    flex: 1,
    paddingVertical: verticalScale(20),
    paddingHorizontal: scale(8),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexCardText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: FontSizes.body * 1.4,
  },

  // ── Step 1: Age ────────────────────────────────────────────────────────────
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  agePill: {
    paddingVertical: scale(10),
    paddingHorizontal: scale(18),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
  },
  activeAgePill: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  agePillText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  activeAgePillText: {
    color: Colors.bone,
  },

  // ── Step 1: Life stage toggles ─────────────────────────────────────────────
  toggleBlock: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(16),
  },
  toggleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  toggleLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
    flex: 1,
  },
  track: {
    width: scale(44),
    height: scale(24),
    borderRadius: scale(12),
    backgroundColor: Colors.boneDark,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackActive: {
    backgroundColor: Colors.ink,
  },
  knob: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(10),
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  knobActive: {
    alignSelf: 'flex-end',
  },

  // ── Step 2: Focus areas grid ───────────────────────────────────────────────
  focusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  focusCard: {
    width: FOCUS_CARD_W,
    paddingVertical: verticalScale(20),
    paddingHorizontal: scale(14),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    justifyContent: 'flex-end',
    minHeight: verticalScale(90),
  },
  focusCardLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
    marginBottom: scale(4),
    lineHeight: FontSizes.title * 1.2,
  },
  focusCardDesc: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    lineHeight: FontSizes.caption * 1.4,
  },

  // ── Step 3: Concern cards ──────────────────────────────────────────────────
  concernList: {
    gap: scale(8),
  },
  concernCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    padding: scale(16),
    gap: scale(12),
  },
  concernCardActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  concernBody: {
    flex: 1,
  },
  concernLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.subtitle,
    color: Colors.ink,
    marginBottom: 2,
  },
  concernLabelActive: {
    color: Colors.bone,
  },
  concernDesc: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.caption * 1.4,
  },
  concernDescActive: {
    color: 'rgba(233, 230, 223, 0.55)',
  },
  checkCircle: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  checkCircleActive: {
    backgroundColor: 'rgba(233, 230, 223, 0.2)',
    borderColor: 'rgba(233, 230, 223, 0.4)',
  },
  checkMark: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.bone,
  },
  optionalNote: {
    fontFamily: Fonts.sansLight,
    fontSize: FontSizes.caption,
    color: Colors.inkTertiary,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: FontSizes.caption * 1.5,
  },

  // ── Step 4: Goal pills ─────────────────────────────────────────────────────
  goalCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
  },
  goalPill: {
    paddingVertical: scale(11),
    paddingHorizontal: scale(18),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
  },
  activeGoalPill: {
    backgroundColor: Colors.accentMoss,
    borderColor: Colors.accentMoss,
  },
  goalPillText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  activeGoalPillText: {
    color: Colors.bone,
  },

  // ── Completion screen ──────────────────────────────────────────────────────
  completionScroll: {
    paddingHorizontal: scale(28),
  },
  completionTitle: {
    fontFamily: Fonts.serif,
    fontSize: scale(44),
    lineHeight: scale(50),
    color: Colors.ink,
    marginBottom: Spacing.md,
  },
  completionSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.bodyLarge,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.bodyLarge * 1.55,
    marginBottom: Spacing.xl,
  },
  summaryCard: {
    backgroundColor: Colors.inkWarm,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  summarySection: {
    padding: scale(20),
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(233, 230, 223, 0.1)',
  },
  summarySectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(233, 230, 223, 0.45)',
    marginBottom: Spacing.sm,
  },
  summaryTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(6),
  },
  tagFocus: {
    paddingVertical: scale(6),
    paddingHorizontal: scale(12),
    backgroundColor: 'rgba(233, 230, 223, 0.12)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(233, 230, 223, 0.2)',
  },
  tagFocusText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.bone,
  },
  tagConcern: {
    paddingVertical: scale(6),
    paddingHorizontal: scale(12),
    backgroundColor: 'rgba(163, 78, 78, 0.25)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(163, 78, 78, 0.4)',
  },
  tagConcernText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: '#D9A0A0',
  },
  tagGoal: {
    paddingVertical: scale(6),
    paddingHorizontal: scale(12),
    backgroundColor: 'rgba(92, 110, 92, 0.3)',
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(92, 110, 92, 0.45)',
  },
  tagGoalText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: '#A8C4A8',
  },
  noProfileNote: {
    padding: scale(24),
    backgroundColor: Colors.boneCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  noProfileNoteText: {
    fontFamily: Fonts.sansLight,
    fontSize: FontSizes.subtitle,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.subtitle * 1.5,
    textAlign: 'center',
  },
  completionFooter: {
    paddingHorizontal: scale(28),
    paddingTop: Spacing.md,
    backgroundColor: Colors.bone,
  },
  createBtn: {
    backgroundColor: Colors.ink,
    paddingVertical: verticalScale(18),
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  createBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: Colors.bone,
  },
});
