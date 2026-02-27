/**
 * Nour AI Design System
 * Based on moodboard designs with bone/cream palette and clinical aesthetic
 * Includes responsive utilities for all phone sizes
 */

import { Platform, Dimensions, PixelRatio, StyleSheet } from 'react-native';
import { Easing } from 'react-native-reanimated';

// Get device dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (iPhone 14/15 Pro as reference - 393x852)
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

/**
 * Responsive scaling utilities
 * Scale values based on screen width for consistent UI across devices
 */
export const scale = (size: number): number => {
  const ratio = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * ratio;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

export const verticalScale = (size: number): number => {
  const ratio = SCREEN_HEIGHT / BASE_HEIGHT;
  const newSize = size * ratio;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
};

// Moderate scaling - less aggressive for fonts and spacing
export const moderateScale = (size: number, factor: number = 0.5): number => {
  return Math.round(PixelRatio.roundToNearestPixel(size + (scale(size) - size) * factor));
};

// Font scaling with limits to prevent too large/small text
export const fontScale = (size: number): number => {
  const scaled = moderateScale(size, 0.3);
  const minSize = size * 0.85;
  const maxSize = size * 1.2;
  return Math.max(minSize, Math.min(maxSize, scaled));
};

// Device type detection
export const isSmallDevice = SCREEN_WIDTH < 375;
export const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;
export const isLargeDevice = SCREEN_WIDTH >= 414;
export const isTablet = SCREEN_WIDTH >= 768;

// Core palette from moodboard
export const Colors = {
  // Primary backgrounds
  bone: '#E9E6DF',
  boneCard: '#F2F0EB',
  boneDark: '#D6D3CC',
  boneWarm: '#EFEDE8',
  cardPure: '#FAF9F6',

  // Ink colors
  ink: '#1C1C1C',
  inkWarm: '#1A1918',
  inkSecondary: 'rgba(28, 28, 28, 0.6)',
  inkTertiary: 'rgba(28, 28, 28, 0.4)',
  textMuted: '#585754',

  // Borders
  borderHairline: 'rgba(28, 28, 28, 0.12)',
  borderStrong: 'rgba(28, 28, 28, 1)',

  // Accent colors for biosignals
  accentClay: '#8C6A54',
  accentMoss: '#5C6E5C',
  accentHill: '#2F362F',
  accentAlert: '#A34E4E',

  // Alert backgrounds
  alertBg: '#FDF1F1',
  alertBorder: 'rgba(163, 75, 75, 0.2)',
  alertText: '#5C2B2B',

  // Semantic colors
  success: '#5C6E5C',
  warning: '#8C6A54',
  error: '#A34E4E',

  // Scanner specific
  scannerBg: '#000',
  scannerOverlay: 'rgba(0, 0, 0, 0.3)',
  scannerGreen: '#4CAF50',
};

// Typography — Cormorant Garamond for serif, Manrope for sans
export const Fonts = {
  serif: 'CormorantGaramond_400Regular',
  serifMedium: 'CormorantGaramond_500Medium',
  serifItalic: 'CormorantGaramond_400Regular_Italic',
  sans: 'Manrope_400Regular',
  sansLight: 'Manrope_300Light',
  sansMedium: 'Manrope_500Medium',
  sansSemiBold: 'Manrope_600SemiBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })!,
};

// Animation duration constants
export const DURATION_FAST = 200;
export const DURATION_MEDIUM = 400;
export const DURATION_SLOW = 600;

// Easing presets matching moodboard CSS curves
export const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_SPRING = { damping: 15, stiffness: 100 };

// Responsive font sizes
export const FontSizes = {
  xs: fontScale(9),
  sm: fontScale(10),
  caption: fontScale(11),
  body: fontScale(12),
  bodyLarge: fontScale(14),
  subtitle: fontScale(15),
  title: fontScale(18),
  heading: fontScale(24),
  display: fontScale(28),
  hero: fontScale(36),
  giant: fontScale(42),
};

// Responsive spacing scale
export const Spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(16),
  lg: scale(24),
  xl: scale(32),
  xxl: scale(48),
};

// Border radius scale (less aggressive scaling)
export const Radius = {
  sm: moderateScale(4, 0.2),
  md: moderateScale(12, 0.2),
  lg: moderateScale(24, 0.2),
  xl: moderateScale(32, 0.2),
  pill: 100,
  arch: 180, // For the arch cards
};

// Shadow presets
export const Shadows = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: 0.1,
    shadowRadius: scale(12),
    elevation: 4,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: scale(10) },
    shadowOpacity: 0.15,
    shadowRadius: scale(20),
    elevation: 8,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: scale(16) },
    shadowOpacity: 0.12,
    shadowRadius: scale(32),
    elevation: 12,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: scale(8),
    elevation: 0,
  }),
};

// Common text styles matching moodboard
export const TextStyles = StyleSheet.create({
  // Labels (uppercase, spaced)
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.2,
    color: Colors.inkSecondary,
  },
  labelSmall: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    color: Colors.inkSecondary,
  },
  // Serif display text
  serifDisplay: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    lineHeight: FontSizes.display * 1.1,
  },
  serifTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
  },
  serifHero: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.hero,
    color: Colors.bone,
    textAlign: 'center' as const,
    lineHeight: FontSizes.hero * 1.1,
  },
  // Body text
  body: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.ink,
    lineHeight: FontSizes.body * 1.5,
  },
  bodySecondary: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.body,
    color: Colors.inkSecondary,
    lineHeight: FontSizes.body * 1.5,
  },
  // Philosophy/italic text
  philosophy: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.title,
    color: 'rgba(233, 230, 223, 0.8)',
    textAlign: 'center' as const,
    lineHeight: FontSizes.title * 1.5,
  },
});

// Glassmorphism constants — iOS BlurView tint + overlay values
export const Glass = {
  // Use with expo-blur BlurView on iOS
  tint: 'systemUltraThinMaterialLight' as const,
  intensity: 88,
  // Warm bone overlay on top of the blur (matches palette)
  overlayBone: 'rgba(242, 240, 235, 0.58)',
  // Top hairline — bright white catches light like real glass
  border: 'rgba(255, 255, 255, 0.9)',
  // Subtle inner border for glass cards
  borderSubtle: 'rgba(255, 255, 255, 0.35)',
  // Android/non-iOS fallback (solid, no blur)
  androidFallback: 'rgba(242, 240, 235, 0.97)',
};

// Layout constants
export const Layout = {
  screenPaddingHorizontal: Spacing.lg,
  screenPaddingTop: verticalScale(60),
  tabBarHeight: verticalScale(80),
  bottomPadding: verticalScale(120), // Account for tab bar
  cardPadding: Spacing.md,
  scannerOverlaySize: scale(280),
};
