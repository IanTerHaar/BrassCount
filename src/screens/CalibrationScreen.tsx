import { memo, type ComponentProps } from 'react';

import {
  Linking,
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
import {
  useCalibrationCapture,
  type CalibrationCaptureMode,
  type CalibrationCaptureNoticeKind,
} from '@hooks/useCalibrationCapture';
import { useThemedStyles } from '@hooks/useTheme';
import { MIN_SAMPLE_DBFS, testOutcome } from '@utils/calibration';
import { formatDecibels, spokenDecibels } from '@utils/format';

/**
 * dBFS range the meters are drawn against: full scale at the top, and a
 * floor below which a sound is too quiet to be worth detecting — the same
 * level a calibration sample has to reach to count.
 */
const DBFS_METER_FLOOR = MIN_SAMPLE_DBFS;
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
 * from rack (K). `prompt` is what the operator is asked to do while the
 * microphone listens for that sound.
 */
const calibrationTypes: {
  key: CalibrationSound;
  badge: string;
  label: string;
  description: string;
  prompt: string;
}[] = [
  {
    key: 'shot',
    badge: 'S',
    label: 'Shot',
    description: 'A single round downrange',
    prompt: 'Fire one shot',
  },
  {
    key: 'reload',
    badge: 'R',
    label: 'Reload',
    description: 'Magazine change',
    prompt: 'Change the magazine',
  },
  {
    key: 'rack',
    badge: 'K',
    label: 'Rack',
    description: 'Cycle the slide',
    prompt: 'Rack the slide',
  },
];

/** Why a capture fell short, as the card says it. */
const noticeMessages: Record<CalibrationCaptureNoticeKind, string> = {
  'no-sound': 'No sound heard. Try again, closer to the microphone.',
  'permission-denied': 'Microphone access is needed to listen for this sound.',
  'permission-blocked':
    'Microphone access is turned off. Allow it in Settings, then try again.',
  interrupted: 'Listening stopped because the app was left. Try again.',
  failed: 'The microphone could not be used. Try again.',
};

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
    feedbackText: { marginBottom: theme.spacing.md },
    settingsButton: { marginBottom: theme.spacing.md },
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
  listening: boolean,
): string => {
  // A test only ever belongs to a threshold, so there is none to report.
  if (calibration.status === 'uncalibrated') {
    return `${label}, ${listening ? 'listening' : 'not calibrated'}, threshold not set`;
  }
  const outcome = testOutcome(calibration);
  const lastTest =
    outcome === null
      ? 'not tested yet'
      : `last test ${spokenDecibels(calibration.lastTestDbfs)}, test ${outcome}`;
  return `${label}, ${listening ? 'listening' : 'calibrated'}, threshold ${spokenDecibels(calibration.thresholdDbfs)}, ${lastTest}`;
};

type StatusChip = Pick<ComponentProps<typeof Chip>, 'label' | 'tone'>;

/**
 * The card's status badge. A capture in progress comes first; after that a
 * test result says more than "Calibrated", which it implies.
 */
const statusChip = (
  calibration: Readonly<SoundCalibration>,
  listening: boolean,
): StatusChip => {
  if (listening) {
    return { label: 'Listening', tone: 'primary' };
  }
  if (calibration.status === 'uncalibrated') {
    return { label: 'Not calibrated', tone: 'neutral' };
  }
  switch (testOutcome(calibration)) {
    case 'passed':
      return { label: 'Test passed', tone: 'success' };
    case 'failed':
      return { label: 'Test failed', tone: 'danger' };
    case null:
      return { label: 'Calibrated', tone: 'success' };
  }
};

type Feedback = {
  message: string;
  /** How a screen reader should say it, when the message holds a level. */
  spoken?: string;
  color: ComponentProps<typeof Typography>['color'];
};

/**
 * The line under the readouts: what to do while listening, why the last
 * capture fell short, or how the last test went. `null` when there is
 * nothing to say. The wording carries the meaning; the colour only backs
 * it up.
 */
const feedbackFor = (
  type: (typeof calibrationTypes)[number],
  calibration: Readonly<SoundCalibration>,
  listening: boolean,
  noticeKind: CalibrationCaptureNoticeKind | null,
): Feedback | null => {
  if (listening) {
    return { message: `Listening. ${type.prompt} now.`, color: 'primary' };
  }
  if (noticeKind !== null) {
    return { message: noticeMessages[noticeKind], color: 'danger' };
  }
  if (calibration.status === 'uncalibrated') {
    return null;
  }
  switch (testOutcome(calibration)) {
    case 'passed':
      return {
        message: 'Test passed. The sound reached the threshold.',
        color: 'success',
      };
    case 'failed':
      return {
        message: 'Test failed. The sound was quieter than the threshold.',
        color: 'danger',
      };
    case null:
      // Without this a recalibration that worked would end in silence for
      // a screen reader: the chip that turns to "Calibrated" is not live.
      return {
        message: `Threshold set to ${formatDecibels(calibration.thresholdDbfs)}. Run a test to check it.`,
        spoken: `Threshold set to ${spokenDecibels(calibration.thresholdDbfs)}. Run a test to check it.`,
        color: 'textSecondary',
      };
  }
};

