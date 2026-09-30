import React, { useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Fonts, Palette, Radius } from '@/constants/theme';
import { Txt } from './Txt';

export type TextFieldProps = TextInputProps & { label: string; trailing?: React.ReactNode };

/**
 * Labelled input on a surface card; the border turns accent while focused.
 * Tapping anywhere on the card focuses the input, not just the text line.
 */
export const TextField = React.forwardRef<TextInput, TextFieldProps>(
  function TextField({ label, trailing, style, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    const input = useRef<TextInput>(null);
    useImperativeHandle(ref, () => input.current as TextInput);
    return (
      <Pressable onPress={() => input.current?.focus()} style={[styles.field, focused && { borderColor: Palette.accent }]}>
        <Txt variant="caption" tone={focused ? 'accent' : 'secondary'}>{label}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            ref={input}
            placeholderTextColor={Palette.ink4}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.input, style]}
            accessibilityLabel={label}
            {...props}
          />
          {trailing}
        </View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  field: { borderRadius: Radius.lg, borderCurve: 'continuous', backgroundColor: Palette.surface, borderWidth: 1.5, borderColor: 'transparent', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  input: { flex: 1, fontFamily: Fonts.sans, fontSize: 17, color: Palette.ink, paddingVertical: 4 },
});
