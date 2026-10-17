import { useCallback, useRef, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import { DrillStorageService } from '@services/drillStorage';
import { SessionStorageService } from '@services/sessionStorage';
import {
  summarizeDrillHistory,
  type DrillHistorySummary,
} from '@utils/history';

export type DrillHistoryState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready';
      /** Saved sessions: one per completed run of a drill. */
      runCount: number;
      /** One per drill with at least one run, most recently run first. */
      summaries: DrillHistorySummary[];
      /**
       * The last refresh failed, so the history was read earlier. Cleared
       * by the next read that succeeds.
       */
      refreshFailed: boolean;
    };

export type UseDrillHistoryResult = {
  state: DrillHistoryState;
  /** Read the history again from scratch, e.g. from a "Try again" button. */
  reload: () => void;
};

/**
 * Loads every saved run for the History screen, grouped by drill, and
 * reads them again each time the screen regains focus: runs are saved, and
 * drills renamed or deleted, from other tabs while this one stays mounted.
 *
 * The drills are read alongside the sessions because a session only holds
 * its drill's id; the name comes from the drill as it is now.
 *
 * A refresh keeps the current list on screen until the new one arrives, so
 * coming back does not flash a loading state — and keeps it if the read
 * fails, flagged as `refreshFailed`. Only a first load (or a `reload`)
 * that fails shows an error.
 */
export const useDrillHistory = (): UseDrillHistoryResult => {
  const [state, setState] = useState<DrillHistoryState>({ status: 'loading' });
  // Bumped by every load, and when the screen loses focus, so a read that
  // has been superseded never lands.
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;

    try {
      const [sessions, drills] = await Promise.all([
        SessionStorageService.loadAll(),
        DrillStorageService.loadAll(),
      ]);
      if (loadIdRef.current !== loadId) {
        return;
      }
      setState({
        status: 'ready',
        runCount: sessions.length,
        summaries: summarizeDrillHistory(sessions, drills),
        refreshFailed: false,
      });
    } catch {
      if (loadIdRef.current !== loadId) {
        return;
      }
      // With nothing on screen yet, whichever read failed, there is no
      // true picture to show, so the screen offers a retry. A refresh that
      // fails is different: the history already shown was read
      // successfully, so it stays, marked as possibly out of date, and the
      // next focus reads again.
      setState(previous =>
        previous.status === 'ready'
          ? { ...previous, refreshFailed: true }
          : { status: 'error' },
      );
    }
  }, []);

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
    setState({ status: 'loading' });
    load().catch(() => {});
  }, [load]);

  return { state, reload };
};
