import {
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { SemanticColors } from '@/theme/theme';
import { Typography } from '@components/Typography';
import { useTheme } from '@hooks/useTheme';

/** `danger` is for an action that destroys something, such as a delete. */
type ButtonVariant = 'primary' | 'secondary' | 'danger';

type VariantColors = {
  fill: keyof SemanticColors;
  text: keyof SemanticColors;
};

const VARIANT_COLORS: Record<ButtonVariant, VariantColors> = {
  primary: { fill: 'primary', text: 'textOnPrimary' },
  secondary: { fill: 'surface', text: 'textPrimary' },
  danger: { fill: 'danger', text: 'textOnDanger' },
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /**
   * What a screen reader announces in place of `label`. Set it when the
   * visible label repeats on the screen and needs its subject spelled out.
   */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: ButtonProps) => {
  const theme = useTheme();
  const colors = VARIANT_COLORS[variant];

  const containerStyle: ViewStyle = {
    backgroundColor: theme.colors[colors.fill],
    borderColor: theme.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    opacity: disabled ? 0.5 : 1,
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={style ? [containerStyle, style] : containerStyle}
    >
      {/* Centred, so a label that wraps stays in the middle of the button. */}
      <Typography variant="bodyStrong" color={colors.text} align="center">
        {label}
      </Typography>
    </TouchableOpacity>
  );
};
