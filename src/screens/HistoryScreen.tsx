import { useMemo } from 'react';

import { StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { HistoryStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { previewHistory, type SessionResult } from '@constants/previewData';
import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';
import { formatSeconds, pluralize } from '@utils/format';

type Nav = NativeStackNavigationProp<HistoryStackParamList, 'HistoryList'>;

/** Rolled-up view of every run logged against a single drill. */
type DrillHistorySummary = {
  drillId: string;
  drillName: string;
  runs: number;
  bestTime: number;
  /** ISO-8601 of the most recent run, used to sort the list. */
  lastRun: string;
};

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
  });

/** Group history rows by drill so the tab lists drills, not raw runs. */
const summarizeHistory = (history: SessionResult[]): DrillHistorySummary[] => {
  const groups = new Map<string, SessionResult[]>();

  for (const result of history) {
    const existing = groups.get(result.drillId) ?? [];
    existing.push(result);
    groups.set(result.drillId, existing);
  }

  return Array.from(groups.values())
    .map(runs => ({
      drillId: runs[0].drillId,
      drillName: runs[0].drillName,
      runs: runs.length,
      bestTime: Math.min(...runs.map(run => run.timeSeconds)),
      lastRun: runs.reduce(
        (latest, run) => (run.completedAt > latest ? run.completedAt : latest),
        runs[0].completedAt,
      ),
    }))
    .sort((a, b) => (a.lastRun < b.lastRun ? 1 : -1));
};

/** Rough relative time — "today", "2d ago", "3w ago". */
const timeAgo = (iso: string, now = new Date()): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '—';
  }

  const days = Math.floor((now.getTime() - then) / 86_400_000);
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w ago`;
  }
  return `${Math.floor(days / 30)}mo ago`;
};

export const HistoryScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();

  const drillSummaries = useMemo(() => summarizeHistory(previewHistory), []);

  return (
    <Screen
      title="History"
      subtitle="Pick a drill to see previous runs"
      scrollable
      testID="screen-history"
    >
      <Card>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Typography variant="overline" color="textSecondary">
              RUNS
            </Typography>
            <Typography variant="metric">
              {String(previewHistory.length)}
            </Typography>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCell}>
            <Typography variant="overline" color="textSecondary">
              DRILLS
            </Typography>
            <Typography variant="metric" color="primary">
              {String(drillSummaries.length)}
            </Typography>
          </View>
        </View>
      </Card>

      <View>
        <SectionHeader title="Drills" />

        {drillSummaries.length === 0 ? (
          <Card>
            <EmptyState
              icon="chart"
              title="Nothing here yet"
              message="Run a drill from the timer and it will appear here."
            />
          </Card>
        ) : (
          <Card flush>
            {drillSummaries.map((summary, i) => (
              <ListRow
                key={summary.drillId}
                title={summary.drillName}
                subtitle={`${pluralize(summary.runs, 'run')} · Best ${formatSeconds(
                  summary.bestTime,
                )} · ${timeAgo(summary.lastRun)}`}
                onPress={() =>
                  navigation.navigate('HistoryDetail', {
                    drillId: summary.drillId,
                    drillName: summary.drillName,
                  })
                }
                divided={i < drillSummaries.length - 1}
                testID={`row-history-${summary.drillId}`}
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
};
