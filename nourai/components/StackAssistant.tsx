/**
 * StackAssistant — Claude-powered chat modal for the Stack tab.
 *
 * Receives full stack context (products, domain scores, goals) and forwards
 * each message to POST /chat/message on the backend.
 */
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Colors,
  Fonts,
  FontSizes,
  Radius,
  scale,
  Spacing,
  verticalScale,
} from '@/constants/theme';
import { DOMAINS } from '@/constants/domains';
import { api, type ChatMessage } from '@/services/api';
import type { Product } from '@/context/app-state';

const SUGGESTED_PROMPTS = [
  "What's the biggest gap in my stack?",
  'Any ingredient overlaps I should watch?',
  'How well does my stack support my goals?',
  'What timing would you recommend?',
];

export function StackAssistant({
  visible,
  onClose,
  stack,
  radarScores,
  goals,
}: {
  visible: boolean;
  onClose: () => void;
  stack: Product[];
  radarScores: number[];
  goals: string[];
}) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const buildContext = useCallback(
    () => ({
      products: stack.map((p) => ({
        name: p.name,
        brand: p.brand,
        category: p.category,
        grade: p.grade,
        ingredients: p.ingredients,
      })),
      domain_scores: Object.fromEntries(
        DOMAINS.map((domain, i) => [domain, radarScores[i]])
      ),
      goals,
    }),
    [stack, radarScores, goals]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput('');
      setLoading(true);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        const { message } = await api.chatMessage({
          messages: next,
          stack_context: buildContext(),
        });
        setMessages((prev) => [...prev, { role: 'assistant', content: message }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: "I'm having trouble connecting right now. Please try again.",
          },
        ]);
      } finally {
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [messages, loading, buildContext]
  );

  const handleClose = useCallback(() => {
    setMessages([]);
    setInput('');
    onClose();
  }, [onClose]);

  const isEmpty = messages.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerOverline}>Powered by Claude</Text>
            <Text style={styles.headerTitle}>Stack Assistant</Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={12}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* ── Message list ─────────────────────────────────────────────── */}
          <ScrollView
            ref={scrollRef}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              isEmpty && styles.listContentEmpty,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
          >
            {isEmpty ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Ask about your stack</Text>
                <Text style={styles.emptyBody}>
                  I have full context on your products, ingredients, and bio-domain scores.
                </Text>
                <View style={styles.chips}>
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <Pressable
                      key={prompt}
                      style={styles.chip}
                      onPress={() => send(prompt)}
                    >
                      <Text style={styles.chipText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <View
                    key={i}
                    style={[
                      styles.bubble,
                      msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                    ]}
                  >
                    {msg.role === 'assistant' && (
                      <Text style={styles.bubbleLabel}>Elory</Text>
                    )}
                    <Text
                      style={[
                        styles.bubbleText,
                        msg.role === 'user'
                          ? styles.bubbleTextUser
                          : styles.bubbleTextAssistant,
                      ]}
                    >
                      {msg.content}
                    </Text>
                  </View>
                ))}
                {loading && (
                  <View style={[styles.bubble, styles.bubbleAssistant, styles.bubbleTyping]}>
                    <ActivityIndicator size="small" color={Colors.inkSecondary} />
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* ── Input bar ────────────────────────────────────────────────── */}
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about your stack…"
              placeholderTextColor={Colors.inkTertiary}
              multiline
              blurOnSubmit
              returnKeyType="send"
              onSubmitEditing={() => send(input)}
            />
            <Pressable
              style={[
                styles.sendBtn,
                (!input.trim() || loading) && styles.sendBtnDisabled,
              ]}
              onPress={() => send(input)}
              disabled={!input.trim() || loading}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  container: {
    flex: 1,
    backgroundColor: Colors.bone,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  headerOverline: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkTertiary,
    marginBottom: scale(3),
  },
  headerTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
  },
  closeBtn: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(16),
    backgroundColor: Colors.boneDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },

  // Message list
  list: { flex: 1 },
  listContent: {
    padding: scale(20),
    gap: Spacing.sm,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // Empty / suggested prompts
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptyBody: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    textAlign: 'center',
    lineHeight: FontSizes.body * 1.6,
    marginBottom: Spacing.xl,
  },
  chips: {
    width: '100%',
    gap: Spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.boneCard,
  },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },

  // Bubbles
  bubble: {
    maxWidth: '82%',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.ink,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
  },
  bubbleTyping: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  bubbleLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.inkTertiary,
    marginBottom: scale(4),
  },
  bubbleText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    lineHeight: FontSizes.body * 1.6,
  },
  bubbleTextUser: {
    color: Colors.bone,
  },
  bubbleTextAssistant: {
    color: Colors.ink,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: scale(20),
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderHairline,
    backgroundColor: Colors.bone,
  },
  input: {
    flex: 1,
    minHeight: verticalScale(44),
    maxHeight: verticalScale(120),
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  sendBtn: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.boneDark,
  },
  sendBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.bodyLarge,
    color: Colors.bone,
  },
});
