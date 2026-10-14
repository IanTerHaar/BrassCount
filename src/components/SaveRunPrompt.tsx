import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import type { RunSaveFailure, RunSaveStatus } from '@hooks/useRunSave';
import { useThemedStyles } from '@hooks/useTheme';
import { formatSeconds, pluralize } from '@utils/format';

import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { Typography } from './Typography';

type SaveRunPromptProps = {
  /** Whether every step the run listened for was heard. */
  completed: boolean;
  /** Seconds from the start signal to the last step heard. */
  totalTime: number;
  /** How many steps were heard. */
  heardCount: number;
  /** How many steps the run listened for. */
  plannedCount: number;
  status: RunSaveStatus;
  failure: RunSaveFailure | null;
  onSave: () => void;
  onDiscard: () => void;
};

/**
 * Above this font scale the two buttons no longer fit side by side on a
 * phone, so they are stacked, in the order a screen reader meets them.
 */
const STACK_ACTIONS_ABOVE_FONT_SCALE = 1.3;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.spacing.md },
    text: { gap: theme.spacing.xs },
    actions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    actionsStacked: {
      flexDirection: 'column',
      gap: theme.spacing.sm,
    },
    // Big targets: the shooter may still be wearing gloves.
    button: { flex: 1, minHeight: 48 },
    buttonStacked: { minHeight: 48 },
    saved: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
  });

/** The line under the question: what is about to be saved. */
const describeRun = ({
  completed,
  totalTime,
  heardCount,
  plannedCount,
}: Pick<
  SaveRunPromptProps,
  'completed' | 'totalTime' | 'heardCount' | 'plannedCount'
>): string =>
  completed
    ? `${formatSeconds(totalTime)} · ${pluralize(heardCount, 'step')} heard.`
    : `Stopped early at ${formatSeconds(totalTime)}: ${heardCount} of ${pluralize(plannedCount, 'step')} heard. It is kept as incomplete and left out of your best and average.`;

const failureMessage = (failure: RunSaveFailure): string =>
  failure === 'invalid'
    ? 'This run cannot be saved.'
    : 'Could not save this run. Try again.';

/**
 * Asks whether a finished run goes into History. Nothing is stored until
 * Save is pressed; Discard drops the run. Once saved, the card says so in
 * place of the question.
 */
export const SaveRunPrompt = ({
  completed,
  totalTime,
  heardCount,
  plannedCount,
  status,
  failure,
  onSave,
  onDiscard,
}: SaveRunPromptProps) => {
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_ACTIONS_ABOVE_FONT_SCALE;
  const buttonStyle = stacked ? styles.buttonStacked : styles.button;

  if (status === 'saved') {
    return (
      <Card testID="card-save-run">
        <View style={styles.saved} accessible testID="text-run-saved">
          <Icon name="check" size={18} color="success" />
          <Typography variant="bodyStrong">
            {completed ? 'Saved to History' : 'Saved to History as incomplete'}
          </Typography>
        </View>
      </Card>
    );
  }

  const saving = status === 'saving';
  // Storage turned this run down as it is: another press cannot help.
  const refused = failure === 'invalid';

  return (
    <Card testID="card-save-run">
      <View style={styles.body}>
        <View style={styles.text}>
          <Typography variant="subtitle" accessibilityRole="header">
            Save this run?
          </Typography>
          <Typography
            variant="body"
            color="textSecondary"
            testID="text-save-run-summary"
          >
            {describeRun({ completed, totalTime, heardCount, plannedCount })}
          </Typography>
          {/* Always mounted, so a reader hears the error when it appears. */}
          <View accessibilityLiveRegion="polite">
            {failure === null ? null : (
              <Typography
                variant="label"
                color="danger"
                testID="text-save-run-error"
              >
                {failureMessage(failure)}
              </Typography>
            )}
          </View>
        </View>

        <View style={stacked ? styles.actionsStacked : styles.actions}>
          <Button
            label="Discard"
            variant="secondary"
            disabled={saving}
            onPress={onDiscard}
            accessibilityLabel="Discard run"
            style={buttonStyle}
            testID="btn-discard-run"
          />
          <Button
            label={
              saving ? 'Saving…' : completed ? 'Save run' : 'Save as incomplete'
            }
            disabled={saving || refused}
            onPress={onSave}
            style={buttonStyle}
            testID="btn-save-run"
          />
        </View>
      </View>
    </Card>
  );
};
