import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import type { Theme } from '@/theme/theme';
import { useTheme, useThemedStyles } from '@hooks/useTheme';

import { Typography } from './Typography';

type TextFieldProps = {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Mono + numeric keypad, for dB and other calibration values. */
  numeric?: boolean;
  /** Mono + decimal keypad, for par times and other fractional values. */
  decimal?: boolean;
  /** Trailing unit shown inside the field, e.g. "dB". */
  unit?: string;
  editable?: boolean;
  /** Most characters the field accepts; typing stops there. */
  maxLength?: number;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Turn off for values a dictionary would mangle, such as a handle. */
  autoCorrect?: boolean;
  /**
   * Why the current value cannot be used. Shown under the field, which
   * takes the danger border, and announced when it appears.
   */
  error?: string | null;
  testID?: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    group: { gap: theme.spacing.xs },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      minHeight: 48,
    },
    input: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
      color: theme.colors.textPrimary,
      ...theme.typography.body,
    },
    numericInput: {
      ...theme.typography.metricSmall,
      color: theme.colors.textPrimary,
      textAlign: 'right',
    },
    disabled: { opacity: 0.5 },
    invalid: { borderColor: theme.colors.danger },
  });

/** Labelled text input wired to the theme's surfaces and type scale. */
export const TextField = ({
  label,
  value,
  onChangeText,
  placeholder,
  numeric = false,
  decimal = false,
  unit,
  editable = true,
  maxLength,
  autoCapitalize,
  autoCorrect,
  error,
  testID,
}: TextFieldProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();

  const keyboardType = decimal
    ? 'decimal-pad'
    : numeric
      ? 'number-pad'
      : 'default';
  const monoInput = numeric || decimal;

  return (
    <View style={styles.group}>
      {label ? (
        <Typography variant="label" color="textSecondary">
          {label}
        </Typography>
      ) : null}

      <View
        style={[
          styles.field,
          !editable && styles.disabled,
          error ? styles.invalid : null,
        ]}
      >
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          editable={editable}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          accessibilityLabel={label}
          style={[styles.input, monoInput && styles.numericInput]}
        />
        {unit ? (
          <Typography variant="label" color="textTertiary">
            {unit}
          </Typography>
        ) : null}
      </View>

      {error ? (
        <Typography
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </Typography>
      ) : null}
    </View>
  );
};
