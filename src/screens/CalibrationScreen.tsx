import { memo } from 'react';

import { StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import type { CalibrationSound, SoundCalibration } from '@/types/calibration';
import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { useCalibration } from '@hooks/useCalibration';
import { useThemedStyles } from '@hooks/useTheme';
import { formatDecibels, spokenDecibels } from '@utils/format';

/**
 * dBFS range the meters are drawn against: full scale at the top, and a
 * floor below which a sound is too quiet to be worth detecting.
 */
const DBFS_METER_FLOOR = -60;
const DBFS_METER_CEILING = 0;

/** Fixed width of the threshold readout, so the three meters line up. */
const METER_VALUE_WIDTH = 62;

/**
 * The sounds the audio detector needs a threshold for.
 *
 * Calibration is scoped to the current shooting session — the operator
 * dials each sound in against the ambient noise and gear on hand, so the
 * thresholds live on the session rather than the firearm (see
 * `useCalibration`). The single-letter badge distinguishes reload (R)
 * from rack (K).
 */
const calibrationTypes: {
  key: CalibrationSound;
  badge: string;
  label: string;
  description: string;
}[] = [
  {
    key: 'shot',
    badge: 'S',
    label: 'Shot',
    description: 'A single round downrange',
  },
  {
    key: 'reload',
    badge: 'R',
    label: 'Reload',
    description: 'Magazine change',
  },
  {
    key: 'rack',
    badge: 'K',
    label: 'Rack',
    description: 'Cycle the slide',
  },
];

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    sessionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    sessionText: { flex: 1, gap: 2 },
    list: { gap: theme.spacing.md },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    headerText: { flex: 1, gap: 2 },
    meterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    meterTrack: {
      flex: 1,
      height: 8,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    meterFill: {
      height: '100%',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    meterValue: { width: METER_VALUE_WIDTH, alignItems: 'flex-end' },
    scaleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.md,
      paddingRight: METER_VALUE_WIDTH + theme.spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    actionButton: { flex: 1 },
  });

/**
 * How far along the meter a threshold sits, from 0 to 1. A threshold
 * quieter than the meter's floor is still valid; it just draws as an
 * empty bar, with the value beside it carrying the real number.
 */
const meterRatio = (thresholdDbfs: number | null): number => {
  if (thresholdDbfs === null) {
    return 0;
  }
  const ratio =
    (thresholdDbfs - DBFS_METER_FLOOR) /
    (DBFS_METER_CEILING - DBFS_METER_FLOOR);
  return Math.min(1, Math.max(0, ratio));
};

type CalibrationCardProps = {
  type: (typeof calibrationTypes)[number];
  calibration: Readonly<SoundCalibration>;
};

/**
 * Memoised so a card only re-renders when its own sound changes — the
 * store keeps the other sounds' objects identical across an update.
 */
const CalibrationCard = memo(({ type, calibration }: CalibrationCardProps) => {
  const styles = useThemedStyles(createStyles);

  const { thresholdDbfs, status } = calibration;
  const statusLabel = status === 'calibrated' ? 'Calibrated' : 'Not calibrated';

  return (
    <Card testID={`card-calibration-${type.key}`}>
      {/*
       * One screen-reader stop for the whole readout, in place of the
       * badge letter, the dash and the bar being announced piecemeal.
       */}
      <View
        accessible
        accessibilityLabel={`${type.label}, ${statusLabel.toLowerCase()}, threshold ${spokenDecibels(thresholdDbfs)}`}
        testID={`summary-calibration-${type.key}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.badge}>
            <Typography variant="subtitle" color="primary">
              {type.badge}
            </Typography>
          </View>

          <View style={styles.headerText}>
            <Typography variant="subtitle" numberOfLines={1}>
              {type.label}
            </Typography>
            <Typography variant="caption" color="textTertiary">
              {type.description}
            </Typography>
          </View>

          <Chip
            label={statusLabel}
            tone={status === 'calibrated' ? 'success' : 'neutral'}
            testID={`chip-calibration-${type.key}`}
          />
        </View>

        <View style={styles.meterRow}>
          <View style={styles.meterTrack}>
            <View
              style={[
                styles.meterFill,
                { width: `${meterRatio(thresholdDbfs) * 100}%` },
              ]}
              testID={`meter-calibration-${type.key}`}
            />
          </View>
          <View style={styles.meterValue}>
            <Typography
              variant="metricSmall"
              testID={`text-threshold-${type.key}`}
            >
              {formatDecibels(thresholdDbfs)}
            </Typography>
          </View>
        </View>

        <View style={styles.scaleRow}>
          <Typography variant="caption" color="textTertiary">
            {`${DBFS_METER_FLOOR}`}
          </Typography>
          <Typography variant="caption" color="textTertiary">
            {formatDecibels(DBFS_METER_CEILING)}
          </Typography>
        </View>
      </View>

      <View style={styles.actionRow}>
        <View style={styles.actionButton}>
          <Button
            label="Recalibrate"
            variant="secondary"
            onPress={() => {}}
            testID={`btn-recalibrate-${type.key}`}
          />
        </View>
        <View style={styles.actionButton}>
          <Button
            label="Test"
            variant="secondary"
            onPress={() => {}}
            testID={`btn-test-${type.key}`}
          />
        </View>
      </View>
    </Card>
  );
});

export const CalibrationScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { state } = useCalibration();

  return (
    <Screen
      title="Calibration"
      subtitle="Tune sound detection for this session"
      scrollable
      testID="screen-calibration"
    >
      <Card style={styles.sessionCard}>
        <View style={styles.sessionText}>
          <Typography variant="bodyStrong">Current session</Typography>
          <Typography variant="caption" color="textTertiary">
            Thresholds apply until you close the app
          </Typography>
        </View>
        <Chip label="Active" tone="success" />
      </Card>

      <View>
        <SectionHeader title={`Sounds · ${calibrationTypes.length}`} />
        <View style={styles.list}>
          {calibrationTypes.map(type => (
            <CalibrationCard
              key={type.key}
              type={type}
              calibration={state[type.key]}
            />
          ))}
        </View>
      </View>

      <Button label="Recalibrate all" variant="secondary" onPress={() => {}} />
    </Screen>
  );
};
