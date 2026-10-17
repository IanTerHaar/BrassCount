import { useCallback, useRef, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import type { Drill } from '@/types/drill';
import { DrillStorageService } from '@services/drillStorage';

export type DrillsState =
  | { status: 'loading' }
  | { status: 'error' }
  /** Most recently changed first, as `DrillStorageService` returns them. */
  | {
      status: 'ready';
      drills: Drill[];
      /**
       * The last refresh failed, so the list was read earlier. Cleared by
       * the next read that succeeds.
       */
      refreshFailed: boolean;
    };

export type UseDrillsResult = {
  state: DrillsState;
  /** Read the drills again from scratch, e.g. from a "Try again" button. */
  reload: () => void;
  /**
   * Delete the stored drill with this id and take it off the list. Never
   * rejects: resolves to `false`, with the list as it was, when the drill
   * could not be deleted.
   */
  deleteDrill: (id: string) => Promise<boolean>;
};

/**
 * Loads every saved drill for the Drills screen, and reads them again each
 * time the screen regains focus: drills are created and edited on the
 * editor pushed over it while this screen stays mounted.
 *
 * A refresh keeps the current list on screen until the new one arrives, so
 * coming back does not flash a loading state — and keeps it if the read
 * fails, flagged as `refreshFailed`. Only a first load (or a `reload`)
 * that fails shows an error.
 *
 * A drill deleted here leaves the list as soon as storage has let go of
 * it. Its sessions are left alone: deleting a drill does not delete the
 * runs recorded with it.
 */
export const useDrills = (): UseDrillsResult => {
  const [state, setState] = useState<DrillsState>({ status: 'loading' });
  // Bumped by every load, and when the screen loses focus, so a read that
  // has been superseded never lands.
  const loadIdRef = useRef(0);
  // Ids deleted from here. A read that began before a delete can answer
  // after it, still holding the drill; ids are never reused, so leaving
  // these out of every later answer is always right.
  const deletedIdsRef = useRef<ReadonlySet<string>>(new Set());

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;

    try {
      const stored = await DrillStorageService.loadAll();
      if (loadIdRef.current !== loadId) {
        return;
      }
      const drills = stored.filter(
        drill => !deletedIdsRef.current.has(drill.id),
      );
      setState({ status: 'ready', drills, refreshFailed: false });
    } catch {
      if (loadIdRef.current !== loadId) {
        return;
      }
      // With nothing on screen yet there is no list to show, so the screen
      // offers a retry. A refresh that fails is different: the list already
      // shown was read successfully, so it stays, marked as possibly out of
      // date, and the next focus reads again.
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

  const deleteDrill = useCallback(async (id: string): Promise<boolean> => {
    try {
      await DrillStorageService.deleteById(id);
    } catch {
      // The drill is still stored, so it stays listed; the caller says so.
      return false;
    }

    deletedIdsRef.current = new Set([...deletedIdsRef.current, id]);
    setState(previous =>
      previous.status === 'ready'
        ? {
            ...previous,
            drills: previous.drills.filter(drill => drill.id !== id),
          }
        : previous,
    );
    return true;
  }, []);

  return { state, reload, deleteDrill };
};
