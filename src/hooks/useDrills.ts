import { useCallback, useRef, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import type { Drill } from '@/types/drill';
import { DrillStorageService } from '@services/drillStorage';

export type DrillsState =
  | { status: 'loading' }
  | { status: 'error' }
  /** Most recently changed first, as `DrillStorageService` returns them. */
  | { status: 'ready'; drills: Drill[] };

export type UseDrillsResult = {
  state: DrillsState;
  /** Read the drills again from scratch, e.g. from a "Try again" button. */
  reload: () => void;
};

/**
 * Loads every saved drill for the Drills screen, and reads them again each
 * time the screen regains focus: drills are created, edited and deleted on
 * the editor pushed over it while this screen stays mounted.
 *
 * A refresh keeps the current list on screen until the new one arrives, so
 * coming back does not flash a loading state — and keeps it if the read
 * fails. Only a first load (or a `reload`) that fails shows an error.
 */
export const useDrills = (): UseDrillsResult => {
  const [state, setState] = useState<DrillsState>({ status: 'loading' });
  // Bumped by every load, and when the screen loses focus, so a read that
  // has been superseded never lands.
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;

    try {
      const drills = await DrillStorageService.loadAll();
      if (loadIdRef.current !== loadId) {
        return;
      }
      setState({ status: 'ready', drills });
    } catch {
      if (loadIdRef.current !== loadId) {
        return;
      }
      // With nothing on screen yet there is no list to show, so the screen
      // offers a retry. A refresh that fails is different: the list already
      // shown was read successfully, so it stays and the next focus reads
      // again.
      setState(previous =>
        previous.status === 'ready' ? previous : { status: 'error' },
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
