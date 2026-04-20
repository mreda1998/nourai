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

// ─── Placeholder OnboardingScreen (will be replaced in Task 9) ───────────────

export default function OnboardingScreen() {
  return (
    <SafeAreaView style={s.screen}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: Fonts.serif, fontSize: 20, color: Colors.ink }}>
          Onboarding coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}
