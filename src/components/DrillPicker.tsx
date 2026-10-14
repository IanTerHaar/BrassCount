import { useMemo } from 'react';

import { StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import type { Drill } from '@/types/drill';
import type { DrillsState } from '@hooks/useDrills';
import { useThemedStyles } from '@hooks/useTheme';
import { describeDrill } from '@utils/drill';

import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Select } from './Select';
import { Typography } from './Typography';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    loading: {
      alignItems: 'center',
      paddingVertical: theme.spacing.xl,
    },
  });

type DrillPickerProps = {
  state: DrillsState;
  /** The drill on the timer; `null` while there is none to show. */
  drill: Drill | null;
  /** The drill cannot be changed: a run is on, or being saved. */
  locked: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRetry: () => void;
};

/**
 * Which stored drill is on the timer, or why there is none: the library
 * is still being read, could not be read, or is empty.
 */
export const DrillPicker = ({
  state,
  drill,
  locked,
  onSelect,
  onCreate,
  onRetry,
}: DrillPickerProps) => {
  const styles = useThemedStyles(createStyles);
  const options = useMemo(
    () =>
      state.status === 'ready'
        ? state.drills.map(item => ({
            value: item.id,
            label: item.name,
            description: describeDrill(item),
          }))
        : [],
    [state],
  );

  if (state.status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            testID="text-timer-drills-loading"
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
            testID="state-timer-drills-error"
          />
        </View>
      </Card>
    );
  }

  if (drill === null) {
    return (
      <Card>
        <EmptyState
          icon="list"
          title="No drills yet"
          message="Create a drill and it will show up here, ready to time."
          actionLabel="Create drill"
          onActionPress={onCreate}
          testID="state-timer-drills-empty"
        />
      </Card>
    );
  }

  return (
    <Select
      value={drill.id}
      options={options}
      onChange={onSelect}
      sheetTitle="Drill"
      // Not while a run is on: a stray touch would throw it away.
      disabled={locked}
      testID="select-drill"
    />
  );
};
