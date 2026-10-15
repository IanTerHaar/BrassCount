import { useCallback } from 'react';

import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme/theme';
import { useTheme, useThemedStyles } from '@hooks/useTheme';
import {
  formatDateTime,
  formatSeconds,
  spokenDateTime,
  spokenSeconds,
} from '@utils/format';
import type { RunSummary } from '@utils/history';

import { Chip } from './Chip';
import { Typography } from './Typography';

/** The most of the window's height the sheet's list may take. */
const LIST_MAX_HEIGHT_RATIO = 0.6;

/** What a run stopped before its last step is marked with, as on its card. */
const STOPPED_EARLY = 'Stopped early';

type RunPickerSheetProps = {
  visible: boolean;
  /** The runs that can be picked, newest first. */
  runs: readonly RunSummary[];
  /** Called with the session id of the run picked. */
  onSelect: (sessionId: string) => void;
  /** Called when the sheet is dismissed without picking. */
  onClose: () => void;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // Mirrors the appearance and par picker sheets so they feel like the
    // same primitive.
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
      gap: theme.spacing.xs,
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
    // The date takes the room the total leaves, and wraps.
    optionBody: { flex: 1, gap: theme.spacing.xs },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
  });

/** A run as a screen reader should say it in the list. */
const speakRun = ({ session, personalBest }: RunSummary): string =>
  [
    `Run on ${spokenDateTime(session.createdAt)}`,
    spokenSeconds(Number(session.totalTime.toFixed(2))),
    ...(session.completed ? [] : [STOPPED_EARLY.toLowerCase()]),
    // Said in full: TalkBack reads "PB" as letters.
    ...(personalBest ? ['personal best'] : []),
  ].join(', ');

type RunOptionProps = {
  run: RunSummary;
  divided: boolean;
  onSelect: (sessionId: string) => void;
};

const RunOption = ({ run, divided, onSelect }: RunOptionProps) => {
  const styles = useThemedStyles(createStyles);
  const { session, personalBest } = run;

  return (
    <Pressable
      onPress={() => onSelect(session.id)}
      accessibilityRole="button"
      accessibilityLabel={speakRun(run)}
      accessibilityHint="Compares this run with the one you chose"
      style={[styles.option, divided && styles.optionDivider]}
      testID={`opt-compare-${session.id}`}
    >
      <View style={styles.optionBody}>
        <Typography variant="bodyStrong">
          {formatDateTime(session.createdAt)}
        </Typography>
        {session.completed && !personalBest ? null : (
          <View style={styles.chips}>
            {session.completed ? null : <Chip label={STOPPED_EARLY} />}
            {personalBest ? <Chip label="PB" tone="success" /> : null}
          </View>
        )}
      </View>
      <Typography variant="metricSmall">
        {formatSeconds(session.totalTime)}
      </Typography>
    </Pressable>
  );
};

const keyOfRun = (run: RunSummary): string => run.session.id;

/**
 * Bottom sheet that picks the run to compare another run of the same drill
 * with. Picking one calls `onSelect`; closing the sheet is left to the
 * caller, through `visible`. A drill can be run any number of times, so
 * the runs are a list that scrolls inside the sheet.
 */
export const RunPickerSheet = ({
  visible,
  runs,
  onSelect,
  onClose,
}: RunPickerSheetProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const renderRun = useCallback(
    ({ item, index }: ListRenderItemInfo<RunSummary>) => (
      <RunOption run={item} divided={index > 0} onSelect={onSelect} />
    ),
    [onSelect],
  );

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
        accessibilityLabel="Close run picker"
        onPress={onClose}
        testID="btn-compare-close"
      >
        {/* Claims touches inside the sheet so they don't reach the backdrop
            and dismiss it. */}
        <View
          onStartShouldSetResponder={() => true}
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + theme.spacing.sm },
          ]}
          testID="sheet-compare"
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Typography
              variant="overline"
              color="textSecondary"
              accessibilityRole="header"
            >
              COMPARE WITH
            </Typography>
            <Typography variant="caption" color="textTertiary">
              Pick another run of this drill.
            </Typography>
          </View>

          <FlatList
            data={runs}
            keyExtractor={keyOfRun}
            renderItem={renderRun}
            style={{ maxHeight: height * LIST_MAX_HEIGHT_RATIO }}
            testID="list-compare-runs"
          />
        </View>
      </Pressable>
    </Modal>
  );
};
