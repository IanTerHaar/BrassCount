import { useMemo } from 'react';

import { StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@/types/navigation';
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

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Rolled-up view of every run logged against a single drill. */
type DrillHistorySummary = {
  drillName: string;
  runs: number;
  bestTime: number;
  averageScore: number;
  hasPersonalBest: boolean;
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
    const existing = groups.get(result.drillName) ?? [];
    existing.push(result);
    groups.set(result.drillName, existing);
  }

  return Array.from(groups.entries())
    .map(([drillName, runs]) => ({
      drillName,
      runs: runs.length,
      bestTime: Math.min(...runs.map(run => run.timeSeconds)),
      averageScore: Math.round(
        runs.reduce((sum, run) => sum + run.score, 0) / runs.length,
      ),
      hasPersonalBest: runs.some(run => run.personalBest),
      lastRun: runs.reduce(
        (latest, run) => (run.completedAt > latest ? run.completedAt : latest),
        runs[0].completedAt,
      ),
    }))
    .sort((a, b) => (a.lastRun < b.lastRun ? 1 : -1));
};

export const HistoryScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();

  const drillSummaries = useMemo(() => summarizeHistory(previewHistory), []);

  const bestOverall = useMemo(
    () =>
      previewHistory.length === 0
        ? null
        : Math.min(...previewHistory.map(item => item.timeSeconds)),
    [],
  );

  const averageOverall = useMemo(
    () =>
      previewHistory.length === 0
        ? 0
        : Math.round(
            previewHistory.reduce((sum, item) => sum + item.score, 0) /
              previewHistory.length,
          ),
    [],
  );

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
              BEST
            </Typography>
            <Typography variant="metric" color="primary">
              {bestOverall !== null ? formatSeconds(bestOverall) : '—'}
            </Typography>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCell}>
            <Typography variant="overline" color="textSecondary">
              AVG SCORE
            </Typography>
            <Typography variant="metric">{`${averageOverall}%`}</Typography>
          </View>
        </View>
      </Card>

      <View>
        <SectionHeader title={`Drills · ${drillSummaries.length}`} />

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
                key={summary.drillName}
                title={summary.drillName}
                subtitle={`${pluralize(summary.runs, 'run')} · Best ${formatSeconds(
                  summary.bestTime,
                )} · Avg ${summary.averageScore}%`}
                onPress={() =>
                  navigation.navigate('HistoryDetail', {
                    drillName: summary.drillName,
                  })
                }
                divided={i < drillSummaries.length - 1}
                testID={`row-history-${summary.drillName}`}
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
};
