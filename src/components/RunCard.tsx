import { memo } from 'react';

import {
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import type { SemanticColors, Theme } from '@/theme/theme';
import type { SessionSplit } from '@/types/session';
import { useThemedStyles } from '@hooks/useTheme';
import {
  formatDateTime,
  formatSeconds,
  formatSignedSeconds,
  spokenDateTime,
  spokenSeconds,
} from '@utils/format';
import { shownDeltaSign, type RunSummary } from '@utils/history';

import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { Typography } from './Typography';

/** Stands in for a figure a step does not have: an untimed step's par. */
const NO_VALUE = '—';

/** What a run stopped before its last step is marked with. */
const STOPPED_EARLY = 'Stopped early';

/** What the drill's quickest completed run is marked with. */
const PERSONAL_BEST = 'PB';

/**
 * Sizes in dp at the default font size; each is multiplied by the system
 * font scale. A figure column of the split table is `FIGURE_COLUMN_WIDTH`
 * wide; stacked, a figure only needs room for its caption, which lets all
 * three share a line on most phones.
 */
const FIGURE_COLUMN_WIDTH = 60;
const STACKED_FIGURE_MIN_WIDTH = 48;

/**
 * Above this font scale the table's four columns no longer fit side by
 * side on a phone, so each step puts its name over its captioned figures.
 */
const STACK_SPLITS_ABOVE_FONT_SCALE = 1.2;

/**
 * Above this font scale the date and the total time no longer fit side by
 * side, so the total goes under the date and chip.
 */
const STACK_HEADER_ABOVE_FONT_SCALE = 1.3;

const CHEVRON_SIZE = 12;

type Tone = 'success' | 'danger' | 'neutral';

/** A difference that reads as faster is good news, slower is bad. */
const toneOf = (delta: number): Tone => {
  const sign = shownDeltaSign(delta);
  if (sign === 0) {
    return 'neutral';
  }
  return sign < 0 ? 'success' : 'danger';
};

const toneColor: Record<Tone, keyof SemanticColors> = {
  success: 'success',
  danger: 'danger',
  neutral: 'textSecondary',
};

/** A length of time said to the hundredth, the figure the card shows. */
const speak = (seconds: number): string =>
  spokenSeconds(Number(Math.abs(seconds).toFixed(2)));

/** The card's header as a screen reader should say it. */
const speakRun = ({
  session,
  deltaToPrevious,
  personalBest,
}: RunSummary): string => {
  const said = [
    `Run on ${spokenDateTime(session.createdAt)}`,
    speak(session.totalTime),
  ];

  if (!session.completed) {
    said.push(STOPPED_EARLY.toLowerCase());
  }
  // Said in full: TalkBack reads "PB" as letters.
  if (personalBest) {
    said.push('personal best');
  }
  if (deltaToPrevious !== null) {
    const sign = shownDeltaSign(deltaToPrevious);
    said.push(
      sign === 0
        ? 'the same as the run before'
        : `${speak(deltaToPrevious)} ${sign < 0 ? 'faster' : 'slower'} than the run before`,
    );
  }

  return said.join(', ');
};

/** One step of the run as a screen reader should say it. */
const speakSplit = ({ label, par, actual, delta }: SessionSplit): string => {
  if (par === undefined || delta === null) {
    return `${label}, no par, took ${speak(actual)}`;
  }

  const sign = shownDeltaSign(delta);
  const againstPar =
    sign === 0
      ? 'on par'
      : `${speak(delta)} ${sign < 0 ? 'under' : 'over'} par`;
  return `${label}, par ${speak(par)}, took ${speak(actual)}, ${againstPar}`;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    header: {
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    headerStacked: { gap: theme.spacing.xs },
    headerText: { gap: theme.spacing.xs },
    // Beside the total, the date takes the room that is left and wraps.
    headerTextInRow: { flex: 1 },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
    },
    // The one chevron glyph points right: turned down to open, up to close.
    chevronOpen: { transform: [{ rotate: '-90deg' }] },
    chevronClosed: { transform: [{ rotate: '90deg' }] },
    table: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
    },
    rowStacked: {
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    name: { flex: 1 },
    figures: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    figuresStacked: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: theme.spacing.md,
      rowGap: theme.spacing.xs,
    },
    figure: { alignItems: 'flex-end' },
    figureCaption: { textAlign: 'right' },
    compare: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    compareButton: { minHeight: 48 },
  });

