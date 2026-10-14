import { Text } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useTheme } from '../src/hooks/useTheme';
import { ProfileScreen } from '../src/screens/ProfileScreen';
import { saveDrill } from '../src/services/drillStorage';
import {
  ProfileStorageError,
  ProfileStorageService,
  loadProfile,
  updateProfile,
} from '../src/services/profileStorage';
import {
  SessionStorageService,
  saveSession,
} from '../src/services/sessionStorage';
import {
  AppearanceProvider,
  type AppearanceProviderProps,
} from '../src/store/AppearanceContext';
import { DEFAULT_PROFILE, type Profile } from '../src/types/profile';

type TestTabParamList = {
  Profile: undefined;
  Elsewhere: undefined;
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Tab = createBottomTabNavigator<TestTabParamList>();

/** A second tab to switch to, so the Profile tab can lose and regain focus. */
const Elsewhere = () => null;

/** Says which theme the rest of the app is being drawn in. */
const ThemeProbe = () => (
  <Text testID="text-theme-mode">{useTheme().mode}</Text>
);

const seedDrill = () =>
  saveDrill({
    name: 'Bill Drill',
    steps: [
      { type: 'draw', par: 1.5 },
      { type: 'shot', par: 0.25 },
    ],
  });

const seedSession = () =>
  saveSession({
    drillId: 'drill-1',
    totalTime: 1.7,
    completed: true,
    splits: [
      { stepId: 'step-1', label: 'Draw', par: 1.5, actual: 1.4 },
      { stepId: 'step-2', label: 'Shot 1', par: 0.25, actual: 0.3 },
    ],
  });

/** Let pending storage reads and the state updates they cause land. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
  });
};

type Harness = {
  tree: ReactTestRenderer;
  /** Switch to another tab, or back to Profile. */
  goTo: (tab: keyof TestTabParamList) => Promise<void>;
};

const mounted: ReactTestRenderer[] = [];

/**
 * The real storage functions, handed to the provider directly so a spy on
 * `ProfileStorageService` only ever sees the screen's own reads and saves.
 */
const appearanceStorage: AppearanceProviderProps['storage'] = {
  load: loadProfile,
  update: updateProfile,
};

/** Mount the screen in a tab navigator without waiting for it to load. */
const mountScreen = (storage = appearanceStorage): Harness => {
  const navigationRef = createNavigationContainerRef<TestTabParamList>();
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <AppearanceProvider storage={storage}>
          <ThemeProbe />
          <NavigationContainer ref={navigationRef}>
            <Tab.Navigator screenOptions={{ headerShown: false }}>
              <Tab.Screen name="Profile" component={ProfileScreen} />
              <Tab.Screen name="Elsewhere" component={Elsewhere} />
            </Tab.Navigator>
          </NavigationContainer>
        </AppearanceProvider>
      </SafeAreaProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  mounted.push(tree);

  return {
    tree,
    goTo: async tab => {
      act(() => {
        navigationRef.navigate(tab);
      });
      await settle();
    },
  };
};

/** Mount the screen and wait until it shows what is in storage. */
const renderScreen = async (storage = appearanceStorage): Promise<Harness> => {
  const harness = mountScreen(storage);
  await settle();
  return harness;
};

const byTestId = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({ testID });

const has = (tree: ReactTestRenderer, testID: string): boolean =>
  byTestId(tree, testID).length > 0;

/**
 * The text shown by the element with this `testID`. A `testID` is
 * forwarded through several nested elements; the one holding the string is
 * the text itself.
 */
const textOf = (tree: ReactTestRenderer, testID: string): string => {
  const text = byTestId(tree, testID).find(
    node => typeof node.props.children === 'string',
  );
  if (text === undefined) {
    throw new Error(`no text is rendered for "${testID}"`);
  }
  return text.props.children;
};

const press = async (tree: ReactTestRenderer, testID: string) => {
  await act(async () => {
    byTestId(tree, testID)[0].props.onPress();
  });
  await settle();
};

const type = (tree: ReactTestRenderer, testID: string, text: string) => {
  act(() => {
    byTestId(tree, testID)[0].props.onChangeText(text);
  });
};

const saveButton = (tree: ReactTestRenderer) =>
  byTestId(tree, 'btn-save-profile')[0];

