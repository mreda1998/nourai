import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell, BookOpen, ChevronRight, CircleUserRound, Crown, Grid2x2, History, Info, KeyRound, MessageSquareHeart, Settings, ShieldCheck, SlidersHorizontal,
} from 'lucide-react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { FeedbackSheet } from '@/components/FeedbackSheet';
import { TESTER_MODE } from '@/lib/tester-mode';
import { useAuth } from '@/context/auth-context';
import { usePurchases } from '@/context/purchases-context';
import { Palette, Radius } from '@/constants/theme';
import { Imagery } from '@/constants/imagery';
import { Button, Card, IconButton, ListGroup, ListRow, PressableScale, Screen, Section, Txt } from '@/components/ui';

const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function YouScreen() {
  const { user, onboardingProfile, isSignedIn } = useAuth();
  const { isPremium } = usePurchases();
  const name = user?.name?.trim() || (isSignedIn ? 'Elory member' : 'Guest');
  const goals = onboardingProfile?.goals ?? [];
  const focus = onboardingProfile?.focusAreas ?? [];
  const concerns = onboardingProfile?.healthConcerns ?? [];
  const feedback = useRef<BottomSheetModal>(null);

  return (
    <Screen tabbed right={<IconButton icon={Settings} label="Account settings" onPress={() => router.push('/settings/account' as never)} />}>
      {/* Identity */}
      <View style={{ alignItems: 'center', marginTop: -4 }}>
        <View style={styles.avatar}>
          {user?.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={StyleSheet.absoluteFill} /> : <Txt variant="largeTitle" tone="accent">{name.slice(0, 1).toUpperCase()}</Txt>}
        </View>
        <Txt variant="title1" style={{ marginTop: 14 }}>{name}</Txt>
        <Txt variant="subhead" tone="secondary" style={{ marginTop: 2 }}>{user?.email ?? 'Not signed in'}</Txt>
      </View>

      {!isSignedIn ? (
        <Card padding={18} style={{ marginTop: 24 }}>
          <Txt variant="headline">Save your stack and history</Txt>
          <Txt variant="footnote" tone="secondary" style={{ marginTop: 4 }}>Create an account to sync across devices and use Ask Elory.</Txt>
          <Button label="Sign in or create account" size="md" style={{ marginTop: 14 }} onPress={() => router.push('/auth' as never)} />
        </Card>
      ) : null}

      {/* Membership */}
      <PressableScale onPress={() => router.push((isPremium ? '/(premium)/atelier' : '/settings/subscription') as never)} style={styles.premium} accessibilityLabel={isPremium ? 'Open Atelier' : 'Explore Elory Premium'}>
        <Image source={Imagery.atelier} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['rgba(10,29,28,0.55)', 'rgba(10,29,28,0.92)']} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Crown size={16} color={Palette.gold} strokeWidth={2} />
          <Txt variant="overline" tone="gold">{isPremium ? 'Premium member' : 'Elory Premium'}</Txt>
        </View>
        <Txt variant="title1" tone="inverse" style={{ marginTop: 10 }}>{isPremium ? 'Your Atelier' : 'Go deeper with Atelier'}</Txt>
        <Txt variant="footnote" tone="inverse2" style={{ marginTop: 6, maxWidth: 280 }}>
          Ask Elory, interaction maps, timing protocols and a weekly evidence brief — built around your stack.
        </Txt>
        <View style={styles.premiumCta}>
          <Txt variant="footnoteStrong" tone="inverse">{isPremium ? 'Open' : 'See plans'}</Txt>
          <ChevronRight size={16} color={Palette.nightInk} />
        </View>
      </PressableScale>

      {/* Health profile */}
      <Section title="Health profile" action="Edit" onAction={() => router.push('/health/edit-profile' as never)}>
        <Card padding={18}>
          {goals.length || focus.length ? (
            <>
              {goals.length ? <TagBlock title="Goals" items={goals} /> : null}
              {focus.length ? <TagBlock title="Focus areas" items={focus} /> : null}
              {concerns.length ? <TagBlock title="Health context" items={concerns} /> : null}
            </>
          ) : (
            <>
              <Txt variant="headline">Personalise your analysis</Txt>
              <Txt variant="footnote" tone="secondary" style={{ marginTop: 4 }}>Tell Elory your goals and concerns so every product is scored for you.</Txt>
              <Button label="Set up profile" size="md" variant="secondary" style={{ marginTop: 14 }} onPress={() => router.push('/health/edit-profile' as never)} />
            </>
          )}
        </Card>
        <ListGroup style={{ marginTop: 12 }}>
          <ListRow icon={Grid2x2} title="Longevity domains" subtitle="Skin, sleep, gut, hormonal, hair and fitness" onPress={() => router.push('/domains' as never)} />
          <ListRow icon={History} title="History" subtitle="Everything you’ve scanned and searched" onPress={() => router.push('/(tabs)/history' as never)} />
          <ListRow icon={BookOpen} title="Journal" onPress={() => router.push('/(tabs)/journal' as never)} />
        </ListGroup>
      </Section>

      {TESTER_MODE ? (
        <Section title="Beta">
          <ListGroup>
            <ListRow icon={MessageSquareHeart} title="Send feedback" subtitle="What’s confusing, broken or missing?" onPress={() => feedback.current?.present()} />
          </ListGroup>
        </Section>
      ) : null}

      <Section title="Settings">
        <ListGroup>
          <ListRow icon={CircleUserRound} title="Account" onPress={() => router.push('/settings/account' as never)} />
          <ListRow icon={Crown} title="Subscription" value={isPremium ? 'Premium' : 'Free'} onPress={() => router.push('/settings/subscription' as never)} />
          <ListRow icon={Bell} title="Notifications" onPress={() => router.push('/settings/notifications' as never)} />
          <ListRow icon={KeyRound} title="Permissions" onPress={() => router.push('/settings/permissions' as never)} />
          <ListRow icon={ShieldCheck} title="Privacy & data" onPress={() => router.push('/settings/privacy' as never)} />
          <ListRow icon={Info} title="About Elory" subtitle="Our evidence standards" onPress={() => router.push('/settings/about' as never)} />
        </ListGroup>
      </Section>

      <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 28 }}>Elory · Evidence over opinion</Txt>
      <FeedbackSheet ref={feedback} />
    </Screen>
  );
}

function TagBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <SlidersHorizontal size={13} color={Palette.ink3} />
        <Txt variant="overline" tone="secondary">{title}</Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {items.map((g) => (
          <View key={g} style={styles.tag}><Txt variant="footnoteStrong" tone="accent">{label(g)}</Txt></View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 88, height: 88, borderRadius: 44, overflow: 'hidden', backgroundColor: Palette.accentSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: Palette.surface },
  premium: { marginTop: 24, borderRadius: Radius.xxl, borderCurve: 'continuous', overflow: 'hidden', padding: 22, backgroundColor: Palette.night },
  premiumCta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 16, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: 'rgba(244,241,234,0.14)' },
  tag: { paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: Palette.accentSoft },
});
