import { useMemo } from 'react';

import { StyleSheet, View } from 'react-native';

import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';

import type { RootStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { EmptyState } from '@components/EmptyState';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { previewHistory } from '@constants/previewData';
import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';
import { formatDate, formatSeconds, pluralize } from '@utils/format';

type HistoryDetailRoute = RouteProp<RootStackParamList, 'HistoryDetail'>;

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
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
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

export const HistoryDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const route = useRoute<HistoryDetailRoute>();
  const { drillName } = route.params;

  // Freshest first so the top card is the most recent attempt at a glance.
  const results = useMemo(
    () =>
      previewHistory
        .filter(result => result.drillName === drillName)
        .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)),
    [drillName],
  );

  const bestTime = useMemo(
    () =>
      results.length === 0
        ? null
        : Math.min(...results.map(result => result.timeSeconds)),
    [results],
  );

  const averageScore = useMemo(
    () =>
      results.length === 0
        ? 0
        : Math.round(
            results.reduce((sum, result) => sum + result.score, 0) /
              results.length,
          ),
    [results],
  );

  const personalBests = useMemo(
    () => results.filter(result => result.personalBest).length,
    [results],
  );

  return (
    <Screen
      title={drillName}
      onBack={navigation.goBack}
      subtitle={`${pluralize(results.length, 'run')} logged`}
      scrollable
      testID="screen-history-detail"
    >
      <Card>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Typography variant="overline" color="textSecondary">
              BEST
            </Typography>
            <Typography variant="metric" color="primary">
              {bestTime !== null ? formatSeconds(bestTime) : '—'}
            </Typography>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCell}>
            <Typography variant="overline" color="textSecondary">
              AVG SCORE
            </Typography>
            <Typography variant="metric">{`${averageScore}%`}</Typography>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryCell}>
            <Typography variant="overline" color="textSecondary">
              PBs
            </Typography>
            <Typography variant="metric">{String(personalBests)}</Typography>
          </View>
        </View>
      </Card>

      <View>
        <SectionHeader title={`Runs · ${results.length}`} />

        {results.length === 0 ? (
          <Card>
            <EmptyState
              icon="chart"
              title="No runs yet"
              message="Runs of this drill will show up here once you have logged some."
            />
          </Card>
        ) : (
          <View style={styles.list}>
            {results.map(result => (
              <Card key={result.id} testID={`card-result-${result.id}`}>
                <View style={styles.resultHeader}>
                  <Typography variant="subtitle" numberOfLines={1}>
                    {formatDate(result.completedAt)}
                  </Typography>

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
