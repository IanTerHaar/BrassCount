import type { ReactNode } from 'react';

import {
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { Theme } from '@/theme/theme';
import { useTheme, useThemedStyles } from '@hooks/useTheme';

type CardProps = {
  children: ReactNode;
  /** Render as a button. Adds press feedback and a button a11y role. */
  onPress?: () => void;
  /** Drop the default inner padding when the card hosts its own rows. */
  flush?: boolean;
  /** Lift the card off the background — use for the one focal card. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    padded: {
      padding: theme.spacing.md,
    },
  });

/** Standard surface container. The base unit every screen is built from. */
export const Card = ({
  children,
  onPress,
  flush = false,
  raised = false,
  style,
  testID,
}: CardProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();

  const composed = [
    styles.base,
    !flush && styles.padded,
    raised ? theme.elevation.raised : theme.elevation.card,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        activeOpacity={0.75}
        style={composed}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID} style={composed}>
      {children}
    </View>
  );
};
