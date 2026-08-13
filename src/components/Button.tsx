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
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
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
