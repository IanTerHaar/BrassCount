import { useMemo, useState } from 'react';

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';

import type { SemanticColors, Theme } from '@/theme/theme';
import type { HistoryStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { EmptyState } from '@components/EmptyState';
import { Icon } from '@components/Icon';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import {
  labelForStep,
  previewHistory,
  type SessionResult,
} from '@constants/previewData';
import { useThemedStyles } from '@hooks/useTheme';
import { formatDate, formatSeconds, pluralize } from '@utils/format';

type HistoryDetailRoute = RouteProp<HistoryStackParamList, 'HistoryDetail'>;

/**
 * How a run's total time compares to the run *before* it (older). Positive
 * means slower, negative means faster.
 */
const deltaToPrevious = (
  runs: SessionResult[],
  index: number,
): number | undefined => {
  const previous = runs[index + 1];
  if (!previous) {
    return undefined;
  }
  return runs[index].timeSeconds - previous.timeSeconds;
};

const signed = (value: number): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(2)}s`;

const deltaTone = (delta: number | undefined): keyof SemanticColors => {
  if (delta === undefined || delta === 0) {
    return 'textSecondary';
  }
  return delta < 0 ? 'success' : 'danger';
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
    trendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    resultHeaderLeft: {
      flex: 1,
      gap: theme.spacing.xs,
    },
    resultHeaderRight: {
      alignItems: 'flex-end',
      gap: theme.spacing.xs,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    resultBody: {
      marginTop: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    stepsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.xs,
      paddingBottom: theme.spacing.xs,
      gap: theme.spacing.sm,
    },
    stepsHeaderIndex: { width: 24 },
    stepsHeaderName: { flex: 1 },
    stepsHeaderMetric: {
      width: 68,
      textAlign: 'right',
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
    },
    stepRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    stepIndex: {
      width: 24,
      alignItems: 'center',
    },
    stepName: { flex: 1 },
    stepMetric: {
      width: 68,
      alignItems: 'flex-end',
    },
    expandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
    },
    expandChevronOpen: {
      transform: [{ rotate: '-90deg' }],
    },
    expandChevronClosed: {
      transform: [{ rotate: '90deg' }],
    },
    compareBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    compareBarBody: { flex: 1, gap: 2 },
    compareBarActions: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    compareClearButton: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    comparePair: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    comparePairCell: { flex: 1, gap: theme.spacing.xs },
    compareStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
    },
    compareStepName: { flex: 1 },
    compareStepCell: {
      width: 60,
      alignItems: 'flex-end',
    },
    list: { gap: theme.spacing.md },
  });

/**
 * Sums the actual times of the two runs step-by-step. Positive delta means
 * A was slower than B on that step; a big delta flags the split to work on.
 */
const compareStepDeltas = (a: SessionResult, b: SessionResult) => {
  const length = Math.max(a.steps.length, b.steps.length);
  const rows: {
    label: string;
    aTime?: number;
    bTime?: number;
    delta?: number;
  }[] = [];

  for (let i = 0; i < length; i += 1) {
    const stepA = a.steps[i];
    const stepB = b.steps[i];
    const label = stepA
      ? labelForStep(a.steps, i)
      : stepB
        ? labelForStep(b.steps, i)
        : '—';
    rows.push({
      label,
      aTime: stepA?.actualSeconds,
      bTime: stepB?.actualSeconds,
      delta:
        stepA && stepB ? stepA.actualSeconds - stepB.actualSeconds : undefined,
    });
  }

  return rows;
};

export const HistoryDetailScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation();
  const route = useRoute<HistoryDetailRoute>();
  const { drillId, drillName } = route.params;

  // Freshest first so the top card is the most recent attempt at a glance.
  const results = useMemo(
    () =>
      previewHistory
        .filter(result => result.drillId === drillId)
        .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)),
    [drillId],
  );

  // Expanded cards remember their state per run id — collapse the noisy
  // step tables by default and let the shooter drill into one at a time.
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    results.length > 0 ? { [results[0].id]: true } : {},
  );

  // Compare mode: taps on a run's "Compare" chip toggle it into this set.
  // Once two are selected we show the compare card at the top; a third tap
  // rotates the oldest selection out so the shooter can keep pivoting.
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const bestTime = useMemo(
    () =>
      results.length === 0
        ? null
        : Math.min(...results.map(result => result.timeSeconds)),
    [results],
  );

  const averageTime = useMemo(
    () =>
      results.length === 0
        ? null
        : results.reduce((sum, result) => sum + result.timeSeconds, 0) /
          results.length,
    [results],
  );

  // Δ from the most recent run to the one before it — a coarse "getting
  // better?" indicator that sits under the summary block.
  const overallTrend = useMemo(
    () => (results.length >= 2 ? deltaToPrevious(results, 0) : undefined),
    [results],
  );

  const compareRuns = useMemo(
    () =>
      compareIds.map(id => results.find(run => run.id === id)!).filter(Boolean),
    [compareIds, results],
  );

  const toggleExpanded = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const toggleCompare = (id: string) =>
    setCompareIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(runId => runId !== id);
      }
      // Cap at two — a comparison beyond a pair gets noisy fast on mobile.
      return [...prev, id].slice(-2);
    });

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
              AVG
            </Typography>
            <Typography variant="metric">
              {averageTime !== null ? formatSeconds(averageTime) : '—'}
            </Typography>
          </View>
        </View>

        {overallTrend !== undefined ? (
          <View style={[styles.trendRow, { marginTop: 12 }]}>
            <Typography variant="overline" color="textSecondary">
              LAST RUN
            </Typography>
            <Typography variant="label" color={deltaTone(overallTrend)}>
              {`${signed(overallTrend)} vs previous`}
            </Typography>
          </View>
        ) : null}
      </Card>

      {compareRuns.length > 0 ? (
        <View>
          <SectionHeader title="Compare" />
          <Card>
            <View style={styles.compareBar}>
              <View style={styles.compareBarBody}>
                <Typography variant="bodyStrong">
                  {compareRuns.length === 1
                    ? 'Pick one more run to compare'
                    : 'Comparing 2 runs'}
                </Typography>
                <Typography variant="caption" color="textTertiary">
                  {compareRuns.length === 1
                    ? 'Tap "Compare" on another run below.'
                    : 'Green splits are faster, red are slower — for the top run.'}
                </Typography>
              </View>

              <TouchableOpacity
                onPress={() => setCompareIds([])}
                accessibilityRole="button"
                accessibilityLabel="Clear compare selection"
                style={styles.compareClearButton}
                testID="btn-compare-clear"
              >
                <Typography variant="label" color="textSecondary">
                  Clear
                </Typography>
              </TouchableOpacity>
            </View>

            {compareRuns.length === 2 ? (
              <View style={{ marginTop: 16 }}>
                <View style={styles.comparePair}>
                  {compareRuns.map((run, i) => {
                    const other = compareRuns[1 - i];
                    const totalDelta = run.timeSeconds - other.timeSeconds;
                    return (
                      <View
                        key={`compare-cell-${run.id}`}
                        style={styles.comparePairCell}
                      >
                        <Typography variant="overline" color="textSecondary">
                          {i === 0 ? 'RUN A' : 'RUN B'}
                        </Typography>
                        <Typography variant="body" numberOfLines={1}>
                          {formatDate(run.completedAt)}
                        </Typography>
                        <Typography variant="metric">
                          {formatSeconds(run.timeSeconds)}
                        </Typography>
                        <Typography
                          variant="label"
                          color={
                            i === 0 ? deltaTone(totalDelta) : 'textTertiary'
                          }
                        >
                          {i === 0 ? `${signed(totalDelta)} vs B` : '—'}
                        </Typography>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.stepsHeader}>
                  <Typography
                    variant="overline"
                    color="textSecondary"
                    style={styles.stepsHeaderIndex}
                  >
                    #
                  </Typography>
                  <Typography
                    variant="overline"
                    color="textSecondary"
                    style={styles.stepsHeaderName}
                  >
                    STEP
                  </Typography>
                  <Typography
                    variant="overline"
                    color="textSecondary"
                    style={[styles.stepsHeaderMetric, { width: 60 }]}
                  >
                    A
                  </Typography>
                  <Typography
                    variant="overline"
                    color="textSecondary"
                    style={[styles.stepsHeaderMetric, { width: 60 }]}
                  >
                    B
                  </Typography>
                  <Typography
                    variant="overline"
                    color="textSecondary"
                    style={[styles.stepsHeaderMetric, { width: 60 }]}
                  >
                    Δ
                  </Typography>
                </View>

                {compareStepDeltas(compareRuns[0], compareRuns[1]).map(
                  (row, i) => (
                    <View
                      key={`compare-row-${i}`}
                      style={[
                        styles.compareStepRow,
                        i > 0 && styles.stepRowDivider,
                      ]}
                    >
                      <View style={styles.stepIndex}>
                        <Typography variant="label" color="textTertiary">
                          {String(i + 1).padStart(2, '0')}
                        </Typography>
                      </View>
                      <View style={styles.compareStepName}>
                        <Typography variant="body" numberOfLines={1}>
                          {row.label}
                        </Typography>
                      </View>
                      <View style={styles.compareStepCell}>
                        <Typography variant="metricSmall">
                          {row.aTime !== undefined
                            ? formatSeconds(row.aTime)
                            : '—'}
                        </Typography>
                      </View>
                      <View style={styles.compareStepCell}>
                        <Typography variant="metricSmall">
                          {row.bTime !== undefined
                            ? formatSeconds(row.bTime)
                            : '—'}
                        </Typography>
                      </View>
                      <View style={styles.compareStepCell}>
                        <Typography
                          variant="metricSmall"
                          color={deltaTone(row.delta)}
                        >
                          {row.delta !== undefined ? signed(row.delta) : '—'}
                        </Typography>
                      </View>
                    </View>
                  ),
                )}
              </View>
            ) : null}
          </Card>
        </View>
      ) : null}

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
            {results.map((result, index) => {
              const isExpanded = expanded[result.id] ?? false;
              const isSelectedForCompare = compareIds.includes(result.id);
              const delta = deltaToPrevious(results, index);

              return (
                <Card key={result.id} testID={`card-result-${result.id}`}>
                  <View style={styles.resultHeader}>
                    <View style={styles.resultHeaderLeft}>
                      <Typography variant="subtitle" numberOfLines={1}>
                        {formatDate(result.completedAt)}
                      </Typography>
                      <View style={styles.chipRow}>
                        {result.personalBest ? (
                          <Chip label="PB" tone="success" />
                        ) : null}
                        {delta !== undefined ? (
                          <Chip
                            label={`${signed(delta)} vs previous`}
                            tone={
                              delta === 0
                                ? 'neutral'
                                : delta < 0
                                  ? 'success'
                                  : 'danger'
                            }
                          />
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.resultHeaderRight}>
                      <Typography variant="metric">
                        {formatSeconds(result.timeSeconds)}
                      </Typography>
                      <Chip
                        label={isSelectedForCompare ? 'Selected' : 'Compare'}
                        tone="primary"
                        selected={isSelectedForCompare}
                        onPress={() => toggleCompare(result.id)}
                        testID={`chip-compare-${result.id}`}
                      />
                    </View>
                  </View>

                  {isExpanded ? (
                    <View style={styles.resultBody}>
                      <View style={styles.stepsHeader}>
                        <Typography
                          variant="overline"
                          color="textSecondary"
                          style={styles.stepsHeaderIndex}
                        >
                          #
                        </Typography>
                        <Typography
                          variant="overline"
                          color="textSecondary"
                          style={styles.stepsHeaderName}
                        >
                          STEP
                        </Typography>
                        <Typography
                          variant="overline"
                          color="textSecondary"
                          style={styles.stepsHeaderMetric}
                        >
                          PAR
                        </Typography>
                        <Typography
                          variant="overline"
                          color="textSecondary"
                          style={styles.stepsHeaderMetric}
                        >
                          ACTUAL
                        </Typography>
                        <Typography
                          variant="overline"
                          color="textSecondary"
                          style={styles.stepsHeaderMetric}
                        >
                          Δ
                        </Typography>
                      </View>

                      {result.steps.map((step, i) => {
                        const stepDelta =
                          step.parSeconds !== undefined
                            ? step.actualSeconds - step.parSeconds
                            : undefined;

                        return (
                          <View
                            key={`step-${result.id}-${i}`}
                            style={[
                              styles.stepRow,
                              i > 0 && styles.stepRowDivider,
                            ]}
                          >
                            <View style={styles.stepIndex}>
                              <Typography variant="label" color="textTertiary">
                                {String(i + 1).padStart(2, '0')}
                              </Typography>
                            </View>
                            <View style={styles.stepName}>
                              <Typography variant="body" numberOfLines={1}>
                                {labelForStep(result.steps, i)}
                              </Typography>
                            </View>
                            <View style={styles.stepMetric}>
                              <Typography
                                variant="metricSmall"
                                color="textTertiary"
                              >
                                {step.parSeconds !== undefined
                                  ? formatSeconds(step.parSeconds)
                                  : '—'}
                              </Typography>
                            </View>
                            <View style={styles.stepMetric}>
                              <Typography variant="metricSmall">
                                {formatSeconds(step.actualSeconds)}
                              </Typography>
                            </View>
                            <View style={styles.stepMetric}>
                              <Typography
                                variant="metricSmall"
                                color={deltaTone(stepDelta)}
                              >
                                {stepDelta !== undefined
                                  ? signed(stepDelta)
                                  : '—'}
                              </Typography>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => toggleExpanded(result.id)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isExpanded ? 'Hide step splits' : 'Show step splits'
                    }
                    style={styles.expandRow}
                    testID={`btn-toggle-${result.id}`}
                  >
                    <Typography variant="label" color="primary">
                      {isExpanded ? 'Hide splits' : 'Show splits'}
                    </Typography>
                    <View
                      style={
                        isExpanded
                          ? styles.expandChevronOpen
                          : styles.expandChevronClosed
                      }
                    >
                      <Icon name="chevron" size={12} color="primary" />
                    </View>
                  </TouchableOpacity>
                </Card>
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
};
