import React, { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetModal, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Moon, Sun, Sunrise, Sunset } from 'lucide-react-native';
import { Fonts, Palette } from '@/constants/theme';
import { Button, PressableScale, SegmentedControl, Sheet, Txt } from '@/components/ui';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type Protocol = 'meal' | 'supplement' | 'skincare' | 'treatment' | 'other';

export interface StackEntry {
  timeOfDay: TimeOfDay;
  protocol: Protocol;
  quantity?: string;
  loggedAt: Date;
}

const TIMES: { value: TimeOfDay; label: string; hint: string; Icon: typeof Sun }[] = [
  { value: 'morning', label: 'Morning', hint: '6–11am', Icon: Sunrise },
  { value: 'afternoon', label: 'Afternoon', hint: '11–5pm', Icon: Sun },
  { value: 'evening', label: 'Evening', hint: '5–9pm', Icon: Sunset },
  { value: 'night', label: 'Night', hint: '9pm+', Icon: Moon },
];

function defaults(category: string): { timeOfDay: TimeOfDay; protocol: Protocol } {
  switch (category) {
    case 'food': return { timeOfDay: 'morning', protocol: 'meal' };
    case 'supplement': return { timeOfDay: 'morning', protocol: 'supplement' };
    case 'cosmetic': return { timeOfDay: 'morning', protocol: 'skincare' };
    case 'otc': return { timeOfDay: 'evening', protocol: 'treatment' };
    default: return { timeOfDay: 'morning', protocol: 'other' };
  }
}

function placeholder(category: string) {
  switch (category) {
    case 'food': return 'e.g. 1 cup, 100 g';
    case 'supplement': return 'e.g. 2 capsules, 5 g';
    case 'cosmetic': return 'e.g. 2 pumps';
    case 'otc': return 'e.g. 1 tablet';
    default: return 'e.g. 1 serving';
  }
}

const HOUR: Record<TimeOfDay, number> = { morning: 8, afternoon: 13, evening: 19, night: 22 };

/** Bottom sheet for adding a product to the stack: when, how much, which day. */
export const AddToStackSheet = forwardRef<BottomSheetModal, {
  productName: string;
  productCategory: string;
  onConfirm: (entry: StackEntry) => void;
}>(function AddToStackSheet({ productName, productCategory, onConfirm }, ref) {
  const d = defaults(productCategory);
  const [time, setTime] = useState<TimeOfDay>(d.timeOfDay);
  const [day, setDay] = useState<'today' | 'yesterday'>('today');
  const [quantity, setQuantity] = useState('');

  useEffect(() => { setTime(defaults(productCategory).timeOfDay); }, [productCategory]);

  const confirm = () => {
    const at = new Date();
    if (day === 'yesterday') at.setDate(at.getDate() - 1);
    at.setHours(HOUR[time], 0, 0, 0);
    onConfirm({ timeOfDay: time, protocol: d.protocol, quantity: quantity.trim() || undefined, loggedAt: at });
    setQuantity('');
    setDay('today');
  };

  return (
    <Sheet ref={ref}>
      <Txt variant="overline" tone="secondary" style={{ marginTop: 8 }}>Add to stack</Txt>
      <Txt variant="title1" numberOfLines={2} style={{ marginTop: 6 }}>{productName}</Txt>

      <Txt variant="headline" style={{ marginTop: 24, marginBottom: 10 }}>When do you take it?</Txt>
      <View style={styles.grid}>
        {TIMES.map(({ value, label, hint, Icon }) => {
          const active = value === time;
          return (
            <PressableScale
              key={value}
              haptic="selection"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}, ${hint}`}
              onPress={() => setTime(value)}
              style={[styles.time, active && styles.timeActive]}
            >
              <Icon size={20} color={active ? Palette.onAccent : Palette.accent} strokeWidth={1.9} />
              <Txt variant="subheadStrong" color={active ? Palette.onAccent : Palette.ink} style={{ marginTop: 8 }}>{label}</Txt>
              <Txt variant="caption" color={active ? 'rgba(247,245,239,0.7)' : Palette.ink3}>{hint}</Txt>
            </PressableScale>
          );
        })}
      </View>

      <Txt variant="headline" style={{ marginTop: 22, marginBottom: 10 }}>How much? <Txt variant="subhead" tone="tertiary">Optional</Txt></Txt>
      <BottomSheetTextInput
        value={quantity}
        onChangeText={setQuantity}
        placeholder={placeholder(productCategory)}
        placeholderTextColor={Palette.ink3}
        style={styles.input}
        returnKeyType="done"
      />

      <SegmentedControl
        style={{ marginTop: 16 }}
        options={[{ key: 'today', label: 'Today' }, { key: 'yesterday', label: 'Yesterday' }]}
        value={day}
        onChange={setDay}
      />

      <Button label="Add to stack" onPress={confirm} style={{ marginTop: 24 }} />
    </Sheet>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: 8 },
  time: { flex: 1, paddingVertical: 14, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', backgroundColor: Palette.canvas },
  timeActive: { backgroundColor: Palette.accent },
  input: { height: 50, borderRadius: 14, borderCurve: 'continuous', backgroundColor: Palette.canvas, paddingHorizontal: 16, fontFamily: Fonts.sans, fontSize: 17, color: Palette.ink },
});
