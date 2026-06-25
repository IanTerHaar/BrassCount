export const colors = {
  background: '#ffffff',
  backgroundDark: '#0b0b0f',
  surface: '#f5f5f7',
  surfaceDark: '#1c1c21',
  text: '#111111',
  textDark: '#f5f5f7',
  textMuted: '#666666',
  primary: '#c08a3e',
  primaryDark: '#8b6128',
  border: '#e1e1e6',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