type Layout = {
  /** Name over captioned figures, instead of four columns. */
  stacked: boolean;
  /** Width of one figure column at the current font scale. */
  figureWidth: number;
};

type FigureProps = Layout & {
  caption: string;
  value: string;
  color?: keyof SemanticColors;
};

/** One of a step's three times. It carries its caption when stacked. */
const Figure = ({
  caption,
  value,
  color = 'textPrimary',
  stacked,
  figureWidth,
}: FigureProps) => {
  const styles = useThemedStyles(createStyles);

  if (stacked) {
    return (
      <View style={{ minWidth: figureWidth }}>
        <Typography variant="overline" color="textSecondary">
          {caption}
        </Typography>
        <Typography variant="metricSmall" color={color}>
          {value}
        </Typography>
      </View>
    );
  }

  return (
    <View style={[styles.figure, { width: figureWidth }]}>
      <Typography variant="metricSmall" color={color}>
        {value}
      </Typography>
    </View>
  );
};

const CAPTIONS = { par: 'PAR', actual: 'ACTUAL', delta: 'Δ' } as const;

/** The column captions, shown once above the rows when they sit in columns. */
const SplitTableHeader = ({ figureWidth }: Pick<Layout, 'figureWidth'>) => {
  const styles = useThemedStyles(createStyles);

  return (
    // Every row says its own figures by name, so the captions are skipped.
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Typography variant="overline" color="textSecondary" style={styles.name}>
        STEP
      </Typography>
      <View style={styles.figures}>
        {Object.values(CAPTIONS).map(caption => (
          <Typography
            key={caption}
            variant="overline"
            color="textSecondary"
            style={[styles.figureCaption, { width: figureWidth }]}
          >
            {caption}
          </Typography>
        ))}
      </View>
    </View>
  );
};

type SplitRowProps = Layout & {
  split: SessionSplit;
  /** Draw a rule above the row, to part it from the one before. */
  divided: boolean;
};

const SplitRow = ({ split, divided, stacked, figureWidth }: SplitRowProps) => {
  const styles = useThemedStyles(createStyles);
  const layout = { stacked, figureWidth };

  return (
    <View
      style={[
        stacked ? styles.rowStacked : styles.row,
        divided && styles.rowDivider,
      ]}
      accessible
      accessibilityLabel={speakSplit(split)}
    >
      <Typography variant="body" style={stacked ? undefined : styles.name}>
        {split.label}
      </Typography>
      <View style={stacked ? styles.figuresStacked : styles.figures}>
        <Figure
          caption={CAPTIONS.par}
          value={split.par === undefined ? NO_VALUE : formatSeconds(split.par)}
          color="textTertiary"
          {...layout}
        />
        <Figure
          caption={CAPTIONS.actual}
          value={formatSeconds(split.actual)}
          {...layout}
        />
        <Figure
          caption={CAPTIONS.delta}
          value={
            split.delta === null ? NO_VALUE : formatSignedSeconds(split.delta)
          }
          color={
            split.delta === null
              ? 'textSecondary'
              : toneColor[toneOf(split.delta)]
          }
          {...layout}
        />
      </View>
    </View>
  );
};

type SplitTableProps = {
  sessionId: string;
  splits: readonly SessionSplit[];
};

/**
 * Step / Par / Actual / Δ for every step of a run. A run has at most
 * `MAX_DRILL_STEPS` splits, so the rows are mapped, not virtualised.
 */
