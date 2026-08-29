import React from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

export interface FilterPillOption {
  label: string;
  value?: string;
  key?: string;
  count?: number;
}

interface Props {
  options: FilterPillOption[];
  value?: string;
  selected?: string;
  onChange?: (value: string) => void;
  onSelect?: (value: string) => void;
  dark?: boolean;
}

export function FilterPills({ options, value, selected, onChange, onSelect, dark }: Props) {
  const current = value ?? selected ?? '';
  const change = onChange ?? onSelect ?? (() => {});
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((opt) => {
        const optionValue = opt.value ?? opt.key ?? opt.label;
        const active = optionValue === current;
        return (
          <Pressable
            key={optionValue}
            onPress={() => change(optionValue)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: 999,
              backgroundColor: active ? (dark ? Colors.sand : Colors.accent) : 'transparent',
              borderWidth: 1,
              borderColor: active ? 'transparent' : (dark ? 'rgba(241,237,228,0.22)' : Colors.borderHairline),
            }}
          >
            <Text
              style={{
                fontFamily: Fonts.sansMedium,
                fontSize: 10.5,
                color: active
                  ? (dark ? Colors.ink : Colors.accentInk)
                  : (dark ? 'rgba(241,237,228,0.7)' : Colors.inkSecondary),
              }}
            >
              {opt.label}
              {opt.count !== undefined ? ` (${opt.count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
