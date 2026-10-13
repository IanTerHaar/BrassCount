import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { Typography } from './Typography';

type SectionHeaderProps = {
  title: string;
  /** Optional right-hand text action, e.g. "Add new". */
  actionLabel?: string;
  onActionPress?: () => void;
  /**
   * What a screen reader says for the action, when its visible text alone
   * does not say what it does (a bare "Done").
   */
  actionAccessibilityLabel?: string;
  actionTestID?: string;
  testID?: string;
};

/**
 * Extra touch area around the text action, taking it up to the 48dp
 * minimum without pushing the header's line apart. The label line is
 * 18dp tall, plus the action's own padding.
 */
const ACTION_HIT_SLOP = { top: 11, bottom: 11, left: 8, right: 8 };

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
    },
    action: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.xs,
    },
  });

/** Small all-caps label that groups the cards beneath it. */
export const SectionHeader = ({
  title,
  actionLabel,
  onActionPress,
  actionAccessibilityLabel,
  actionTestID,
  testID,
}: SectionHeaderProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row} testID={testID}>
      <Typography variant="overline" color="textSecondary">
        {title.toUpperCase()}
      </Typography>

      {actionLabel && onActionPress ? (
        <TouchableOpacity
          onPress={onActionPress}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel}
          hitSlop={ACTION_HIT_SLOP}
          style={styles.action}
          testID={actionTestID}
        >
          <Typography variant="label" color="primary">
            {actionLabel}
          </Typography>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};
