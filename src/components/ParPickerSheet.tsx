import { useState } from 'react';

import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import { MAX_STEP_PAR_SECONDS } from '@/types/drill';
import { useThemedStyles } from '@hooks/useTheme';
import { parseParInput } from '@utils/drillDraft';
import { formatSeconds, spokenSeconds } from '@utils/format';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Icon } from './Icon';
import { TextField } from './TextField';
import { Typography } from './Typography';

type ParPreset = {
  /** `undefined` is the "No par" row, which leaves the step untimed. */
  seconds: number | undefined;
  description?: string;
};

/** Step pars offered as one-tap rows under the custom field. */
const PAR_PRESETS: readonly ParPreset[] = [
  { seconds: undefined, description: 'Untimed step' },
  { seconds: 0.15, description: 'Very fast split' },
  { seconds: 0.2 },
  { seconds: 0.25, description: 'Comfortable split' },
  { seconds: 0.3 },
  { seconds: 0.5, description: 'Head shot / transition' },
  { seconds: 0.75 },
  { seconds: 1.0 },
  { seconds: 1.5, description: 'Draw from concealment' },
  { seconds: 2.0, description: 'Reload' },
  { seconds: 3.0 },
];

/** Room for the longest par that can be typed, "60.00", and one to spare. */
const CUSTOM_PAR_MAX_LENGTH = 6;

const presetLabel = (seconds: number | undefined): string =>
  seconds === undefined ? 'No par' : formatSeconds(seconds);

type ParPickerSheetProps = {
  visible: boolean;
  /** Position of the step being timed, counted from 1, for the heading. */
  stepNumber: number;
  /** The step's current par in seconds; `undefined` when it is untimed. */
  par: number | undefined;
  /** Called with the par chosen, or `undefined` for "No par". */
  onSelect: (par: number | undefined) => void;
  /** Called when the sheet is dismissed without choosing. */
  onClose: () => void;
};

type ParPickerBodyProps = Pick<
  ParPickerSheetProps,
  'stepNumber' | 'par' | 'onSelect'
>;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.sm,
      gap: 2,
    },
    custom: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.xs,
    },
    customRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing.sm,
    },
    customField: { flex: 1 },
    presetHeader: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
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
    optionList: { maxHeight: 420 },
  });

/**
 * What the sheet shows. A separate component so the custom field starts
 * from the step's par each time the sheet opens: the `Modal` renders
 * nothing while it is hidden, which unmounts this and its state.
 */
const ParPickerBody = ({ stepNumber, par, onSelect }: ParPickerBodyProps) => {
  const styles = useThemedStyles(createStyles);
  // Prefilled with the current par, so a small change is one keystroke.
  const [customText, setCustomText] = useState(
    par === undefined ? '' : par.toFixed(2),
  );

  const customPar = parseParInput(customText);
  const customRejected = customText.trim().length > 0 && customPar === null;

  return (
    <>
      <View style={styles.header}>
        <Typography
          variant="overline"
          color="textSecondary"
          accessibilityRole="header"
          testID="text-par-heading"
        >
          {`STEP ${stepNumber} PAR`}
        </Typography>
        <Typography variant="caption" color="textTertiary">
          {stepNumber === 1
            ? 'Max time from the timer start to this step.'
            : 'Max time from the previous step to this one.'}
        </Typography>
      </View>

      <View style={styles.custom}>
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <TextField
              label="Custom par"
              value={customText}
              onChangeText={setCustomText}
              placeholder="0.00"
              decimal
              unit="s"
              maxLength={CUSTOM_PAR_MAX_LENGTH}
              testID="input-par-custom"
            />
          </View>
          <Button
            label="Set"
            accessibilityLabel="Set custom par"
            onPress={() => {
              if (customPar !== null) {
                onSelect(customPar);
              }
            }}
            disabled={customPar === null}
            accessibilityHint={
              customPar === null ? 'Enter a valid par time first' : undefined
            }
            testID="btn-par-custom-set"
          />
        </View>
        {/* Always shown, so the reason "Set" is disabled is on screen
            before anything is typed; the colour only adds emphasis. */}
        <Typography
          variant="caption"
          color={customRejected ? 'danger' : 'textTertiary'}
          testID="text-par-custom-hint"
        >
          {`Enter a time from 0.01 to ${MAX_STEP_PAR_SECONDS} seconds.`}
        </Typography>
      </View>

      <View style={styles.presetHeader}>
        <Typography variant="overline" color="textSecondary">
          OR PICK A PRESET
        </Typography>
      </View>

      <ScrollView style={styles.optionList} bounces={false}>
        {PAR_PRESETS.map((preset, i) => {
          const isSelected = preset.seconds === par;
          const spoken =
            preset.seconds === undefined
              ? 'No par'
              : spokenSeconds(preset.seconds);

          return (
            <Pressable
              key={presetLabel(preset.seconds)}
              onPress={() => onSelect(preset.seconds)}
              accessibilityRole="button"
              accessibilityLabel={
                preset.description ? `${spoken}, ${preset.description}` : spoken
              }
              accessibilityState={{ selected: isSelected }}
              style={[styles.option, i > 0 && styles.optionDivider]}
              testID={`opt-par-${preset.seconds ?? 'none'}`}
            >
              <View style={styles.optionBody}>
                <Typography
                  variant="bodyStrong"
                  color={isSelected ? 'primary' : 'textPrimary'}
                >
                  {presetLabel(preset.seconds)}
                </Typography>
                {preset.description ? (
                  <Typography variant="caption" color="textTertiary">
                    {preset.description}
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
    </>
  );
};

/**
 * Bottom sheet for one step's par: a custom time typed to the hundredth of
 * a second, or one of the preset rows. Choosing either calls `onSelect`;
 * closing the sheet is left to the caller, through `visible`.
 */
export const ParPickerSheet = ({
  visible,
  stepNumber,
  par,
  onSelect,
  onClose,
}: ParPickerSheetProps) => {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel="Close par picker"
      backdropTestID="btn-par-close"
    >
      <ParPickerBody stepNumber={stepNumber} par={par} onSelect={onSelect} />
    </BottomSheet>
  );
};
