import type { Theme } from '@constants/theme';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { EmptyState } from '@components/EmptyState';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { previewHistory } from '@constants/previewData';
import { useThemedStyles } from '@hooks/useTheme';
import { formatDate, formatSeconds } from '@utils/format';

type Filter = 'all' | 'best';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    filterRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
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
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    resultTitle: { flex: 1, gap: 2 },
    statRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    stat: {
      flex: 1,
      gap: theme.spacing.xs,
      padding: theme.spacing.sm + theme.spacing.xs,
      borderRadius: theme.radius.md,
      backgroundColor: theme.colors.surfaceElevated,
    },
    scoreTrack: {
      height: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.border,
      overflow: 'hidden',
      marginTop: theme.spacing.xs,
    },
    scoreFill: {
      height: '100%',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    list: { gap: theme.spacing.md },
  });

export const HistoryScreen = () => {
  const styles = useThemedStyles(createStyles);
  const [filter, setFilter] = useState<Filter>('all');

  const results = useMemo(
    () =>
      filter === 'best'
        ? previewHistory.filter(item => item.personalBest)
        : previewHistory,
    [filter],
  );

  const bestTime = useMemo(
    () =>
      previewHistory.reduce(
        (best, item) => Math.min(best, item.timeSeconds),
        Number.POSITIVE_INFINITY,
      ),
    [],
  );

  const averageScore = useMemo(
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
      subtitle="Every run you have logged"
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
              {Number.isFinite(bestTime) ? formatSeconds(bestTime) : '—'}
            </Typography>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCell}>
            <Typography variant="overline" color="textSecondary">
              AVG SCORE
            </Typography>
            <Typography variant="metric">{`${averageScore}%`}</Typography>
          </View>
        </View>
      </Card>

      <View style={styles.filterRow}>
        <Chip
          label="All runs"
          selected={filter === 'all'}
          onPress={() => setFilter('all')}
          testID="chip-filter-all"
        />
        <Chip
          label="Personal bests"
          selected={filter === 'best'}
          onPress={() => setFilter('best')}
          testID="chip-filter-best"
        />
      </View>

      <View>
        <SectionHeader title={`Results · ${results.length}`} />

        {results.length === 0 ? (
          <Card>
            <EmptyState
              icon="chart"
              title="Nothing here yet"
              message="Run a drill from the timer and your results will show up here."
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {results.map(result => (
              <Card key={result.id} testID={`card-result-${result.id}`}>
                <View style={styles.resultHeader}>
                  <View style={styles.resultTitle}>
                    <Typography variant="subtitle" numberOfLines={1}>
                      {result.drillName}
                    </Typography>
                    <Typography variant="caption" color="textTertiary">
                      {formatDate(result.completedAt)}
                    </Typography>
                  </View>

                  {result.personalBest ? (
                    <Chip label="PB" tone="success" />
                  ) : null}
                </View>

                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <Typography variant="overline" color="textSecondary">
                      TIME
                    </Typography>
                    <Typography variant="metric">
                      {formatSeconds(result.timeSeconds)}
                    </Typography>
                  </View>

                  <View style={styles.stat}>
                    <Typography variant="overline" color="textSecondary">
                      SCORE
                    </Typography>
                    <Typography variant="metric">{`${result.score}%`}</Typography>
                    <View style={styles.scoreTrack}>
                      <View
                        style={[
                          styles.scoreFill,
                          { width: `${result.score}%` },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
};
