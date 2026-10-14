import { StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Theme } from '@/theme/theme';
import type { HistoryStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import {
  useDrillHistory,
  type DrillHistoryState,
} from '@hooks/useDrillHistory';
import { useThemedStyles } from '@hooks/useTheme';
import {
  formatSeconds,
  formatTimeAgo,
  pluralize,
  spokenSeconds,
  spokenTimeAgo,
} from '@utils/format';
import type { DrillHistorySummary } from '@utils/history';

type Nav = NativeStackNavigationProp<HistoryStackParamList, 'HistoryList'>;

/** Stands in for a counter until the history has been read. */
const NO_COUNT = '—';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    summaryRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    summaryCell: {
      flex: 1,
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    loading: {
      alignItems: 'center',
      paddingVertical: theme.spacing.xxl,
    },
  });

/**
 * The line under a drill's name: `3 runs · Best 4.21s · 2d ago`. A drill
 * whose every run was stopped early has no best, so it is left out.
 */
const describeSummary = (summary: DrillHistorySummary, now: number): string =>
  [
    pluralize(summary.runCount, 'run'),
    summary.bestTime === null
      ? null
      : `Best ${formatSeconds(summary.bestTime)}`,
    formatTimeAgo(summary.lastRunAt, now),
  ]
    .filter(part => part !== null)
    .join(' · ');

/**
 * The whole row as a screen reader should say it. The best time is said
 * to the hundredth, the same figure the row shows.
 */
const speakSummary = (summary: DrillHistorySummary, now: number): string =>
  [
    summary.drillName,
    pluralize(summary.runCount, 'run'),
    summary.bestTime === null
      ? null
      : `best ${spokenSeconds(Number(summary.bestTime.toFixed(2)))}`,
    `last run ${spokenTimeAgo(summary.lastRunAt, now)}`,
  ]
    .filter(part => part !== null)
    .join(', ');

type CounterProps = {
  /** `null` until the history has been read. */
  count: number | null;
  noun: string;
  highlighted?: boolean;
  testID: string;
};

/** One counter in the totals card, read out as a phrase ("3 runs"). */
const Counter = ({
  count,
  noun,
  highlighted = false,
  testID,
}: CounterProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={styles.summaryCell}
      accessible
      accessibilityLabel={
        count === null ? `${noun}s not loaded` : pluralize(count, noun)
      }
    >
      <Typography variant="overline" color="textSecondary">
        {`${noun}s`.toUpperCase()}
      </Typography>
      <Typography
        variant="metric"
        color={highlighted ? 'primary' : undefined}
        testID={testID}
      >
        {count === null ? NO_COUNT : String(count)}
      </Typography>
    </View>
  );
};

type DrillHistoryListProps = {
  state: DrillHistoryState;
  /** Open the runs recorded for one drill. */
  onOpen: (summary: DrillHistorySummary) => void;
  onRetry: () => void;
};

/** What sits under the "Drills" header: the list, or why there is none. */
const DrillHistoryList = ({
  state,
  onOpen,
  onRetry,
}: DrillHistoryListProps) => {
  const styles = useThemedStyles(createStyles);

  if (state.status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            testID="text-history-loading"
          >
            Loading your history…
          </Typography>
        </View>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        {/* Announced: it takes the place of the loading line on its own. */}
        <View accessibilityLiveRegion="polite">
          <EmptyState
            icon="chart"
            title="Could not load your history"
            message="Something went wrong reading it from this device."
            actionLabel="Try again"
            onActionPress={onRetry}
            testID="state-history-error"
          />
        </View>
      </Card>
    );
  }

  const { summaries } = state;

  if (summaries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="chart"
          title="Nothing here yet"
          message="Run a drill from the timer and it will appear here."
          testID="state-history-empty"
        />
      </Card>
    );
  }

  // One reading of the clock for the whole list, so two drills run at the
  // same moment never show different ages.
  const now = Date.now();

  // Mapped inside the card rather than virtualised, like the Drills list:
  // there is one row per drill, not per run, and a library built by hand
  // stays small. If libraries grow into the hundreds this becomes a
  // `FlatList`.
  return (
    <Card flush>
      {summaries.map((summary, i) => (
        <ListRow
          key={summary.drillId}
          title={summary.drillName}
          subtitle={describeSummary(summary, now)}
          accessibilityLabel={speakSummary(summary, now)}
          onPress={() => onOpen(summary)}
          divided={i < summaries.length - 1}
          testID={`row-history-${summary.drillId}`}
        />
      ))}
    </Card>
  );
};

/**
 * Every drill that has been run, read from `SessionStorageService` and
 * grouped by drill: how many runs, the best time and how long ago the last
 * one was, most recently run first. Above the list, the number of runs and
 * of drills they were made against.
 *
 * A drill that has never been run is not listed. A drill deleted after it
 * was run still is, since its runs are kept, under a stand-in name.
 */
export const HistoryScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { state, reload } = useDrillHistory();

  const ready = state.status === 'ready';

  const openDrill = (summary: DrillHistorySummary) =>
    navigation.navigate('HistoryDetail', {
      drillId: summary.drillId,
      drillName: summary.drillName,
    });

  return (
    <Screen
      title="History"
      subtitle="Pick a drill to see previous runs"
      scrollable
      testID="screen-history"
    >
      <Card>
        <View style={styles.summaryRow}>
          <Counter
            count={ready ? state.runCount : null}
            noun="run"
            testID="text-history-run-count"
          />

          <View style={styles.summaryDivider} />

          <Counter
            count={ready ? state.summaries.length : null}
            noun="drill"
            highlighted
            testID="text-history-drill-count"
          />
        </View>
      </Card>

      <View>
        <SectionHeader title="Drills" />
        <DrillHistoryList state={state} onOpen={openDrill} onRetry={reload} />
      </View>
    </Screen>
  );
};
