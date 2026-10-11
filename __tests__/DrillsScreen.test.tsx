import { AccessibilityInfo } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

import { DrillsScreen } from '../src/screens/DrillsScreen';
import {
  DrillStorageError,
  DrillStorageService,
  saveDrill,
} from '../src/services/drillStorage';
import type { Drill, DrillInput } from '../src/types/drill';

/**
 * The editor sits on the root stack in the app. Here it is a sibling tab:
 * the screen only needs a route of that name to navigate to, and a tab
 * keeps the Drills screen mounted behind it the way the stack does.
 */
type TestTabParamList = {
  Drills: undefined;
  Elsewhere: undefined;
  SequenceEditor: { id?: string };
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Tab = createBottomTabNavigator<TestTabParamList>();

/** Stands in for the other tabs and for the editor. */
const Blank = () => null;

const BILL_DRILL: DrillInput = {
  name: 'Bill Drill',
  steps: [
    { type: 'draw', par: 1.5 },
    { type: 'shot', par: 0.25 },
    { type: 'shot', par: 0.2 },
    { type: 'shot', par: 0.2 },
    { type: 'shot', par: 0.2 },
    { type: 'shot', par: 0.2 },
    { type: 'shot', par: 0.2 },
  ],
};

/** Has an untimed step, so the drill has no total par. */
const MOZAMBIQUE: DrillInput = {
  name: 'Mozambique',
  steps: [
    { type: 'draw', par: 1.5 },
    { type: 'shot', par: 0.25 },
    { type: 'shot', par: 0.25 },
    { type: 'shot', par: 0.5 },
    { type: 'holster' },
  ],
};

const ONE_SHOT: DrillInput = {
  name: 'Draw and fire',
  steps: [
    { type: 'draw', par: 1.5 },
    { type: 'shot', par: 0.3 },
  ],
};

/** Save a drill as if it was last changed at `updatedAt`. */
const seedDrill = (input: DrillInput, updatedAt: string): Promise<Drill> =>
  saveDrill(input, { getTimestamp: () => updatedAt });

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
  /** Switch to another tab, or back to Drills. */
  goTo: (tab: 'Drills' | 'Elsewhere') => Promise<void>;
  /** The route on screen, e.g. the editor after a row was tapped. */
  currentRoute: () => { name: string; params?: object } | undefined;
};

const mounted: ReactTestRenderer[] = [];

/** Mount the screen in a tab navigator without waiting for it to load. */
const mountScreen = (): Harness => {
  const navigationRef = createNavigationContainerRef<TestTabParamList>();
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      // The drill rows swipe, and a gesture needs the root view `App` mounts.
      <GestureHandlerRootView>
        <SafeAreaProvider initialMetrics={metrics}>
          <NavigationContainer ref={navigationRef}>
            <Tab.Navigator screenOptions={{ headerShown: false }}>
              <Tab.Screen name="Drills" component={DrillsScreen} />
              <Tab.Screen name="Elsewhere" component={Blank} />
              <Tab.Screen name="SequenceEditor" component={Blank} />
            </Tab.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>,
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
    currentRoute: () => navigationRef.getCurrentRoute(),
  };
};

/** Mount the screen and wait until it shows what is in storage. */
const renderScreen = async (): Promise<Harness> => {
  const harness = mountScreen();
  await settle();
  return harness;
};

const byTestId = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({ testID });

const has = (tree: ReactTestRenderer, testID: string): boolean =>
  byTestId(tree, testID).length > 0;

/** Every string rendered under `node`, in the order it is shown. */
const textsUnder = (node: ReactTestInstance): string[] =>
  node.children.flatMap(child =>
    typeof child === 'string' ? [child] : textsUnder(child),
  );

/** The strings shown by the element with this `testID`. */
const textsOf = (tree: ReactTestRenderer, testID: string): string[] => {
  const [node] = byTestId(tree, testID);
  if (node === undefined) {
    throw new Error(`nothing is rendered for "${testID}"`);
  }
  return textsUnder(node);
};

