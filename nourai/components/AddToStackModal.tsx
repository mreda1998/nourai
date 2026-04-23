/**
 * AddToStackModal
 *
 * Presented when the user taps "Add to Stack" on a product page.
 * Lets the user choose:
 *   • When they take it (Morning / Afternoon / Evening / Night)
 *   • What protocol it belongs to (Meal / Supplement / Skincare / Treatment / Other)
 *
 * Smart defaults are derived from the product category.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import {
  Colors,
  Fonts,
  FontSizes,
  Radius,
  scale,
  Spacing,
  verticalScale,
} from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type Protocol = 'meal' | 'supplement' | 'skincare' | 'treatment' | 'other';

export interface StackEntry {
  timeOfDay: TimeOfDay;
  protocol: Protocol;
  quantity?: string;  // free-form, e.g. "100g", "2 capsules", "1 cup"
}

// ─── Option definitions ───────────────────────────────────────────────────────

const TIME_OPTIONS: { value: TimeOfDay; label: string; hint: string }[] = [
  { value: 'morning',   label: 'Morning',   hint: '6–11 am' },
  { value: 'afternoon', label: 'Afternoon', hint: '11–5 pm' },
  { value: 'evening',   label: 'Evening',   hint: '5–9 pm'  },
  { value: 'night',     label: 'Night',     hint: '9 pm+'   },
];

const PROTOCOL_OPTIONS: { value: Protocol; label: string; icon: string }[] = [
  { value: 'meal',       label: 'Meal',         icon: '⬡' },
  { value: 'supplement', label: 'Supplement',   icon: '◎' },
  { value: 'skincare',   label: 'Skincare',     icon: '◇' },
  { value: 'treatment',  label: 'Treatment',    icon: '△' },
  { value: 'other',      label: 'Other',        icon: '○' },
];

// ─── Default derivation from product category ─────────────────────────────────

function defaultsForCategory(category: string): StackEntry {
  switch (category) {
    case 'food':
      return { timeOfDay: 'morning', protocol: 'meal' };
    case 'supplement':
      return { timeOfDay: 'morning', protocol: 'supplement' };
    case 'cosmetic':
      return { timeOfDay: 'morning', protocol: 'skincare' };
    case 'otc':
      return { timeOfDay: 'evening', protocol: 'treatment' };
    default:
      return { timeOfDay: 'morning', protocol: 'other' };
  }
}

function quantityPlaceholder(category: string): string {
  switch (category) {
    case 'food':       return 'e.g. 100g, 1 cup, 1 portion';
    case 'supplement': return 'e.g. 2 capsules, 5g, 1 scoop';
    case 'cosmetic':   return 'e.g. 2 pumps, pea-sized amount';
    case 'otc':        return 'e.g. 1 tablet, 10ml';
    default:           return 'e.g. 1 serving, 100ml';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddToStackModal({
  visible,
  productName,
  productCategory,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  productName: string;
  productCategory: string;
  onConfirm: (entry: StackEntry) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const defaults = defaultsForCategory(productCategory);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(defaults.timeOfDay);
  const [protocol, setProtocol] = useState<Protocol>(defaults.protocol);
  const [quantity, setQuantity] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0),
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const handleConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm({ timeOfDay, protocol, quantity: quantity.trim() || undefined });
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  const selectTime = (t: TimeOfDay) => {
    Haptics.selectionAsync();
    setTimeOfDay(t);
  };

  const selectProtocol = (p: Protocol) => {
    Haptics.selectionAsync();
    setProtocol(p);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleCancel} />

      {/* Sheet */}
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md, bottom: keyboardHeight }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.overline}>Add to Stack</Text>
          <Text style={styles.productName} numberOfLines={1}>{productName}</Text>
        </View>

        {/* Time of day */}
        <Text style={styles.sectionLabel}>When do you take this?</Text>
        <View style={styles.timeRow}>
          {TIME_OPTIONS.map((opt) => {
            const selected = timeOfDay === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.timeCell, selected && styles.timeCellSelected]}
                onPress={() => selectTime(opt.value)}
              >
                <Text style={[styles.timeCellLabel, selected && styles.timeCellLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={[styles.timeCellHint, selected && styles.timeCellHintSelected]}>
                  {opt.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Protocol */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>As part of?</Text>
        <View style={styles.protocolRow}>
          {PROTOCOL_OPTIONS.map((opt) => {
            const selected = protocol === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.protocolChip, selected && styles.protocolChipSelected]}
                onPress={() => selectProtocol(opt.value)}
              >
                <Text style={[styles.protocolChipIcon, selected && styles.protocolChipIconSelected]}>
                  {opt.icon}
                </Text>
                <Text style={[styles.protocolChipText, selected && styles.protocolChipTextSelected]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Quantity */}
        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>Quantity (optional)</Text>
        <Pressable
          style={styles.quantityRow}
          onPress={() => inputRef.current?.focus()}
          activeOpacity={1}
        >
          <TextInput
            ref={inputRef}
            style={styles.quantityInput}
            value={quantity}
            onChangeText={setQuantity}
            placeholder={quantityPlaceholder(productCategory)}
            placeholderTextColor={Colors.inkTertiary}
            returnKeyType="done"
            autoCorrect={false}
          />
        </Pressable>

        {/* Confirm button */}
        <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
          <Text style={styles.confirmBtnText}>Add to Stack</Text>
        </Pressable>

        {/* Cancel */}
        <Pressable style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 28, 0.4)',
  },
  sheet: {
    backgroundColor: Colors.bone,
    borderTopLeftRadius: Radius.lg ?? scale(20),
    borderTopRightRadius: Radius.lg ?? scale(20),
    paddingHorizontal: scale(24),
    paddingTop: Spacing.sm,
  },
  handle: {
    width: scale(36),
    height: scale(4),
    borderRadius: scale(2),
    backgroundColor: Colors.boneDark,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },

  // Header
  header: {
    marginBottom: Spacing.xl,
  },
  overline: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: Colors.inkTertiary,
    marginBottom: scale(4),
  },
  productName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.heading,
    color: Colors.ink,
  },

  // Section label
  sectionLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.inkSecondary,
    marginBottom: Spacing.sm,
  },

  // Time of day — 4-cell horizontal grid
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timeCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    paddingVertical: scale(12),
    alignItems: 'center',
    backgroundColor: Colors.boneCard,
  },
  timeCellSelected: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  timeCellLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.caption,
    color: Colors.ink,
    marginBottom: scale(2),
  },
  timeCellLabelSelected: {
    color: Colors.bone,
  },
  timeCellHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.inkTertiary,
  },
  timeCellHintSelected: {
    color: 'rgba(233, 230, 223, 0.6)',
  },

  // Protocol — horizontal scrollable chips
  protocolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  protocolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.pill,
    paddingVertical: scale(8),
    paddingHorizontal: scale(14),
    backgroundColor: Colors.boneCard,
  },
  protocolChipSelected: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  protocolChipIcon: {
    fontSize: FontSizes.caption,
    color: Colors.inkSecondary,
  },
  protocolChipIconSelected: {
    color: Colors.bone,
  },
  protocolChipText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.body,
    color: Colors.ink,
  },
  protocolChipTextSelected: {
    color: Colors.bone,
  },

  // Quantity
  quantityRow: {
    borderWidth: 1,
    borderColor: Colors.borderHairline,
    borderRadius: Radius.md,
    backgroundColor: Colors.boneCard,
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
  },
  quantityInput: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    padding: 0,
    margin: 0,
  },

  // Confirm button
  confirmBtn: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: verticalScale(16),
    alignItems: 'center',
  },
  confirmBtnText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.body,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.bone,
  },

  // Cancel
  cancelBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkTertiary,
  },
});
