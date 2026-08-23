import { useState } from 'react';

import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { Icon } from './Icon';
import { Typography } from './Typography';

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  /** Optional hint shown under the label in the open sheet. */
  description?: string;
};

type SelectProps<T extends string> = {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (next: T) => void;
  /** Heading for the sheet that opens on press. */
  sheetTitle?: string;
  testID?: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    group: { gap: theme.spacing.xs },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      minHeight: 48,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
    },
    triggerText: { flex: 1 },
    // Points the chevron down without a second glyph.
    triggerChevron: { transform: [{ rotate: '90deg' }] },

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
    sheetTitle: {
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
    optionList: { maxHeight: 380 },
  });

/**
 * Dropdown built on React Native's core `Modal`.
 *
 * The project has no picker dependency, so the options open in a bottom
 * sheet — which also gives more room for labels than a native picker wheel.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  sheetTitle,
  testID,
}: Readonly<SelectProps<T>>) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const selected = options.find(option => option.value === value);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <View style={styles.group}>
      {label ? (
        <Typography variant="label" color="textSecondary">
          {label}
        </Typography>
      ) : null}

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label ?? sheetTitle ?? 'Select an option'}
        accessibilityValue={{ text: selected?.label }}
        style={styles.trigger}
        testID={testID}
      >
        <View style={styles.triggerText}>
          <Typography
            variant="bodyStrong"
            color={selected ? 'textPrimary' : 'textTertiary'}
            numberOfLines={1}
          >
            {selected?.label ?? 'Choose…'}
          </Typography>
        </View>

        <View style={styles.triggerChevron}>
          <Icon name="chevron" size={14} color="textTertiary" />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Close"
          onPress={() => setOpen(false)}
        >
          {/* Swallow taps inside the sheet so they don't dismiss it. */}
          <Pressable
            onPress={event => event.stopPropagation()}
            style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}
          >
            <View style={styles.grabber} />

            {sheetTitle ? (
              <View style={styles.sheetTitle}>
                <Typography variant="overline" color="textSecondary">
                  {sheetTitle.toUpperCase()}
                </Typography>
              </View>
            ) : null}

            <ScrollView style={styles.optionList} bounces={false}>
              {options.map((option, i) => {
                const isSelected = option.value === value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => choose(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={[styles.option, i > 0 && styles.optionDivider]}
                    testID={`${testID}-option-${option.value}`}
                  >
                    <View style={styles.optionBody}>
                      <Typography
                        variant="bodyStrong"
                        color={isSelected ? 'primary' : 'textPrimary'}
                      >
                        {option.label}
                      </Typography>
                      {option.description ? (
                        <Typography variant="caption" color="textTertiary">
                          {option.description}
                        </Typography>
                      ) : null}
                    </View>

                    {isSelected ? (
                      <Icon name="check" size={18} color="primary" />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
