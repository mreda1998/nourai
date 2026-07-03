import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { api } from '@/services/api';
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';
import { useAppState } from '@/context/app-state';
import { useAuth } from '@/context/auth-context';
import { DOMAINS, computeRadarScores } from '@/constants/domains';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const PROMPTS = [
  'Why did my sleep score drop this week?',
  'Can I take ashwagandha with SSRIs?',
  'Walk me through my current stack synergies.',
];

export default function AskEloryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { stack, meals } = useAppState();
  const { onboardingProfile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const stackContext = useMemo(() => {
    const allProducts = [...stack, ...meals];
    const scores = computeRadarScores(allProducts);
    return {
      products: allProducts.map((p) => ({
        name: p.name,
        brand: p.brand,
        category: p.category,
        grade: p.grade,
        ingredients: p.ingredients,
      })),
      domain_scores: Object.fromEntries(
        DOMAINS.map((domain, index) => [domain, scores[index] ?? 50]),
      ),
      goals: onboardingProfile?.goals ?? [],
    };
  }, [stack, meals, onboardingProfile?.goals]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await api.getChatHistory(token, 50, 0);
      setMessages(res.messages.map(m => ({ id: m.id, role: m.role, content: m.content })));
    } catch {
      // Non-fatal — show empty state
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const token = await getToken();
      if (!token) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sign in to use Ask Elory. Your local stack can be previewed in the other tools, but chat needs a synced account so answers can use your saved stack and history.',
        };
        setMessages(prev => [...prev, assistantMsg]);
        return;
      }
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const res = await api.sendChatMessage(token, history, stackContext);
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: res.message };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleNewConversation() {
    try {
      const token = await getToken();
      if (!token) return;
      await api.deleteChatHistory(token);
      setMessages([]);
    } catch {
      // Non-fatal
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top + scale(12), paddingHorizontal: scale(24), paddingBottom: scale(20) }}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(241,237,228,0.6)" strokeWidth={2}>
              <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={handleNewConversation}>
              <Text style={styles.newConvoBtn}>New</Text>
            </Pressable>
            <View style={styles.atelierBadge}>
              <Text style={styles.atelierBadgeText}>◆ Atelier</Text>
            </View>
          </View>
        </View>
        <Text style={styles.eyebrow}>Premium · Conversational</Text>
        <Text style={styles.title}>Ask Elory.</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(100) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading && (
          <ActivityIndicator color={Colors.sand} style={{ marginVertical: scale(24) }} />
        )}

        {/* Suggested prompts — only when no history */}
        {!loading && messages.length === 0 && (
          <Animated.View entering={FadeInUp.duration(320)} style={{ gap: scale(8), marginBottom: scale(24) }}>
            {PROMPTS.map((p, i) => (
              <Pressable key={i} style={styles.promptCard} onPress={() => setInput(p)}>
                <Text style={styles.promptText}>— {p}</Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Message thread */}
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <Animated.View key={msg.id} entering={FadeInUp.duration(200)}>
              <Text style={styles.msgTimestamp}>You</Text>
              <Text style={styles.userMsg}>{msg.content}</Text>
              <View style={styles.msgDivider} />
            </Animated.View>
          ) : (
            <Animated.View key={msg.id} entering={FadeInUp.duration(200)} style={{ gap: scale(10), marginBottom: scale(20) }}>
              <View style={styles.eloryMeta}>
                <View style={styles.eloryAvatar}>
                  <Text style={styles.eloryAvatarText}>E</Text>
                </View>
                <Text style={styles.eloryLabel}>Elory</Text>
              </View>
              <Text style={styles.eloryText}>{msg.content}</Text>
            </Animated.View>
          )
        )}

        {sending && (
          <View style={styles.eloryMeta}>
            <View style={styles.eloryAvatar}>
              <Text style={styles.eloryAvatarText}>E</Text>
            </View>
            <ActivityIndicator size="small" color={Colors.sand} />
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + scale(12) }]}>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            placeholder="Ask about your stack…"
            placeholderTextColor="rgba(241,237,228,0.3)"
            value={input}
            onChangeText={setInput}
            multiline
            onSubmitEditing={handleSend}
          />
          <Pressable style={[styles.sendBtn, sending && { opacity: 0.5 }]} onPress={handleSend}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={Colors.darkSurface} strokeWidth={2}>
              <Path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.darkSurface },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(24) },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(241,237,228,0.6)' },
  newConvoBtn: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(241,237,228,0.4)' },
  atelierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(241,237,228,0.22)', borderRadius: 999 },
  atelierBadgeText: { fontFamily: Fonts.sansSemiBold, fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: Colors.sand },
  eyebrow: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.45)', marginBottom: scale(10) },
  title: { fontFamily: Fonts.serifItalic, fontSize: scale(40), lineHeight: scale(42), color: Colors.darkInk, letterSpacing: -0.5 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: scale(24), paddingTop: scale(4) },
  promptCard: { padding: scale(14), borderWidth: 1, borderColor: 'rgba(241,237,228,0.1)', borderRadius: Radius.md },
  promptText: { fontFamily: Fonts.serifItalic, fontSize: FontSizes.subtitle, color: 'rgba(241,237,228,0.8)', lineHeight: FontSizes.subtitle * 1.4 },
  msgTimestamp: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.4)', marginBottom: scale(8) },
  userMsg: { fontFamily: Fonts.serif, fontSize: FontSizes.title, lineHeight: FontSizes.title * 1.4, color: Colors.darkInk, paddingBottom: scale(16) },
  msgDivider: { height: 1, backgroundColor: 'rgba(241,237,228,0.1)', marginBottom: scale(20) },
  eloryMeta: { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(8) },
  eloryAvatar: { width: scale(22), height: scale(22), borderRadius: 999, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' },
  eloryAvatarText: { fontFamily: Fonts.serifItalic, fontSize: 12, color: Colors.darkSurface },
  eloryLabel: { fontFamily: Fonts.sansSemiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, color: 'rgba(241,237,228,0.4)' },
  eloryText: { fontFamily: Fonts.serif, fontSize: FontSizes.title, lineHeight: FontSizes.title * 1.5, color: Colors.darkInk, marginBottom: scale(20) },
  inputBar: { paddingHorizontal: scale(16), paddingTop: scale(8) },
  inputPill: { flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingLeft: scale(20), paddingRight: scale(6), paddingVertical: scale(6), borderRadius: 999, backgroundColor: 'rgba(241,237,228,0.08)', borderWidth: 1, borderColor: 'rgba(241,237,228,0.12)' },
  input: { flex: 1, fontFamily: Fonts.sans, fontSize: FontSizes.body, color: Colors.darkInk, maxHeight: scale(80), paddingVertical: scale(6) },
  sendBtn: { width: scale(36), height: scale(36), borderRadius: 999, backgroundColor: Colors.sand, alignItems: 'center', justifyContent: 'center' },
});
