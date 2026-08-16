import type { Theme } from '@constants/theme';
import { StyleSheet, View } from 'react-native';
import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { Chip } from '@components/Chip';
import { Icon } from '@components/Icon';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { previewGuns, type GunProfile } from '@constants/previewData';
import { useThemedStyles } from '@hooks/useTheme';

/** dB range the meters are drawn against. Below 60 dB nothing registers. */
const DB_FLOOR = 60;
const DB_CEILING = 110;

const calibrationRows = [
  { key: 'shot', label: 'Shot' },
  { key: 'reload', label: 'Reload' },
  { key: 'rack', label: 'Rack' },
] as const;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    gunHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    gunIcon: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    gunTitle: { flex: 1, gap: 2 },
    meterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    meterLabel: { width: 56 },
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
    list: { gap: theme.spacing.md },
    scaleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: theme.spacing.xs,
      paddingLeft: 56 + theme.spacing.md,
      paddingRight: 62 + theme.spacing.md,
    },
  });

type GunCardProps = { gun: GunProfile };

const GunCard = ({ gun }: GunCardProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <Card testID={`card-gun-${gun.id}`}>
      <View style={styles.gunHeader}>
        <View style={styles.gunIcon}>
          <Icon name="target" size={22} color="primary" />
        </View>

        <View style={styles.gunTitle}>
          <Typography variant="subtitle" numberOfLines={1}>
            {gun.name}
          </Typography>
          <Typography variant="caption" color="textTertiary">
            Calibrated thresholds
          </Typography>
        </View>

        <Chip label="Edit" tone="primary" onPress={() => {}} />
      </View>

      {calibrationRows.map(row => {
        const value = gun.calibration[row.key];
        const ratio = Math.min(
          1,
          Math.max(0, (value - DB_FLOOR) / (DB_CEILING - DB_FLOOR)),
        );

        return (
          <View key={row.key} style={styles.meterRow}>
            <View style={styles.meterLabel}>
              <Typography variant="label" color="textSecondary">
                {row.label}
              </Typography>
            </View>

            <View style={styles.meterTrack}>
              <View style={[styles.meterFill, { width: `${ratio * 100}%` }]} />
            </View>

            <View style={styles.meterValue}>
              <Typography variant="metricSmall">{`${value} dB`}</Typography>
            </View>
          </View>
        );
      })}

      <View style={styles.scaleRow}>
        <Typography variant="caption" color="textTertiary">
          {`${DB_FLOOR}`}
        </Typography>
        <Typography variant="caption" color="textTertiary">
          {`${DB_CEILING} dB`}
        </Typography>
      </View>
    </Card>
  );
};

export const GunsScreen = () => {
  const styles = useThemedStyles(createStyles);

  return (
    <Screen
      title="My Guns"
      subtitle="Detection thresholds per firearm"
      scrollable
      testID="screen-guns"
    >
      <SectionHeader title={`Firearms · ${previewGuns.length}`} />

      <View style={styles.list}>
        {previewGuns.map(gun => (
          <GunCard key={gun.id} gun={gun} />
        ))}
      </View>

      <Button label="Add new firearm" variant="secondary" onPress={() => {}} />
    </Screen>
  );
};
