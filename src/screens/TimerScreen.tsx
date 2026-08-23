import { useCallback, useEffect, useRef, useState } from 'react';

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { Icon } from '@components/Icon';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import {
  countShots,
  labelForStep,
  previewDrills,
  totalParSeconds,
} from '@constants/previewData';
import type { Theme } from '@constants/theme';
import { useTheme, useThemedStyles } from '@hooks/useTheme';
import { formatElapsed, formatSeconds } from '@utils/format';

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

  const overPar = (() => {
    const par = totalParSeconds(drill.steps);
    return par !== undefined && elapsed > par && elapsed > 0;
  })();

  const shotCount = countShots(drill.steps);
  const drillPar = totalParSeconds(drill.steps);

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
            {`${shotCount} SHOTS`}
          </Typography>
          {drillPar !== undefined ? (
            <Typography variant="overline" color="textSecondary">
              {`PAR ${drillPar.toFixed(2)}S`}
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
          {drill.steps.map((step, i) => (
            <ListRow
              key={`split-${drill.id}-${i}`}
              index={i + 1}
              title={labelForStep(drill.steps, i)}
              subtitle={
                step.parSeconds !== undefined
                  ? `par ${formatSeconds(step.parSeconds)}`
                  : undefined
              }
              value="—"
              divided={i < drill.steps.length - 1}
              testID={`row-split-${i}`}
            />
          ))}
        </Card>
      </View>
    </Screen>
  );
};
