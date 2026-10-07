import { Platform, Dimensions, PixelRatio, StyleSheet, TextStyle } from 'react-native';
import { Easing } from 'react-native-reanimated';

/**
 * Elory design system — "Clinical calm".
 *
 * Warm paper canvas, raised white cards, one deep-teal accent, an evidence
 * colour scale, and a dark "night" register for hero moments. Type pairs an
 * editorial serif (Instrument Serif) for display with Inter for everything a
 * user has to read. Sizes follow the iOS HIG scale — nothing readable is
 * below 12pt.
 */

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
  return Math.max(size * 0.9, Math.min(size * 1.15, scaled));
};

export const isSmallDevice = SCREEN_WIDTH < 375;
export const isMediumDevice = SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414;
export const isLargeDevice = SCREEN_WIDTH >= 414;
export const isTablet = SCREEN_WIDTH >= 768;
export const SCREEN = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

// ─── Palette ──────────────────────────────────────────────────────────────────

export const Palette = {
  // Light register
  canvas: '#F3F0E9',
  surface: '#FCFBF8',
  sunken: '#EAE6DC',
  ink: '#0E1F1E',
  ink2: 'rgba(14, 31, 30, 0.64)',
  ink3: 'rgba(14, 31, 30, 0.42)',
  ink4: 'rgba(14, 31, 30, 0.20)',
  hairline: 'rgba(14, 31, 30, 0.09)',

  // Brand
  accent: '#0F5652',
  accentPressed: '#0B4441',
  accentSoft: '#DCE9E4',
  onAccent: '#F7F5EF',
  gold: '#C9A465',
  goldSoft: '#F1E6D0',

  // Evidence scale — the one semantic scale used everywhere a score appears
  strong: '#2E8567',
  strongSoft: '#DFEEE6',
  moderate: '#C38A26',
  moderateSoft: '#F5EAD3',
  weak: '#BE5B3B',
  weakSoft: '#F6E2DA',

  // Night register (hero moments, premium, Ask Elory)
  night: '#0A1D1C',
  nightRaised: '#123230',
  nightHairline: 'rgba(244, 241, 234, 0.12)',
  nightInk: '#F4F1EA',
  nightInk2: 'rgba(244, 241, 234, 0.66)',
  nightInk3: 'rgba(244, 241, 234, 0.40)',
} as const;

// Measures read like a lab instrument: cells that fill in one verdict colour,
// rulers with zone strips, and the verdict's ink for text.
export const MeasureFill = {
  neutral: '#9AA8A4',
  good: '#4F9D7F',
  moderate: '#D19F40',
  weak: '#C4613F',
} as const;

export const MeasureSoft = {
  neutral: Palette.sunken,
  good: Palette.strongSoft,
  moderate: Palette.moderateSoft,
  weak: Palette.weakSoft,
} as const;

// Zone fills for dose / contaminant bars, and the ink each tone reads in.
export const MeasureZone = {
  neutral: 'rgba(14, 31, 30, 0.10)',
  good: '#A6D0BE',
  moderate: '#E6C88E',
  weak: '#E3A68F',
} as const;

export const MeasureInk = {
  neutral: Palette.ink3,
  good: Palette.strong,
  moderate: Palette.moderate,
  weak: Palette.weak,
} as const;

// Legacy colour map — every key existing screens import, re-pointed at the
// new palette so un-migrated screens inherit the redesign.
export const Colors = {
  surface: Palette.canvas,
  surfaceAlt: Palette.sunken,
  surfaceCard: Palette.surface,

  ink: Palette.ink,
  inkSecondary: Palette.ink2,
  inkTertiary: Palette.ink3,

  borderHairline: Palette.hairline,
  borderStrong: 'rgba(14, 31, 30, 0.82)',

  accent: Palette.accent,
  accentInk: Palette.onAccent,
  sand: Palette.gold,
  sage: Palette.strong,
  alert: Palette.weak,

  darkSurface: Palette.nightRaised,
  darkInk: Palette.nightInk,

  bone: Palette.canvas,
  boneCard: Palette.surface,
  boneDark: Palette.sunken,
  boneWarm: Palette.canvas,
  cardPure: Palette.surface,
  inkWarm: Palette.ink,
  textMuted: Palette.ink2,
  borderHairlineOld: Palette.hairline,
  accentClay: Palette.weak,
  accentMoss: Palette.strong,
  accentHill: Palette.accent,
  accentAlert: Palette.weak,
  alertBg: 'rgba(190, 91, 59, 0.07)',
  alertBorder: 'rgba(190, 91, 59, 0.22)',
  alertText: Palette.weak,
  success: Palette.strong,
  warning: Palette.moderateSoft,
  error: Palette.weak,
  scannerBg: '#000',
  scannerOverlay: 'rgba(0, 0, 0, 0.3)',
  scannerGreen: Palette.strong,
};

// ─── Type ─────────────────────────────────────────────────────────────────────

