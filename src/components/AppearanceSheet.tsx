import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme/theme';
import {
  APPEARANCE_PREFERENCES,
  type AppearancePreference,
} from '@/types/profile';
import { useTheme, useThemedStyles } from '@hooks/useTheme';

import { Icon } from './Icon';
import { Typography } from './Typography';

/** How each choice is named in the sheet. */
const APPEARANCE_LABELS: Record<AppearancePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const APPEARANCE_DESCRIPTIONS: Record<AppearancePreference, string> = {
  system: 'Follows your device setting',
  light: 'Always use the light theme',
  dark: 'Always use the dark theme',
};

type AppearanceSheetProps = {
  visible: boolean;
  /** The choice in use, marked with a check. */
  selected: AppearancePreference;
  onSelect: (preference: AppearancePreference) => void;
  /** Called when the sheet is dismissed without choosing. */
  onClose: () => void;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Mirrors the par picker sheet so the two feel like the same primitive.
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    sheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingTop: theme.spacing.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.borderStrong,
      marginBottom: theme.spacing.sm,
    },
    header: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.sm,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md - theme.spacing.xs,
      paddingHorizontal: theme.spacing.lg,
      minHeight: 56,
    },
    optionDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    optionBody: { flex: 1, gap: 2 },
  });

/**
 * Bottom sheet for the Appearance preference: System, Light or Dark.
 * Choosing one calls `onSelect`; closing the sheet is left to the caller,
 * through `visible`.
 */
export const AppearanceSheet = ({
  visible,
  selected,
  onSelect,
  onClose,
}: AppearanceSheetProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close appearance picker"
        onPress={onClose}
        testID="btn-appearance-close"
      >
        {/* Claims touches inside the sheet so they don't reach the backdrop
            and dismiss it. */}
        <View
          onStartShouldSetResponder={() => true}
          accessibilityRole="radiogroup"
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + theme.spacing.sm },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Typography
              variant="overline"
              color="textSecondary"
              accessibilityRole="header"
            >
              APPEARANCE
            </Typography>
          </View>

          {APPEARANCE_PREFERENCES.map((preference, i) => {
            const isSelected = preference === selected;
            return (
              <Pressable
                key={preference}
                onPress={() => onSelect(preference)}
                accessibilityRole="radio"
                accessibilityLabel={`${APPEARANCE_LABELS[preference]}, ${APPEARANCE_DESCRIPTIONS[preference]}`}
                accessibilityState={{ checked: isSelected }}
                style={[styles.option, i > 0 && styles.optionDivider]}
                testID={`opt-appearance-${preference}`}
              >
                <View style={styles.optionBody}>
                  <Typography
                    variant="bodyStrong"
                    color={isSelected ? 'primary' : 'textPrimary'}
                  >
                    {APPEARANCE_LABELS[preference]}
                  </Typography>
                  <Typography variant="caption" color="textTertiary">
                    {APPEARANCE_DESCRIPTIONS[preference]}
                  </Typography>
                </View>
                {isSelected ? (
                  <Icon name="check" size={18} color="primary" />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
};
