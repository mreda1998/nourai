import React, { forwardRef } from 'react';
import { Pressable, StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { ScanLine, Search, X } from 'lucide-react-native';
import { Fonts, Palette } from '@/constants/theme';

export const SearchField = forwardRef<TextInput, TextInputProps & { onClear?: () => void; onScan?: () => void; containerStyle?: StyleProp<ViewStyle> }>(
  function SearchField({ value, onClear, onScan, containerStyle, ...rest }, ref) {
    return (
      <View style={[styles.box, containerStyle]}>
        <Search size={19} color={Palette.ink3} strokeWidth={2} />
        <TextInput
          ref={ref}
          value={value}
          placeholderTextColor={Palette.ink3}
          returnKeyType="search"
          clearButtonMode="never"
          autoCorrect={false}
          style={styles.input}
          {...rest}
        />
        {value ? (
          <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={onClear} style={styles.clear}>
            <X size={13} color={Palette.surface} strokeWidth={3} />
          </Pressable>
        ) : onScan ? (
          <Pressable accessibilityLabel="Scan a barcode" hitSlop={10} onPress={onScan}>
            <ScanLine size={20} color={Palette.accent} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  box: { height: 48, borderRadius: 16, borderCurve: 'continuous', backgroundColor: 'rgba(14,31,30,0.06)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  input: { flex: 1, fontFamily: Fonts.sans, fontSize: 17, color: Palette.ink, paddingVertical: 0, letterSpacing: -0.25 },
  clear: { width: 20, height: 20, borderRadius: 10, backgroundColor: Palette.ink3, alignItems: 'center', justifyContent: 'center' },
});