/** Ids of the drill rows on screen, top to bottom. */
const rowOrder = (tree: ReactTestRenderer): string[] => {
  const ids = tree.root
    .findAll(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('row-drill-'),
    )
    .map(node => (node.props.testID as string).slice('row-drill-'.length));
  // A `testID` is forwarded through several nested elements.
  return [...new Set(ids)];
};

const press = async (tree: ReactTestRenderer, testID: string) => {
  await act(async () => {
    byTestId(tree, testID)[0].props.onPress();
  });
  await settle();
};

/**
 * Further than a row's Delete action is wide at any font size, so the row
 * ends up fully open (leftward) or fully closed (rightward).
 */
const FULL_SWIPE = 400;

/** Drag the drill's row sideways by `translationX` and let go. */
const swipe = async (id: string, translationX: number, velocityX = 0) => {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`swipe-drill-${id}`), [
      { state: State.BEGAN },
      { state: State.ACTIVE },
      { translationX, velocityX },
      { state: State.END, translationX, velocityX },
    ]);
  });
};

/**
 * Whether the drill's row rests open. Its Delete action is kept from a
 * screen reader until it does.
 */
const isSwipedOpen = (tree: ReactTestRenderer, id: string): boolean =>
  byTestId(tree, `btn-delete-drill-${id}`)[0].props
    .importantForAccessibility === 'yes';

/** Ids of the drills in storage. */
const storedIds = async (): Promise<string[]> =>
  (await DrillStorageService.loadAll()).map(drill => drill.id);

