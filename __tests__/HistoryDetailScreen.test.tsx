import { Dimensions, StyleSheet } from 'react-native';

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

import { HistoryDetailScreen } from '../src/screens/HistoryDetailScreen';
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
import type { Session, SessionSplitInput } from '../src/types/session';
import { formatDateTime, spokenDateTime } from '../src/utils/format';

/**
 * In the app the detail screen is pushed over the list inside the History
 * tab. Here it is a tab of its own, next to a blank one to leave it for:
 * a tab keeps it mounted while it is out of sight, the way the tabs of
 * the app do.
 */
type TestTabParamList = {
  HistoryDetail: { drillId: string; drillName: string };
  Elsewhere: undefined;
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Tab = createBottomTabNavigator<TestTabParamList>();

/** Stands in for the other tabs. */
const Blank = () => null;

const seedDrill = (name: string): Promise<Drill> =>
  saveDrill({
    name,
    steps: [
      { type: 'draw', par: 1.5 },
      { type: 'shot', par: 0.25 },
    ],
  });

/** A draw against a 1.5 s par and an untimed shot, adding up to `totalTime`. */
const splitsFor = (totalTime: number): SessionSplitInput[] => [
  { stepId: 'step-1', label: 'Draw', par: 1.5, actual: totalTime / 2 },
  { stepId: 'step-2', label: 'Shot 1', actual: totalTime / 2 },
];

/** Save a run of `drillId` that took `totalTime` and finished at `at`. */
const seedSession = (
  drillId: string,
  totalTime: number,
  at: string,
  splits: SessionSplitInput[] = splitsFor(totalTime),
): Promise<Session> =>
  saveSession({ drillId, totalTime, splits }, { getTimestamp: () => at });

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
  /** Switch to the other tab, or back to the detail screen. */
  goTo: (tab: 'HistoryDetail' | 'Elsewhere') => Promise<void>;
};

const mounted: ReactTestRenderer[] = [];

/** Mount the screen for a drill without waiting for its runs to load. */
const mountScreen = (drillId: string, drillName: string): Harness => {
  const navigationRef = createNavigationContainerRef<TestTabParamList>();
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <NavigationContainer ref={navigationRef}>
          <Tab.Navigator screenOptions={{ headerShown: false }}>
            <Tab.Screen
              name="HistoryDetail"
              component={HistoryDetailScreen}
              initialParams={{ drillId, drillName }}
            />
            <Tab.Screen name="Elsewhere" component={Blank} />
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
        if (tab === 'Elsewhere') {
          navigationRef.navigate('Elsewhere');
        } else {
          navigationRef.navigate('HistoryDetail', { drillId, drillName });
        }
      });
      await settle();
    },
  };
};

