import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import * as Haptics from 'expo-haptics';

import { Colors, Fonts, FontSizes, Radius, scale, Spacing, verticalScale } from '@/constants/theme';
import { api } from '@/services/api';
import type { RecognizedFood } from '@/services/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (foods: RecognizedFood[]) => void;
}

export function MealInputSheet({ visible, onClose, onConfirm }: Props) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [recognized, setRecognized] = useState<RecognizedFood[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const handleAnalyze = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    setRecognized(null);
    try {
      const result = await api.analyzeMeal({ description: trimmed });
      setRecognized(result.foods);
    } catch {
      setError('Could not analyze — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!recognized) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm(recognized);
    handleClose();
  };

  const handleClose = () => {
    setText('');
    setRecognized(null);
    setError(null);
    setLoading(false);
    onClose();
  };

  const confidenceLabel = (c: number) => {
    if (c >= 0.8) return 'High';
    if (c >= 0.5) return 'Medium';
    return 'Low';
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Log Today's Intake</Text>
            <Pressable onPress={handleClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Describe what you ate or took today — be as specific as you like.
          </Text>

          {/* Input */}
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="e.g. salmon poke bowl, chicken shawarma, espresso, fish oil capsule"
            placeholderTextColor={Colors.inkTertiary}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            returnKeyType="done"
            blurOnSubmit
          />

          {/* Analyze button */}
          {!recognized && (
            <Pressable
              style={[styles.analyzeBtn, (!text.trim() || loading) && styles.analyzeBtnDisabled]}
              onPress={handleAnalyze}
              disabled={!text.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.bone} />
              ) : (
                <Text style={styles.analyzeBtnText}>Analyze</Text>
              )}
            </Pressable>
          )}

          {/* Error */}
          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {/* Results */}
          {recognized && (
            <>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsLabel}>Recognized</Text>
                <Pressable onPress={() => { setRecognized(null); setText(''); }}>
                  <Text style={styles.retryBtn}>Try again</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.resultsList} showsVerticalScrollIndicator={false}>
                {recognized.map((food, i) => (
                  <View
                    key={`${food.name}-${i}`}
                    style={[styles.foodRow, i < recognized.length - 1 && styles.foodRowBorder]}
                  >
                    <View style={styles.foodRowLeft}>
                      <Text style={styles.foodName}>{food.name}</Text>
                      {food.estimated_amount && (
                        <Text style={styles.foodAmount}>{food.estimated_amount}</Text>
                      )}
                    </View>
                    <View style={[
                      styles.confidencePill,
                      food.confidence >= 0.8 && styles.confidenceHigh,
                    ]}>
                      <Text style={[
                        styles.confidencePillText,
                        food.confidence >= 0.8 && styles.confidenceHighText,
                      ]}>
                        {confidenceLabel(food.confidence)}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
                <Text style={styles.confirmBtnText}>
                  Add {recognized.length} item{recognized.length !== 1 ? 's' : ''} to Today's Log
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27, 25, 20, 0.4)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: Colors.bone,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: scale(20),
    paddingTop: scale(12),
    paddingBottom: verticalScale(40),
    maxHeight: verticalScale(580),
  },
  handle: {
    width: scale(36),
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.boneDark,
    alignSelf: 'center',
    marginBottom: scale(16),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
  },
  closeBtn: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    padding: scale(4),
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.boneCard,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    minHeight: verticalScale(80),
    marginBottom: Spacing.md,
  },
  analyzeBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: scale(14),
    alignItems: 'center',
  },
  analyzeBtnDisabled: {
    opacity: 0.4,
  },
  analyzeBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.accentAlert,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },

  // Results
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    marginBottom: Spacing.sm,
  },
  resultsLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.ink,
  },
  retryBtn: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    textDecorationLine: 'underline',
  },
  resultsList: {
    maxHeight: verticalScale(180),
    marginBottom: Spacing.md,
  },
  foodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: scale(10),
  },
  foodRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderHairline,
  },
  foodRowLeft: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  foodName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    textTransform: 'capitalize',
  },
  foodAmount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
    marginTop: 2,
  },
  confidencePill: {
    paddingVertical: scale(3),
    paddingHorizontal: scale(8),
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    backgroundColor: Colors.boneCard,
  },
  confidenceHigh: {
    borderColor: 'rgba(74, 103, 65, 0.3)',
    backgroundColor: 'rgba(74, 103, 65, 0.06)',
  },
  confidencePillText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.inkSecondary,
  },
  confidenceHighText: {
    color: Colors.accentHill,
  },
  confirmBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: scale(14),
    alignItems: 'center',
  },
  confirmBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    color: Colors.bone,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
