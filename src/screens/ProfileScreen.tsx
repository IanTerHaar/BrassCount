import { StyleSheet, View } from 'react-native';

import { Avatar } from '@components/Avatar';
import { Card } from '@components/Card';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import {
  previewDrills,
  previewGuns,
  previewHistory,
  previewUser,
} from '@constants/previewData';
import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';
import { pluralize } from '@utils/format';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    identity: {
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.md,
    },
    statsRow: {
      flexDirection: 'row',
      marginTop: theme.spacing.md,
      alignSelf: 'stretch',
    },
    stat: {
      flex: 1,
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
  });

export const ProfileScreen = () => {
  const styles = useThemedStyles(createStyles);

  const guns = previewGuns.filter(gun => previewUser.gunIds.includes(gun.id));

  return (
    <Screen title="Profile" scrollable testID="screen-profile">
      <Card>
        <View style={styles.identity}>
          <Avatar name={previewUser.name} size={84} />
          <Typography variant="subtitle">{previewUser.name}</Typography>
          <Typography variant="body" color="textTertiary">
            {previewUser.handle}
          </Typography>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Typography variant="metric">
                {String(previewHistory.length)}
              </Typography>
              <Typography variant="overline" color="textSecondary">
                RUNS
              </Typography>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Typography variant="metric">
                {String(previewDrills.length)}
              </Typography>
              <Typography variant="overline" color="textSecondary">
                DRILLS
              </Typography>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.stat}>
              <Typography variant="metric">{String(guns.length)}</Typography>
              <Typography variant="overline" color="textSecondary">
                FIREARMS
              </Typography>
            </View>
          </View>
        </View>
      </Card>

      <View>
        <SectionHeader
          title="My firearms"
          actionLabel="Manage"
          onActionPress={() => {}}
        />
        <Card flush>
          {guns.map((gun, i) => (
            <ListRow
              key={gun.id}
              title={gun.name}
              subtitle={`Shot threshold ${gun.calibration.shot} dB`}
              onPress={() => {}}
              divided={i < guns.length - 1}
              testID={`row-gun-${gun.id}`}
            />
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader title="Preferences" />
        <Card flush>
          <ListRow
            title="Appearance"
            subtitle="Follows your device setting"
            onPress={() => {}}
            divided
          />
          <ListRow
            title="Drills"
            value={pluralize(previewDrills.length, 'saved')}
            divided
          />
          <ListRow title="Sign out" onPress={() => {}} />
        </Card>
      </View>
    </Screen>
  );
};
