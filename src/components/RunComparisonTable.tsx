import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { SemanticColors, Theme } from '@/theme/theme';
import { useThemedStyles } from '@hooks/useTheme';
import {
  formatSeconds,
  formatSignedSeconds,
  spokenSeconds,
} from '@utils/format';
import { shownDeltaSign, type StepComparison } from '@utils/history';

import { Typography } from './Typography';

/** Stands in for a time a run does not have: a step it never heard. */
const NO_VALUE = '—';

/**
 * Sizes in dp at the default font size; each is multiplied by the system
 * font scale. "EARLIER" is the widest caption a figure column carries.
 */
const FIGURE_COLUMN_WIDTH = 64;
const STACKED_FIGURE_MIN_WIDTH = 56;

/**
 * Above this font scale the table's four columns no longer fit side by
 * side on a phone, so each step puts its name over its captioned figures.
 * The same point the run card's split table stacks at.
 */
const STACK_ROWS_ABOVE_FONT_SCALE = 1.2;

const CAPTIONS = { earlier: 'EARLIER', later: 'LATER', delta: 'Δ' } as const;

/** Faster reads as good news, slower as bad; no difference as neither. */
export const deltaColor = (delta: number | null): keyof SemanticColors => {
  const sign = delta === null ? 0 : shownDeltaSign(delta);
  if (sign === 0) {
    return 'textSecondary';
  }
  return sign < 0 ? 'success' : 'danger';
};

/** A length of time said to the hundredth, the figure the table shows. */
const speak = (seconds: number): string =>
  spokenSeconds(Number(Math.abs(seconds).toFixed(2)));

/**
 * How the later run did against the earlier one, as a screen reader should
 * say it: "later run 0.03 seconds faster", or "the same in both runs".
 */
export const speakDifference = (delta: number): string => {
  const sign = shownDeltaSign(delta);
  if (sign === 0) {
    return 'the same in both runs';
  }
  return `later run ${speak(delta)} ${sign < 0 ? 'faster' : 'slower'}`;
};

/** One step as a screen reader should say it. */
const speakStep = ({ label, earlier, later, delta }: StepComparison): string =>
  [
    label,
    earlier === null
      ? 'not heard in the earlier run'
      : `earlier run ${speak(earlier)}`,
    later === null ? 'not heard in the later run' : `later run ${speak(later)}`,
    ...(delta === null ? [] : [speakDifference(delta)]),
  ].join(', ');

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    table: { paddingHorizontal: theme.spacing.md },
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

/** One of a step's three figures. It carries its caption when stacked. */
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

/** The column captions, shown once above the rows when they sit in columns. */
const TableHeader = ({ figureWidth }: Pick<Layout, 'figureWidth'>) => {
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

type StepRowProps = Layout & {
  step: StepComparison;
  /** Draw a rule above the row, to part it from the one before. */
  divided: boolean;
};

const StepRow = ({ step, divided, stacked, figureWidth }: StepRowProps) => {
  const styles = useThemedStyles(createStyles);
  const layout = { stacked, figureWidth };

  return (
    <View
      style={[
        stacked ? styles.rowStacked : styles.row,
        divided && styles.rowDivider,
      ]}
      accessible
      accessibilityLabel={speakStep(step)}
      testID={`row-comparison-${step.stepId}`}
    >
      <Typography variant="body" style={stacked ? undefined : styles.name}>
        {step.label}
      </Typography>
      <View style={stacked ? styles.figuresStacked : styles.figures}>
        <Figure
          caption={CAPTIONS.earlier}
          value={step.earlier === null ? NO_VALUE : formatSeconds(step.earlier)}
          {...layout}
        />
        <Figure
          caption={CAPTIONS.later}
          value={step.later === null ? NO_VALUE : formatSeconds(step.later)}
          {...layout}
        />
        <Figure
          caption={CAPTIONS.delta}
          value={
            step.delta === null ? NO_VALUE : formatSignedSeconds(step.delta)
          }
          color={deltaColor(step.delta)}
          {...layout}
        />
      </View>
    </View>
  );
};

type RunComparisonTableProps = {
  steps: readonly StepComparison[];
};

/**
 * Step / Earlier / Later / Δ for every step either of two runs heard. Δ is
 * the later run's time minus the earlier one's, signed so it reads without
 * its colour. A drill has at most `MAX_DRILL_STEPS` steps, so the rows are
 * mapped, not virtualised.
 */
export const RunComparisonTable = ({ steps }: RunComparisonTableProps) => {
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_ROWS_ABOVE_FONT_SCALE;
  const figureWidth =
    (stacked ? STACKED_FIGURE_MIN_WIDTH : FIGURE_COLUMN_WIDTH) * fontScale;

  return (
    <View style={styles.table} testID="table-comparison">
      {stacked ? null : <TableHeader figureWidth={figureWidth} />}
      {steps.map((step, index) => (
        <StepRow
          key={step.stepId}
          step={step}
          // Under the captions every row is ruled; stacked, the first is not.
          divided={!stacked || index > 0}
          stacked={stacked}
          figureWidth={figureWidth}
        />
      ))}
    </View>
  );
};
