import { useState } from 'react';
import {
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
import { Colors, Fonts, FontSizes, scale, Radius } from '@/constants/theme';
import { PremiumLock } from '@/components/elory';

const PROMPTS = [
  'Does my morning stack have any timing conflicts?',
  'What does the evidence say about creatine for cognitive function?',
  'Am I getting enough omega-3 from my current stack?',
];

const MOCK_MESSAGES = [
  {
    role: 'user',
    text: 'Does my morning stack have any timing conflicts?',
  },
  {
    role: 'elory',
    text: 'Looking at your morning stack, there\'s one interaction worth noting. Your magnesium and zinc are competing for absorption — both rely on the same transporter. Taking them together reduces bioavailability of both by roughly 30–40%.',
    citation: 'Solomons et al., Am J Clin Nutr (1983)',
  },
];

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.darkInk} strokeWidth={2}>
      <Path d="M19 12H5M12 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [input, setInput] = useState('');

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + scale(8) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <BackIcon />
        </Pressable>
        <Text style={styles.headerTitle}>Ask Elory.</Text>
        <View style={{ width: scale(36) }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(80) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Suggested prompts */}
        <Animated.View entering={FadeInUp.duration(350)} style={styles.promptsSection}>
          <Text style={styles.promptsLabel}>Suggested questions</Text>
          {PROMPTS.map((p, i) => (
            <Pressable key={i} style={styles.promptCard} onPress={() => setInput(p)}>
              <Text style={styles.promptText}>{p}</Text>
            </Pressable>
          ))}
        </Animated.View>

        {/* Mock conversation */}
        {MOCK_MESSAGES.map((msg, i) => (
          <Animated.View key={i} entering={FadeInUp.delay(i * 80).duration(350)}>
            {msg.role === 'user' ? (
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{msg.text}</Text>
              </View>
            ) : (
              <View style={styles.eloryBubble}>
                <Text style={styles.eloryText}>{msg.text}</Text>
                {msg.citation && (
                  <View style={styles.citation}>
                    <Text style={styles.citationText}>{msg.citation}</Text>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        ))}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + scale(8) }]}>
        <TextInput
          style={styles.input}
          placeholder="Ask about your stack…"
          placeholderTextColor="rgba(241,237,228,0.35)"
          value={input}
          onChangeText={setInput}
          multiline
        />
        <Pressable style={styles.sendBtn}>
          <Text style={styles.sendBtnText}>→</Text>
        </Pressable>
      </View>

      <PremiumLock featureName="Ask Elory" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkSurface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(24),
    paddingBottom: scale(12),
  },
  backBtn: {
    width: scale(36),
    height: scale(36),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.title,
    color: Colors.darkInk,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(8),
    gap: scale(12),
  },
  promptsSection: {
    marginBottom: scale(8),
  },
  promptsLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(241,237,228,0.4)',
    marginBottom: scale(12),
  },
  promptCard: {
    borderWidth: 1,
    borderColor: 'rgba(241,237,228,0.15)',
    borderRadius: Radius.md,
    padding: scale(14),
    marginBottom: scale(8),
  },
  promptText: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.subtitle,
    color: 'rgba(241,237,228,0.8)',
    lineHeight: FontSizes.subtitle * 1.4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.sand,
    borderRadius: Radius.md,
    borderBottomRightRadius: 4,
    padding: scale(12),
    maxWidth: '78%',
  },
  userText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.darkSurface,
    lineHeight: FontSizes.body * 1.5,
  },
  eloryBubble: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    gap: scale(8),
  },
  eloryText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.darkInk,
    lineHeight: FontSizes.body * 1.6,
  },
  citation: {
    borderLeftWidth: 2,
    borderLeftColor: Colors.sand,
    paddingLeft: scale(10),
  },
  citationText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: 'rgba(241,237,228,0.4)',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: scale(8),
    paddingHorizontal: scale(16),
    paddingTop: scale(8),
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,237,228,0.1)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(241,237,228,0.08)',
    borderRadius: Radius.pill,
    paddingHorizontal: scale(16),
    paddingVertical: scale(10),
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.darkInk,
    maxHeight: scale(100),
  },
  sendBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: Colors.sand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.subtitle,
    color: Colors.darkSurface,
  },
});
