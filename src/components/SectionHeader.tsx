import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { Typography } from './Typography';

type SectionHeaderProps = {
  title: string;
  /** Optional right-hand text action, e.g. "Add new". */
  actionLabel?: string;
  onActionPress?: () => void;
  testID?: string;
};

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
          style={styles.action}
        >
          <Typography variant="label" color="primary">
            {actionLabel}
          </Typography>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};
