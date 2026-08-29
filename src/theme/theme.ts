import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Raw palette. Never reference these directly from components — always go
 * through the semantic `colors` on the active theme so dark mode, rebranding
 * and accessibility overrides stay a single-file change.
 */
const palette = {
  white: '#ffffff',
  black: '#000000',

  grey50: '#f5f5f7',
  grey100: '#e1e1e6',
  grey200: '#c9c9d1',
  grey400: '#8a8a95',
  grey500: '#666672',
  grey700: '#3a3a44',
  grey900: '#1c1c21',
  grey950: '#0b0b0f',

  grey850: '#26262e',

  brass300: '#d9a866',
  brass400: '#c08a3e',
  brass500: '#a87226',
  brass700: '#8b6128',
  // Low-alpha brass washes for chip/badge fills that must sit on either
  // background without a second opaque tone per theme.
  brassWash: 'rgba(192, 138, 62, 0.14)',
  brassWashDark: 'rgba(217, 168, 102, 0.16)',

  green400: '#4a9d6b',
  green300: '#6fc48d',
  red400: '#c0503e',
  red300: '#e0705e',
  amber400: '#c9922e',
  amber300: '#e0ad4d',

  scrim: 'rgba(0, 0, 0, 0.45)',
} as const;

export type Palette = typeof palette;

// Spacing & radius — proportional scales. Screens/components MUST use these.
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export type Spacing = typeof spacing;
export type Radius = typeof radius;

// Typography — variants bundle size + weight + lineHeight so callers pick a
// role ("title") instead of hand-mixing size/weight everywhere.
type FontWeight = TextStyle['fontWeight'];

export const fontWeights = {
  light: '300',
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, FontWeight>;

export type FontWeights = typeof fontWeights;
export type FontWeightKey = keyof FontWeights;

/**
 * Timers and dB readings change digit-by-digit, so they must be tabular —
 * a proportional font makes the numbers jitter horizontally as they tick.
 */
export const fontFamilies = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

export type FontFamilies = typeof fontFamilies;

type TypographyStyle = Pick<
  TextStyle,
  'fontSize' | 'lineHeight' | 'fontWeight' | 'letterSpacing' | 'fontFamily'
>;

export const typography = {
  display: { fontSize: 64, lineHeight: 72, fontWeight: fontWeights.light },
  title: { fontSize: 28, lineHeight: 34, fontWeight: fontWeights.bold },
  subtitle: { fontSize: 20, lineHeight: 26, fontWeight: fontWeights.semibold },
  body: { fontSize: 16, lineHeight: 22, fontWeight: fontWeights.regular },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: fontWeights.semibold,
  },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: fontWeights.regular },

  /** Small all-caps section heading. Pair with `textSecondary`. */
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: fontWeights.semibold,
    letterSpacing: 1.2,
  },
  /** Field labels and dense table headers. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: fontWeights.medium },

  /** Running shot timer. Mono so digits never shift as they tick. */
  timer: {
    fontSize: 68,
    lineHeight: 78,
    fontWeight: fontWeights.light,
    fontFamily: fontFamilies.mono,
    letterSpacing: -1,
  },
  /** Split times, dB values, card stats. */
  metric: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: fontWeights.semibold,
    fontFamily: fontFamilies.mono,
  },
  metricSmall: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeights.medium,
    fontFamily: fontFamilies.mono,
  },
} as const satisfies Record<string, TypographyStyle>;

export type Typography = typeof typography;
export type TypographyVariant = keyof Typography;

// Semantic colors — every screen/component references these role names, never
// the palette. Both themes MUST have the same shape (SemanticColors) so
// adding a token forces you to define it for both modes.
export type SemanticColors = {
  background: string;
  /** Cards and rows sitting directly on `background`. */
  surface: string;
  /** A second stacked level — rows *inside* a card. */
  surfaceElevated: string;
  border: string;
  /** Higher-contrast divider for a card's outer edge. */
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  /** De-emphasised meta: timestamps, row indices, units. */
  textTertiary: string;
  textOnPrimary: string;
  primary: string;
  primaryMuted: string;
  /** Tinted fill for chips/badges that carry `primary` text. */
  primarySoft: string;
  success: string;
  danger: string;
  warning: string;
  /** Backdrop behind modal surfaces. */
  overlay: string;
};

const lightColors: SemanticColors = {
  background: palette.white,
  surface: palette.grey50,
  surfaceElevated: palette.white,
  border: palette.grey100,
  borderStrong: palette.grey200,
  textPrimary: palette.grey900,
  textSecondary: palette.grey500,
  textTertiary: palette.grey400,
  textOnPrimary: palette.white,
  primary: palette.brass400,
  primaryMuted: palette.brass700,
  primarySoft: palette.brassWash,
  success: palette.green400,
  danger: palette.red400,
  warning: palette.amber400,
  overlay: palette.scrim,
};

const darkColors: SemanticColors = {
  background: palette.grey950,
  surface: palette.grey900,
  surfaceElevated: palette.grey850,
  border: palette.grey700,
  borderStrong: palette.grey700,
  textPrimary: palette.grey50,
  textSecondary: palette.grey400,
  textTertiary: palette.grey500,
  textOnPrimary: palette.grey950,
  primary: palette.brass300,
  primaryMuted: palette.brass500,
  primarySoft: palette.brassWashDark,
  success: palette.green300,
  danger: palette.red300,
  warning: palette.amber300,
  overlay: palette.scrim,
};

// Theme objects — one shape, two instances. Consumers get everything from
// `useTheme()`; no need to know whether the app is in light or dark mode.
export type ThemeMode = 'light' | 'dark';

export type Elevation = Pick<
  ViewStyle,
  | 'shadowColor'
  | 'shadowOffset'
  | 'shadowOpacity'
  | 'shadowRadius'
  | 'elevation'
>;

/**
 * Shadows read as mud on a near-black background, so dark mode leans on
 * surface/border contrast instead and keeps only a token Android elevation.
 */
const buildElevation = (mode: ThemeMode) => {
  const opacity = mode === 'light' ? 1 : 0;
  return {
    none: { elevation: 0 },
    card: {
      shadowColor: palette.black,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06 * opacity,
      shadowRadius: 3,
      elevation: mode === 'light' ? 2 : 0,
    },
    raised: {
      shadowColor: palette.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16 * opacity,
      shadowRadius: 10,
      elevation: mode === 'light' ? 8 : 6,
    },
  } as const satisfies Record<string, Elevation>;
};

export type Elevations = ReturnType<typeof buildElevation>;

export type Theme = {
  mode: ThemeMode;
  colors: SemanticColors;
  spacing: Spacing;
  radius: Radius;
  typography: Typography;
  fontWeights: FontWeights;
  fontFamilies: FontFamilies;
  elevation: Elevations;
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  spacing,
  radius,
  typography,
  fontWeights,
  fontFamilies,
  elevation: buildElevation('light'),
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: darkColors,
  spacing,
  radius,
  typography,
  fontWeights,
  fontFamilies,
  elevation: buildElevation('dark'),
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
