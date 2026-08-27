import type { ReactNode } from 'react';

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { Icon } from './Icon';
import { Typography } from './Typography';

type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Right-aligned value. Rendered mono so columns line up down the list. */
  value?: string;
  /** Small leading badge — the step number in a sequence, for example. */
  index?: number;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  /** Show a trailing chevron. Implied when `onPress` is set and no `right`. */
  chevron?: boolean;
  /** Hairline separator below the row. Omit on the last row of a group. */
  divided?: boolean;
  testID?: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md - theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      minHeight: 56,
    },
    divided: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    badge: {
      width: 26,
      height: 26,
      borderRadius: theme.radius.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    body: {
      flex: 1,
      gap: 2,
    },
  });

/** One line in a grouped list. Sits inside a `flush` Card. */
export const ListRow = ({
  title,
  subtitle,
  value,
  index,
  left,
  right,
  onPress,
  chevron,
  divided = false,
  testID,
}: ListRowProps) => {
  const styles = useThemedStyles(createStyles);
  const showChevron = chevron ?? (Boolean(onPress) && !right && !value);

  const content = (
    <>
      {index !== undefined ? (
        <View style={styles.badge}>
          <Typography variant="overline" color="primary">
            {index}
          </Typography>
        </View>
      ) : null}
      {left}

      <View style={styles.body}>
        <Typography variant="bodyStrong" numberOfLines={1}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="caption" color="textTertiary" numberOfLines={1}>
            {subtitle}
          </Typography>
        ) : null}
      </View>

      {value ? (
        <Typography variant="metricSmall" color="textSecondary">
          {value}
        </Typography>
      ) : null}
      {right}
      {showChevron ? (
        <Icon name="chevron" size={16} color="textTertiary" />
      ) : null}
    </>
  );

  const style = [styles.row, divided && styles.divided];

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        activeOpacity={0.6}
        style={style}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID} style={style}>
      {content}
    </View>
  );
};
