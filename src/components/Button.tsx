import {
  StyleSheet,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Typography } from '@components/Typography';
import { useTheme } from '@hooks/useTheme';

type ButtonVariant = 'primary' | 'secondary';

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
  const isPrimary = variant === 'primary';

  const containerStyle: ViewStyle = {
    backgroundColor: isPrimary ? theme.colors.primary : theme.colors.surface,
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
      <Typography
        variant="bodyStrong"
        color={isPrimary ? 'textOnPrimary' : 'textPrimary'}
      >
        {label}
      </Typography>
    </TouchableOpacity>
  );
};
