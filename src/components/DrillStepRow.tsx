import { memo, useCallback, type ElementRef } from 'react';

import {
  AccessibilityInfo,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import type { Theme } from '@/theme/theme';
import type { DrillStep, DrillStepType } from '@/types/drill';
import { useTheme, useThemedStyles } from '@hooks/useTheme';
import { stepTypeLabel } from '@utils/drill';
import { stepTypeChoices } from '@utils/drillDraft';
import { formatSeconds, spokenSeconds } from '@utils/format';

import { Icon } from './Icon';
import { Select, type SelectOption } from './Select';
import { Typography } from './Typography';

/** The hint under each step type in the open dropdown. */
const STEP_TYPE_DESCRIPTIONS: Record<DrillStepType, string> = {
  draw: 'From the holster',
  shot: 'One round downrange',
  reload: 'Magazine change',
  rack: 'Cycle the slide',
  transition: 'Move to the next target',
  holster: 'Make safe',
};

const stepTypeOptions = (
  current: DrillStepType,
): SelectOption<DrillStepType>[] =>
  stepTypeChoices(current).map(type => ({
    value: type,
    label: stepTypeLabel(type),
    description: STEP_TYPE_DESCRIPTIONS[type],
  }));

/**
 * Extra touch area around the small controls of a step row, taking each
 * up to the 48dp minimum without growing the row. The remove button is a
 * 32dp circle; the par pill is wide enough but about 26dp tall; a move
 * button is 40dp, and its slop stops where its neighbour's starts.
 */
const REMOVE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const PAR_HIT_SLOP = { top: 11, bottom: 11 };
const MOVE_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      // Sends the controls after the dropdown to the right edge when large
      // text drops them to a second line.
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    badge: {
      minWidth: theme.sizes.badge,
      minHeight: theme.sizes.badge,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.radius.badge,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    select: { flexGrow: 1, flexShrink: 1 },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    parChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
    },
    parChipSet: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primary,
    },
    roundButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    removeButton: {
      width: theme.sizes.removeButton,
      height: theme.sizes.removeButton,
      borderRadius: theme.sizes.removeButton / 2,
    },
    moveButton: {
      width: theme.sizes.moveButton,
      height: theme.sizes.moveButton,
      borderRadius: theme.sizes.moveButton / 2,
    },
    moveButtonDisabled: { opacity: 0.4 },
    // Rotating a glyph turns the plus into a cross and the chevron up or
    // down. The rotation sits inside the button, not on it: Android stops
    // delivering presses to a touchable that is both rotated and given a
    // `hitSlop`.
    removeGlyph: { transform: [{ rotate: '45deg' }] },
    upGlyph: { transform: [{ rotate: '-90deg' }] },
    downGlyph: { transform: [{ rotate: '90deg' }] },
  });

type MoveButtonProps = {
  direction: 'up' | 'down';
  disabled: boolean;
  /** Where the step sits now, counted from 0. */
  position: number;
  label: string;
  onPress: () => void;
};

