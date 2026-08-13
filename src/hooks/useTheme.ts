import { useMemo } from 'react';

import { StyleSheet, useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from '@constants/theme';

/**
 * Resolves the active theme from the OS color scheme. Screens/components
 * should get every design token from here — never import the theme module
 * directly, so we can add a manual override (settings toggle, feature flag)
 * in one place later.
 */
export const useTheme = (): Theme => {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
};

/**
 * Memoize a themed StyleSheet. Define `factory` at module scope (or wrap it
 * in `useCallback`) so the memo only recomputes when the theme changes —
 * an inline arrow works but recomputes every render.
 *
 * @example
 * const createStyles = (theme: Theme) =>
 *   StyleSheet.create({
 *     container: { backgroundColor: theme.colors.background, padding: theme.spacing.lg },
 *   });
 *
 * const styles = useThemedStyles(createStyles);
 */
export const useThemedStyles = <T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
): T => {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
};
