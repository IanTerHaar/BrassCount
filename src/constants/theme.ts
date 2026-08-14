import type { TextStyle } from 'react-native';

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

  brass300: '#d9a866',
  brass400: '#c08a3e',
  brass500: '#a87226',
  brass700: '#8b6128',
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
} as const satisfies Record<
  string,
  Pick<TextStyle, 'fontSize' | 'lineHeight' | 'fontWeight'>
>;

export type Typography = typeof typography;
export type TypographyVariant = keyof Typography;

// Semantic colors — every screen/component references these role names, never
// the palette. Both themes MUST have the same shape (SemanticColors) so
// adding a token forces you to define it for both modes.
export type SemanticColors = {
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;
  primary: string;
  primaryMuted: string;
};

const lightColors: SemanticColors = {
  background: palette.white,
  surface: palette.grey50,
  border: palette.grey100,
  textPrimary: palette.grey900,
  textSecondary: palette.grey500,
  textOnPrimary: palette.white,
  primary: palette.brass400,
  primaryMuted: palette.brass700,
};

const darkColors: SemanticColors = {
  background: palette.grey950,
  surface: palette.grey900,
  border: palette.grey700,
  textPrimary: palette.grey50,
  textSecondary: palette.grey400,
  textOnPrimary: palette.white,
  primary: palette.brass300,
  primaryMuted: palette.brass500,
};

// Theme objects — one shape, two instances. Consumers get everything from
// `useTheme()`; no need to know whether the app is in light or dark mode.
export type ThemeMode = 'light' | 'dark';

export type Theme = {
  mode: ThemeMode;
  colors: SemanticColors;
  spacing: Spacing;
  radius: Radius;
  typography: Typography;
  fontWeights: FontWeights;
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: lightColors,
  spacing,
  radius,
  typography,
  fontWeights,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: darkColors,
  spacing,
  radius,
  typography,
  fontWeights,
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
