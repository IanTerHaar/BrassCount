import { useCallback, useRef, useState } from 'react';

import {
  AccessibilityInfo,
  FlatList,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type ListRenderItemInfo,
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
import { RefreshFailedNotice } from '@components/RefreshFailedNotice';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { SwipeableRow } from '@components/SwipeableRow';
import { Typography } from '@components/Typography';
import { useAnnounce } from '@hooks/useAnnounce';
import { useDrills, type DrillsState } from '@hooks/useDrills';
import { useThemedStyles } from '@hooks/useTheme';
import { describeDrill } from '@utils/drill';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ERROR_TITLE = 'Could not load your drills';

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    // The list runs to the bottom edge, under the floating tab bar.
    screenContent: { paddingBottom: 0 },
    // Pulled out to the screen's edges and padded back in, so the cards'
    // shadows are not cut off at the sides of the list.
    list: {
      flex: 1,
      marginHorizontal: -theme.spacing.lg,
    },
    listContent: {
      paddingHorizontal: theme.spacing.lg,
      // Clears the floating tab bar so the last card is never trapped.
      paddingBottom: theme.spacing.xxl * 2,
    },
    listHeader: { gap: theme.spacing.md },
    separator: { height: theme.spacing.md },
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
  /** Whether the row is swiped open, showing its Delete action. */
  open: boolean;
};

/** One saved drill: tap to edit, swipe left for Delete. */
const DrillRow = ({
  drill,
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
    <Card flush>
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
          accessibilityActions={DRILL_ROW_ACTIONS}
          onAccessibilityAction={handleAccessibilityAction}
          testID={`row-drill-${drill.id}`}
        />
      </SwipeableRow>
    </Card>
  );
};

type DrillsStatusProps = {
  /** Why there is no drill to list. */
  status: 'loading' | 'error' | 'empty';
  onRetry: () => void;
};

/** What sits under the "Saved" header when there is no drill to list. */
const DrillsStatus = ({ status, onRetry }: DrillsStatusProps) => {
  const styles = useThemedStyles(createStyles);

  if (status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            // Spoken when "Try again" swaps the error for this line.
            accessibilityLiveRegion="polite"
            testID="text-drills-loading"
          >
            Loading your drills…
          </Typography>
        </View>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        <EmptyState
          icon="list"
          title={ERROR_TITLE}
          message="Something went wrong reading them from this device."
          actionLabel="Try again"
          onActionPress={onRetry}
          testID="state-drills-error"
        />
      </Card>
    );
  }

  // No button of its own: the Create Drill card sits right above, and a
  // second control with the same job would give a screen reader two.
  return (
    <Card>
      <EmptyState
        icon="list"
        title="No drills yet"
        message="Tap Create Drill above to build your first. It will show up here and on the timer."
        testID="state-drills-empty"
      />
    </Card>
  );
};

const NO_DRILLS: Drill[] = [];

const keyOfDrill = (drill: Drill): string => drill.id;

const DrillSeparator = () => {
  const styles = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
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
  const drills = state.status === 'ready' ? state.drills : NO_DRILLS;
  const listStatus = state.status === 'ready' ? 'empty' : state.status;
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  // The drill the confirmation sheet is asking about, while it is up.
  const [pendingDelete, setPendingDelete] = useState<Drill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // A second press of the confirm button lands before `deleting` has
  // rendered, so the guard is a ref.
  const deletingRef = useRef(false);

  // An error takes the place of the loading line, which TalkBack does not
  // announce on its own.
  useAnnounce(state.status === 'error' ? ERROR_TITLE : null);

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

  const renderDrill = useCallback(
    ({ item }: ListRenderItemInfo<Drill>) => (
      <DrillRow
        drill={item}
        open={item.id === openRowId}
        onEdit={editDrill}
        onOpenChange={changeOpenRow}
        onRequestDelete={requestDelete}
      />
    ),
    [openRowId, editDrill, changeOpenRow, requestDelete],
  );

  return (
    <Screen
      title="Drills"
      subtitle="Your library of runnable drills"
      contentStyle={styles.screenContent}
      testID="screen-drills"
    >
      <FlatList
        data={drills}
        keyExtractor={keyOfDrill}
        renderItem={renderDrill}
        // The rows know which one is open only through `renderItem`.
        extraData={openRowId}
        ListHeaderComponent={
          <View style={styles.listHeader}>
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

            <SectionHeader
              title={
                state.status === 'ready'
                  ? `Saved · ${state.drills.length}`
                  : 'Saved'
              }
              testID="header-saved-drills"
            />
            {state.status === 'ready' && state.refreshFailed ? (
              <RefreshFailedNotice testID="text-drills-refresh-failed" />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <DrillsStatus status={listStatus} onRetry={reload} />
        }
        ItemSeparatorComponent={DrillSeparator}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        testID="list-drills"
      />

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
