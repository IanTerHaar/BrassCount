import { useCallback, useRef, useState } from 'react';

import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Theme } from '@/theme/theme';
import type { Drill } from '@/types/drill';
import type { RootStackParamList } from '@/types/navigation';
import { Card } from '@components/Card';
import { ConfirmSheet } from '@components/ConfirmSheet';
import { EmptyState } from '@components/EmptyState';
import { Icon } from '@components/Icon';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { SwipeableRow } from '@components/SwipeableRow';
import { Typography } from '@components/Typography';
import { useDrills, type DrillsState } from '@hooks/useDrills';
import { useThemedStyles } from '@hooks/useTheme';
import { describeDrill } from '@utils/drill';

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
 * A swipe is out of a screen reader's reach, so deleting is also offered
 * as an action on the row itself.
 */
const DELETE_ACTION = 'delete';
const DRILL_ROW_ACTIONS = [
  { name: DELETE_ACTION, label: 'Delete drill' },
] as const;

type DrillRowHandlers = {
  /** Open the editor on the saved drill with this id. */
  onEdit: (id: string) => void;
  /** A swipe left the row with this id open, or closed. */
  onOpenChange: (id: string, open: boolean) => void;
  /** Ask whether this drill should be deleted. */
  onRequestDelete: (drill: Drill) => void;
};

type DrillRowProps = DrillRowHandlers & {
  drill: Drill;
  divided: boolean;
  /** Whether the row is swiped open, showing its Delete action. */
  open: boolean;
};

/** One saved drill: tap to edit, swipe left for Delete. */
const DrillRow = ({
  drill,
  divided,
  open,
  onEdit,
  onOpenChange,
  onRequestDelete,
}: DrillRowProps) => {
  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === DELETE_ACTION) {
      onRequestDelete(drill);
    }
  };

  return (
    <SwipeableRow
      actionLabel="Delete"
      actionAccessibilityLabel={`Delete ${drill.name}`}
      onAction={() => onRequestDelete(drill)}
      open={open}
      onOpenChange={next => onOpenChange(drill.id, next)}
      actionTestID={`btn-delete-drill-${drill.id}`}
      gestureTestID={`swipe-drill-${drill.id}`}
    >
      <ListRow
        title={drill.name}
        subtitle={describeDrill(drill)}
        // A row showing its Delete action is put away by a tap, the same
        // as swiping it back, rather than opened in the editor.
        onPress={() =>
          open ? onOpenChange(drill.id, false) : onEdit(drill.id)
        }
        divided={divided}
        accessibilityActions={DRILL_ROW_ACTIONS}
        onAccessibilityAction={handleAccessibilityAction}
        testID={`row-drill-${drill.id}`}
      />
    </SwipeableRow>
  );
};

type SavedDrillsProps = DrillRowHandlers & {
  state: DrillsState;
  /** Id of the row swiped open, if any. Only one is open at a time. */
  openRowId: string | null;
  /** Open the editor on a new drill. */
  onCreate: () => void;
  onRetry: () => void;
};

/** What sits under the "Saved" header: the list, or why there is none. */
const SavedDrills = ({
  state,
  openRowId,
  onCreate,
  onEdit,
  onOpenChange,
  onRequestDelete,
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
        <DrillRow
          key={drill.id}
          drill={drill}
          divided={i < drills.length - 1}
          open={drill.id === openRowId}
          onEdit={onEdit}
          onOpenChange={onOpenChange}
          onRequestDelete={onRequestDelete}
        />
      ))}
    </Card>
  );
};

/**
 * Library of saved drills, read from `DrillStorageService` — the same
 * drills the shot timer runs. This screen is where they are viewed and
 * deleted, and the way into the editor to create one or change one.
 *
 * A drill is deleted by swiping its row left for the Delete action, then
 * confirming in a sheet. The runs recorded with it are not touched.
 */
export const DrillsScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { state, reload, deleteDrill } = useDrills();
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // The drill the confirmation sheet is asking about, while it is up.
  const [pendingDelete, setPendingDelete] = useState<Drill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // A second press of the confirm button lands before `deleting` has
  // rendered, so the guard is a ref.
  const deletingRef = useRef(false);

  const createDrill = useCallback(
    () => navigation.navigate('SequenceEditor', {}),
    [navigation],
  );

  const editDrill = useCallback(
    (id: string) => navigation.navigate('SequenceEditor', { id }),
    [navigation],
  );

  // A row left open is put away when the screen is left, so coming back
  // never finds a Delete action already showing.
  useFocusEffect(useCallback(() => () => setOpenRowId(null), []));

  const changeOpenRow = useCallback((id: string, open: boolean) => {
    // Opening a row closes whichever was open; closing one only counts if
    // it is still the open one.
    setOpenRowId(current => {
      if (open) {
        return id;
      }
      return current === id ? null : current;
    });
  }, []);

  const requestDelete = useCallback((drill: Drill) => {
    setDeleteFailed(false);
    setPendingDelete(drill);
  }, []);

  const cancelDelete = useCallback(() => {
    if (deletingRef.current) {
      return;
    }
    setPendingDelete(null);
    setDeleteFailed(false);
  }, []);

  const confirmDelete = async () => {
    if (pendingDelete === null || deletingRef.current) {
      return;
    }
    deletingRef.current = true;
    setDeleting(true);
    setDeleteFailed(false);

    // `deleteDrill` settles a failure into `false`, so this never rejects.
    const deleted = await deleteDrill(pendingDelete.id);

    deletingRef.current = false;
    setDeleting(false);
    if (!deleted) {
      // The sheet stays up with the reason, and the drill stays listed.
      setDeleteFailed(true);
      return;
    }
    // The row, and the reader's focus with the sheet, is gone: say so.
    AccessibilityInfo.announceForAccessibility(`Deleted ${pendingDelete.name}`);
    setPendingDelete(null);
    setOpenRowId(null);
  };

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
          openRowId={openRowId}
          onCreate={createDrill}
          onEdit={editDrill}
          onOpenChange={changeOpenRow}
          onRequestDelete={requestDelete}
          onRetry={reload}
        />
      </View>

      <ConfirmSheet
        visible={pendingDelete !== null}
        title={`Delete “${pendingDelete?.name ?? ''}”?`}
        message="This removes the drill from this device and cannot be undone."
        confirmLabel="Delete drill"
        busyLabel="Deleting…"
        busy={deleting}
        error={
          deleteFailed && pendingDelete !== null
            ? `Could not delete ${pendingDelete.name}. Try again.`
            : undefined
        }
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        testID="sheet-delete-drill"
      />
    </Screen>
  );
};