const openAppSettings = (): void => {
  // Nothing more to offer if the settings screen will not open: the
  // message beside the button already says where the permission lives.
  Linking.openSettings().catch(() => {});
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
  /** The capture running for this sound, if one is. */
  activeMode: CalibrationCaptureMode | null;
  /** Another sound holds the microphone, so this card cannot start. */
  locked: boolean;
  /** Why this sound's last capture fell short, if it did. */
  noticeKind: CalibrationCaptureNoticeKind | null;
  onRecalibrate: (sound: CalibrationSound) => void;
  onTest: (sound: CalibrationSound) => void;
  onCancel: () => void;
};

/**
 * Memoised so a card only re-renders when its own sound changes — the
 * store keeps the other sounds' objects identical across an update, and
 * the capture callbacks keep their identity.
 */
const CalibrationCard = memo((props: CalibrationCardProps) => {
  const {
    type,
    calibration,
    activeMode,
    locked,
    noticeKind,
    onRecalibrate,
    onTest,
    onCancel,
  } = props;
  const styles = useThemedStyles(createStyles);

  const { thresholdDbfs, status, lastTestDbfs } = calibration;
  const sound = type.label.toLowerCase();
  const { fontScale } = useWindowDimensions();
  const halfRowMinWidth = HALF_ROW_MIN_WIDTH * fontScale;

  const listening = activeMode !== null;
  const recalibrating = activeMode === 'recalibrate';
  const testing = activeMode === 'test';
  const chip = statusChip(calibration, listening);
  const feedback = feedbackFor(type, calibration, listening, noticeKind);

  return (
    <Card testID={`card-calibration-${type.key}`}>
      {/*
       * One screen-reader stop for the whole readout, in place of the
       * badge letter, the dashes and the bar being announced piecemeal.
       */}
      <View
        accessible
        accessibilityLabel={spokenSummary(type.label, calibration, listening)}
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
            label={chip.label}
            tone={chip.tone}
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

      {/*
       * Always mounted, so a screen reader is told when the line inside
       * appears or changes rather than only when the region itself does.
       */}
      <View
        accessibilityLiveRegion="polite"
        testID={`feedback-calibration-${type.key}`}
      >
        {feedback === null ? null : (
          <Typography
            variant="caption"
            color={feedback.color}
            // Always set: Android keeps the previous label when this goes
            // back to undefined, and would read it over the new text.
            accessibilityLabel={feedback.spoken ?? feedback.message}
            style={styles.feedbackText}
            testID={`text-feedback-${type.key}`}
          >
            {feedback.message}
          </Typography>
        )}
      </View>

      {noticeKind === 'permission-blocked' && !listening ? (
        <Button
          label="Open settings"
          variant="secondary"
          onPress={openAppSettings}
          style={styles.settingsButton}
          testID={`btn-open-settings-${type.key}`}
        />
      ) : null}

      <View style={styles.actionRow}>
        <View style={[styles.actionButton, { minWidth: halfRowMinWidth }]}>
          <Button
            label={recalibrating ? 'Cancel' : 'Recalibrate'}
            accessibilityLabel={
              recalibrating
                ? `Cancel recalibrating ${sound}`
                : `Recalibrate ${sound}`
            }
            variant="secondary"
            disabled={locked || testing}
            onPress={recalibrating ? onCancel : () => onRecalibrate(type.key)}
            testID={`btn-recalibrate-${type.key}`}
          />
        </View>
        <View style={[styles.actionButton, { minWidth: halfRowMinWidth }]}>
          <Button
            label={testing ? 'Cancel' : 'Test'}
            accessibilityLabel={
              testing ? `Cancel testing ${sound}` : `Test ${sound}`
            }
            variant="secondary"
            // A test measures a sound against its threshold, so there is
            // nothing to run one against until the sound is calibrated.
            disabled={locked || recalibrating || status === 'uncalibrated'}
            onPress={testing ? onCancel : () => onTest(type.key)}
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
  const { active, notice, recalibrate, test, cancel } = useCalibrationCapture();

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
              activeMode={active?.sound === type.key ? active.mode : null}
              locked={active !== null && active.sound !== type.key}
              noticeKind={notice?.sound === type.key ? notice.kind : null}
              onRecalibrate={recalibrate}
              onTest={test}
              onCancel={cancel}
            />
          ))}
        </View>
      </View>

      <Button label="Recalibrate all" variant="secondary" onPress={() => {}} />
    </Screen>
  );
};