describe('DrillsScreen', () => {
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

  describe('listing the saved drills', () => {
    it('says it is loading until storage answers', async () => {
      await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = mountScreen();

      expect(has(tree, 'text-drills-loading')).toBe(true);
      expect(has(tree, 'state-drills-empty')).toBe(false);
      expect(rowOrder(tree)).toEqual([]);

      await settle();

      expect(has(tree, 'text-drills-loading')).toBe(false);
      expect(rowOrder(tree)).toHaveLength(1);
    });

    it('shows each drill with its name, shot count and total par', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-drill-${drill.id}`)).toEqual([
        'Bill Drill',
        '6 shots · Par 2.75s',
      ]);
    });

    it('leaves the par out for a drill with an untimed step', async () => {
      const drill = await seedDrill(MOZAMBIQUE, '2026-09-01T10:00:00.000Z');

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-drill-${drill.id}`)).toEqual([
        'Mozambique',
        '3 shots',
      ]);
    });

    it('counts a single shot in the singular', async () => {
      const drill = await seedDrill(ONE_SHOT, '2026-09-01T10:00:00.000Z');

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-drill-${drill.id}`)).toEqual([
        'Draw and fire',
        '1 shot · Par 1.80s',
      ]);
    });

    it('lists the most recently changed drill first', async () => {
      const oldest = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const newest = await seedDrill(MOZAMBIQUE, '2026-09-03T10:00:00.000Z');
      const middle = await seedDrill(ONE_SHOT, '2026-09-02T10:00:00.000Z');

      const { tree } = await renderScreen();

      expect(rowOrder(tree)).toEqual([newest.id, middle.id, oldest.id]);
    });

    it('says how many drills are saved', async () => {
      await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');

      const { tree } = await renderScreen();

      expect(textsOf(tree, 'header-saved-drills')).toEqual(['SAVED · 2']);
    });

    it('leaves out a stored entry that cannot be read', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      await AsyncStorage.setItem(
        `@BrassCount:${DrillStorageService.namespace}:${DrillStorageService.version}:broken`,
        '{not json',
      );

      const { tree } = await renderScreen();

      expect(rowOrder(tree)).toEqual([drill.id]);
      expect(textsOf(tree, 'header-saved-drills')).toEqual(['SAVED · 1']);
    });
  });

  describe('with no drills saved', () => {
    it('shows an empty state instead of a list', async () => {
      const { tree } = await renderScreen();

      expect(has(tree, 'state-drills-empty')).toBe(true);
      expect(textsOf(tree, 'state-drills-empty')).toContain('No drills yet');
      expect(rowOrder(tree)).toEqual([]);
      expect(textsOf(tree, 'header-saved-drills')).toEqual(['SAVED · 0']);
    });

    it('opens a new drill from the empty state', async () => {
      const { tree, currentRoute } = await renderScreen();
      const create = tree.root.findAllByProps({ label: 'Create drill' })[0];

      await act(async () => {
        create.props.onPress();
      });

      expect(currentRoute()).toMatchObject({
        name: 'SequenceEditor',
        params: {},
      });
    });
  });

  describe('opening the editor', () => {
    it('offers Create Drill before the drills have loaded', async () => {
      const { tree } = mountScreen();

      expect(has(tree, 'text-drills-loading')).toBe(true);
      expect(has(tree, 'btn-create-drill')).toBe(true);

      await settle();
    });

    it('opens a new drill from Create Drill', async () => {
      await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree, currentRoute } = await renderScreen();

      await press(tree, 'btn-create-drill');

      expect(currentRoute()).toMatchObject({
        name: 'SequenceEditor',
        params: {},
      });
    });

    it('opens the tapped drill for editing', async () => {
      await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const tapped = await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');
      const { tree, currentRoute } = await renderScreen();

      await press(tree, `row-drill-${tapped.id}`);

      expect(currentRoute()).toMatchObject({
        name: 'SequenceEditor',
        params: { id: tapped.id },
      });
    });
  });

  describe('coming back to the screen', () => {
    it('picks up a drill saved while the screen was in the background', async () => {
      const first = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree, goTo } = await renderScreen();

      await goTo('Elsewhere');
      const second = await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');
      await goTo('Drills');

      expect(rowOrder(tree)).toEqual([second.id, first.id]);
      expect(textsOf(tree, 'header-saved-drills')).toEqual(['SAVED · 2']);
    });

    it('drops a drill deleted while the screen was in the background', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree, goTo } = await renderScreen();

      await goTo('Elsewhere');
      await DrillStorageService.deleteById(drill.id);
      await goTo('Drills');

      expect(rowOrder(tree)).toEqual([]);
      expect(has(tree, 'state-drills-empty')).toBe(true);
    });

    it('keeps the list on screen while it reads again', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');
      jest
        .spyOn(DrillStorageService, 'loadAll')
        .mockImplementationOnce(() => new Promise<Drill[]>(() => {}));

      await goTo('Drills');

      expect(has(tree, 'text-drills-loading')).toBe(false);
      expect(rowOrder(tree)).toEqual([drill.id]);
    });

    it('ignores a read that answers after the screen was left', async () => {
      const stale = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      let answer: (drills: Drill[]) => void = () => {};
      jest.spyOn(DrillStorageService, 'loadAll').mockImplementationOnce(
        () =>
          new Promise<Drill[]>(resolve => {
            answer = resolve;
          }),
      );
      const { tree, goTo } = await renderScreen();

      await goTo('Elsewhere');
      await DrillStorageService.deleteById(stale.id);
      const current = await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');
      await goTo('Drills');
      // The first read answers last, with a drill that is no longer stored.
      await act(async () => {
        answer([stale]);
      });
      await settle();

      expect(rowOrder(tree)).toEqual([current.id]);
    });
  });

  describe('when storage cannot be read', () => {
    const failure = () =>
      new DrillStorageError('Failed to load drills', 'STORAGE_FAILURE');

    it('says so instead of showing an empty library, and recovers on retry', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      jest
        .spyOn(DrillStorageService, 'loadAll')
        .mockRejectedValueOnce(failure());

      const { tree } = await renderScreen();

      expect(has(tree, 'state-drills-error')).toBe(true);
      expect(has(tree, 'state-drills-empty')).toBe(false);
      expect(textsOf(tree, 'header-saved-drills')).toEqual(['SAVED']);
      expect(has(tree, 'btn-create-drill')).toBe(true);

      const retry = tree.root.findAllByProps({ label: 'Try again' })[0];
      await act(async () => {
        retry.props.onPress();
      });
      await settle();

      expect(has(tree, 'state-drills-error')).toBe(false);
      expect(rowOrder(tree)).toEqual([drill.id]);
    });

    it('announces the failure to a screen reader', async () => {
      jest
        .spyOn(DrillStorageService, 'loadAll')
        .mockRejectedValueOnce(failure());

      const { tree } = await renderScreen();

      const announced = tree.root.findAllByProps({
        accessibilityLiveRegion: 'polite',
      });
      expect(announced.flatMap(textsUnder)).toContain(
        'Could not load your drills',
      );
    });

    it('ignores an earlier read that answers after a retry', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      let answer: (drills: Drill[]) => void = () => {};
      jest
        .spyOn(DrillStorageService, 'loadAll')
        .mockRejectedValueOnce(failure())
        .mockImplementationOnce(
          () =>
            new Promise<Drill[]>(resolve => {
              answer = resolve;
            }),
        );
      const { tree, goTo } = await renderScreen();
      // Coming back starts a read that stays pending under the error.
      await goTo('Elsewhere');
      await goTo('Drills');
      expect(has(tree, 'state-drills-error')).toBe(true);

      const retry = tree.root.findAllByProps({ label: 'Try again' })[0];
      await act(async () => {
        retry.props.onPress();
      });
      await settle();
      await act(async () => {
        answer([]);
      });
      await settle();

      expect(rowOrder(tree)).toEqual([drill.id]);
      expect(has(tree, 'state-drills-empty')).toBe(false);
    });

    it('does not show the service’s own wording', async () => {
      jest
        .spyOn(DrillStorageService, 'loadAll')
        .mockRejectedValueOnce(failure());

      const { tree } = await renderScreen();

      expect(textsOf(tree, 'state-drills-error')).not.toContain(
        'Failed to load drills',
      );
    });

    it('ignores a read that fails after the screen was left', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      let fail: (reason: DrillStorageError) => void = () => {};
      jest.spyOn(DrillStorageService, 'loadAll').mockImplementationOnce(
        () =>
          new Promise<Drill[]>((_, reject) => {
            fail = reject;
          }),
      );
      const { tree, goTo } = await renderScreen();

      await goTo('Elsewhere');
      await act(async () => {
        fail(failure());
      });
      await settle();

      expect(has(tree, 'state-drills-error')).toBe(false);

      await goTo('Drills');

      expect(rowOrder(tree)).toEqual([drill.id]);
    });

    it('keeps the list when a later read fails, then reads again', async () => {
      const first = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');
      const second = await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');
      jest
        .spyOn(DrillStorageService, 'loadAll')
        .mockRejectedValueOnce(failure());

      await goTo('Drills');

      expect(has(tree, 'state-drills-error')).toBe(false);
      expect(rowOrder(tree)).toEqual([first.id]);

      await goTo('Elsewhere');
      await goTo('Drills');

      expect(rowOrder(tree)).toEqual([second.id, first.id]);
    });
  });

  describe('swiping a drill row', () => {
    it('keeps the Delete action out of reach until the row is swiped', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');

      const { tree } = await renderScreen();

      expect(isSwipedOpen(tree, drill.id)).toBe(false);
    });

    it('opens the row when it is swiped left', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = await renderScreen();

      await swipe(drill.id, -FULL_SWIPE);

      expect(isSwipedOpen(tree, drill.id)).toBe(true);
    });

    it('leaves the row closed after a short swipe', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = await renderScreen();

      await swipe(drill.id, -20);

      expect(isSwipedOpen(tree, drill.id)).toBe(false);
    });

    it('closes an open row when it is swiped back', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = await renderScreen();
      await swipe(drill.id, -FULL_SWIPE);

      await swipe(drill.id, FULL_SWIPE);

      expect(isSwipedOpen(tree, drill.id)).toBe(false);
    });

    it('closes an open row on a tap instead of opening the editor', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree, currentRoute } = await renderScreen();
      await swipe(drill.id, -FULL_SWIPE);

      await press(tree, `row-drill-${drill.id}`);

      expect(isSwipedOpen(tree, drill.id)).toBe(false);
      expect(currentRoute()).toMatchObject({ name: 'Drills' });

      await press(tree, `row-drill-${drill.id}`);

      expect(currentRoute()).toMatchObject({
        name: 'SequenceEditor',
        params: { id: drill.id },
      });
    });

    it('keeps one row open at a time', async () => {
      const first = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const second = await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');
      const { tree } = await renderScreen();
      await swipe(first.id, -FULL_SWIPE);

      await swipe(second.id, -FULL_SWIPE);

      expect(isSwipedOpen(tree, first.id)).toBe(false);
      expect(isSwipedOpen(tree, second.id)).toBe(true);
    });

    it('puts an open row away when the screen is left', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree, goTo } = await renderScreen();
      await swipe(drill.id, -FULL_SWIPE);

      await goTo('Elsewhere');
      await goTo('Drills');

      expect(isSwipedOpen(tree, drill.id)).toBe(false);
    });
  });

  describe('deleting a drill', () => {
    const SHEET = 'sheet-delete-drill';

    /** Whether the confirmation sheet is up. */
    const isAsking = (tree: ReactTestRenderer): boolean =>
      has(tree, `${SHEET}-confirm`);

    /** Swipe the drill's row open and press its Delete action. */
    const askToDelete = async (tree: ReactTestRenderer, id: string) => {
      await swipe(id, -FULL_SWIPE);
      await press(tree, `btn-delete-drill-${id}`);
    };

    it('asks before deleting, naming the drill', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = await renderScreen();
      expect(isAsking(tree)).toBe(false);

      await askToDelete(tree, drill.id);

      expect(textsOf(tree, SHEET)).toContain('Delete “Bill Drill”?');
      expect(rowOrder(tree)).toEqual([drill.id]);
      expect(await storedIds()).toEqual([drill.id]);
    });

    it('names the drill in what a screen reader hears for Delete', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');

      const { tree } = await renderScreen();

      expect(
        byTestId(tree, `btn-delete-drill-${drill.id}`)[0].props
          .accessibilityLabel,
      ).toBe('Delete Bill Drill');
    });

    it('keeps the drill when the confirmation is cancelled', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = await renderScreen();
      await askToDelete(tree, drill.id);

      await press(tree, `${SHEET}-cancel`);

      expect(isAsking(tree)).toBe(false);
      expect(rowOrder(tree)).toEqual([drill.id]);
      expect(await storedIds()).toEqual([drill.id]);
    });

    it('removes the drill from the list and from storage once confirmed', async () => {
      const kept = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const deleted = await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');
      const { tree } = await renderScreen();
      await askToDelete(tree, deleted.id);

      await press(tree, `${SHEET}-confirm`);

      expect(isAsking(tree)).toBe(false);
      expect(rowOrder(tree)).toEqual([kept.id]);
      expect(textsOf(tree, 'header-saved-drills')).toEqual(['SAVED · 1']);
      expect(await storedIds()).toEqual([kept.id]);
    });

    it('shows the empty state after the last drill is deleted', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = await renderScreen();
      await askToDelete(tree, drill.id);

      await press(tree, `${SHEET}-confirm`);

      expect(has(tree, 'state-drills-empty')).toBe(true);
      expect(textsOf(tree, 'header-saved-drills')).toEqual(['SAVED · 0']);
    });

    it('tells a screen reader the drill was deleted', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const { tree } = await renderScreen();
      await askToDelete(tree, drill.id);

      await press(tree, `${SHEET}-confirm`);

      expect(announce).toHaveBeenCalledWith('Deleted Bill Drill');
    });

    it('offers a screen reader a delete action on the row', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const { tree } = await renderScreen();
      const row = byTestId(tree, `row-drill-${drill.id}`)[0];

      expect(row.props.accessibilityActions).toEqual([
        { name: 'delete', label: 'Delete drill' },
      ]);

      await act(async () => {
        row.props.onAccessibilityAction({
          nativeEvent: { actionName: 'delete' },
        });
      });

      expect(textsOf(tree, SHEET)).toContain('Delete “Bill Drill”?');
      expect(await storedIds()).toEqual([drill.id]);
    });

    it('leaves the sheet up and deletes once while the delete is running', async () => {
      const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      let finish: () => void = () => {};
      const deleteById = jest
        .spyOn(DrillStorageService, 'deleteById')
        .mockImplementationOnce(
          () =>
            new Promise<void>(resolve => {
              finish = resolve;
            }),
        );
      const { tree } = await renderScreen();
      await askToDelete(tree, drill.id);

      await press(tree, `${SHEET}-confirm`);
      await press(tree, `${SHEET}-confirm`);
      await press(tree, `${SHEET}-cancel`);

      expect(deleteById).toHaveBeenCalledTimes(1);
      expect(textsOf(tree, `${SHEET}-confirm`)).toEqual(['Deleting…']);
      expect(
        byTestId(tree, `${SHEET}-confirm`).some(
          node => node.props.accessibilityState?.disabled === true,
        ),
      ).toBe(true);
      expect(rowOrder(tree)).toEqual([drill.id]);

      await act(async () => {
        finish();
      });
      await settle();

      expect(isAsking(tree)).toBe(false);
      expect(rowOrder(tree)).toEqual([]);
    });

    describe('when the drill cannot be deleted', () => {
      const failure = () =>
        new DrillStorageError('Failed to delete drill', 'STORAGE_FAILURE');

      it('keeps the drill and says so, without the service’s wording', async () => {
        const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
        jest
          .spyOn(DrillStorageService, 'deleteById')
          .mockRejectedValueOnce(failure());
        const { tree } = await renderScreen();
        await askToDelete(tree, drill.id);

        await press(tree, `${SHEET}-confirm`);

        expect(textsOf(tree, `${SHEET}-error`)).toEqual([
          'Could not delete Bill Drill. Try again.',
        ]);
        expect(textsOf(tree, SHEET)).not.toContain('Failed to delete drill');
        expect(rowOrder(tree)).toEqual([drill.id]);
        expect(await storedIds()).toEqual([drill.id]);
      });

      it('announces the failure to a screen reader', async () => {
        const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
        jest
          .spyOn(DrillStorageService, 'deleteById')
          .mockRejectedValueOnce(failure());
        const { tree } = await renderScreen();
        await askToDelete(tree, drill.id);

        await press(tree, `${SHEET}-confirm`);

        const [sheet] = byTestId(tree, SHEET);
        const announced = sheet.findAllByProps({
          accessibilityLiveRegion: 'polite',
        });
        expect(announced.flatMap(textsUnder)).toContain(
          'Could not delete Bill Drill. Try again.',
        );
      });

      it('deletes the drill when confirmed again', async () => {
        const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
        jest
          .spyOn(DrillStorageService, 'deleteById')
          .mockRejectedValueOnce(failure());
        const { tree } = await renderScreen();
        await askToDelete(tree, drill.id);
        await press(tree, `${SHEET}-confirm`);

        await press(tree, `${SHEET}-confirm`);

        expect(isAsking(tree)).toBe(false);
        expect(rowOrder(tree)).toEqual([]);
        expect(await storedIds()).toEqual([]);
      });

      it('forgets the failure once the sheet is closed', async () => {
        const drill = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
        jest
          .spyOn(DrillStorageService, 'deleteById')
          .mockRejectedValueOnce(failure());
        const { tree } = await renderScreen();
        await askToDelete(tree, drill.id);
        await press(tree, `${SHEET}-confirm`);

        await press(tree, `${SHEET}-cancel`);
        await press(tree, `btn-delete-drill-${drill.id}`);

        expect(has(tree, `${SHEET}-error`)).toBe(false);
      });
    });

    it('does not bring the drill back when an earlier read answers late', async () => {
      const kept = await seedDrill(BILL_DRILL, '2026-09-01T10:00:00.000Z');
      const deleted = await seedDrill(MOZAMBIQUE, '2026-09-02T10:00:00.000Z');
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');
      // Coming back starts a read that is still out when the delete lands.
      let answer: (drills: Drill[]) => void = () => {};
      jest.spyOn(DrillStorageService, 'loadAll').mockImplementationOnce(
        () =>
          new Promise<Drill[]>(resolve => {
            answer = resolve;
          }),
      );
      await goTo('Drills');
      await askToDelete(tree, deleted.id);
      await press(tree, `${SHEET}-confirm`);

      await act(async () => {
        answer([deleted, kept]);
      });
      await settle();

      expect(rowOrder(tree)).toEqual([kept.id]);
    });
  });
});
