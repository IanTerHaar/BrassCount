import { StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Theme } from '@/theme/theme';
import type { RootStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { Icon } from '@components/Icon';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { countShots, previewDrills } from '@constants/previewData';
import { useThemedStyles } from '@hooks/useTheme';
import { pluralize } from '@utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    createCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    createIcon: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    createText: { flex: 1, gap: 2 },
  });

/**
 * Library of saved drills — the same list surfaced as chips above the
 * shot timer. Selecting a drill on the timer runs it; this screen is
 * where they are viewed, created and edited.
 */
export const DrillsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();

  const describe = (drill: (typeof previewDrills)[number]) =>
    pluralize(countShots(drill.steps), 'shot');

  return (
    <Screen
      title="Drills"
      subtitle="Your library of runnable drills"
      scrollable
      testID="screen-drills"
    >
      <Card
        onPress={() => navigation.navigate('SequenceEditor', {})}
        style={styles.createCard}
        testID="btn-create-drill"
      >
        <View style={styles.createIcon}>
          <Icon name="plus" size={22} color="primary" />
        </View>
        <View style={styles.createText}>
          <Typography variant="bodyStrong">Create Drill</Typography>
          <Typography variant="caption" color="textTertiary">
            Name it, then chain the actions in order
          </Typography>
        </View>
        <Icon name="chevron" size={16} color="textTertiary" />
      </Card>

      <View>
        <SectionHeader title={`Saved · ${previewDrills.length}`} />

        {previewDrills.length === 0 ? (
          <Card>
            <EmptyState
              icon="list"
              title="No drills yet"
              message="Build your first drill and it will show up here and on the timer."
              actionLabel="Create drill"
              onActionPress={() => navigation.navigate('SequenceEditor', {})}
            />
          </Card>
        ) : (
          <Card flush>
            {previewDrills.map((drill, i) => (
              <ListRow
                key={drill.id}
                title={drill.name}
                subtitle={describe(drill)}
                onPress={() =>
                  navigation.navigate('SequenceEditor', { id: drill.id })
                }
                divided={i < previewDrills.length - 1}
                testID={`row-drill-${drill.id}`}
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
};