export const Fonts = {
  serif: 'InstrumentSerif_400Regular',
  serifMedium: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  sans: 'Inter_400Regular',
  sansLight: 'Inter_300Light',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })!,
};

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/** HIG-aligned type ramp. Use through <Txt variant="…">. */
export const Type = {
  hero: { fontFamily: Fonts.serif, fontSize: 52, lineHeight: 54, letterSpacing: -0.8 },
  display: { fontFamily: Fonts.serif, fontSize: 40, lineHeight: 44, letterSpacing: -0.5 },
  largeTitle: { fontFamily: Fonts.serif, fontSize: 34, lineHeight: 38, letterSpacing: -0.3 },
  title1: { fontFamily: Fonts.serif, fontSize: 28, lineHeight: 32, letterSpacing: -0.2 },
  title2: { fontFamily: Fonts.serif, fontSize: 24, lineHeight: 28 },
  title3: { fontFamily: Fonts.sansSemiBold, fontSize: 20, lineHeight: 25, letterSpacing: -0.35 },
  headline: { fontFamily: Fonts.sansSemiBold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  body: { fontFamily: Fonts.sans, fontSize: 17, lineHeight: 24, letterSpacing: -0.25 },
  callout: { fontFamily: Fonts.sans, fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  subhead: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  subheadStrong: { fontFamily: Fonts.sansMedium, fontSize: 15, lineHeight: 20, letterSpacing: -0.15 },
  footnote: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18, letterSpacing: -0.05 },
  footnoteStrong: { fontFamily: Fonts.sansMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: Fonts.sansMedium, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: Fonts.sansSemiBold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' as const },
  numeral: { fontFamily: Fonts.sansSemiBold, fontSize: 17, lineHeight: 22, fontVariant: tabular, letterSpacing: -0.3 },
  metric: { fontFamily: Fonts.sansSemiBold, fontSize: 28, lineHeight: 32, fontVariant: tabular, letterSpacing: -0.8 },
  gauge: { fontFamily: Fonts.sansLight, fontSize: 64, lineHeight: 68, fontVariant: tabular, letterSpacing: -2.5 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof Type;

// Legacy size map — bumped so older screens stop rendering 9–10pt text.
export const FontSizes = {
  xs: fontScale(11),
  sm: fontScale(12),
  caption: fontScale(13),
  body: fontScale(15),
  bodyLarge: fontScale(16),
  subtitle: fontScale(17),
  title: fontScale(20),
  heading: fontScale(28),
  display: fontScale(34),
  hero: fontScale(44),
  giant: fontScale(48),
};

// ─── Space, shape, depth ──────────────────────────────────────────────────────

export const Spacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;

export const Radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  xxl: 32,
  pill: 999,
  arch: 120,
};

export const Shadows = {
  soft: {
    shadowColor: '#1B2A28',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  card: {
    shadowColor: '#1B2A28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  medium: {
    shadowColor: '#1B2A28',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#0A1D1C',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 12,
  },
  scanButton: {
    shadowColor: '#0A2E2B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
    elevation: 10,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 0,
  }),
};

// ─── Motion ───────────────────────────────────────────────────────────────────

export const DURATION_FAST = 180;
export const DURATION_MEDIUM = 360;
export const DURATION_SLOW = 700;
export const EASE_OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_SPRING = { damping: 18, stiffness: 180 };
export const Motion = {
  press: { damping: 20, stiffness: 400, mass: 0.6 },
  settle: { damping: 22, stiffness: 180 },
  gaugeMs: 1100,
};

// ─── Legacy text styles ───────────────────────────────────────────────────────

export const TextStyles = StyleSheet.create({
  label: { ...Type.overline, color: Colors.inkSecondary },
  labelSmall: { ...Type.overline, fontSize: 10, color: Colors.inkSecondary },
  serifDisplay: { ...Type.largeTitle, color: Colors.ink },
  serifTitle: { ...Type.title2, color: Colors.ink },
  serifHero: { ...Type.display, color: Palette.nightInk },
  body: { ...Type.subhead, color: Colors.ink },
  bodySecondary: { ...Type.subhead, color: Colors.inkSecondary },
  philosophy: { fontFamily: Fonts.serifItalic, fontSize: 22, lineHeight: 30, color: Palette.nightInk2 },
});

export const Glass = {
  tint: 'systemChromeMaterialLight' as const,
  intensity: 80,
  overlayBone: 'rgba(252, 251, 248, 0.62)',
  border: 'rgba(255, 255, 255, 0.9)',
  borderSubtle: 'rgba(255, 255, 255, 0.35)',
  androidFallback: 'rgba(252, 251, 248, 0.98)',
};

export const Layout = {
  gutter: 20,
  screenPaddingHorizontal: 20,
  screenPaddingTop: verticalScale(60),
  tabBarHeight: 64,
  /** Scroll padding so content clears the floating tab bar. */
  bottomPadding: 132,
  cardPadding: 18,
  scannerOverlaySize: scale(260),
};
