import { StyleSheet, View } from 'react-native';

import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';

/** dB range the meters are drawn against. Below 60 dB nothing registers. */
const DB_FLOOR = 60;
const DB_CEILING = 110;

type CalibrationKey = 'shot' | 'reload' | 'rack';

/**
 * The sounds the audio detector needs a threshold for.
 *
 * Calibration is scoped to the current shooting session — the operator
 * dials each sound in against the ambient noise and gear on hand, so the
 * thresholds live on the session rather than the firearm. The
 * single-letter badge distinguishes reload (R) from rack (K).
 */
const calibrationTypes: {
  key: CalibrationKey;
  badge: string;
  label: string;
  description: string;
  threshold: number;
}[] = [
  {
    key: 'shot',
    badge: 'S',
    label: 'Shot',
    description: 'A single round downrange',
    threshold: 96,
  },
  {
    key: 'reload',
    badge: 'R',
    label: 'Reload',
    description: 'Magazine change',
    threshold: 74,
  },
  {
    key: 'rack',
    badge: 'K',
    label: 'Rack',
    description: 'Cycle the slide',
    threshold: 68,
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
    meterValue: { width: 62, alignItems: 'flex-end' },
    scaleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.md,
      paddingRight: 62 + theme.spacing.md,
    },
    actionRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    actionButton: { flex: 1 },
  });

type CalibrationCardProps = {
  type: (typeof calibrationTypes)[number];
};

const CalibrationCard = ({ type }: CalibrationCardProps) => {
  const styles = useThemedStyles(createStyles);

  const ratio = Math.min(
    1,
    Math.max(0, (type.threshold - DB_FLOOR) / (DB_CEILING - DB_FLOOR)),
  );

  return (
    <Card testID={`card-calibration-${type.key}`}>
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

        <Chip label="Calibrated" tone="success" />
      </View>

      <View style={styles.meterRow}>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: `${ratio * 100}%` }]} />
        </View>
        <View style={styles.meterValue}>
          <Typography variant="metricSmall">{`${type.threshold} dB`}</Typography>
        </View>
      </View>

      <View style={styles.scaleRow}>
        <Typography variant="caption" color="textTertiary">
          {`${DB_FLOOR}`}
        </Typography>
        <Typography variant="caption" color="textTertiary">
          {`${DB_CEILING} dB`}
        </Typography>
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
};

export const CalibrationScreen = () => {
  const styles = useThemedStyles(createStyles);

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
            <CalibrationCard key={type.key} type={type} />
          ))}
        </View>
      </View>

      <Button label="Recalibrate all" variant="secondary" onPress={() => {}} />
    </Screen>
  );
};
