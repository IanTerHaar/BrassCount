import { useCallback, useRef, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import { DrillStorageService } from '@services/drillStorage';
import { SessionStorageService } from '@services/sessionStorage';
import {
  DELETED_DRILL_NAME,
  describeRuns,
  summarizeRuns,
  type RunSummary,
  type RunTotals,
} from '@utils/history';

export type DrillRunsState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      /** The drill's name as it is now, or `DELETED_DRILL_NAME`. */
      drillName: string;
      /** Every run of the drill, newest first. */
      runs: RunSummary[];
      /** Best and average time; `null` when the drill has no runs. */
      totals: RunTotals | null;
      /**
       * The last refresh failed, so the runs were read earlier. Cleared by
       * the next read that succeeds.
       */
      refreshFailed: boolean;
    };

export type UseDrillRunsResult = {
  state: DrillRunsState;
  /** Read the runs again from scratch, e.g. from a "Try again" button. */
  reload: () => void;
};

/** What has been read, and the drill it was read for. */
type Loaded = { drillId: string; state: DrillRunsState };

const LOADING: DrillRunsState = { status: 'loading' };

/**
 * Loads the runs of one drill for the History detail screen and reads them
 * again each time the screen regains focus: it stays mounted behind the
 * other tabs, where runs are saved and the drill renamed or deleted.
 *
 * The drill is read alongside its sessions because a session only holds
 * the drill's id; the name comes from the drill as it is now.
 *
 * A refresh keeps the current runs on screen until the new ones arrive, so
 * coming back does not flash a loading state — and keeps them if the read
 * fails, flagged as `refreshFailed`. Only a first load (or a `reload`)
 * that fails shows an error.
 */
export const useDrillRuns = (drillId: string): UseDrillRunsResult => {
  const [loaded, setLoaded] = useState<Loaded>({ drillId, state: LOADING });
  // Bumped by every load, and when the screen loses focus, so a read that
  // has been superseded never lands.
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;

    try {
      const [sessions, drill] = await Promise.all([
        SessionStorageService.loadByDrillId(drillId),
        DrillStorageService.loadById(drillId),
      ]);
      if (loadIdRef.current !== loadId) {
        return;
      }
      setLoaded({
        drillId,
        state: {
          status: 'ready',
          drillName: drill?.name ?? DELETED_DRILL_NAME,
          runs: describeRuns(sessions),
          totals: summarizeRuns(sessions),
          refreshFailed: false,
        },
      });
    } catch {
      if (loadIdRef.current !== loadId) {
        return;
      }
      // With nothing on screen yet, whichever read failed, there is no
      // true picture to show, so the screen offers a retry. A refresh that
      // fails is different: the runs already shown were read successfully,
      // so they stay, marked as possibly out of date, and the next focus
      // reads again.
      setLoaded(previous =>
        previous.drillId === drillId && previous.state.status === 'ready'
          ? {
              drillId,
              state: { ...previous.state, refreshFailed: true },
            }
          : { drillId, state: { status: 'error' } },
      );
    }
  }, [drillId]);

  useFocusEffect(
    useCallback(() => {
      // `load` settles every failure into state, so it never rejects.
      load().catch(() => {});

      return () => {
        loadIdRef.current += 1;
      };
    }, [load]),
  );

  const reload = useCallback(() => {
    setLoaded({ drillId, state: LOADING });
    load().catch(() => {});
  }, [drillId, load]);

  // What was read for another drill is not this drill's history: until its
  // own read lands, the screen is loading.
  return { state: loaded.drillId === drillId ? loaded.state : LOADING, reload };
};
