import type { Theme } from '@constants/theme';
import { StyleSheet, TextInput, View } from 'react-native';
import { useTheme, useThemedStyles } from '@hooks/useTheme';
import { Typography } from './Typography';

type TextFieldProps = {
  label?: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Mono + numeric keypad, for dB and other calibration values. */
  numeric?: boolean;
  /** Trailing unit shown inside the field, e.g. "dB". */
  unit?: string;
  editable?: boolean;
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
  });

/** Labelled text input wired to the theme's surfaces and type scale. */
export const TextField = ({
  label,
  value,
  onChangeText,
  placeholder,
  numeric = false,
  unit,
  editable = true,
  testID,
}: TextFieldProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();

  return (
    <View style={styles.group}>
      {label ? (
        <Typography variant="label" color="textSecondary">
          {label}
        </Typography>
      ) : null}

      <View style={[styles.field, !editable && styles.disabled]}>
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          editable={editable}
          keyboardType={numeric ? 'number-pad' : 'default'}
          accessibilityLabel={label}
          style={[styles.input, numeric && styles.numericInput]}
        />
        {unit ? (
          <Typography variant="label" color="textTertiary">
            {unit}
          </Typography>
        ) : null}
      </View>
    </View>
  );
};
