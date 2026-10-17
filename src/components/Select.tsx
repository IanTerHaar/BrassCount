import { useState } from 'react';

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import { useThemedStyles } from '@hooks/useTheme';

import { BottomSheet } from './BottomSheet';
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
  /** The value cannot be changed: the trigger is dimmed and does not open. */
  disabled?: boolean;
  testID?: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    group: { gap: theme.spacing.xs },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      minHeight: theme.sizes.touchTarget,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
    },
    // Matches a disabled `Button`.
    triggerDisabled: { opacity: 0.5 },
    triggerText: { flex: 1 },
    // Points the chevron down without a second glyph.
    triggerChevron: { transform: [{ rotate: '90deg' }] },

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
  disabled = false,
  testID,
}: Readonly<SelectProps<T>>) {
  const styles = useThemedStyles(createStyles);
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
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ?? sheetTitle ?? 'Select an option'}
        accessibilityValue={{ text: selected?.label }}
        accessibilityState={{ disabled }}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
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

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        closeLabel="Close"
        backdropTestID={testID ? `${testID}-backdrop` : undefined}
      >
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
      </BottomSheet>
    </View>
  );
}
