import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { DEFAULT_PROFILE, type AppearancePreference } from '@/types/profile';
import {
  ProfileStorageService,
  type ProfileStorageServiceType,
} from '@services/profileStorage';

export type AppearanceContextValue = {
  /** The Appearance choice the app is drawn with. */
  preference: AppearancePreference;
  /**
   * Switch the app to `preference` straight away and store it in the
   * profile. If the save fails the last saved choice comes back and the
   * promise rejects with the service's `ProfileStorageError` — unless a
   * newer choice was made meanwhile, in which case it resolves and the
   * newer choice stays.
   */
  setPreference: (preference: AppearancePreference) => Promise<void>;
};

export const AppearanceContext = createContext<AppearanceContextValue | null>(
  null,
);

export type AppearanceProviderProps = {
  children: ReactNode;
  /** Where the preference is read from and saved to. Swapped in tests. */
  storage?: Pick<ProfileStorageServiceType, 'load' | 'update'>;
};

/**
 * Holds the Appearance preference from the stored profile, which
 * `useTheme()` resolves into the light or dark theme.
 *
 * Nothing below it renders until the stored preference has been read, so
 * a shooter who pinned dark never sees a light first frame. The read is a
 * single small key; if it fails the app follows the device setting rather
 * than refusing to start.
 */
export const AppearanceProvider = ({
  children,
  storage = ProfileStorageService,
}: AppearanceProviderProps) => {
  const [preference, setPreferenceState] = useState<AppearancePreference>(
    DEFAULT_PROFILE.appearance,
  );
  const [loaded, setLoaded] = useState(false);
  // The last preference storage confirmed: what a failed save goes back to.
  const savedRef = useRef<AppearancePreference>(DEFAULT_PROFILE.appearance);
  // Bumped by every change, so only the latest one may roll back.
  const changeIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    storage
      .load()
      .then(profile => {
        if (active) {
          savedRef.current = profile.appearance;
          setPreferenceState(profile.appearance);
        }
      })
      // A failed read keeps the default, `system`; the shooter can still
      // pick a theme, and that save is reported if storage stays broken.
      .catch(() => {})
      .finally(() => {
        if (active) {
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [storage]);

  const setPreference = useCallback(
    async (next: AppearancePreference): Promise<void> => {
      const changeId = ++changeIdRef.current;
      setPreferenceState(next);
      try {
        const profile = await storage.update({ appearance: next });
        savedRef.current = profile.appearance;
      } catch (err) {
        // A newer choice has been made since: what is on screen is that
        // one, and its own save reports how it went, so this failure is
        // no longer the shooter's concern.
        if (changeIdRef.current !== changeId) {
          return;
        }
        setPreferenceState(savedRef.current);
        throw err;
      }
    },
    [storage],
  );

  const value = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {loaded ? children : null}
    </AppearanceContext.Provider>
  );
};
