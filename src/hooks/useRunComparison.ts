import { useCallback, useRef, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import { DrillStorageService } from '@services/drillStorage';
import { SessionStorageService } from '@services/sessionStorage';
import {
  DELETED_DRILL_NAME,
  compareRuns,
  findPersonalBest,
  type RunComparison,
} from '@utils/history';

export type RunComparisonState =
  | { status: 'loading' }
  | { status: 'error' }
  /** One of the runs is not a stored run of the drill. */
  | { status: 'missing' }
  | {
      status: 'ready';
      /** The drill's name as it is now, or `DELETED_DRILL_NAME`. */
      drillName: string;
      comparison: RunComparison;
      /** Id of the drill's personal best, which may be neither run. */
      personalBestId: string | null;
    };

export type UseRunComparisonResult = {
  state: RunComparisonState;
  /** Read the runs again from scratch, e.g. from a "Try again" button. */
  reload: () => void;
};

/** What has been read, and the runs it was read for. */
type Loaded = { key: string; state: RunComparisonState };

const LOADING: RunComparisonState = { status: 'loading' };

/**
 * Loads two runs of one drill for the comparison screen, and reads them
 * again each time the screen regains focus, the way `useDrillRuns` does:
 * the drill may be renamed or deleted on another tab.
 *
 * The runs are picked out of every run of the drill rather than read by
 * id, so a run of another drill is never compared, and the drill's
 * personal best comes along with them.
 */
export const useRunComparison = (
  drillId: string,
  firstRunId: string,
  secondRunId: string,
): UseRunComparisonResult => {
  const key = `${drillId}:${firstRunId}:${secondRunId}`;
  const [loaded, setLoaded] = useState<Loaded>({ key, state: LOADING });
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
      const first = sessions.find(session => session.id === firstRunId);
      const second = sessions.find(session => session.id === secondRunId);
      setLoaded({
        key,
        state:
          firstRunId === secondRunId ||
          first === undefined ||
          second === undefined
            ? { status: 'missing' }
            : {
                status: 'ready',
                drillName: drill?.name ?? DELETED_DRILL_NAME,
                comparison: compareRuns(first, second),
                personalBestId: findPersonalBest(sessions),
              },
      });
    } catch {
      if (loadIdRef.current !== loadId) {
        return;
      }
      // A refresh that fails keeps what was read successfully before; only
      // a first load (or a retry) with nothing to show is an error.
      setLoaded(previous =>
        previous.key === key && previous.state.status === 'ready'
          ? previous
          : { key, state: { status: 'error' } },
      );
    }
  }, [drillId, firstRunId, secondRunId, key]);

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
    setLoaded({ key, state: LOADING });
    load().catch(() => {});
  }, [key, load]);

  // What was read for other runs is not this comparison: until its own
  // read lands, the screen is loading.
  return { state: loaded.key === key ? loaded.state : LOADING, reload };
};
