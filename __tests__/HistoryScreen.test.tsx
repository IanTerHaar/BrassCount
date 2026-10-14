import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

import { HistoryScreen } from '../src/screens/HistoryScreen';
import {
  DrillStorageError,
  DrillStorageService,
  deleteDrillById,
  saveDrill,
  updateDrill,
} from '../src/services/drillStorage';
import {
  SessionStorageError,
  SessionStorageService,
  saveSession,
} from '../src/services/sessionStorage';
import type { Drill } from '../src/types/drill';
import type { Session } from '../src/types/session';

/**
 * In the app the list and the detail screen share a stack inside the
 * History tab. Here they are sibling tabs: the list only needs a route of
 * that name to navigate to, and a tab keeps it mounted behind the detail
 * the way the stack does.
 */
type TestTabParamList = {
  HistoryList: undefined;
  Elsewhere: undefined;
  HistoryDetail: { drillId: string; drillName: string };
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Tab = createBottomTabNavigator<TestTabParamList>();

/** Stands in for the other tabs and for the detail screen. */
const Blank = () => null;

/** The moment every test runs at, so "X ago" is a fixed answer. */
const NOW = '2026-10-12T12:00:00.000Z';

const seedDrill = (name: string): Promise<Drill> =>
  saveDrill({
    name,
    steps: [
      { type: 'draw', par: 1.5 },
      { type: 'shot', par: 0.25 },
    ],
  });

/** Save a run of `drillId` that took `totalTime` and finished at `at`. */
const seedSession = (
  drillId: string,
  totalTime: number,
  at: string,
  completed = true,
): Promise<Session> =>
  saveSession(
    {
      drillId,
      totalTime,
      completed,
      splits: [
        { stepId: 'step-1', label: 'Draw', par: 1.5, actual: totalTime / 2 },
        { stepId: 'step-2', label: 'Shot 1', actual: totalTime / 2 },
      ],
    },
    { getTimestamp: () => at },
  );

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
  /** Switch to another tab, or back to the list. */
  goTo: (tab: 'HistoryList' | 'Elsewhere') => Promise<void>;
  /** The route on screen, e.g. the detail after a row was tapped. */
  currentRoute: () => { name: string; params?: object } | undefined;
};

const mounted: ReactTestRenderer[] = [];

