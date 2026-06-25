import { useColorScheme } from 'react-native';

import { colors, radius, spacing } from '@theme/index';

export const useTheme = () => {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return {
    isDark,
    colors: {
      background: isDark ? colors.backgroundDark : colors.background,
      surface: isDark ? colors.surfaceDark : colors.surface,
      text: isDark ? colors.textDark : colors.text,
      textMuted: colors.textMuted,
      primary: isDark ? colors.primaryDark : colors.primary,
      border: colors.border,
    },
    spacing,
    radius,
  };
};
