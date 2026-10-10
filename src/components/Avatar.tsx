import { StyleSheet, TouchableOpacity, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { Icon } from './Icon';
import { Typography } from './Typography';

type AvatarProps = {
  /**
   * Full name. Reduced to up to two initials; a blank name shows a person
   * glyph instead, so the circle is never empty.
   */
  name: string;
  size?: number;
  onPress?: () => void;
  testID?: string;
};

/** How much of the circle the person glyph fills. */
const GLYPH_SCALE = 0.5;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    // By code point, so a simple emoji at the start of a name is not cut
    // in half.
    .map(part => Array.from(part)[0] ?? '')
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
  const content = initials ? (
    <Typography
      variant={size >= 64 ? 'title' : 'bodyStrong'}
      color="primary"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {initials}
    </Typography>
  ) : (
    <Icon name="user" size={size * GLYPH_SCALE} color="primary" />
  );

  if (onPress) {
    return (
      <TouchableOpacity
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          initials ? `${name.trim()}, open profile` : 'Open profile'
        }
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
