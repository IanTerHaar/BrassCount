import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme/theme';
import { useTheme, useThemedStyles } from '@hooks/useTheme';

import { Button } from './Button';
import { Typography } from './Typography';

type ConfirmSheetProps = {
  visible: boolean;
  /** The question being asked, e.g. `Delete "Bill Drill"?`. */
  title: string;
  /** What confirming does, in a sentence. */
  message: string;
  /** Label of the button that goes ahead. It is styled as destructive. */
  confirmLabel: string;
  /** Shown on the confirm button while `busy`, e.g. "Deleting…". */
  busyLabel: string;
  /**
   * The confirmed action is running: both buttons are disabled and the
   * sheet cannot be dismissed until it settles.
   */
  busy?: boolean;
  /** Why the last attempt fell short. Shown above the buttons. */
  error?: string;
  onConfirm: () => void;
  /** Called when the sheet is dismissed without confirming. */
  onCancel: () => void;
  /** Prefix for the `testID`s of the sheet's controls. */
  testID: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Mirrors the appearance and par picker sheets so the three feel like
    // the same primitive.
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
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.borderStrong,
    },
    text: { gap: theme.spacing.xs },
    actions: { gap: theme.spacing.sm },
    button: { minHeight: 48 },
  });

/**
 * Bottom sheet that asks before something destructive happens. Confirming
 * calls `onConfirm`; closing the sheet is left to the caller, through
 * `visible`, so it can stay up while the action runs and when it fails.
 */
export const ConfirmSheet = ({
  visible,
  title,
  message,
  confirmLabel,
  busyLabel,
  busy = false,
  error,
  onConfirm,
  onCancel,
  testID,
}: ConfirmSheetProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // While the action runs there is nothing to go back to: the backdrop
  // and the system back button wait for it to settle.
  const dismiss = busy ? undefined : onCancel;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => dismiss?.()}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={dismiss}
        testID={`${testID}-backdrop`}
      >
        {/* Claims touches inside the sheet so they don't reach the backdrop
            and dismiss it. */}
        <View
          onStartShouldSetResponder={() => true}
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + theme.spacing.md },
          ]}
          testID={testID}
        >
          <View style={styles.grabber} />
          <View style={styles.text}>
            <Typography variant="subtitle" accessibilityRole="header">
              {title}
            </Typography>
            <Typography variant="body" color="textSecondary">
              {message}
            </Typography>
            {/* Always mounted, so a reader hears the error when it appears. */}
            <View accessibilityLiveRegion="polite">
              {error ? (
                <Typography
                  variant="label"
                  color="danger"
                  testID={`${testID}-error`}
                >
                  {error}
                </Typography>
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              label={busy ? busyLabel : confirmLabel}
              variant="danger"
              disabled={busy}
              onPress={onConfirm}
              style={styles.button}
              testID={`${testID}-confirm`}
            />
            <Button
              label="Cancel"
              variant="secondary"
              disabled={busy}
              onPress={onCancel}
              style={styles.button}
              testID={`${testID}-cancel`}
            />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};
