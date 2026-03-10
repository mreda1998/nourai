/**
 * CategoryIcon — aesthetic SVG icons per product category.
 * Used as the arch-shaped thumbnail on product list items.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect, Ellipse, Line, G } from 'react-native-svg';
import { Colors } from '@/constants/theme';

type Category = 'food' | 'supplement' | 'cosmetic' | 'otc' | string;

interface CategoryIconProps {
  category: Category;
  size?: number;
  color?: string;
  bg?: string;
}

// Food — stylized wheat / grain
function FoodIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Stem */}
      <Path d="M12 22V10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      {/* Grain clusters */}
      <Ellipse cx="12" cy="7" rx="2.2" ry="3" stroke={color} strokeWidth="1.2" />
      <Ellipse cx="8.5" cy="9" rx="1.8" ry="2.5" stroke={color} strokeWidth="1.2" transform="rotate(-20 8.5 9)" />
      <Ellipse cx="15.5" cy="9" rx="1.8" ry="2.5" stroke={color} strokeWidth="1.2" transform="rotate(20 15.5 9)" />
      <Ellipse cx="9.5" cy="13" rx="1.6" ry="2.2" stroke={color} strokeWidth="1.1" transform="rotate(-15 9.5 13)" />
      <Ellipse cx="14.5" cy="13" rx="1.6" ry="2.2" stroke={color} strokeWidth="1.1" transform="rotate(15 14.5 13)" />
    </Svg>
  );
}

// Supplement — capsule / oval pill
function SupplementIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Capsule body */}
      <Path
        d="M8.5 6 Q5 6 5 12 Q5 18 8.5 18 L15.5 18 Q19 18 19 12 Q19 6 15.5 6 Z"
        stroke={color}
        strokeWidth="1.4"
        fill="none"
      />
      {/* Dividing line */}
      <Line x1="12" y1="6" x2="12" y2="18" stroke={color} strokeWidth="1.2" />
      {/* Left fill */}
      <Path
        d="M8.5 6 Q5 6 5 12 Q5 18 8.5 18 L12 18 L12 6 Z"
        fill={color}
        opacity="0.18"
      />
    </Svg>
  );
}

// Cosmetic — elegant water drop / serum bottle
function CosmeticIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Bottle body */}
      <Path
        d="M10 8 L10 17 Q10 20 12 20 Q14 20 14 17 L14 8 Z"
        stroke={color}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Bottle neck */}
      <Rect x="10.8" y="4.5" width="2.4" height="3.5" rx="0.8" stroke={color} strokeWidth="1.2" />
      {/* Cap */}
      <Rect x="10.2" y="3" width="3.6" height="1.8" rx="1" stroke={color} strokeWidth="1.2" />
      {/* Highlight */}
      <Line x1="11.5" y1="10" x2="11.5" y2="16" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
    </Svg>
  );
}

// OTC — medical cross in a rounded square
function OtcIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Rounded square */}
      <Rect x="3" y="3" width="18" height="18" rx="5" stroke={color} strokeWidth="1.4" />
      {/* Cross */}
      <Path
        d="M12 7.5 L12 16.5 M7.5 12 L16.5 12"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Category color backgrounds
const CATEGORY_BG: Record<string, string> = {
  food: '#D6D3CC',
  supplement: '#C8CCBF',
  cosmetic: '#CEC9C0',
  otc: '#C4C7CB',
};

export default function CategoryIcon({
  category,
  size = 28,
  color,
  bg,
}: CategoryIconProps) {
  const cat = (category || 'food').toLowerCase();
  const iconColor = color ?? Colors.ink;
  const bgColor = bg ?? CATEGORY_BG[cat] ?? CATEGORY_BG.food;

  const iconProps = { size, color: iconColor };

  let icon: React.ReactElement;
  if (cat === 'supplement') {
    icon = <SupplementIcon {...iconProps} />;
  } else if (cat === 'cosmetic') {
    icon = <CosmeticIcon {...iconProps} />;
  } else if (cat === 'otc') {
    icon = <OtcIcon {...iconProps} />;
  } else {
    icon = <FoodIcon {...iconProps} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {icon}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