describe('ProfileScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    // Unmount, or the navigator's pending work outlives the test.
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
  });

  describe('showing the profile', () => {
    it('says it is loading until storage answers', async () => {
      let releaseRead: () => void = () => {};
      jest.spyOn(SessionStorageService, 'loadAll').mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseRead = () => resolve([]);
          }),
      );
      const { tree } = await renderScreen();

      expect(has(tree, 'text-profile-loading')).toBe(true);
      expect(has(tree, 'text-profile-name')).toBe(false);

      await act(async () => {
        releaseRead();
      });
      await settle();

      expect(has(tree, 'text-profile-loading')).toBe(false);
      expect(has(tree, 'text-profile-name')).toBe(true);
    });

    it('shows an unnamed profile with zero counts on a fresh install', async () => {
      const { tree } = await renderScreen();

      expect(textOf(tree, 'text-profile-name')).toBe('No name set');
      expect(has(tree, 'text-profile-handle')).toBe(false);
      expect(textOf(tree, 'text-run-count')).toBe('0');
      expect(textOf(tree, 'text-drill-count')).toBe('0');
    });

    it('shows the stored name, handle and initials', async () => {
      await updateProfile({ name: 'Marty McFly', handle: 'martymcfly' });

      const { tree } = await renderScreen();

      expect(textOf(tree, 'text-profile-name')).toBe('Marty McFly');
      expect(textOf(tree, 'text-profile-handle')).toBe('@martymcfly');
      expect(tree.root.findAllByProps({ children: 'MM' })).not.toHaveLength(0);
    });

    it('counts the stored runs and drills', async () => {
      await seedDrill();
      await seedSession();
      await seedSession();

      const { tree } = await renderScreen();

      expect(textOf(tree, 'text-run-count')).toBe('2');
      expect(textOf(tree, 'text-drill-count')).toBe('1');
    });

    it('reads each count out as a phrase', async () => {
      await seedDrill();
      await seedSession();
      await seedSession();

      const { tree } = await renderScreen();

      expect(
        tree.root.findAllByProps({ accessibilityLabel: '2 runs' }),
      ).not.toHaveLength(0);
      expect(
        tree.root.findAllByProps({ accessibilityLabel: '1 drill' }),
      ).not.toHaveLength(0);
    });

    it('drops a read that answers after the tab was left, then reads again', async () => {
      let releaseRead: () => void = () => {};
      jest.spyOn(ProfileStorageService, 'load').mockImplementationOnce(
        () =>
          new Promise<Profile>(resolve => {
            releaseRead = () => resolve({ ...DEFAULT_PROFILE, name: 'Stale' });
          }),
      );
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');

      await act(async () => {
        releaseRead();
      });
      await settle();
      expect(has(tree, 'text-profile-loading')).toBe(true);

      await updateProfile({ name: 'Marty McFly' });
      await goTo('Profile');
      expect(textOf(tree, 'text-profile-name')).toBe('Marty McFly');
    });

    it('picks up runs and drills saved while another tab was open', async () => {
      const { tree, goTo } = await renderScreen();
      expect(textOf(tree, 'text-run-count')).toBe('0');

      await goTo('Elsewhere');
      await seedDrill();
      await seedSession();
      await goTo('Profile');

      expect(textOf(tree, 'text-run-count')).toBe('1');
      expect(textOf(tree, 'text-drill-count')).toBe('1');
    });
  });

  describe('preferences', () => {
    it('says Appearance follows the device until a theme is chosen', async () => {
      const { tree } = await renderScreen();

      expect(byTestId(tree, 'row-appearance')[0].props.subtitle).toBe(
        'Follows your device setting',
      );
    });

    it('shows the stored Appearance preference', async () => {
      await updateProfile({ appearance: 'dark' });

      const { tree } = await renderScreen();

      expect(byTestId(tree, 'row-appearance')[0].props.subtitle).toBe('Dark');
    });

    it('opens the picker with the stored choice checked', async () => {
      await updateProfile({ appearance: 'light' });
      const { tree } = await renderScreen();

      expect(byTestId(tree, 'opt-appearance-light')).toHaveLength(0);
      await press(tree, 'row-appearance');

      const checked = (preference: string) =>
        byTestId(tree, `opt-appearance-${preference}`)[0].props
          .accessibilityState.checked;
      expect(checked('system')).toBe(false);
      expect(checked('light')).toBe(true);
      expect(checked('dark')).toBe(false);
    });

    it('switches the theme and stores the choice', async () => {
      const { tree } = await renderScreen();
      expect(textOf(tree, 'text-theme-mode')).toBe('light');

      await press(tree, 'row-appearance');
      await press(tree, 'opt-appearance-dark');

      expect(textOf(tree, 'text-theme-mode')).toBe('dark');
      expect(byTestId(tree, 'row-appearance')[0].props.subtitle).toBe('Dark');
      expect(byTestId(tree, 'opt-appearance-dark')).toHaveLength(0);
      expect((await loadProfile()).appearance).toBe('dark');
    });

    it('draws the stored theme from the first frame', async () => {
      await updateProfile({ appearance: 'dark' });

      const { tree } = await renderScreen();

      expect(textOf(tree, 'text-theme-mode')).toBe('dark');
    });

    it('follows the device again when System is chosen', async () => {
      await updateProfile({ appearance: 'dark' });
      const { tree } = await renderScreen();

      await press(tree, 'row-appearance');
      await press(tree, 'opt-appearance-system');

      // The test environment reports a light device.
      expect(textOf(tree, 'text-theme-mode')).toBe('light');
      expect(byTestId(tree, 'row-appearance')[0].props.subtitle).toBe(
        'Follows your device setting',
      );
      expect((await loadProfile()).appearance).toBe('system');
    });

    it('changes nothing when the picker is closed without a choice', async () => {
      const { tree } = await renderScreen();

      await press(tree, 'row-appearance');
      await press(tree, 'btn-appearance-close');

      expect(byTestId(tree, 'opt-appearance-dark')).toHaveLength(0);
      expect(textOf(tree, 'text-theme-mode')).toBe('light');
      expect((await loadProfile()).updatedAt).toBeNull();
    });

    it('puts the old theme back and says so when the save fails', async () => {
      await updateProfile({ appearance: 'light' });
      const { tree } = await renderScreen({
        load: loadProfile,
        update: () =>
          Promise.reject(
            new ProfileStorageError('disk full', 'STORAGE_FAILURE'),
          ),
      });

      await press(tree, 'row-appearance');
      await press(tree, 'opt-appearance-dark');

      expect(textOf(tree, 'text-theme-mode')).toBe('light');
      expect(byTestId(tree, 'row-appearance')[0].props.subtitle).toBe('Light');
      expect(textOf(tree, 'text-appearance-error')).toBe(
        'Could not save your theme. Try again.',
      );
      expect((await loadProfile()).appearance).toBe('light');
    });

    it('shows no error when an older save fails after a newer choice', async () => {
      let failFirst: () => void = () => {};
      let calls = 0;
      const { tree } = await renderScreen({
        load: loadProfile,
        update: changes => {
          calls += 1;
          if (calls === 1) {
            return new Promise<Profile>((_, reject) => {
              failFirst = () =>
                reject(new ProfileStorageError('disk full', 'STORAGE_FAILURE'));
            });
          }
          return updateProfile(changes);
        },
      });

      await press(tree, 'row-appearance');
      await press(tree, 'opt-appearance-dark');
      await press(tree, 'row-appearance');
      await press(tree, 'opt-appearance-light');
      await act(async () => {
        failFirst();
      });
      await settle();

      expect(has(tree, 'text-appearance-error')).toBe(false);
      expect(textOf(tree, 'text-theme-mode')).toBe('light');
      expect((await loadProfile()).appearance).toBe('light');
    });

    it('follows the device when the stored choice cannot be read', async () => {
      const { tree } = await renderScreen({
        load: () =>
          Promise.reject(
            new ProfileStorageError('unreadable', 'STORAGE_FAILURE'),
          ),
        update: updateProfile,
      });

      expect(textOf(tree, 'text-theme-mode')).toBe('light');
      expect(has(tree, 'row-appearance')).toBe(true);
    });

    it('offers no sign out, as there is no account to leave', async () => {
      const { tree } = await renderScreen();

      expect(tree.root.findAllByProps({ title: 'Sign out' })).toHaveLength(0);
    });
  });

  describe('editing the profile', () => {
    it('opens the form with the stored name and handle', async () => {
      await updateProfile({ name: 'Marty McFly', handle: '@martymcfly' });
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');

      expect(byTestId(tree, 'input-profile-name')[0].props.value).toBe(
        'Marty McFly',
      );
      expect(byTestId(tree, 'input-profile-handle')[0].props.value).toBe(
        '@martymcfly',
      );
    });

    it('saves what was typed and shows it as stored', async () => {
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', '  Doc   Brown ');
      type(tree, 'input-profile-handle', 'doc.brown');
      await press(tree, 'btn-save-profile');

      expect(has(tree, 'form-profile')).toBe(false);
      expect(textOf(tree, 'text-profile-name')).toBe('Doc Brown');
      expect(textOf(tree, 'text-profile-handle')).toBe('@doc.brown');
      expect(await loadProfile()).toMatchObject({
        name: 'Doc Brown',
        handle: '@doc.brown',
      });
    });

    it('clears the name and handle when the fields are emptied', async () => {
      await updateProfile({ name: 'Marty McFly', handle: '@martymcfly' });
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', '');
      type(tree, 'input-profile-handle', '');
      await press(tree, 'btn-save-profile');

      expect(textOf(tree, 'text-profile-name')).toBe('No name set');
      expect(has(tree, 'text-profile-handle')).toBe(false);
      expect(await loadProfile()).toMatchObject({ name: null, handle: null });
    });

    it('keeps the Appearance preference when the name is saved', async () => {
      await updateProfile({ appearance: 'dark' });
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', 'Doc Brown');
      await press(tree, 'btn-save-profile');

      expect((await loadProfile()).appearance).toBe('dark');
    });

    it('discards what was typed on cancel', async () => {
      await updateProfile({ name: 'Marty McFly' });
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', 'Biff Tannen');
      await press(tree, 'btn-cancel-profile');

      expect(has(tree, 'form-profile')).toBe(false);
      expect(textOf(tree, 'text-profile-name')).toBe('Marty McFly');
      expect((await loadProfile()).name).toBe('Marty McFly');

      // Reopening starts from the stored profile, not the abandoned draft.
      await press(tree, 'btn-edit-profile');
      expect(byTestId(tree, 'input-profile-name')[0].props.value).toBe(
        'Marty McFly',
      );
    });

    it('explains a handle that cannot be used and blocks the save', async () => {
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      expect(saveButton(tree).props.disabled).toBe(false);

      type(tree, 'input-profile-handle', '@doc brown');

      expect(textOf(tree, 'input-profile-handle-error')).toMatch(/letters/);
      expect(saveButton(tree).props.disabled).toBe(true);

      await press(tree, 'btn-save-profile');

      expect(has(tree, 'form-profile')).toBe(true);
      expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
    });

    it('allows the save again once the handle is fixed', async () => {
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-handle', '@doc brown');
      type(tree, 'input-profile-handle', '@doc_brown');

      expect(has(tree, 'input-profile-handle-error')).toBe(false);
      expect(saveButton(tree).props.disabled).toBe(false);
    });

    it('keeps the form open with a message when the save fails', async () => {
      const update = jest
        .spyOn(ProfileStorageService, 'update')
        .mockRejectedValueOnce(
          new ProfileStorageError('disk full', 'STORAGE_FAILURE'),
        );
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', 'Doc Brown');
      await press(tree, 'btn-save-profile');

      expect(textOf(tree, 'text-profile-save-error')).toBe(
        'Could not save your profile. Try again.',
      );
      expect(byTestId(tree, 'input-profile-name')[0].props.value).toBe(
        'Doc Brown',
      );
      expect(saveButton(tree).props.disabled).toBe(false);

      // The mock only fails once, so a second press goes through.
      await press(tree, 'btn-save-profile');

      expect(update).toHaveBeenCalledTimes(2);
      expect(has(tree, 'form-profile')).toBe(false);
      expect(textOf(tree, 'text-profile-name')).toBe('Doc Brown');
    });

    it('does not show the service’s own wording for a rejected value', async () => {
      jest
        .spyOn(ProfileStorageService, 'update')
        .mockRejectedValueOnce(
          new ProfileStorageError('internal detail', 'INVALID_INPUT'),
        );
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      await press(tree, 'btn-save-profile');

      expect(textOf(tree, 'text-profile-save-error')).toBe(
        'That name or handle cannot be saved. Check them and try again.',
      );
    });

    it('locks the form while a save is in flight', async () => {
      let finishSave: (profile: Profile) => void = () => {};
      jest.spyOn(ProfileStorageService, 'update').mockImplementationOnce(
        () =>
          new Promise<Profile>(resolve => {
            finishSave = resolve;
          }),
      );
      const { tree } = await renderScreen();

      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', 'Doc Brown');
      await press(tree, 'btn-save-profile');

      expect(saveButton(tree).props.label).toBe('Saving…');
      expect(saveButton(tree).props.disabled).toBe(true);
      expect(byTestId(tree, 'btn-cancel-profile')[0].props.disabled).toBe(true);
      expect(byTestId(tree, 'input-profile-name')[0].props.editable).toBe(
        false,
      );

      await act(async () => {
        finishSave({ ...DEFAULT_PROFILE, name: 'Doc Brown' });
      });

      expect(has(tree, 'form-profile')).toBe(false);
      expect(textOf(tree, 'text-profile-name')).toBe('Doc Brown');
    });

    it('keeps a just-saved name when an older read lands after it', async () => {
      await updateProfile({ name: 'Marty McFly' });
      const { tree, goTo } = await renderScreen();
      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', 'Doc Brown');

      // The refresh on returning to the tab reads the profile before the
      // save below, but only answers after it.
      const realLoad = ProfileStorageService.load;
      let releaseRead: () => void = () => {};
      jest.spyOn(ProfileStorageService, 'load').mockImplementationOnce(() => {
        const staleRead = realLoad();
        return new Promise<Profile>(resolve => {
          releaseRead = () => resolve(staleRead);
        });
      });
      await goTo('Elsewhere');
      await goTo('Profile');

      await press(tree, 'btn-save-profile');
      expect(textOf(tree, 'text-profile-name')).toBe('Doc Brown');

      await act(async () => {
        releaseRead();
      });
      await settle();

      expect(textOf(tree, 'text-profile-name')).toBe('Doc Brown');
    });
  });

  describe('when storage cannot be read', () => {
    it('keeps the profile and a half-typed edit when a refresh fails', async () => {
      await updateProfile({ name: 'Marty McFly' });
      await seedDrill();
      const { tree, goTo } = await renderScreen();
      await press(tree, 'btn-edit-profile');
      type(tree, 'input-profile-name', 'Doc Brown');

      jest
        .spyOn(ProfileStorageService, 'load')
        .mockRejectedValueOnce(
          new ProfileStorageError('unreadable', 'STORAGE_FAILURE'),
        );
      await goTo('Elsewhere');
      await goTo('Profile');

      expect(has(tree, 'state-profile-error')).toBe(false);
      expect(byTestId(tree, 'input-profile-name')[0].props.value).toBe(
        'Doc Brown',
      );
      expect(textOf(tree, 'text-drill-count')).toBe('1');

      // The next visit reads again, and this time storage answers.
      await seedDrill();
      await goTo('Elsewhere');
      await goTo('Profile');

      expect(textOf(tree, 'text-drill-count')).toBe('2');
    });

    it('says so instead of showing a profile, and recovers on retry', async () => {
      jest
        .spyOn(ProfileStorageService, 'load')
        .mockRejectedValueOnce(
          new ProfileStorageError('unreadable', 'STORAGE_FAILURE'),
        );
      await updateProfile({ name: 'Marty McFly' });

      const { tree } = await renderScreen();

      expect(has(tree, 'state-profile-error')).toBe(true);
      expect(has(tree, 'text-profile-name')).toBe(false);
      expect(has(tree, 'text-run-count')).toBe(false);

      const retry = tree.root.findAllByProps({ label: 'Try again' })[0];
      await act(async () => {
        retry.props.onPress();
      });
      await settle();

      expect(has(tree, 'state-profile-error')).toBe(false);
      expect(textOf(tree, 'text-profile-name')).toBe('Marty McFly');
    });
  });
});
