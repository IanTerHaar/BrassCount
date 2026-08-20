import type { ReactNode } from 'react';

import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { Icon } from './Icon';
import { Typography } from './Typography';

type ScreenProps = {
  title?: string;
  /** Supporting line under the title. */
  subtitle?: string;
  /** Accessory pinned to the title row's right edge, e.g. an avatar. */
  headerRight?: ReactNode;
  /** Show a back control before the title. Pass `navigation.goBack`. */
  onBack?: () => void;
  children: ReactNode;
  /** Center children on both axes. Defaults to false (top-aligned). */
  centered?: boolean;
  /** Wrap content in a ScrollView. Use for any screen that can overflow. */
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shared screen shell: safe-area, themed background, standard padding, and
 * an optional title. Screens should render only their unique content inside.
 *
 * Bottom inset is left to the tab bar, which floats over the content and
 * applies its own safe-area padding.
 */
const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.colors.background },
    content: {
      flex: 1,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    scrollContent: {
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
      // Clears the floating tab bar so the last card is never trapped.
      paddingBottom: theme.spacing.xxl * 2,
    },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    headerText: { flex: 1, gap: 2 },
    back: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      // Reuse the right-facing chevron rather than ship a mirrored glyph.
      transform: [{ rotate: '180deg' }],
    },
  });

export const Screen = ({
  title,
  subtitle,
  headerRight,
  onBack,
  children,
  centered = false,
  scrollable = false,
  contentStyle,
  testID,
}: ScreenProps) => {
  const styles = useThemedStyles(createStyles);

  const header =
    title || headerRight || onBack ? (
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            activeOpacity={0.7}
            style={styles.back}
            testID="btn-back"
          >
            <Icon name="chevron" size={18} color="textPrimary" />
          </TouchableOpacity>
        ) : null}

        <View style={styles.headerText}>
          {title ? <Typography variant="title">{title}</Typography> : null}
          {subtitle ? (
            <Typography variant="body" color="textSecondary">
              {subtitle}
            </Typography>
          ) : null}
        </View>
        {headerRight}
      </View>
    ) : null;

  return (
    <SafeAreaView
      testID={testID}
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      {scrollable ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View
          style={[styles.content, centered && styles.centered, contentStyle]}
        >
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
};
