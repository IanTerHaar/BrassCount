import type { Theme } from '@constants/theme';
import { StyleSheet, View } from 'react-native';
import { useThemedStyles } from '@hooks/useTheme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Typography } from './Typography';

type EmptyStateProps = {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
  testID?: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: theme.spacing.xxl,
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    halo: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing.xs,
    },
    action: {
      marginTop: theme.spacing.sm,
    },
  });

/** Shown when a list has nothing in it yet — never leave a blank screen. */
export const EmptyState = ({
  icon,
  title,
  message,
  actionLabel,
  onActionPress,
  testID,
}: EmptyStateProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.halo}>
        <Icon name={icon} size={30} color="textTertiary" />
      </View>

      <Typography variant="subtitle" align="center">
        {title}
      </Typography>
      <Typography variant="body" color="textSecondary" align="center">
        {message}
      </Typography>

      {actionLabel && onActionPress ? (
        <Button
          label={actionLabel}
          onPress={onActionPress}
          style={styles.action}
        />
      ) : null}
    </View>
  );
};
