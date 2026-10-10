import { useCallback } from 'react';

import { StyleSheet, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Theme } from '@/theme/theme';
import type { Drill } from '@/types/drill';
import type { RootStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { Icon } from '@components/Icon';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import { useDrills, type DrillsState } from '@hooks/useDrills';
import { useThemedStyles } from '@hooks/useTheme';
import { formatSeconds, pluralize } from '@utils/format';

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
    loading: {
      alignItems: 'center',
      paddingVertical: theme.spacing.xxl,
    },
  });

/**
 * The line under a drill's name: its shot count, then its total par. A
 * drill with an untimed step has no total par, so the par is left out.
 */
const describeDrill = (drill: Drill): string => {
  const shots = pluralize(drill.shotCount, 'shot');
  return drill.totalPar === null
    ? shots
    : `${shots} · Par ${formatSeconds(drill.totalPar)}`;
};

type SavedDrillsProps = {
  state: DrillsState;
  /** Open the editor on a new drill. */
  onCreate: () => void;
  /** Open the editor on the saved drill with this id. */
  onEdit: (id: string) => void;
  onRetry: () => void;
};

/** What sits under the "Saved" header: the list, or why there is none. */
const SavedDrills = ({
  state,
  onCreate,
  onEdit,
  onRetry,
}: SavedDrillsProps) => {
  const styles = useThemedStyles(createStyles);

  if (state.status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            testID="text-drills-loading"
          >
            Loading your drills…
          </Typography>
        </View>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        {/* Announced: it takes the place of the loading line on its own. */}
        <View accessibilityLiveRegion="polite">
          <EmptyState
            icon="list"
            title="Could not load your drills"
            message="Something went wrong reading them from this device."
            actionLabel="Try again"
            onActionPress={onRetry}
            testID="state-drills-error"
          />
        </View>
      </Card>
    );
  }

  const { drills } = state;

  if (drills.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="list"
          title="No drills yet"
          message="Build your first drill and it will show up here and on the timer."
          actionLabel="Create drill"
          onActionPress={onCreate}
          testID="state-drills-empty"
        />
      </Card>
    );
  }

  // Mapped inside the card rather than virtualised: a deliberate bet that a
  // library built by hand, one drill at a time, stays small. Each row is two
  // lines of text. Nothing caps the number of drills, so if libraries grow
  // into the hundreds this becomes a `FlatList`.
  return (
    <Card flush>
      {drills.map((drill, i) => (
        <ListRow
          key={drill.id}
          title={drill.name}
          subtitle={describeDrill(drill)}
          onPress={() => onEdit(drill.id)}
          divided={i < drills.length - 1}
          testID={`row-drill-${drill.id}`}
        />
      ))}
    </Card>
  );
};

/**
 * Library of saved drills, read from `DrillStorageService` — the same
 * drills the shot timer runs. This screen is where they are viewed, and
 * the way into the editor to create one or change one.
 */
export const DrillsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { state, reload } = useDrills();

  const createDrill = useCallback(
    () => navigation.navigate('SequenceEditor', {}),
    [navigation],
  );

  const editDrill = useCallback(
    (id: string) => navigation.navigate('SequenceEditor', { id }),
    [navigation],
  );

  return (
    <Screen
      title="Drills"
      subtitle="Your library of runnable drills"
      scrollable
      testID="screen-drills"
    >
      <Card
        onPress={createDrill}
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
        <SectionHeader
          title={
            state.status === 'ready'
              ? `Saved · ${state.drills.length}`
              : 'Saved'
          }
          testID="header-saved-drills"
        />
        <SavedDrills
          state={state}
          onCreate={createDrill}
          onEdit={editDrill}
          onRetry={reload}
        />
      </View>
    </Screen>
  );
};
