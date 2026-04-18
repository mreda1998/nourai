import { Platform, Dimensions, PixelRatio, StyleSheet } from 'react-native';
import { Easing } from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

export const scale = (size: number): number => {
  const ratio = SCREEN_WIDTH / BASE_WIDTH;
  return Math.round(PixelRatio.roundToNearestPixel(size * ratio));
};

export const verticalScale = (size: number): number => {
  const ratio = SCREEN_HEIGHT / BASE_HEIGHT;
  return Math.round(PixelRatio.roundToNearestPixel(size * ratio));
};

export const moderateScale = (size: number, factor = 0.5): number =>
  Math.round(PixelRatio.roundToNearestPixel(size + (scale(size) - size) * factor));

export const fontScale = (size: number): number => {
  const scaled = moderateScale(size, 0.3);
  return Math.max(size * 0.85, Math.min(size * 1.2, scaled));
};

export const isSmallDevice = SCREEN_WIDTH < 375;
export const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;
export const isLargeDevice = SCREEN_WIDTH >= 414;
export const isTablet = SCREEN_WIDTH >= 768;

// Elory palette — teal canonical
export const Colors = {
  // Surfaces
  surface: '#F1EDE4',
  surfaceAlt: '#E8E3D7',
  surfaceCard: '#FAF7F0',

  // Ink
  ink: '#0F2928',
  inkSecondary: 'rgba(15, 41, 40, 0.62)',
  inkTertiary: 'rgba(15, 41, 40, 0.38)',

  // Borders
  borderHairline: 'rgba(15, 41, 40, 0.12)',
  borderStrong: 'rgba(15, 41, 40, 0.85)',

  // Brand
  accent: '#1A5C5A',
  accentInk: '#F1EDE4',
  sand: '#E8D5B0',
  sage: '#7BAE8E',
  alert: '#C4654A',

  // Premium / dark register
  darkSurface: '#0F3E3D',
  darkInk: '#F1EDE4',

  // Legacy aliases (keep so existing code doesn't break before screens are updated)
  bone: '#F1EDE4',
  boneCard: '#FAF7F0',
  boneDark: '#E8E3D7',
  boneWarm: '#F1EDE4',
  cardPure: '#FAF7F0',
  inkWarm: '#0F2928',
  textMuted: 'rgba(15, 41, 40, 0.62)',
  borderHairlineOld: 'rgba(15, 41, 40, 0.12)',
  accentClay: '#C4654A',
  accentMoss: '#7BAE8E',
  accentHill: '#1A5C5A',
  accentAlert: '#C4654A',
  alertBg: 'rgba(196, 101, 74, 0.06)',
  alertBorder: 'rgba(196, 101, 74, 0.2)',
  alertText: '#C4654A',
  success: '#7BAE8E',
  warning: '#E8D5B0',
  error: '#C4654A',
  scannerBg: '#000',
  scannerOverlay: 'rgba(0, 0, 0, 0.3)',
  scannerGreen: '#7BAE8E',
};

// Elory typography — Cormorant Garamond serif + DM Sans sans
export const Fonts = {
  serif: 'CormorantGaramond_400Regular',
  serifMedium: 'CormorantGaramond_500Medium',
  serifItalic: 'CormorantGaramond_400Regular_Italic',
  sans: 'DMSans_400Regular',
  sansLight: 'DMSans_300Light',
  sansMedium: 'DMSans_500Medium',
  sansSemiBold: 'DMSans_600SemiBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })!,
};

export const DURATION_FAST = 200;
export const DURATION_MEDIUM = 400;
export const DURATION_SLOW = 600;
export const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_SPRING = { damping: 15, stiffness: 100 };

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

export const Spacing = {
  xs: scale(4),
  sm: scale(8),
  md: scale(16),
  lg: scale(24),
  xl: scale(32),
  xxl: scale(48),
};

export const Radius = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
  arch: 120,
};

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
  scanButton: {
    shadowColor: '#0F2928',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: scale(8),
    elevation: 0,
  }),
};

export const TextStyles = StyleSheet.create({
  label: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.4,
    color: Colors.inkSecondary,
  },
  labelSmall: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.0,
    color: Colors.inkSecondary,
  },
  serifDisplay: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.display,
    color: Colors.ink,
    lineHeight: FontSizes.display * 1.05,
  },
  serifTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.title,
    color: Colors.ink,
  },
  serifHero: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.hero,
    color: Colors.surface,
    lineHeight: FontSizes.hero * 1.05,
  },
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
  philosophy: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.title,
    color: 'rgba(241, 237, 228, 0.8)',
    lineHeight: FontSizes.title * 1.5,
  },
});

export const Glass = {
  tint: 'systemUltraThinMaterialLight' as const,
  intensity: 88,
  overlayBone: 'rgba(241, 237, 228, 0.58)',
  border: 'rgba(255, 255, 255, 0.9)',
  borderSubtle: 'rgba(255, 255, 255, 0.35)',
  androidFallback: 'rgba(241, 237, 228, 0.97)',
};

export const Layout = {
  screenPaddingHorizontal: scale(24),
  screenPaddingTop: verticalScale(60),
  tabBarHeight: verticalScale(80),
  bottomPadding: verticalScale(120),
  cardPadding: scale(16),
  scannerOverlaySize: scale(280),
};
