import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { Typography } from './Typography';

type AvatarProps = {
  /** Full name. Reduced to up to two initials. */
  name: string;
  size?: number;
  onPress?: () => void;
  testID?: string;
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] ?? '')
    .join('')
    .toUpperCase();

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primary,
    },
  });

/** Initials avatar. Avoids bundling image assets for a placeholder. */
export const Avatar = ({ name, size = 40, onPress, testID }: AvatarProps) => {
  const styles = useThemedStyles(createStyles);
  const initials = initialsOf(name);

  const sizing = { width: size, height: size, borderRadius: size / 2 };
  const content = (
    <Typography
      variant={size >= 64 ? 'title' : 'bodyStrong'}
      color="primary"
      accessibilityElementsHidden
    >
      {initials}
    </Typography>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, open profile`}
        activeOpacity={0.75}
        style={[styles.base, sizing]}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityLabel={name}
      style={[styles.base, sizing]}
    >
      {content}
    </View>
  );
};
