import { useCallback, useRef, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import type { Profile, ProfileChanges } from '@/types/profile';
import { DrillStorageService } from '@services/drillStorage';
import { ProfileStorageService } from '@services/profileStorage';
import { SessionStorageService } from '@services/sessionStorage';

/** Everything the Profile screen shows that comes out of storage. */
export type ProfileOverview = {
  profile: Profile;
  /** Saved sessions: one per completed run of a drill. */
  runCount: number;
  /** Saved drills. */
  drillCount: number;
};

export type ProfileOverviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; overview: ProfileOverview };

export type UseProfileOverviewResult = {
  state: ProfileOverviewState;
  /** Read everything again from scratch, e.g. from a "Try again" button. */
  reload: () => void;
  /**
   * Save changes to the profile and show the stored result. Rejects with
   * the service's `ProfileStorageError`, leaving what is shown untouched.
   */
  saveProfile: (changes: ProfileChanges) => Promise<Profile>;
};

/**
 * Loads the local profile and the run / drill counts for the Profile
 * screen, and reads them again each time the screen regains focus: runs
 * and drills are saved from other tabs while this one stays mounted.
 *
 * A refresh keeps the current values on screen until the new ones arrive,
 * so returning to the tab does not flash a loading state — and keeps them
 * if it fails. Only a first load (or a `reload`) that fails shows an error.
 *
 * The counts come from loading every session and drill, so they match
 * what the History and Drills lists will show: entries that fail
 * validation are skipped there and are not counted here.
 */
export const useProfileOverview = (): UseProfileOverviewResult => {
  const [state, setState] = useState<ProfileOverviewState>({
    status: 'loading',
  });
  // Bumped by every load, and when the screen loses focus, so a read that
  // has been superseded never lands.
  const loadIdRef = useRef(0);
  // Bumped by every completed save, so a read that started before the save
  // cannot put the older profile back.
  const saveCountRef = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++loadIdRef.current;
    const savesAtStart = saveCountRef.current;

    try {
      const [profile, sessions, drills] = await Promise.all([
        ProfileStorageService.load(),
        SessionStorageService.loadAll(),
        DrillStorageService.loadAll(),
      ]);
      if (loadIdRef.current !== loadId) {
        return;
      }
      setState(previous => ({
        status: 'ready',
        overview: {
          profile:
            previous.status === 'ready' && saveCountRef.current !== savesAtStart
              ? previous.overview.profile
              : profile,
          runCount: sessions.length,
          drillCount: drills.length,
        },
      }));
    } catch {
      if (loadIdRef.current !== loadId) {
        return;
      }
      // With nothing on screen yet, whichever read failed, there is no
      // true picture to show, so the screen offers a retry. A refresh that
      // fails is different: what is already shown was read successfully,
      // and replacing it with an error would also throw away a half-typed
      // edit. It stays, and the next focus reads again.
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

  const saveProfile = useCallback(
    async (changes: ProfileChanges): Promise<Profile> => {
      const profile = await ProfileStorageService.update(changes);
      saveCountRef.current += 1;
      setState(previous =>
        previous.status === 'ready'
          ? { status: 'ready', overview: { ...previous.overview, profile } }
          : previous,
      );
      return profile;
    },
    [],
  );

  return { state, reload, saveProfile };
};
