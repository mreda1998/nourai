import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { ArrowUp, ArrowUpRight, Sparkles, SquarePen, X } from 'lucide-react-native';
import { api } from '@/services/api';
import { accessToken } from '@/lib/stack-sync';
import { Fonts, Palette, Radius } from '@/constants/theme';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { IconButton, PressableScale, Txt } from '@/components/ui';

interface Message { id: string; role: 'user' | 'assistant'; content: string }

function suggestions(stackNames: string[]) {
  const first = stackNames[0];
  return [
    first ? `Is ${first} worth taking?` : 'What should I look for in a magnesium supplement?',
    stackNames.length > 1 ? 'Do any of my products conflict?' : 'Is creatine safe to take every day?',
    'What’s the best time of day to take my stack?',
  ];
}

export default function AskEloryScreen() {
  const insets = useSafeAreaInsets();
  const { stack, meals } = useAppState();
  const { onboardingProfile, isSignedIn } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const context = useMemo(() => {
    const all = [...stack, ...meals];
    return {
      products: all.map((p) => ({ name: p.name, brand: p.brand, category: p.category, grade: p.grade, ingredients: p.ingredients })),
      goals: onboardingProfile?.goals ?? [],
    };
  }, [stack, meals, onboardingProfile?.goals]);

  useEffect(() => {
    (async () => {
      try {
        const token = await accessToken();
        if (!token) return;
        const res = await api.getChatHistory(token, 50, 0);
        setMessages(res.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })));
      } catch { /* start fresh */ }
    })();
  }, []);

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60); }, [messages.length, sending]);

  const send = async (text = input.trim()) => {
    if (!text || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    const userMsg: Message = { id: `${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const token = await accessToken();
      if (!token) {
        setMessages((prev) => [...prev, { id: `${Date.now()}a`, role: 'assistant', content: 'Sign in to chat with Elory — answers use your saved stack and history, so they need an account.' }]);
        return;
      }
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const res = await api.sendChatMessage(token, history, context);
      setMessages((prev) => [...prev, { id: `${Date.now()}a`, role: 'assistant', content: res.message }]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    setMessages([]);
    try { const t = await accessToken(); if (t) await api.deleteChatHistory(t); } catch { /* non-fatal */ }
  };

  const empty = messages.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: Palette.canvas }}>
      <LinearGradient
        colors={['rgba(15,86,82,0)', 'rgba(15,86,82,0.10)', 'rgba(201,164,101,0.16)']}
        locations={[0.45, 0.8, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <IconButton icon={X} label="Close" onPress={() => router.back()} />
        <View style={{ alignItems: 'center' }}>
          <Txt variant="headline">Ask Elory</Txt>
          <Txt variant="caption" tone="tertiary">{stack.length ? `Knows your ${stack.length} product${stack.length === 1 ? '' : 's'}` : 'Evidence-based answers'}</Txt>
        </View>
        <IconButton icon={SquarePen} label="New conversation" onPress={reset} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, paddingBottom: 24, flexGrow: 1 }} keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
          {empty ? (
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', marginBottom: 32 }}>
                <Orb />
                <Txt variant="largeTitle" align="center" style={{ marginTop: 24 }}>What would you{'\n'}like to know?</Txt>
                <Txt variant="subhead" tone="secondary" align="center" style={{ marginTop: 10, maxWidth: 300 }}>
                  Ask about ingredients, timing, interactions or your stack. Answers cite the evidence.
                </Txt>
              </Animated.View>
              <View style={{ gap: 10 }}>
                {suggestions(stack.map((s) => s.name)).map((s, i) => (
                  <Animated.View key={s} entering={FadeInUp.duration(500).delay(200 + i * 90)}>
                    <PressableScale onPress={() => send(s)} style={styles.suggestion} accessibilityLabel={s}>
                      <Txt variant="callout" style={{ flex: 1 }}>{s}</Txt>
                      <ArrowUpRight size={18} color={Palette.ink3} />
                    </PressableScale>
                  </Animated.View>
                ))}
              </View>
              {!isSignedIn ? <Txt variant="footnote" tone="tertiary" align="center" style={{ marginTop: 16 }}>Sign in required to send messages.</Txt> : null}
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {messages.map((m) => m.role === 'user' ? (
                <Animated.View key={m.id} entering={FadeInDown.duration(300)} style={styles.userBubble}>
                  <Txt variant="callout" tone="inverse">{m.content}</Txt>
                </Animated.View>
              ) : (
                <Animated.View key={m.id} entering={FadeIn.duration(400)} style={styles.assistant}>
                  <View style={styles.assistantHead}>
                    <View style={styles.mark}><Sparkles size={12} color={Palette.onAccent} strokeWidth={2.4} /></View>
                    <Txt variant="footnoteStrong" tone="accent">Elory</Txt>
                  </View>
                  <Txt variant="body" selectable>{m.content}</Txt>
                </Animated.View>
              ))}
              {sending ? <Typing /> : null}
            </View>
          )}
        </ScrollView>

        <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.composer}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask anything…"
              placeholderTextColor={Palette.ink3}
              style={styles.input}
              multiline
              maxLength={2000}
            />
            <PressableScale
              onPress={() => send()}
              disabled={!input.trim() || sending}
              accessibilityLabel="Send"
              pressedScale={0.88}
              style={[styles.send, { backgroundColor: input.trim() ? Palette.accent : Palette.ink4 }]}
            >
              <ArrowUp size={19} color={Palette.onAccent} strokeWidth={2.6} />
            </PressableScale>
          </View>
          <Txt variant="caption" tone="tertiary" align="center" style={{ marginTop: 8 }}>Not medical advice. Check with a clinician before changing treatment.</Txt>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Orb() {
  const s = useSharedValue(1);
  useEffect(() => { s.value = withRepeat(withSequence(withTiming(1.08, { duration: 1600 }), withTiming(1, { duration: 1600 })), -1); }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[{ width: 76, height: 76, borderRadius: 38, overflow: 'hidden' }, style]}>
      <LinearGradient colors={[Palette.accent, '#4E9A86', Palette.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Sparkles size={30} color={Palette.onAccent} strokeWidth={1.8} />
      </LinearGradient>
    </Animated.View>
  );
}

function Typing() {
  return (
    <View style={[styles.assistant, { flexDirection: 'row', gap: 6, alignSelf: 'flex-start', paddingVertical: 16 }]} accessibilityLabel="Elory is typing">
      {[0, 1, 2].map((i) => <Dot key={i} delay={i * 160} />)}
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const o = useSharedValue(0.3);
  useEffect(() => { o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.3, { duration: 380 })), -1)); }, []);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: Palette.accent }, style]} />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderRadius: Radius.xl, borderCurve: 'continuous', backgroundColor: 'rgba(252,251,248,0.9)', borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.hairline },
  userBubble: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: Palette.accent, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, borderBottomRightRadius: 6, borderCurve: 'continuous' },
  assistant: { alignSelf: 'stretch', backgroundColor: Palette.surface, padding: 16, borderRadius: 22, borderBottomLeftRadius: 6, borderCurve: 'continuous', borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.hairline },
  assistantHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  mark: { width: 20, height: 20, borderRadius: 10, backgroundColor: Palette.accent, alignItems: 'center', justifyContent: 'center' },
  composerWrap: { paddingHorizontal: 16, paddingTop: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, minHeight: 54, borderRadius: 27, backgroundColor: Palette.surface, paddingLeft: 18, paddingRight: 7, paddingVertical: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: Palette.hairline, shadowColor: '#0A1D1C', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  input: { flex: 1, fontFamily: Fonts.sans, fontSize: 17, color: Palette.ink, maxHeight: 120, paddingTop: 9, paddingBottom: 9 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
