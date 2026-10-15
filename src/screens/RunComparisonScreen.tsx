import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';

import type { Theme } from '@/theme/theme';
import type { HistoryStackParamList } from '@/types/navigation';
import type { Session } from '@/types/session';
import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { EmptyState } from '@components/EmptyState';
import {
  RunComparisonTable,
  deltaColor,
  speakDifference,
} from '@components/RunComparisonTable';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import {
  useRunComparison,
  type RunComparisonState,
} from '@hooks/useRunComparison';
import { useThemedStyles } from '@hooks/useTheme';
import {
  formatDateTime,
  formatSeconds,
  formatSignedSeconds,
  spokenDateTime,
  spokenSeconds,
} from '@utils/format';
import { shownDeltaSign, type RunComparison } from '@utils/history';

type RunComparisonRoute = RouteProp<HistoryStackParamList, 'RunComparison'>;

/** Stands in for the difference when the totals are not compared. */
const NO_VALUE = '—';

/** What a run stopped before its last step is marked with, as on its card. */
const STOPPED_EARLY = 'Stopped early';

/**
 * Above this font scale two runs no longer fit side by side, so the later
 * one goes under the earlier one. The point the summary card stacks at.
 */
const STACK_RUNS_ABOVE_FONT_SCALE = 1.3;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    runs: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    runsStacked: { gap: theme.spacing.md },
    run: { flex: 1, gap: theme.spacing.xs },
    divider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    dividerStacked: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
    },
    difference: {
      marginTop: theme.spacing.md,
      paddingTop: theme.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    loading: {
      alignItems: 'center',
      paddingVertical: theme.spacing.xxl,
    },
  });

type RunColumnProps = {
  /** `EARLIER` or `LATER`. */
  caption: string;
  session: Session;
  personalBest: boolean;
  testID: string;
};

/** One of the two runs: when it was made, its total time and its badges. */
const RunColumn = ({
  caption,
  session,
  personalBest,
  testID,
}: RunColumnProps) => {
  const styles = useThemedStyles(createStyles);
  const said = [
    `${caption.toLowerCase()} run, ${spokenDateTime(session.createdAt)}`,
    spokenSeconds(Number(session.totalTime.toFixed(2))),
    ...(session.completed ? [] : [STOPPED_EARLY.toLowerCase()]),
    // Said in full: TalkBack reads "PB" as letters.
    ...(personalBest ? ['personal best'] : []),
  ];

  return (
    <View
      style={styles.run}
      accessible
      accessibilityLabel={said.join(', ')}
      testID={testID}
    >
      <Typography variant="overline" color="textSecondary">
        {caption}
      </Typography>
      <Typography variant="bodyStrong">
        {formatDateTime(session.createdAt)}
      </Typography>
      <Typography variant="metric" testID={`${testID}-total`}>
        {formatSeconds(session.totalTime)}
      </Typography>
      {session.completed && !personalBest ? null : (
        <View style={styles.chips}>
          {session.completed ? null : (
            <Chip label={STOPPED_EARLY} testID={`${testID}-incomplete`} />
          )}
          {personalBest ? (
            <Chip label="PB" tone="success" testID={`${testID}-pb`} />
          ) : null}
        </View>
      )}
    </View>
  );
};

/** How the totals compare, in words: "0.08s faster than the earlier run". */
const describeTotal = (totalDelta: number | null): string => {
  if (totalDelta === null) {
    return 'Total times are not compared: a run stopped early has no time for the whole drill.';
  }
  const sign = shownDeltaSign(totalDelta);
  if (sign === 0) {
    return 'The same time as the earlier run';
  }
  const shown = formatSeconds(Math.abs(totalDelta));
  return `${shown} ${sign < 0 ? 'faster' : 'slower'} than the earlier run`;
};

type TotalsCardProps = {
  comparison: RunComparison;
  personalBestId: string | null;
};

/** Both runs side by side, and how the later one's total compares. */
const TotalsCard = ({ comparison, personalBestId }: TotalsCardProps) => {
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_RUNS_ABOVE_FONT_SCALE;
  const { earlier, later, totalDelta } = comparison;

  return (
    <Card testID="card-comparison-totals">
      <View style={stacked ? styles.runsStacked : styles.runs}>
        <RunColumn
          caption="EARLIER"
          session={earlier}
          personalBest={earlier.id === personalBestId}
          testID="run-earlier"
        />
        <View style={stacked ? styles.dividerStacked : styles.divider} />
        <RunColumn
          caption="LATER"
          session={later}
          personalBest={later.id === personalBestId}
          testID="run-later"
        />
      </View>

      <View
        style={styles.difference}
        accessible
        accessibilityLabel={
          totalDelta === null
            ? describeTotal(null)
            : `Total time: ${speakDifference(totalDelta)}`
        }
        testID="comparison-difference"
      >
        <Typography variant="overline" color="textSecondary">
          DIFFERENCE
        </Typography>
        <Typography
          variant="metric"
          color={deltaColor(totalDelta)}
          testID="text-comparison-difference"
        >
          {totalDelta === null ? NO_VALUE : formatSignedSeconds(totalDelta)}
        </Typography>
        <Typography variant="caption" color="textSecondary" align="center">
          {describeTotal(totalDelta)}
        </Typography>
      </View>
    </Card>
  );
};

type ComparisonStatusProps = {
  status: Exclude<RunComparisonState['status'], 'ready'>;
  onRetry: () => void;
};

/** What the screen shows when there is no comparison to draw, and why. */
const ComparisonStatus = ({ status, onRetry }: ComparisonStatusProps) => {
  const styles = useThemedStyles(createStyles);

  if (status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            testID="text-comparison-loading"
          >
            Loading the runs…
          </Typography>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      {/* Announced: it takes the place of the loading line on its own. */}
      <View accessibilityLiveRegion="polite">
        {status === 'error' ? (
          <EmptyState
            icon="chart"
            title="Could not load the runs"
            message="Something went wrong reading them from this device."
            actionLabel="Try again"
            onActionPress={onRetry}
            testID="state-comparison-error"
          />
        ) : (
          <EmptyState
            icon="chart"
            title="These runs are not here"
            message="One of the runs could not be found for this drill."
            testID="state-comparison-missing"
          />
        )}
      </View>
    </Card>
  );
};

/**
 * Two runs of one drill side by side: each run's date, total time and
 * badges, the difference between the totals, and every step with the time
 * it took in each run and how the later run did against the earlier one.
 *
 * Opened from the Compare action on a run card in the History detail
 * screen, with the ids of the two runs; it reads them itself, so what is
 * shown is always what is stored.
 */
export const RunComparisonScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RunComparisonRoute>();
  const {
    drillId,
    runIds: [firstRunId, secondRunId],
  } = route.params;
  const { state, reload } = useRunComparison(drillId, firstRunId, secondRunId);

  return (
    <Screen
      title="Compare runs"
      subtitle={state.status === 'ready' ? state.drillName : 'Run history'}
      onBack={navigation.goBack}
      scrollable
      testID="screen-run-comparison"
    >
      {state.status === 'ready' ? (
        <>
          <TotalsCard
            comparison={state.comparison}
            personalBestId={state.personalBestId}
          />
          <View>
            <SectionHeader title="Steps" />
            <Card flush>
              <RunComparisonTable steps={state.comparison.steps} />
            </Card>
          </View>
        </>
      ) : (
        <ComparisonStatus status={state.status} onRetry={reload} />
      )}
    </Screen>
  );
};