/** Mount the screen in a tab navigator without waiting for it to load. */
const mountScreen = (): Harness => {
  const navigationRef = createNavigationContainerRef<TestTabParamList>();
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <NavigationContainer ref={navigationRef}>
          <Tab.Navigator screenOptions={{ headerShown: false }}>
            <Tab.Screen name="HistoryList" component={HistoryScreen} />
            <Tab.Screen name="Elsewhere" component={Blank} />
            <Tab.Screen name="HistoryDetail" component={Blank} />
          </Tab.Navigator>
        </NavigationContainer>
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

/**
 * The figure a counter shows. Its `testID` is also a prop of the counter
 * component, which holds the caption too, so this reads the innermost
 * element that carries it: the figure's own text.
 */
const figureOf = (tree: ReactTestRenderer, testID: string): string => {
  const figure = byTestId(tree, testID).at(-1);
  if (figure === undefined) {
    throw new Error(`nothing is rendered for "${testID}"`);
  }
  return textsUnder(figure).join('');
};

/** The Runs and Drills counters, as shown. */
const counters = (tree: ReactTestRenderer) => ({
  runs: figureOf(tree, 'text-history-run-count'),
  drills: figureOf(tree, 'text-history-drill-count'),
});

/** Drill ids of the rows on screen, top to bottom. */
const rowOrder = (tree: ReactTestRenderer): string[] => {
  const ids = tree.root
    .findAll(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('row-history-'),
    )
    .map(node => (node.props.testID as string).slice('row-history-'.length));
  // A `testID` is forwarded through several nested elements.
  return [...new Set(ids)];
};

const press = async (tree: ReactTestRenderer, testID: string) => {
  await act(async () => {
    byTestId(tree, testID)[0].props.onPress();
  });
  await settle();
};

describe('HistoryScreen', () => {
  beforeEach(async () => {
    // Only the clock is faked: storage and the navigator still run on real
    // timers, which `settle` waits on.
    jest.useFakeTimers({
      now: new Date(NOW),
      doNotFake: [
        'nextTick',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'hrtime',
        'performance',
      ],
    });
    await AsyncStorage.clear();
  });

  afterEach(() => {
    // Unmount, or the navigator's pending work outlives the test.
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('listing the drills that have been run', () => {
    it('says it is loading until storage answers', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-12T09:00:00.000Z');
      const { tree } = mountScreen();

      expect(has(tree, 'text-history-loading')).toBe(true);
      expect(has(tree, 'state-history-empty')).toBe(false);
      expect(rowOrder(tree)).toEqual([]);
      expect(counters(tree)).toEqual({ runs: '—', drills: '—' });

      await settle();

      expect(has(tree, 'text-history-loading')).toBe(false);
      expect(rowOrder(tree)).toEqual([drill.id]);
    });

    it('shows each drill with its name, run count, best time and last run', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-10T12:00:00.000Z');
      await seedSession(drill.id, 2.456, '2026-10-05T12:00:00.000Z');
      await seedSession(drill.id, 2.9, '2026-10-01T12:00:00.000Z');

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-history-${drill.id}`)).toEqual([
        'Bill Drill',
        '3 runs · Best 2.46s · 2d ago',
      ]);
    });

    it('takes the best time from the completed runs only', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 1.1, '2026-10-10T12:00:00.000Z', false);
      await seedSession(drill.id, 2.456, '2026-10-05T12:00:00.000Z');

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-history-${drill.id}`)).toEqual([
        'Bill Drill',
        '2 runs · Best 2.46s · 2d ago',
      ]);
    });

    it('shows no best time for a drill whose every run was stopped early', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 1.1, '2026-10-10T12:00:00.000Z', false);

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-history-${drill.id}`)).toEqual([
        'Bill Drill',
        '1 run · 2d ago',
      ]);
      const [row] = byTestId(tree, `row-history-${drill.id}`);
      expect(row.props.accessibilityLabel).toBe(
        'Bill Drill, 1 run, last run 2 days ago',
      );
    });

    it('says a single run in the singular', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-12T11:30:00.000Z');

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-history-${drill.id}`)).toEqual([
        'Bill Drill',
        '1 run · Best 3.10s · 30m ago',
      ]);
    });

    it('reads a row out in words, not abbreviations', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-10T12:00:00.000Z');
      await seedSession(drill.id, 2.456, '2026-10-05T12:00:00.000Z');

      const { tree } = await renderScreen();

      const [row] = byTestId(tree, `row-history-${drill.id}`);
      expect(row.props.accessibilityLabel).toBe(
        'Bill Drill, 2 runs, best 2.46 seconds, last run 2 days ago',
      );
    });

    it('lists the most recently run drill first', async () => {
      const older = await seedDrill('Mozambique');
      const newer = await seedDrill('Bill Drill');
      await seedSession(older.id, 4.2, '2026-10-01T12:00:00.000Z');
      await seedSession(newer.id, 3.1, '2026-10-11T12:00:00.000Z');
      await seedSession(older.id, 4.0, '2026-09-20T12:00:00.000Z');

      const { tree } = await renderScreen();

      expect(rowOrder(tree)).toEqual([newer.id, older.id]);
    });

    it('leaves out a drill that has never been run', async () => {
      const run = await seedDrill('Bill Drill');
      const neverRun = await seedDrill('Mozambique');
      await seedSession(run.id, 3.1, '2026-10-11T12:00:00.000Z');

      const { tree } = await renderScreen();

      expect(rowOrder(tree)).toEqual([run.id]);
      expect(has(tree, `row-history-${neverRun.id}`)).toBe(false);
    });

    it('keeps the runs of a deleted drill, under a stand-in name', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      await seedSession(drill.id, 2.8, '2026-10-09T12:00:00.000Z');
      await deleteDrillById(drill.id);

      const { tree } = await renderScreen();

      expect(textsOf(tree, `row-history-${drill.id}`)).toEqual([
        'Deleted drill',
        '2 runs · Best 2.80s · 1d ago',
      ]);
      expect(counters(tree)).toEqual({ runs: '2', drills: '1' });
    });

    it('says there is nothing yet when no drill has been run', async () => {
      await seedDrill('Bill Drill');

      const { tree } = await renderScreen();

      expect(has(tree, 'state-history-empty')).toBe(true);
      expect(rowOrder(tree)).toEqual([]);
      expect(counters(tree)).toEqual({ runs: '0', drills: '0' });
    });
  });

  describe('the counters', () => {
    it('count every run and every drill that has one', async () => {
      const bill = await seedDrill('Bill Drill');
      const mozambique = await seedDrill('Mozambique');
      await seedDrill('Never run');
      await seedSession(bill.id, 3.1, '2026-10-11T12:00:00.000Z');
      await seedSession(bill.id, 2.9, '2026-10-10T12:00:00.000Z');
      await seedSession(mozambique.id, 4.2, '2026-10-09T12:00:00.000Z');

      const { tree } = await renderScreen();

      expect(counters(tree)).toEqual({ runs: '3', drills: '2' });
    });

    it('are read out as phrases', async () => {
      const bill = await seedDrill('Bill Drill');
      await seedSession(bill.id, 3.1, '2026-10-11T12:00:00.000Z');

      const { tree } = await renderScreen();

      const labels = tree.root
        .findAll(node => node.props.accessible === true)
        .map(node => node.props.accessibilityLabel as string);
      expect(labels).toEqual(expect.arrayContaining(['1 run', '1 drill']));
    });
  });

  describe('opening a drill', () => {
    it('goes to the runs of the drill that was tapped', async () => {
      const bill = await seedDrill('Bill Drill');
      const mozambique = await seedDrill('Mozambique');
      await seedSession(bill.id, 3.1, '2026-10-11T12:00:00.000Z');
      await seedSession(mozambique.id, 4.2, '2026-10-09T12:00:00.000Z');
      const { tree, currentRoute } = await renderScreen();

      await press(tree, `row-history-${mozambique.id}`);

      expect(currentRoute()).toMatchObject({
        name: 'HistoryDetail',
        params: { drillId: mozambique.id, drillName: 'Mozambique' },
      });
    });

    it('opens the runs of a deleted drill too', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      await deleteDrillById(drill.id);
      const { tree, currentRoute } = await renderScreen();

      await press(tree, `row-history-${drill.id}`);

      expect(currentRoute()).toMatchObject({
        name: 'HistoryDetail',
        params: { drillId: drill.id, drillName: 'Deleted drill' },
      });
    });
  });

  describe('coming back to the screen', () => {
    it('shows a run saved while it was in the background', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      const { tree, goTo } = await renderScreen();

      await goTo('Elsewhere');
      await seedSession(drill.id, 2.5, '2026-10-12T11:00:00.000Z');
      await goTo('HistoryList');

      expect(textsOf(tree, `row-history-${drill.id}`)).toEqual([
        'Bill Drill',
        '2 runs · Best 2.50s · 1h ago',
      ]);
      expect(counters(tree)).toEqual({ runs: '2', drills: '1' });
    });

    it('shows a drill under its new name after it is renamed', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      const { tree, goTo } = await renderScreen();

      await goTo('Elsewhere');
      await updateDrill(drill.id, { name: 'Bill Drill at 7 yards' });
      await goTo('HistoryList');

      expect(textsOf(tree, `row-history-${drill.id}`)[0]).toBe(
        'Bill Drill at 7 yards',
      );
    });

    it('does not flash the loading line while it reads again', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');

      // Coming back starts a read that stays pending.
      jest
        .spyOn(SessionStorageService, 'loadAll')
        .mockReturnValue(new Promise<Session[]>(() => {}));
      await goTo('HistoryList');

      expect(has(tree, 'text-history-loading')).toBe(false);
      expect(rowOrder(tree)).toEqual([drill.id]);
    });

    it('keeps the list it had when reading again fails', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');

      jest
        .spyOn(SessionStorageService, 'loadAll')
        .mockRejectedValue(
          new SessionStorageError('Failed to load sessions', 'STORAGE_FAILURE'),
        );
      await goTo('HistoryList');

      expect(has(tree, 'state-history-error')).toBe(false);
      expect(rowOrder(tree)).toEqual([drill.id]);
      expect(counters(tree)).toEqual({ runs: '1', drills: '1' });
    });

    it('ignores a read that answers after the screen was left', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');

      let answer: (sessions: Session[]) => void = () => {};
      jest.spyOn(SessionStorageService, 'loadAll').mockReturnValueOnce(
        new Promise<Session[]>(resolve => {
          answer = resolve;
        }),
      );
      await goTo('HistoryList');
      await goTo('Elsewhere');
      // The read from the visit that has ended comes back empty.
      answer([]);
      await settle();

      expect(rowOrder(tree)).toEqual([drill.id]);
      expect(counters(tree)).toEqual({ runs: '1', drills: '1' });
    });
  });

  describe('when the history cannot be read', () => {
    it('offers to try again when the runs cannot be read', async () => {
      jest
        .spyOn(SessionStorageService, 'loadAll')
        .mockRejectedValue(
          new SessionStorageError('Failed to load sessions', 'STORAGE_FAILURE'),
        );

      const { tree } = await renderScreen();

      expect(has(tree, 'state-history-error')).toBe(true);
      expect(has(tree, 'text-history-loading')).toBe(false);
      expect(has(tree, 'state-history-empty')).toBe(false);
      expect(counters(tree)).toEqual({ runs: '—', drills: '—' });
    });

    it('offers to try again when the drills cannot be read', async () => {
      await seedSession('drill-1', 3.1, '2026-10-11T12:00:00.000Z');
      jest
        .spyOn(DrillStorageService, 'loadAll')
        .mockRejectedValue(
          new DrillStorageError('Failed to load drills', 'STORAGE_FAILURE'),
        );

      const { tree } = await renderScreen();

      // Without the drills every row would be a nameless "Deleted drill".
      expect(has(tree, 'state-history-error')).toBe(true);
      expect(rowOrder(tree)).toEqual([]);
    });

    it('does not show the raw error', async () => {
      jest
        .spyOn(SessionStorageService, 'loadAll')
        .mockRejectedValue(
          new SessionStorageError('Failed to load sessions', 'STORAGE_FAILURE'),
        );

      const { tree } = await renderScreen();

      expect(textsOf(tree, 'state-history-error')).not.toContain(
        'Failed to load sessions',
      );
    });

    it('reads again when Try again is pressed', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-11T12:00:00.000Z');
      jest
        .spyOn(SessionStorageService, 'loadAll')
        .mockRejectedValueOnce(
          new SessionStorageError('Failed to load sessions', 'STORAGE_FAILURE'),
        );
      const { tree } = await renderScreen();
      expect(has(tree, 'state-history-error')).toBe(true);

      await act(async () => {
        tree.root.findAllByProps({ label: 'Try again' })[0].props.onPress();
      });
      await settle();

      expect(has(tree, 'state-history-error')).toBe(false);
      expect(rowOrder(tree)).toEqual([drill.id]);
      expect(counters(tree)).toEqual({ runs: '1', drills: '1' });
    });
  });
});
