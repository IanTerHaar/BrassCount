import type { SemanticColors, Theme } from '@constants/theme';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTheme, useThemedStyles } from '@hooks/useTheme';
import { Typography } from './Typography';

type ChipTone = 'neutral' | 'primary' | 'success' | 'danger';

type ChipProps = {
  label: string;
  tone?: ChipTone;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};

const toneText: Record<ChipTone, keyof SemanticColors> = {
  neutral: 'textSecondary',
  primary: 'primary',
  success: 'success',
  danger: 'danger',
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm + theme.spacing.xs,
      borderRadius: theme.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.surfaceElevated,
      borderColor: theme.colors.border,
    },
    selected: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primary,
    },
  });

/**
 * Compact status/filter pill.
 *
 * `selected` promotes a neutral chip to the brass treatment, but an explicit
 * `tone` always wins — a "PB" badge stays green even while selected.
 */
export const Chip = ({
  label,
  tone = 'neutral',
  selected = false,
  onPress,
  testID,
}: ChipProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();

  const resolvedTone: ChipTone =
    tone !== 'neutral' ? tone : selected ? 'primary' : 'neutral';
  const color = toneText[resolvedTone];

  const composed = [
    styles.base,
    // The brass fill belongs to the primary tone only; other tones stay
    // outlined so their colour reads cleanly against the surface.
    selected && resolvedTone === 'primary' && styles.selected,
    resolvedTone !== 'neutral' && { borderColor: theme.colors[color] },
  ];

  const content = (
    <Typography variant="overline" color={color}>
      {label.toUpperCase()}
    </Typography>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        activeOpacity={0.75}
        style={composed}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID} style={composed}>
      {content}
    </View>
  );
};