/** Mount the screen for a drill and wait until it shows what is stored. */
const renderScreen = async (
  drill: Pick<Drill, 'id' | 'name'>,
): Promise<Harness> => {
  const harness = mountScreen(drill.id, drill.name);
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
 * The time a summary figure shows. Its `testID` is forwarded through
 * several nested elements, so this reads the innermost one.
 */
const figureOf = (tree: ReactTestRenderer, testID: string): string => {
  const figure = byTestId(tree, testID).at(-1);
  if (figure === undefined) {
    throw new Error(`nothing is rendered for "${testID}"`);
  }
  return textsUnder(figure).join('');
};

/** The Best and Avg times, as shown. */
const totals = (tree: ReactTestRenderer) => ({
  best: figureOf(tree, 'text-history-detail-best'),
  avg: figureOf(tree, 'text-history-detail-avg'),
});

/** Everything the screen shows, title and subtitle included. */
const screenTexts = (tree: ReactTestRenderer): string[] =>
  textsOf(tree, 'screen-history-detail');

/** Session ids of the run cards on screen, top to bottom. */
const cardOrder = (tree: ReactTestRenderer): string[] => {
  const ids = tree.root
    .findAll(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('card-run-'),
    )
    .map(node => (node.props.testID as string).slice('card-run-'.length));
  // A `testID` is forwarded through several nested elements.
  return [...new Set(ids)];
};

/** The button that shows or hides the steps of a run. */
const toggleOf = (tree: ReactTestRenderer, session: Session) => {
  const [toggle] = byTestId(tree, `btn-toggle-${session.id}`);
  if (toggle === undefined) {
    throw new Error(`there is no card for run "${session.id}"`);
  }
  return toggle;
};

const isOpen = (tree: ReactTestRenderer, session: Session): boolean =>
  has(tree, `table-splits-${session.id}`);

const pressToggle = async (tree: ReactTestRenderer, session: Session) => {
  await act(async () => {
    toggleOf(tree, session).props.onPress();
  });
};

/** What a screen reader says for each step of an open run, top to bottom. */
const spokenSteps = (tree: ReactTestRenderer, session: Session): string[] => {
  const [table] = byTestId(tree, `table-splits-${session.id}`);
  const labels = table
    .findAll(node => node.props.accessible === true)
    .map(node => node.props.accessibilityLabel as string);
  return [...new Set(labels)];
};

/** Every label a screen reader is given for a grouped element. */
const spokenGroups = (tree: ReactTestRenderer): string[] =>
  tree.root
    .findAll(node => node.props.accessible === true)
    .map(node => node.props.accessibilityLabel as string);

/** Reports a new system font scale the way the OS does, as a window change. */
const setFontScale = (fontScale: number): void => {
  act(() => {
    Dimensions.set({
      window: { ...Dimensions.get('window'), fontScale },
      screen: Dimensions.get('screen'),
    });
  });
};

const storageFailure = (): SessionStorageError =>
  new SessionStorageError('Failed to load sessions', 'STORAGE_FAILURE');

describe('HistoryDetailScreen', () => {
  const initialWindow = Dimensions.get('window');

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    // Unmount, or the navigator's pending work outlives the test.
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
    setFontScale(initialWindow.fontScale);
  });

  describe('loading the runs', () => {
    it('says it is loading until storage answers', async () => {
      const drill = await seedDrill('Bill Drill');
      const run = await seedSession(drill.id, 3.1, '2026-10-12T09:00:00.000Z');
      const { tree } = mountScreen(drill.id, drill.name);

      expect(has(tree, 'text-history-detail-loading')).toBe(true);
      expect(has(tree, 'state-history-detail-empty')).toBe(false);
      expect(cardOrder(tree)).toEqual([]);
      expect(totals(tree)).toEqual({ best: '—', avg: '—' });
      // The name the list passed stands in until the drill has been read.
      expect(screenTexts(tree)).toContain('Bill Drill');

      await settle();

      expect(has(tree, 'text-history-detail-loading')).toBe(false);
      expect(cardOrder(tree)).toEqual([run.id]);
    });
  });

  describe('the summary', () => {
    it('shows the best and the average time of the runs', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3, '2026-10-10T12:00:00.000Z');
      await seedSession(drill.id, 2, '2026-10-05T12:00:00.000Z');
      await seedSession(drill.id, 2.5, '2026-10-01T12:00:00.000Z');

      const { tree } = await renderScreen(drill);

      expect(totals(tree)).toEqual({ best: '2.00s', avg: '2.50s' });
      expect(screenTexts(tree)).toContain('3 runs logged');
    });

    it('says a single run in the singular', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-10T12:00:00.000Z');

      const { tree } = await renderScreen(drill);

      expect(totals(tree)).toEqual({ best: '3.10s', avg: '3.10s' });
      expect(screenTexts(tree)).toContain('1 run logged');
    });

    it('is read out as phrases', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3, '2026-10-10T12:00:00.000Z');
      await seedSession(drill.id, 2, '2026-10-05T12:00:00.000Z');

      const { tree } = await renderScreen(drill);

      expect(spokenGroups(tree)).toEqual(
        expect.arrayContaining(['Best 2 seconds', 'Average 2.5 seconds']),
      );
    });
  });

  describe('the run cards', () => {
    it('lists the newest run first', async () => {
      const drill = await seedDrill('Bill Drill');
      const middle = await seedSession(drill.id, 2.4, '2026-10-05T12:00:00Z');
      const newest = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      const oldest = await seedSession(drill.id, 2.9, '2026-10-01T12:00:00Z');

      const { tree } = await renderScreen(drill);

      expect(cardOrder(tree)).toEqual([newest.id, middle.id, oldest.id]);
    });

    it('lists only the runs of the drill that was opened', async () => {
      const drill = await seedDrill('Bill Drill');
      const other = await seedDrill('Mozambique');
      const run = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      await seedSession(other.id, 1.2, '2026-10-11T12:00:00Z');

      const { tree } = await renderScreen(drill);

      expect(cardOrder(tree)).toEqual([run.id]);
      expect(totals(tree)).toEqual({ best: '3.10s', avg: '3.10s' });
    });

    it('shows when a run was made, its total time and how it compares to the run before', async () => {
      const drill = await seedDrill('Bill Drill');
      const at = '2026-10-10T12:00:00.000Z';
      const newest = await seedSession(drill.id, 2.4, at);
      const middle = await seedSession(drill.id, 2.9, '2026-10-05T12:00:00Z');
      await seedSession(drill.id, 2.2, '2026-10-01T12:00:00Z');

      const { tree } = await renderScreen(drill);

      expect(textsOf(tree, `btn-toggle-${newest.id}`)).toEqual([
        formatDateTime(at),
        '-0.50S VS PREVIOUS',
        '2.40s',
        'Hide splits',
      ]);
      expect(textsOf(tree, `chip-delta-${middle.id}`)).toEqual([
        '+0.70S VS PREVIOUS',
      ]);
    });

    it('compares the first run of a drill with nothing', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 2.4, '2026-10-10T12:00:00Z');
      const oldest = await seedSession(drill.id, 2.9, '2026-10-01T12:00:00Z');

      const { tree } = await renderScreen(drill);

      expect(has(tree, `chip-delta-${oldest.id}`)).toBe(false);
    });

    it('shows a difference too small to show as no difference', async () => {
      const drill = await seedDrill('Bill Drill');
      const newest = await seedSession(drill.id, 2.502, '2026-10-10T12:00:00Z');
      await seedSession(drill.id, 2.5, '2026-10-01T12:00:00Z');

      const { tree } = await renderScreen(drill);

      expect(textsOf(tree, `chip-delta-${newest.id}`)).toEqual([
        '0.00S VS PREVIOUS',
      ]);
      expect(toggleOf(tree, newest).props.accessibilityLabel).toContain(
        'the same as the run before',
      );
    });

    it('puts the total time under the date at large text, instead of beside it', async () => {
      setFontScale(1);
      const drill = await seedDrill('Bill Drill');
      const newest = await seedSession(drill.id, 2.4, '2026-10-10T12:00:00Z');
      await seedSession(drill.id, 2.9, '2026-10-01T12:00:00Z');
      const { tree } = await renderScreen(drill);
      /** Which way the date block and the total time are laid out. */
      const headerDirection = (): 'row' | 'column' => {
        // Walk up from the chip to the card's button, looking for a row.
        let node = byTestId(tree, `chip-delta-${newest.id}`)[0].parent;
        while (node && node.props.testID !== `btn-toggle-${newest.id}`) {
          if (StyleSheet.flatten(node.props.style)?.flexDirection === 'row') {
            return 'row';
          }
          node = node.parent;
        }
        // A view lays its children out in a column unless told otherwise.
        return 'column';
      };

      expect(headerDirection()).toBe('row');

      setFontScale(2);

      expect(headerDirection()).toBe('column');
    });

    it('reads a card out in words, not abbreviations', async () => {
      const drill = await seedDrill('Bill Drill');
      const newestAt = '2026-10-10T12:00:00.000Z';
      const middleAt = '2026-10-05T12:00:00.000Z';
      const oldestAt = '2026-10-01T12:00:00.000Z';
      const newest = await seedSession(drill.id, 2.4, newestAt);
      const middle = await seedSession(drill.id, 2.9, middleAt);
      const oldest = await seedSession(drill.id, 2.2, oldestAt);

      const { tree } = await renderScreen(drill);

      expect(toggleOf(tree, newest).props.accessibilityLabel).toBe(
        `Run on ${spokenDateTime(newestAt)}, 2.4 seconds, 0.5 seconds faster than the run before`,
      );
      expect(toggleOf(tree, middle).props.accessibilityLabel).toBe(
        `Run on ${spokenDateTime(middleAt)}, 2.9 seconds, 0.7 seconds slower than the run before`,
      );
      expect(toggleOf(tree, oldest).props.accessibilityLabel).toBe(
        `Run on ${spokenDateTime(oldestAt)}, 2.2 seconds`,
      );
    });
  });

  describe('the steps of a run', () => {
    it('opens the newest run and leaves the others closed', async () => {
      const drill = await seedDrill('Bill Drill');
      const newest = await seedSession(drill.id, 2.4, '2026-10-10T12:00:00Z');
      const older = await seedSession(drill.id, 2.9, '2026-10-01T12:00:00Z');

      const { tree } = await renderScreen(drill);

      expect(isOpen(tree, newest)).toBe(true);
      expect(isOpen(tree, older)).toBe(false);
      expect(toggleOf(tree, newest).props.accessibilityState).toEqual({
        expanded: true,
      });
      expect(toggleOf(tree, older).props.accessibilityState).toEqual({
        expanded: false,
      });
    });

    it('opens a run when its card is pressed, and closes it again', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 2.4, '2026-10-10T12:00:00Z');
      const older = await seedSession(drill.id, 2.9, '2026-10-01T12:00:00Z');
      const { tree } = await renderScreen(drill);

      await pressToggle(tree, older);

      expect(isOpen(tree, older)).toBe(true);
      expect(toggleOf(tree, older).props.accessibilityState).toEqual({
        expanded: true,
      });
      expect(textsOf(tree, `btn-toggle-${older.id}`)).toContain('Hide splits');

      await pressToggle(tree, older);

      expect(isOpen(tree, older)).toBe(false);
      expect(textsOf(tree, `btn-toggle-${older.id}`)).toContain('Show splits');
    });

    it('closes the newest run when its card is pressed', async () => {
      const drill = await seedDrill('Bill Drill');
      const newest = await seedSession(drill.id, 2.4, '2026-10-10T12:00:00Z');
      const { tree } = await renderScreen(drill);

      await pressToggle(tree, newest);

      expect(isOpen(tree, newest)).toBe(false);
    });

    it('leaves the other cards as they were when one is pressed', async () => {
      const drill = await seedDrill('Bill Drill');
      const newest = await seedSession(drill.id, 2.4, '2026-10-10T12:00:00Z');
      const older = await seedSession(drill.id, 2.9, '2026-10-01T12:00:00Z');
      const { tree } = await renderScreen(drill);

      await pressToggle(tree, older);

      expect(isOpen(tree, newest)).toBe(true);
      expect(isOpen(tree, older)).toBe(true);
    });

    it('shows the par, the time taken and the difference for every step', async () => {
      const drill = await seedDrill('Mozambique');
      const run = await seedSession(drill.id, 3.63, '2026-10-10T12:00:00Z', [
        { stepId: 's1', label: 'Draw', par: 1.5, actual: 1.32 },
        { stepId: 's2', label: 'Shot 1', par: 0.25, actual: 0.31 },
        { stepId: 's3', label: 'Shot 2', par: 0.5, actual: 0.5 },
        { stepId: 's4', label: 'Holster', actual: 1.5 },
      ]);

      const { tree } = await renderScreen(drill);

      // At the large text Jest runs at, each step captions its own figures.
      expect(textsOf(tree, `table-splits-${run.id}`)).toEqual([
        ...['Draw', 'PAR', '1.50s', 'ACTUAL', '1.32s', 'Δ', '-0.18s'],
        ...['Shot 1', 'PAR', '0.25s', 'ACTUAL', '0.31s', 'Δ', '+0.06s'],
        ...['Shot 2', 'PAR', '0.50s', 'ACTUAL', '0.50s', 'Δ', '0.00s'],
        // An untimed step has no par, so nothing to be over or under.
        ...['Holster', 'PAR', '—', 'ACTUAL', '1.50s', 'Δ', '—'],
      ]);
    });

    it('reads a step out in words, not abbreviations', async () => {
      const drill = await seedDrill('Mozambique');
      const run = await seedSession(drill.id, 3.63, '2026-10-10T12:00:00Z', [
        { stepId: 's1', label: 'Draw', par: 1.5, actual: 1.32 },
        { stepId: 's2', label: 'Shot 1', par: 0.25, actual: 0.31 },
        { stepId: 's3', label: 'Shot 2', par: 0.5, actual: 0.5 },
        { stepId: 's4', label: 'Holster', actual: 1.5 },
      ]);

      const { tree } = await renderScreen(drill);

      expect(spokenSteps(tree, run)).toEqual([
        'Draw, par 1.5 seconds, took 1.32 seconds, 0.18 seconds under par',
        'Shot 1, par 0.25 seconds, took 0.31 seconds, 0.06 seconds over par',
        'Shot 2, par 0.5 seconds, took 0.5 seconds, on par',
        'Holster, no par, took 1.5 seconds',
      ]);
    });

    it('sets the steps out in columns under one row of captions at the default text size', async () => {
      setFontScale(1);
      const drill = await seedDrill('Mozambique');
      const run = await seedSession(drill.id, 2.82, '2026-10-10T12:00:00Z', [
        { stepId: 's1', label: 'Draw', par: 1.5, actual: 1.32 },
        { stepId: 's2', label: 'Holster', actual: 1.5 },
      ]);

      const { tree } = await renderScreen(drill);

      expect(textsOf(tree, `table-splits-${run.id}`)).toEqual([
        ...['STEP', 'PAR', 'ACTUAL', 'Δ'],
        ...['Draw', '1.50s', '1.32s', '-0.18s'],
        ...['Holster', '—', '1.50s', '—'],
      ]);
      // The captions are for the eye; every step still says its own.
      expect(spokenSteps(tree, run)).toEqual([
        'Draw, par 1.5 seconds, took 1.32 seconds, 0.18 seconds under par',
        'Holster, no par, took 1.5 seconds',
      ]);
    });
  });

  describe('the name of the drill', () => {
    it('shows the name the drill has now, not the one it was opened with', async () => {
      const drill = await seedDrill('Bill Drill at 7 yards');
      await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');

      const { tree } = await renderScreen({ id: drill.id, name: 'Bill Drill' });

      expect(screenTexts(tree)).toContain('Bill Drill at 7 yards');
      expect(screenTexts(tree)).not.toContain('Bill Drill');
    });

    it('keeps the runs of a deleted drill, under a stand-in name', async () => {
      const drill = await seedDrill('Bill Drill');
      const run = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      await deleteDrillById(drill.id);

      const { tree } = await renderScreen(drill);

      expect(screenTexts(tree)).toContain('Deleted drill');
      expect(cardOrder(tree)).toEqual([run.id]);
    });
  });

  describe('a drill with no runs', () => {
    it('says there are none yet', async () => {
      const drill = await seedDrill('Bill Drill');

      const { tree } = await renderScreen(drill);

      expect(has(tree, 'state-history-detail-empty')).toBe(true);
      expect(has(tree, 'text-history-detail-loading')).toBe(false);
      expect(totals(tree)).toEqual({ best: '—', avg: '—' });
      expect(screenTexts(tree)).toContain('0 runs logged');
    });
  });

  describe('coming back to the screen', () => {
    it('shows a run saved while it was in the background, open as the newest', async () => {
      const drill = await seedDrill('Bill Drill');
      const first = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      const { tree, goTo } = await renderScreen(drill);

      await goTo('Elsewhere');
      const second = await seedSession(drill.id, 2.5, '2026-10-11T12:00:00Z');
      await goTo('HistoryDetail');

      expect(cardOrder(tree)).toEqual([second.id, first.id]);
      expect(totals(tree)).toEqual({ best: '2.50s', avg: '2.80s' });
      expect(isOpen(tree, second)).toBe(true);
      expect(isOpen(tree, first)).toBe(false);
    });

    it('shows the drill under its new name after it is renamed', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      const { tree, goTo } = await renderScreen(drill);

      await goTo('Elsewhere');
      await updateDrill(drill.id, { name: 'Bill Drill at 7 yards' });
      await goTo('HistoryDetail');

      expect(screenTexts(tree)).toContain('Bill Drill at 7 yards');
    });

    it('does not flash the loading line while it reads again', async () => {
      const drill = await seedDrill('Bill Drill');
      const run = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      const { tree, goTo } = await renderScreen(drill);
      await goTo('Elsewhere');

      // Coming back starts a read that stays pending.
      jest
        .spyOn(SessionStorageService, 'loadByDrillId')
        .mockReturnValue(new Promise<Session[]>(() => {}));
      await goTo('HistoryDetail');

      expect(has(tree, 'text-history-detail-loading')).toBe(false);
      expect(cardOrder(tree)).toEqual([run.id]);
    });

    it('keeps the runs it had when reading again fails', async () => {
      const drill = await seedDrill('Bill Drill');
      const run = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      const { tree, goTo } = await renderScreen(drill);
      await goTo('Elsewhere');

      jest
        .spyOn(SessionStorageService, 'loadByDrillId')
        .mockRejectedValue(storageFailure());
      await goTo('HistoryDetail');

      expect(has(tree, 'state-history-detail-error')).toBe(false);
      expect(cardOrder(tree)).toEqual([run.id]);
      expect(totals(tree)).toEqual({ best: '3.10s', avg: '3.10s' });
    });

    it('ignores a read that answers after the screen was left', async () => {
      const drill = await seedDrill('Bill Drill');
      const run = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      const { tree, goTo } = await renderScreen(drill);
      await goTo('Elsewhere');

      let answer: (sessions: Session[]) => void = () => {};
      jest.spyOn(SessionStorageService, 'loadByDrillId').mockReturnValueOnce(
        new Promise<Session[]>(resolve => {
          answer = resolve;
        }),
      );
      await goTo('HistoryDetail');
      await goTo('Elsewhere');
      // The read from the visit that has ended comes back empty.
      answer([]);
      await settle();

      expect(cardOrder(tree)).toEqual([run.id]);
      expect(totals(tree)).toEqual({ best: '3.10s', avg: '3.10s' });
    });
  });

  describe('when the runs cannot be read', () => {
    it('offers to try again when the runs cannot be read', async () => {
      const drill = await seedDrill('Bill Drill');
      jest
        .spyOn(SessionStorageService, 'loadByDrillId')
        .mockRejectedValue(storageFailure());

      const { tree } = await renderScreen(drill);

      expect(has(tree, 'state-history-detail-error')).toBe(true);
      expect(has(tree, 'text-history-detail-loading')).toBe(false);
      expect(has(tree, 'state-history-detail-empty')).toBe(false);
      expect(totals(tree)).toEqual({ best: '—', avg: '—' });
    });

    it('offers to try again when the drill cannot be read', async () => {
      const drill = await seedDrill('Bill Drill');
      await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      jest
        .spyOn(DrillStorageService, 'loadById')
        .mockRejectedValue(
          new DrillStorageError('Failed to load drill', 'STORAGE_FAILURE'),
        );

      const { tree } = await renderScreen(drill);

      // Without the drill its runs would be shown as a deleted drill's.
      expect(has(tree, 'state-history-detail-error')).toBe(true);
      expect(cardOrder(tree)).toEqual([]);
    });

    it('does not show the raw error', async () => {
      const drill = await seedDrill('Bill Drill');
      jest
        .spyOn(SessionStorageService, 'loadByDrillId')
        .mockRejectedValue(storageFailure());

      const { tree } = await renderScreen(drill);

      expect(textsOf(tree, 'state-history-detail-error')).not.toContain(
        'Failed to load sessions',
      );
    });

    it('reads again when Try again is pressed', async () => {
      const drill = await seedDrill('Bill Drill');
      const run = await seedSession(drill.id, 3.1, '2026-10-10T12:00:00Z');
      jest
        .spyOn(SessionStorageService, 'loadByDrillId')
        .mockRejectedValueOnce(storageFailure());
      const { tree } = await renderScreen(drill);
      expect(has(tree, 'state-history-detail-error')).toBe(true);

      await act(async () => {
        tree.root.findAllByProps({ label: 'Try again' })[0].props.onPress();
      });
      await settle();

      expect(has(tree, 'state-history-detail-error')).toBe(false);
      expect(cardOrder(tree)).toEqual([run.id]);
      expect(totals(tree)).toEqual({ best: '3.10s', avg: '3.10s' });
    });
  });
});
