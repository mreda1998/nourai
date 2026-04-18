import React from 'react';
import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  SafeAreaView,
} from 'react-native';

import { Colors, Fonts, Radius, FontSizes, scale } from '@/constants/theme';
import { useAppState } from '@/context/app-state';
import {
  Eyebrow,
  SerifH,
  EvidenceSpectrum,
  Tag,
  ProductThumb,
  SectionHead,
} from '@/components/elory';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeToScore(grade: string): number {
  switch (grade) {
    case 'A': return 95;
    case 'B': return 80;
    case 'C': return 60;
    case 'D': return 35;
    default: return 50;
  }
}

const STACK_THUMB_COLORS: Array<'sand' | 'sage' | 'dark' | 'default'> = [
  'sand', 'sage', 'dark', 'default', 'sand',
];

// ─── Placeholder ingredient cloud data ───────────────────────────────────────

const KNOWN_INGREDIENTS = [
  { key: 'magnesium', label: 'Magnesium glycinate', flagged: false },
  { key: 'omega3',   label: 'Omega-3 EPA/DHA',     flagged: false },
  { key: 'vitD',     label: 'Vitamin D₃',           flagged: false },
  { key: 'ashwag',   label: 'Ashwagandha',           flagged: false },
  { key: 'sodium-b', label: 'Sodium benzoate',       flagged: true  },
  { key: 'creatine', label: 'Creatine monohydrate',  flagged: false },
  { key: 'parabenm', label: 'Methylparaben',         flagged: true  },
];

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { hasScannedBefore, stack, meals } = useAppState();

  // Weight each item by its onset ramp so newly-added supplements don't
  // inflate the score before they've had time to accumulate in the body.
  const ONSET_DAYS: Record<string, number> = { food: 1, supplement: 14, cosmetic: 28, otc: 7 };
  const allItems = [...stack, ...meals];
  const compositeScore =
    allItems.length === 0
      ? 0
      : Math.round(
          allItems.reduce((sum, p) => {
            const onset = ONSET_DAYS[p.category] ?? 7;
            const days = (Date.now() - new Date(p.scannedAt).getTime()) / 86_400_000;
            const w = Math.min(days / onset, 1);
            return sum + gradeToScore(p.grade) * w;
          }, 0) /
            allItems.reduce((sum, p) => {
              const onset = ONSET_DAYS[p.category] ?? 7;
              const days = (Date.now() - new Date(p.scannedAt).getTime()) / 86_400_000;
              return sum + Math.min(days / onset, 1);
            }, 0)
        );

  // Derive a user name initial from the stack (placeholder)
  const userName = hasScannedBefore ? 'you' : 'you';
  const userInitial = 'E';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header row ───────────────────────────────────────────────────── */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 28,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <View>
            <Eyebrow style={{ marginBottom: 4 }}>Good morning, {userName}</Eyebrow>
            <SerifH size={32} italic>Elory.</SerifH>
          </View>

          {/* Avatar button */}
          <Pressable
            onPress={() => router.push('/profile-hub')}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              backgroundColor: Colors.sand,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: Fonts.serifItalic,
                fontSize: 15,
                color: Colors.ink,
              }}
            >
              {userInitial}
            </Text>
          </Pressable>
        </View>

        {/* ── Teal hero card ────────────────────────────────────────────────── */}
        <View style={{ marginHorizontal: 20, marginBottom: 28 }}>
          <View
            style={{
              backgroundColor: Colors.accent,
              borderTopLeftRadius: 120,
              borderTopRightRadius: 120,
              borderBottomLeftRadius: Radius.lg,
              borderBottomRightRadius: Radius.lg,
              padding: 28,
              paddingTop: 40,
              overflow: 'hidden',
            }}
          >
            {/* Radial glow overlay */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.08,
                backgroundColor: Colors.sand,
                borderRadius: 999,
              }}
            />
            <Eyebrow style={{ color: 'rgba(241,237,228,0.7)', marginBottom: 16 }}>
              This evening
            </Eyebrow>
            <Text
              style={{
                fontFamily: Fonts.serifItalic,
                fontSize: 24,
                lineHeight: 30,
                color: Colors.accentInk,
                marginBottom: 20,
              }}
            >
              Your magnesium glycinate lands best about 90 minutes before you dim the lights.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: Colors.sand,
                }}
              />
              <Text
                style={{
                  fontFamily: Fonts.sansSemiBold,
                  fontSize: 11,
                  letterSpacing: 1.0,
                  textTransform: 'uppercase',
                  color: 'rgba(241,237,228,0.65)',
                }}
              >
                Based on 4 studies · Read brief
              </Text>
            </View>
          </View>
        </View>

        {/* ── Active Stack section ──────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 24, marginBottom: 32 }}>
          <SectionHead label="Active Stack" right="5 items" />

          {/* 5-column thumbnail grid */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            {STACK_THUMB_COLORS.map((color, i) => (
              <Pressable
                key={i}
                onPress={() => router.push('/(tabs)/stack' as any)}
              >
                <ProductThumb
                  color={color}
                  letter={String.fromCharCode(65 + i)}
                  size={48}
                />
              </Pressable>
            ))}
          </View>

          {/* Stack meta row */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderTopColor: Colors.borderHairline,
              paddingTop: 10,
            }}
          >
            <Text
              style={{
                fontFamily: Fonts.sans,
                fontSize: 11,
                color: Colors.inkSecondary,
              }}
            >
              4 supplements · 1 topical
            </Text>
            <Text
              style={{
                fontFamily: Fonts.sansSemiBold,
                fontSize: 11,
                color: Colors.accent,
              }}
            >
              2 synergies active
            </Text>
          </View>
        </View>

        {/* ── Recent Scans section ──────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 24, marginBottom: 32 }}>
          <SectionHead label="Recent scans" right="View all" />

          {stack.length === 0 ? (
            <Text
              style={{
                fontFamily: Fonts.serifItalic,
                fontSize: FontSizes.bodyLarge,
                color: Colors.inkSecondary,
                lineHeight: FontSizes.bodyLarge * 1.6,
                paddingVertical: 12,
              }}
            >
              Scan your first product to see it here.
            </Text>
          ) : (
            <View style={{ gap: 16 }}>
              {stack.slice(0, 4).map((product, i) => (
                <Pressable
                  key={product.id}
                  onPress={() => router.push(`/product/${product.id}` as any)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
                >
                  <ProductThumb
                    color={STACK_THUMB_COLORS[i % STACK_THUMB_COLORS.length]}
                    letter={product.name.charAt(0).toUpperCase()}
                    size={44}
                  />
                  <View style={{ flex: 1 }}>
                    <Eyebrow style={{ marginBottom: 2 }}>{product.brand}</Eyebrow>
                    <Text
                      style={{
                        fontFamily: Fonts.serif,
                        fontSize: 18,
                        color: Colors.ink,
                        lineHeight: 22,
                        marginBottom: 6,
                      }}
                      numberOfLines={1}
                    >
                      {product.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <EvidenceSpectrum
                        strength={product.grade === 'A' ? 4 : product.grade === 'B' ? 3 : product.grade === 'C' ? 2 : 1}
                      />
                      <Tag tone={product.grade === 'A' ? 'sage' : product.grade === 'D' ? 'alert' : 'default'}>
                        Grade {product.grade}
                      </Tag>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Known Today ingredient cloud ──────────────────────────────────── */}
        <View style={{ paddingHorizontal: 24 }}>
          <SectionHead label="Known to you today" />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {KNOWN_INGREDIENTS.map((ing) => (
              <Pressable
                key={ing.key}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: Radius.pill,
                  borderLeftWidth: ing.flagged ? 2 : 1,
                  borderWidth: 1,
                  borderColor: ing.flagged ? Colors.alert : Colors.borderHairline,
                  backgroundColor: Colors.surfaceCard,
                }}
              >
                <Text
                  style={{
                    fontFamily: Fonts.sans,
                    fontSize: FontSizes.caption,
                    color: ing.flagged ? Colors.alert : Colors.ink,
                  }}
                >
                  {ing.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
