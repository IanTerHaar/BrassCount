import { useCallback, useState } from 'react';

import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';

import type { Theme } from '@/theme/theme';
import type { HistoryStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { RunCard } from '@components/RunCard';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { useDrillRuns, type DrillRunsState } from '@hooks/useDrillRuns';
import { useThemedStyles } from '@hooks/useTheme';
import { formatSeconds, pluralize, spokenSeconds } from '@utils/format';
import type { RunSummary, RunTotals } from '@utils/history';

type HistoryDetailRoute = RouteProp<HistoryStackParamList, 'HistoryDetail'>;

/** Stands in for a time until the runs have been read, or when there are none. */
const NO_TIME = '—';

/** What the list holds until the runs have been read. */
const NO_RUNS: RunSummary[] = [];

/**
 * Above this font scale two times no longer fit side by side in the
 * summary card, so Avg goes under Best.
 */
const STACK_SUMMARY_ABOVE_FONT_SCALE = 1.3;

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
    summaryColumn: { gap: theme.spacing.md },
    summaryCell: {
      flex: 1,
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    summaryDividerStacked: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    loading: {
      alignItems: 'center',
      paddingVertical: theme.spacing.xxl,
    },
  });

type SummaryFigureProps = {
  caption: string;
  /** The caption in full, for a screen reader: "Average", not "AVG". */
  spokenCaption: string;
  /** `null` until the runs have been read, and when there are none. */
  seconds: number | null;
  highlighted?: boolean;
  testID: string;
};

/** One time in the summary card, read out as a phrase ("Best 2.14 seconds"). */
const SummaryFigure = ({
  caption,
  spokenCaption,
  seconds,
  highlighted = false,
  testID,
}: SummaryFigureProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={styles.summaryCell}
      accessible
      accessibilityLabel={
        seconds === null
          ? `No ${spokenCaption.toLowerCase()} time`
          : `${spokenCaption} ${spokenSeconds(Number(seconds.toFixed(2)))}`
      }
    >
      <Typography variant="overline" color="textSecondary">
        {caption}
      </Typography>
      <Typography
        variant="metric"
        color={highlighted ? 'primary' : undefined}
        testID={testID}
      >
        {seconds === null ? NO_TIME : formatSeconds(seconds)}
      </Typography>
    </View>
  );
};

type RunListHeaderProps = {
  /** `null` until the runs have been read, and when there are none. */
  totals: RunTotals | null;
};

/** What scrolls above the runs: the Best / Avg card and the list's title. */
const RunListHeader = ({ totals }: RunListHeaderProps) => {
  const styles = useThemedStyles(createStyles);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_SUMMARY_ABOVE_FONT_SCALE;

  return (
    <View style={styles.listHeader}>
      <Card>
        <View style={stacked ? styles.summaryColumn : styles.summaryRow}>
          <SummaryFigure
            caption="BEST"
            spokenCaption="Best"
            seconds={totals?.bestTime ?? null}
            highlighted
            testID="text-history-detail-best"
          />

          <View
            style={
              stacked ? styles.summaryDividerStacked : styles.summaryDivider
            }
          />

          <SummaryFigure
            caption="AVG"
            spokenCaption="Average"
            seconds={totals?.averageTime ?? null}
            testID="text-history-detail-avg"
          />
        </View>
      </Card>

      <SectionHeader title="Runs" />
    </View>
  );
};

type RunListStatusProps = {
  status: DrillRunsState['status'];
  onRetry: () => void;
};

/** What sits under the "Runs" header when there is no run to list, and why. */
const RunListStatus = ({ status, onRetry }: RunListStatusProps) => {
  const styles = useThemedStyles(createStyles);

  if (status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            testID="text-history-detail-loading"
          >
            Loading the runs…
          </Typography>
        </View>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        {/* Announced: it takes the place of the loading line on its own. */}
        <View accessibilityLiveRegion="polite">
          <EmptyState
            icon="chart"
            title="Could not load the runs"
            message="Something went wrong reading them from this device."
            actionLabel="Try again"
            onActionPress={onRetry}
            testID="state-history-detail-error"
          />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <EmptyState
        icon="chart"
        title="No runs yet"
        message="Runs of this drill will show up here once you have logged some."
        testID="state-history-detail-empty"
      />
    </Card>
  );
};

const RunSeparator = () => {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
};

const keyOfRun = (run: RunSummary): string => run.session.id;

/**
 * Every run of one drill, read from `SessionStorageService`: the best and
 * average total time, then a card per run, newest first, with when it was
 * made, its total time and how that compares to the run before it. A card
 * opens to the Step / Par / Actual / Δ breakdown of the run.
 *
 * The title bar stays put and the list scrolls under it: a drill can be
 * run any number of times, so the cards are virtualised rather than mapped
 * inside the `Screen`'s scroll view.
 */
export const HistoryDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const route = useRoute<HistoryDetailRoute>();
  const { drillId, drillName } = route.params;
  const { state, reload } = useDrillRuns(drillId);

  const ready = state.status === 'ready';
  const runs = ready ? state.runs : NO_RUNS;
  // The newest run starts open, so the run just made is in full view;
  // every other card starts closed.
  const newestId = runs[0]?.session.id;

  // Only the cards the shooter has pressed, by session id: `true` is open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const toggle = useCallback(
    (sessionId: string) =>
      setToggled(previous => ({
        ...previous,
        [sessionId]: !(previous[sessionId] ?? sessionId === newestId),
      })),
    [newestId],
  );

  const renderRun = useCallback(
    ({ item }: ListRenderItemInfo<RunSummary>) => (
      <RunCard
        run={item}
        expanded={toggled[item.session.id] ?? item.session.id === newestId}
        onToggle={toggle}
      />
    ),
    [toggled, newestId, toggle],
  );

  return (
    <Screen
      // The name the list passed until the drill itself has been read: it
      // may have been renamed while this screen sat behind another tab.
      title={ready ? state.drillName : drillName}
      subtitle={
        ready ? `${pluralize(runs.length, 'run')} logged` : 'Run history'
      }
      onBack={navigation.goBack}
      contentStyle={styles.screenContent}
      testID="screen-history-detail"
    >
      <FlatList
        data={runs}
        keyExtractor={keyOfRun}
        renderItem={renderRun}
        ListHeaderComponent={
          <RunListHeader totals={ready ? state.totals : null} />
        }
        ListEmptyComponent={
          <RunListStatus status={state.status} onRetry={reload} />
        }
        ItemSeparatorComponent={RunSeparator}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        testID="list-history-detail-runs"
      />
    </Screen>
  );
};
