import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useTheme } from '@hooks/useTheme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  testID?: string;
};

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  testID,
}: ButtonProps) => {
  const { colors, spacing, radius } = useTheme();
  const isPrimary = variant === 'primary';

  const containerStyle = StyleSheet.flatten([
    styles.base,
    {
      backgroundColor: isPrimary ? colors.primary : colors.surface,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
    },
  ]);

  const labelStyle = StyleSheet.flatten([
    styles.label,
    { color: isPrimary ? '#ffffff' : colors.text },
  ]);

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={containerStyle}
    >
      <Text style={labelStyle}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
