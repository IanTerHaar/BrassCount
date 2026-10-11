import { memo } from 'react';

import {
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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

/**
 * Narrowest a piece of a card row may get before the row wraps, in dp at
 * the default font size. Each is multiplied by the system font scale, so at
 * large text the status chip drops under the name and the paired readouts
 * and buttons stack, instead of squeezing their text into a sliver.
 */
const HEADER_TEXT_MIN_WIDTH = 72;
const HALF_ROW_MIN_WIDTH = 112;

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
    sessionBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    sessionText: { flex: 1, gap: 2 },
    list: { gap: theme.spacing.md },
    cardHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: theme.spacing.md,
      rowGap: theme.spacing.sm,
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
    // Taller than the track, so the last-test tick stands proud of the bar.
    meter: {
      height: theme.spacing.md,
      justifyContent: 'center',
    },
    meterTrack: {
      height: theme.spacing.sm,
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
    meterMarker: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: theme.spacing.xs,
      // Centres the tick on its level instead of hanging it off one side.
      marginLeft: -theme.spacing.xs / 2,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.textPrimary,
    },
    scaleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.md,
    },
    readoutRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    readout: { flex: 1, gap: theme.spacing.xs },
    readoutLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      // As tall as the taller swatch, so the two values share a baseline.
      minHeight: theme.spacing.md,
    },
    // One width for both swatches, so the two labels start in line.
    swatchSlot: { width: theme.spacing.md, alignItems: 'center' },
    // Each swatch repeats the shape its value takes on the meter, so the
    // bar and the tick are told apart by form as well as by colour.
    thresholdSwatch: {
      width: theme.spacing.md,
      height: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primary,
    },
    lastTestSwatch: {
      width: theme.spacing.xs,
      height: theme.spacing.md,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.textPrimary,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    actionButton: { flex: 1 },
  });

/**
 * How far along the meter a level sits, from 0 to 1. A level quieter than
 * the meter's floor is still valid; it just draws at the start of the bar,
 * with the value below it carrying the real number.
 */
const meterRatio = (dbfs: number | null): number => {
  if (dbfs === null) {
    return 0;
  }
  const ratio =
    (dbfs - DBFS_METER_FLOOR) / (DBFS_METER_CEILING - DBFS_METER_FLOOR);
  return Math.min(1, Math.max(0, ratio));
};

const meterPercent = (dbfs: number | null): `${number}%` =>
  `${meterRatio(dbfs) * 100}%`;

/** One sound's calibration as a screen reader should say it. */
const spokenSummary = (
  label: string,
  calibration: Readonly<SoundCalibration>,
): string => {
  // A test only ever belongs to a threshold, so there is none to report.
  if (calibration.status === 'uncalibrated') {
    return `${label}, not calibrated, threshold not set`;
  }
  const lastTest =
    calibration.lastTestDbfs === null
      ? 'not tested yet'
      : `last test ${spokenDecibels(calibration.lastTestDbfs)}`;
  return `${label}, calibrated, threshold ${spokenDecibels(calibration.thresholdDbfs)}, ${lastTest}`;
};

type ReadoutProps = {
  label: string;
  value: string;
  /** The mark this value makes on the meter, repeated beside its label. */
  swatchStyle: StyleProp<ViewStyle>;
  /** Width below which the readout wraps onto its own line. */
  minWidth: number;
  valueTestID: string;
};

const Readout = ({
  label,
  value,
  swatchStyle,
  minWidth,
  valueTestID,
}: ReadoutProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.readout, { minWidth }]}>
      <View style={styles.readoutLabel}>
        <View style={styles.swatchSlot}>
          <View style={swatchStyle} />
        </View>
        <Typography variant="overline" color="textSecondary">
          {label.toUpperCase()}
        </Typography>
      </View>
      <Typography variant="metricSmall" testID={valueTestID}>
        {value}
      </Typography>
    </View>
  );
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

  const { thresholdDbfs, status, lastTestDbfs } = calibration;
  const sound = type.label.toLowerCase();
  const { fontScale } = useWindowDimensions();
  const halfRowMinWidth = HALF_ROW_MIN_WIDTH * fontScale;

  return (
    <Card testID={`card-calibration-${type.key}`}>
      {/*
       * One screen-reader stop for the whole readout, in place of the
       * badge letter, the dashes and the bar being announced piecemeal.
       */}
      <View
        accessible
        accessibilityLabel={spokenSummary(type.label, calibration)}
        testID={`summary-calibration-${type.key}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.badge}>
            <Typography variant="subtitle" color="primary">
              {type.badge}
            </Typography>
          </View>

          <View
            style={[
              styles.headerText,
              { minWidth: HEADER_TEXT_MIN_WIDTH * fontScale },
            ]}
          >
            <Typography variant="subtitle" numberOfLines={1}>
              {type.label}
            </Typography>
            <Typography variant="caption" color="textTertiary">
              {type.description}
            </Typography>
          </View>

          <Chip
            label={status === 'calibrated' ? 'Calibrated' : 'Not calibrated'}
            tone={status === 'calibrated' ? 'success' : 'neutral'}
            testID={`chip-calibration-${type.key}`}
          />
        </View>

        <View style={styles.meter}>
          <View style={styles.meterTrack}>
            <View
              style={[styles.meterFill, { width: meterPercent(thresholdDbfs) }]}
              testID={`meter-calibration-${type.key}`}
            />
          </View>
          {lastTestDbfs === null ? null : (
            <View
              style={[styles.meterMarker, { left: meterPercent(lastTestDbfs) }]}
              testID={`marker-last-test-${type.key}`}
            />
          )}
        </View>

        <View style={styles.scaleRow}>
          <Typography variant="caption" color="textTertiary">
            {`${DBFS_METER_FLOOR}`}
          </Typography>
          <Typography variant="caption" color="textTertiary">
            {formatDecibels(DBFS_METER_CEILING)}
          </Typography>
        </View>

        <View style={styles.readoutRow}>
          <Readout
            label="Threshold"
            value={formatDecibels(thresholdDbfs)}
            swatchStyle={styles.thresholdSwatch}
            minWidth={halfRowMinWidth}
            valueTestID={`text-threshold-${type.key}`}
          />
          <Readout
            label="Last test"
            value={formatDecibels(lastTestDbfs)}
            swatchStyle={styles.lastTestSwatch}
            minWidth={halfRowMinWidth}
            valueTestID={`text-last-test-${type.key}`}
          />
        </View>
      </View>

      <View style={styles.actionRow}>
        <View style={[styles.actionButton, { minWidth: halfRowMinWidth }]}>
          <Button
            label="Recalibrate"
            accessibilityLabel={`Recalibrate ${sound}`}
            variant="secondary"
            onPress={() => {}}
            testID={`btn-recalibrate-${type.key}`}
          />
        </View>
        <View style={[styles.actionButton, { minWidth: halfRowMinWidth }]}>
          <Button
            label="Test"
            accessibilityLabel={`Test ${sound}`}
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
      <Card testID="card-calibration-session">
        <View
          accessible
          accessibilityLabel="Current session, active. Thresholds apply until you close the app"
          style={styles.sessionBanner}
          testID="banner-calibration-session"
        >
          <View style={styles.sessionText}>
            <Typography variant="bodyStrong">Current session</Typography>
            <Typography variant="caption" color="textTertiary">
              Thresholds apply until you close the app
            </Typography>
          </View>
          <Chip
            label="Active"
            tone="success"
            testID="chip-calibration-session"
          />
        </View>
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
