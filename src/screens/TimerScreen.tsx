import { useCallback, useEffect, useRef, useState } from 'react';

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { Icon } from '@components/Icon';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { previewDrills } from '@constants/previewData';
import type { Theme } from '@constants/theme';
import { useTheme, useThemedStyles } from '@hooks/useTheme';
import { formatElapsed, formatSeconds } from '@utils/format';

/** Per-shot times the audio detector will emit once it is wired up. */
const previewSplits = [1.24, 0.31, 0.28, 0.35, 0.29, 0.33];

const fastestSplit = Math.min(...previewSplits);
const slowestSplit = Math.max(...previewSplits);

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    readout: {
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.lg,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      paddingHorizontal: theme.spacing.xs,
    },
    startButton: {
      width: 132,
      height: 132,
      borderRadius: 66,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.md,
    },
    stopGlyph: {
      width: 26,
      height: 26,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.textOnPrimary,
    },
    resetButton: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginTop: theme.spacing.xs,
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm + theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
    },
    splitDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    splitBarTrack: {
      flex: 1,
      height: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceElevated,
      overflow: 'hidden',
    },
    splitBarFill: {
      height: '100%',
      borderRadius: theme.radius.pill,
    },
  });

export const TimerScreen = () => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();

  const [selectedDrillId, setSelectedDrillId] = useState(previewDrills[0].id);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  // Mirrors `elapsed` so the effect can resume from a pause without taking
  // the state value as a dependency (which would restart it every tick).
  const elapsedRef = useRef(0);

  const drill =
    previewDrills.find(item => item.id === selectedDrillId) ?? previewDrills[0];

  // Derive the readout from wall-clock time instead of accumulating ticks,
  // so a dropped frame cannot make the timer drift.
  useEffect(() => {
    if (!running) {
      return;
    }

    startedAt.current = Date.now() - elapsedRef.current * 1000;
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        const next = (Date.now() - startedAt.current) / 1000;
        elapsedRef.current = next;
        setElapsed(next);
      }
    }, 50);

    return () => clearInterval(id);
  }, [running]);

  const toggle = useCallback(() => setRunning(prev => !prev), []);

  const reset = useCallback(() => {
    setRunning(false);
    setElapsed(0);
    elapsedRef.current = 0;
    startedAt.current = null;
  }, []);

  const overPar =
    drill.parSeconds !== undefined && elapsed > drill.parSeconds && elapsed > 0;

  const timerColor = overPar ? 'danger' : running ? 'primary' : 'textPrimary';

  return (
    <Screen
      title="Shot Timer"
      subtitle={running ? 'Listening…' : 'Ready when you are'}
      scrollable
      testID="screen-timer"
    >
      <View>
        <SectionHeader title="Drill" />
        <View style={styles.chipRow}>
          {previewDrills.map(item => (
            <Chip
              key={item.id}
              label={item.name}
              selected={item.id === selectedDrillId}
              onPress={() => setSelectedDrillId(item.id)}
              testID={`chip-drill-${item.id}`}
            />
          ))}
        </View>
      </View>

      <Card raised style={styles.readout} testID="card-readout">
        <View style={styles.metaRow}>
          <Typography variant="overline" color="textSecondary">
            {`${drill.shots} SHOTS`}
          </Typography>
          {drill.parSeconds !== undefined ? (
            <Typography variant="overline" color="textSecondary">
              {`PAR ${drill.parSeconds.toFixed(2)}S`}
            </Typography>
          ) : null}
        </View>

        <Typography
          variant="timer"
          color={timerColor}
          align="center"
          testID="text-elapsed"
        >
          {formatElapsed(elapsed)}
        </Typography>

        <Typography variant="overline" color="textTertiary" align="center">
          {overPar ? 'OVER PAR' : 'SECONDS'}
        </Typography>

        <TouchableOpacity
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={running ? 'Stop timer' : 'Start timer'}
          activeOpacity={0.85}
          style={[
            styles.startButton,
            theme.elevation.raised,
            {
              backgroundColor: running
                ? theme.colors.danger
                : theme.colors.primary,
            },
          ]}
          testID="btn-start"
        >
          {running ? (
            <View style={styles.stopGlyph} />
          ) : (
            <Icon name="play" size={34} color="textOnPrimary" />
          )}
          <Typography variant="overline" color="textOnPrimary">
            {running ? 'STOP' : 'START'}
          </Typography>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={reset}
          accessibilityRole="button"
          style={styles.resetButton}
          testID="btn-reset"
        >
          <Typography variant="label" color="textSecondary">
            Reset
          </Typography>
        </TouchableOpacity>
      </Card>

      <View>
        <SectionHeader title="Splits" />
        <Card flush>
          {previewSplits.map((split, i) => {
            const isFastest = split === fastestSplit;
            return (
              <View
                key={`split-${i}`}
                style={[
                  styles.splitRow,
                  i < previewSplits.length - 1 && styles.splitDivider,
                ]}
              >
                <Typography variant="label" color="textTertiary">
                  {String(i + 1).padStart(2, '0')}
                </Typography>

                <View style={styles.splitBarTrack}>
                  <View
                    style={[
                      styles.splitBarFill,
                      {
                        width: `${(split / slowestSplit) * 100}%`,
                        backgroundColor: isFastest
                          ? theme.colors.success
                          : theme.colors.primary,
                      },
                    ]}
                  />
                </View>

                <Typography
                  variant="metricSmall"
                  color={isFastest ? 'success' : 'textPrimary'}
                >
                  {formatSeconds(split)}
                </Typography>
              </View>
            );
          })}
        </Card>
      </View>
    </Screen>
  );
};