/** Moves its step one place up or down the list. */
const MoveButton = ({
  direction,
  disabled,
  position,
  label,
  onPress,
}: MoveButtonProps) => {
  const styles = useThemedStyles(createStyles);
  const { sizes } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Move step ${position + 1}, ${label}, ${direction}`}
      accessibilityState={{ disabled }}
      hitSlop={MOVE_HIT_SLOP}
      style={[
        styles.roundButton,
        styles.moveButton,
        disabled && styles.moveButtonDisabled,
      ]}
      testID={`btn-move-${direction}-step-${position}`}
    >
      <View style={direction === 'up' ? styles.upGlyph : styles.downGlyph}>
        <Icon name="chevron" size={sizes.iconLg} color="textSecondary" />
      </View>
    </TouchableOpacity>
  );
};

type DrillStepRowProps = {
  step: DrillStep;
  /** Where the step sits in the drill, counted from 0. */
  position: number;
  /** Whether this is the drill's last step, so it cannot move down. */
  last: boolean;
  /** What the step is called in the sequence, e.g. "Shot 2". */
  label: string;
  /**
   * Whether the row shows move buttons in place of its par and remove
   * controls.
   */
  reordering: boolean;
  /** Narrowest the dropdown may get before the row wraps. */
  selectMinWidth: number;
  onChangeType: (id: string, type: DrillStepType) => void;
  /** Open the par picker for the step with this id. */
  onEditPar: (id: string) => void;
  onRemove: (id: string) => void;
  /** Move the step with this id to `toPosition`, counted from 0. */
  onMove: (id: string, toPosition: number) => void;
  /**
   * Hands the screen the step's remove button (and `null` when it goes),
   * so it can put the reader's focus there once a neighbour is removed.
   */
  registerRemove?: (
    id: string,
    node: ElementRef<typeof TouchableOpacity> | null,
  ) => void;
};

/**
 * One step of the drill editor: its number, type dropdown, and either its
 * par and remove controls or, while the list is being reordered, a button
 * to move it up and one to move it down. Memoised so typing the drill's
 * name, or changing one step, does not draw every other row again.
 */
export const DrillStepRow = memo(
  ({
    step,
    position,
    last,
    label,
    reordering,
    selectMinWidth,
    onChangeType,
    onEditPar,
    onRemove,
    onMove,
    registerRemove,
  }: DrillStepRowProps) => {
    const styles = useThemedStyles(createStyles);
    const { sizes } = useTheme();
    const number = position + 1;
    const hasPar = step.par !== undefined;
    const stepId = step.id;
    const removeRef = useCallback(
      (node: ElementRef<typeof TouchableOpacity> | null) =>
        registerRemove?.(stepId, node),
      [registerRemove, stepId],
    );

    const move = (direction: 'up' | 'down') => {
      const to = direction === 'up' ? position - 1 : position + 1;
      // The button is disabled at either end; this keeps a stray press
      // from announcing a move that did not happen.
      if (to < 0 || (direction === 'down' && last)) {
        return;
      }
      onMove(step.id, to);
      // The row is redrawn in its new place and its number changes under
      // the reader's focus: say where it went.
      AccessibilityInfo.announceForAccessibility(
        `Moved step ${number}, ${label}, ${direction} to step ${to + 1}`,
      );
    };

    return (
      <View style={styles.row} testID={`row-step-${position}`}>
        <View style={styles.badge}>
          <Typography variant="overline" color="primary">
            {String(number)}
          </Typography>
        </View>

        <View style={[styles.select, { minWidth: selectMinWidth }]}>
          <Select
            value={step.type}
            options={stepTypeOptions(step.type)}
            onChange={next => onChangeType(step.id, next)}
            sheetTitle={`Step ${number}`}
            testID={`select-step-${position}`}
          />
        </View>

        {reordering ? (
          <View style={styles.controls}>
            <MoveButton
              direction="up"
              disabled={position === 0}
              position={position}
              label={label}
              onPress={() => move('up')}
            />
            <MoveButton
              direction="down"
              disabled={last}
              position={position}
              label={label}
              onPress={() => move('down')}
            />
          </View>
        ) : (
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={() => onEditPar(step.id)}
              accessibilityRole="button"
              accessibilityLabel={
                step.par === undefined
                  ? `Set par for step ${number}`
                  : `Change par for step ${number}, currently ${spokenSeconds(
                      step.par,
                    )}`
              }
              hitSlop={PAR_HIT_SLOP}
              style={[styles.parChip, hasPar && styles.parChipSet]}
              testID={`btn-par-step-${position}`}
            >
              <Icon
                name="timer"
                size={sizes.iconSm}
                color={hasPar ? 'primary' : 'textTertiary'}
              />
              <Typography
                variant="label"
                color={hasPar ? 'primary' : 'textTertiary'}
              >
                {step.par === undefined ? '+ par' : formatSeconds(step.par)}
              </Typography>
            </TouchableOpacity>

            <TouchableOpacity
              ref={removeRef}
              onPress={() => {
                onRemove(step.id);
                // The row, and the reader's focus with it, is gone: say so.
                AccessibilityInfo.announceForAccessibility(
                  `Removed step ${number}, ${label}`,
                );
              }}
              accessibilityRole="button"
              accessibilityLabel={`Remove step ${number}, ${label}`}
              hitSlop={REMOVE_HIT_SLOP}
              style={[styles.roundButton, styles.removeButton]}
              testID={`btn-remove-step-${position}`}
            >
              <View style={styles.removeGlyph}>
                <Icon name="plus" size={sizes.iconMd} color="textSecondary" />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  },
);

DrillStepRow.displayName = 'DrillStepRow';
