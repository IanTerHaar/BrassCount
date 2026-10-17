import { useCallback } from 'react';

import {
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Theme } from '@/theme/theme';
import type { HistoryStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { ListRow } from '@components/ListRow';
import { RefreshFailedNotice } from '@components/RefreshFailedNotice';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { useAnnounce } from '@hooks/useAnnounce';
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

const ERROR_TITLE = 'Could not load your history';

/** What the list holds until the history has been read. */
const NO_SUMMARIES: DrillHistorySummary[] = [];

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // The list runs to the bottom edge, under the floating tab bar.
    screenContent: { paddingBottom: 0 },
    // Pulled out to the screen's edges and padded back in, so the cards'
    // shadows are not cut off at the sides of the list.
    list: {
      flex: 1,
      marginHorizontal: -theme.spacing.lg,
    },
    listContent: {
      paddingHorizontal: theme.spacing.lg,
      // Clears the floating tab bar so the last card is never trapped.
      paddingBottom: theme.spacing.xxl * 2,
    },
    listHeader: { gap: theme.spacing.md },
    separator: { height: theme.spacing.md },
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

type HistoryStatusProps = {
  /** Why there is no drill to list. */
  status: 'loading' | 'error' | 'empty';
  onRetry: () => void;
};

/** What sits under the "Drills" header when there is no drill to list. */
const HistoryStatus = ({ status, onRetry }: HistoryStatusProps) => {
  const styles = useThemedStyles(createStyles);

  if (status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            // Spoken when "Try again" swaps the error for this line.
            accessibilityLiveRegion="polite"
            testID="text-history-loading"
          >
            Loading your history…
          </Typography>
        </View>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        <EmptyState
          icon="chart"
          title={ERROR_TITLE}
          message="Something went wrong reading it from this device."
          actionLabel="Try again"
          onActionPress={onRetry}
          testID="state-history-error"
        />
      </Card>
    );
  }

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
};

const HistorySeparator = () => {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
};

const keyOfSummary = (summary: DrillHistorySummary): string => summary.drillId;

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
  const summaries = ready ? state.summaries : NO_SUMMARIES;

  // An error takes the place of the loading line, which TalkBack does not
  // announce on its own.
  useAnnounce(state.status === 'error' ? ERROR_TITLE : null);

  // One reading of the clock for the whole list, so two drills run at the
  // same moment never show different ages.
  const now = Date.now();

  const openDrill = useCallback(
    (summary: DrillHistorySummary) =>
      navigation.navigate('HistoryDetail', {
        drillId: summary.drillId,
        drillName: summary.drillName,
      }),
    [navigation],
  );

  const renderDrill = useCallback(
    ({ item }: ListRenderItemInfo<DrillHistorySummary>) => (
      <Card flush>
        <ListRow
          title={item.drillName}
          subtitle={describeSummary(item, now)}
          accessibilityLabel={speakSummary(item, now)}
          onPress={() => openDrill(item)}
          testID={`row-history-${item.drillId}`}
        />
      </Card>
    ),
    [now, openDrill],
  );

  return (
    <Screen
      title="History"
      subtitle="Pick a drill to see previous runs"
      contentStyle={styles.screenContent}
      testID="screen-history"
    >
      <FlatList
        data={summaries}
        keyExtractor={keyOfSummary}
        renderItem={renderDrill}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Card>
              <View style={styles.summaryRow}>
                <Counter
                  count={ready ? state.runCount : null}
                  noun="run"
                  testID="text-history-run-count"
                />

                <View style={styles.summaryDivider} />

                <Counter
                  count={ready ? summaries.length : null}
                  noun="drill"
                  highlighted
                  testID="text-history-drill-count"
                />
              </View>
            </Card>

            <SectionHeader title="Drills" />
            {ready && state.refreshFailed ? (
              <RefreshFailedNotice testID="text-history-refresh-failed" />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <HistoryStatus
            status={state.status === 'ready' ? 'empty' : state.status}
            onRetry={reload}
          />
        }
        ItemSeparatorComponent={HistorySeparator}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        testID="list-history"
      />
    </Screen>
  );
};
