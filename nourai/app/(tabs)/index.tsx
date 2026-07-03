import React from 'react';
import { useRouter } from 'expo-router';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  SafeAreaView,
} from 'react-native';

import { Colors, Fonts, Radius, FontSizes } from '@/constants/theme';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import {
  Eyebrow,
  SerifH,
  SectionHead,
} from '@/components/elory';

// ─── Grade → pill tag ─────────────────────────────────────────────────────────

function gradeTag(grade: string): { label: string; bg: string; color: string } {
  switch (grade) {
    case 'A': return { label: 'Clean', bg: 'rgba(123,174,142,0.18)', color: '#3d7a55' };
    case 'B': return { label: 'Good',  bg: 'rgba(123,174,142,0.18)', color: '#3d7a55' };
    case 'C': return { label: 'Review', bg: 'rgba(232,213,176,0.55)', color: '#8a7050' };
    case 'D': return { label: 'Watch', bg: 'rgba(196,101,74,0.14)',   color: Colors.alert };
    default:  return { label: grade,   bg: Colors.surfaceCard,        color: Colors.inkSecondary };
  }
}

const CATEGORY_COLOR: Record<string, string> = {
  supplement: Colors.sage,
  food: Colors.accent,
  cosmetic: Colors.alert,
  otc: '#8a7050',
};

const WORTH_SCANNING = [
  {
    id: 'w1',
    name: 'CeraVe AM Moisturizer SPF 30',
    reason: 'Niacinamide + retinol combo found in many routines — worth checking interactions',
    imageUri: null as string | null,
    thumbBg: 'rgba(123,174,142,0.18)',
    thumbEmoji: '🧴',
  },
  {
    id: 'w2',
    name: 'AG1 Athletic Greens',
    reason: '72 ingredients — a case study in cumulative dosing complexity',
    imageUri: null as string | null,
    thumbBg: 'rgba(232,213,176,0.55)',
    thumbEmoji: '🌿',
  },
];