const SplitTable = ({ sessionId, splits }: SplitTableProps) => {
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_SPLITS_ABOVE_FONT_SCALE;
  const figureWidth =
    (stacked ? STACKED_FIGURE_MIN_WIDTH : FIGURE_COLUMN_WIDTH) * fontScale;

  return (
    <View style={styles.table} testID={`table-splits-${sessionId}`}>
      {stacked ? null : <SplitTableHeader figureWidth={figureWidth} />}
      {splits.map((split, index) => (
        <SplitRow
          key={split.stepId}
          split={split}
          // Under the captions every row is ruled; stacked, the first is not.
          divided={!stacked || index > 0}
          stacked={stacked}
          figureWidth={figureWidth}
        />
      ))}
    </View>
  );
};

type RunCardProps = {
  run: RunSummary;
  /** Whether the step breakdown is showing. */
  expanded: boolean;
  /** Show or hide the breakdown of the run with this session id. */
  onToggle: (sessionId: string) => void;
  /**
   * Start comparing the run with this session id with another run of the
   * drill. Left out when the drill has no other run, and then the card
   * offers no Compare action.
   */
  onCompare?: (sessionId: string) => void;
};

const RunCardBase = ({ run, expanded, onToggle, onCompare }: RunCardProps) => {
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const headerStacked = fontScale > STACK_HEADER_ABOVE_FONT_SCALE;
  const { session, deltaToPrevious, personalBest } = run;

  return (
    <Card flush testID={`card-run-${session.id}`}>
      {/* The whole header is the button: a big target for a gloved hand. */}
      <TouchableOpacity
        onPress={() => onToggle(session.id)}
        accessibilityRole="button"
        accessibilityLabel={speakRun(run)}
        accessibilityHint={
          expanded
            ? 'Hides the time of each step'
            : 'Shows the time of each step'
        }
        accessibilityState={{ expanded }}
        activeOpacity={0.75}
        style={styles.header}
        testID={`btn-toggle-${session.id}`}
      >
        <View style={headerStacked ? styles.headerStacked : styles.headerRow}>
          <View
            style={[
              styles.headerText,
              !headerStacked && styles.headerTextInRow,
            ]}
          >
            <Typography variant="bodyStrong">
              {formatDateTime(session.createdAt)}
            </Typography>
            {/* A run stopped early is not compared, so it has one or the other. */}
            {session.completed ? null : (
              <Chip
                label={STOPPED_EARLY}
                testID={`chip-incomplete-${session.id}`}
              />
            )}
            {personalBest ? (
              <Chip
                label={PERSONAL_BEST}
                tone="success"
                testID={`chip-pb-${session.id}`}
              />
            ) : null}
            {deltaToPrevious !== null ? (
              <Chip
                label={`${formatSignedSeconds(deltaToPrevious)} vs previous`}
                tone={toneOf(deltaToPrevious)}
                testID={`chip-delta-${session.id}`}
              />
            ) : null}
          </View>
          <Typography variant="metric">
            {formatSeconds(session.totalTime)}
          </Typography>
        </View>

        <View style={styles.toggleRow}>
          <Typography variant="label" color="primary">
            {expanded ? 'Hide splits' : 'Show splits'}
          </Typography>
          <View style={expanded ? styles.chevronOpen : styles.chevronClosed}>
            <Icon name="chevron" size={CHEVRON_SIZE} color="primary" />
          </View>
        </View>
      </TouchableOpacity>

      {expanded ? (
        <SplitTable sessionId={session.id} splits={session.splits} />
      ) : null}

      {/* Under the splits, which is what a comparison sets side by side. */}
      {expanded && onCompare !== undefined ? (
        <View style={styles.compare}>
          <Button
            label="Compare with another run"
            variant="secondary"
            onPress={() => onCompare(session.id)}
            accessibilityLabel={`Compare the run on ${spokenDateTime(session.createdAt)} with another run`}
            style={styles.compareButton}
            testID={`btn-compare-${session.id}`}
          />
        </View>
      ) : null}
    </Card>
  );
};

/**
 * One run of a drill: when it was made, its total time and how that
 * compares to the completed run before it, or that it was stopped early,
 * and a "PB" badge on the drill's personal best. Pressing the header shows
 * or hides the time of every step, and, when the drill has another run,
 * offers to compare the two.
 *
 * Memoised because the screen lists every run of the drill and pressing
 * one card must not redraw the others.
 */
export const RunCard = memo(RunCardBase);