function stackSignal(stack: { grade: string; name: string }[]): { text: string; highlight: string | null } | null {
  if (stack.length === 0) return null;
  const dItems = stack.filter((p) => p.grade === 'D');
  if (dItems.length > 0) {
    return {
      text: `${dItems.length} product${dItems.length > 1 ? 's' : ''} in your stack ${dItems.length > 1 ? 'contain' : 'contains'} flagged ingredients.`,
      highlight: dItems[0].name,
    };
  }
  const cItems = stack.filter((p) => p.grade === 'C');
  if (cItems.length > 0) {
    return {
      text: `${cItems.length} product${cItems.length > 1 ? 's' : ''} in your stack warrant a closer look.`,
      highlight: cItems[0].name,
    };
  }
  return {
    text: `Your current stack looks clean across all ${stack.length} product${stack.length > 1 ? 's' : ''} scanned.`,
    highlight: null,
  };
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const { stack } = useAppState();
  const { user } = useAuth();

  const userName = user?.name?.split(' ')[0] ?? 'you';
  const userInitial = (user?.name?.charAt(0) ?? 'E').toUpperCase();

  const displayStack = stack.slice(0, 6).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    grade: p.grade,
    imageUri: p.imageUri ?? null,
  }));

  const signal = stackSignal(stack);

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
            <Text style={{ fontFamily: Fonts.serifItalic, fontSize: 15, color: Colors.ink }}>
              {userInitial}
            </Text>
          </Pressable>
        </View>

        {/* ── Stack signal hero card ────────────────────────────────────────── */}
        {signal ? (
          <View style={{ marginHorizontal: 20, marginBottom: 28 }}>
            <Pressable
              onPress={() => router.push('/(premium)/exposure' as any)}
              style={{
                backgroundColor: Colors.accent,
                borderRadius: Radius.lg,
                paddingHorizontal: 24,
                paddingTop: 28,
                paddingBottom: 20,
                overflow: 'hidden',
              }}
            >
              <Eyebrow style={{ color: 'rgba(241,237,228,0.55)', marginBottom: 10 }}>
                Stack signal
              </Eyebrow>
              <Text
                style={{
                  fontFamily: Fonts.serifItalic,
                  fontSize: 22,
                  lineHeight: 30,
                  color: Colors.accentInk,
                  marginBottom: 14,
                }}
              >
                {signal.highlight ? (
                  <>
                    <Text style={{ color: Colors.sand }}>{signal.highlight}</Text>
                    {' — '}
                  </>
                ) : null}
                {signal.text}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.sand }} />
                <Text
                  style={{
                    fontFamily: Fonts.sansSemiBold,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: 'rgba(241,237,228,0.6)',
                  }}
                >
                  View exposure breakdown
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {/* ── Active Stack ──────────────────────────────────────────────────── */}
        <View style={{ marginBottom: 28 }}>
          <View style={{ paddingHorizontal: 24, marginBottom: 10 }}>
            <SectionHead label="Your stack" right={displayStack.length > 0 ? 'See all' : undefined} />
          </View>
          {displayStack.length === 0 ? (
            <Pressable
              onPress={() => router.push('/(tabs)/scan' as any)}
              style={{
                marginHorizontal: 24,
                backgroundColor: Colors.surfaceCard,
                borderWidth: 0.5,
                borderColor: Colors.borderHairline,
                borderRadius: 14,
                paddingVertical: 20,
                paddingHorizontal: 16,
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontFamily: Fonts.serifItalic, fontSize: 16, color: Colors.inkSecondary }}>
                Scan your first product to get started
              </Text>
              <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: Colors.sage }}>
                Open scanner →
              </Text>
            </Pressable>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
            >
              {displayStack.map((item) => {
                const tag = gradeTag(item.grade);
                const catColor = CATEGORY_COLOR[item.category] ?? Colors.inkSecondary;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push('/(tabs)/stack' as any)}
                    style={{
                      backgroundColor: Colors.surfaceCard,
                      borderWidth: 0.5,
                      borderColor: Colors.borderHairline,
                      borderRadius: 12,
                      padding: 12,
                      width: 112,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: Fonts.sansSemiBold,
                        fontSize: 9,
                        textTransform: 'uppercase',
                        letterSpacing: 0.8,
                        color: catColor,
                        marginBottom: 3,
                      }}
                      numberOfLines={1}
                    >
                      {item.category}
                    </Text>
                    <Text
                      style={{
                        fontFamily: Fonts.sansMedium,
                        fontSize: 12,
                        color: Colors.ink,
                        lineHeight: 15,
                        marginBottom: 8,
                      }}
                      numberOfLines={2}
                    >
                      {item.name}
                    </Text>
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: tag.bg,
                        borderRadius: 999,
                        paddingVertical: 2,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text style={{ fontFamily: Fonts.sansSemiBold, fontSize: 9, color: tag.color }}>
                        {tag.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── Worth Scanning ────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 24 }}>
          <SectionHead label="Worth scanning" right="Curated by Elory" />
          <View style={{ gap: 8 }}>
            {WORTH_SCANNING.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push('/(tabs)/scan' as any)}
                style={{
                  backgroundColor: Colors.surfaceCard,
                  borderWidth: 0.5,
                  borderColor: Colors.borderHairline,
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {item.imageUri ? (
                  <Image
                    source={{ uri: item.imageUri }}
                    style={{ width: 44, height: 44, borderRadius: 10, resizeMode: 'contain' }}
                  />
                ) : (
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: item.thumbBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>{item.thumbEmoji}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: Fonts.sansMedium,
                      fontSize: 13,
                      color: Colors.ink,
                      marginBottom: 2,
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: Fonts.sans,
                      fontSize: FontSizes.caption,
                      color: Colors.inkSecondary,
                      lineHeight: 16,
                    }}
                    numberOfLines={2}
                  >
                    {item.reason}
                  </Text>
                </View>
                <Text style={{ fontSize: 18, color: Colors.inkSecondary, opacity: 0.5 }}>›</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
