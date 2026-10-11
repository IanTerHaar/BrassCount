import { AccessibilityInfo } from 'react-native';

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

import { SequenceEditorScreen } from '../src/screens/SequenceEditorScreen';
import {
  DrillStorageError,
  DrillStorageService,
  deleteDrillById,
  loadDrillById,
  loadDrills,
  saveDrill,
} from '../src/services/drillStorage';
import {
  MAX_DRILL_NAME_LENGTH,
  MAX_DRILL_STEPS,
  type Drill,
  type DrillInput,
} from '../src/types/drill';
import { isStepPar } from '../src/utils/drill';

/**
 * The editor is pushed over the tabs on the root stack in the app. Here it
 * is a tab beside a stand-in for the Drills list: the screen only needs a
 * route to read its params from and something to go back to.
 */
type TestTabParamList = {
  Drills: undefined;
  SequenceEditor: { id?: string };
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Tab = createBottomTabNavigator<TestTabParamList>();

/** Stands in for the Drills list the editor is opened from. */
const Blank = () => null;

const BILL_DRILL: DrillInput = {
  name: 'Bill Drill',
  steps: [
    { type: 'draw', par: 1.5 },
    { type: 'shot', par: 0.25 },
    { type: 'shot', par: 0.2 },
  ],
};

/** Has an untimed step, so the drill has no total par. */
const MOZAMBIQUE: DrillInput = {
  name: 'Mozambique',
  steps: [{ type: 'draw', par: 1.5 }, { type: 'shot' }, { type: 'holster' }],
};

/** Holds a step type the editor no longer offers for new steps. */
const EL_PRESIDENTE: DrillInput = {
  name: 'El Presidente',
  steps: [
    { type: 'shot', par: 0.3 },
    { type: 'transition', par: 0.4 },
    { type: 'shot', par: 0.3 },
  ],
};

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
  /** Point the editor at another drill, as a second navigation would. */
  openDrill: (id: string) => Promise<void>;
  /** The route on screen, e.g. the Drills list after going back. */
  currentRoute: () => { name: string; params?: object } | undefined;
};

const mounted: ReactTestRenderer[] = [];

/** Mount the editor on `id`, or on a new drill, without waiting for it. */
const mountEditor = (id?: string): Harness => {
  const navigationRef = createNavigationContainerRef<TestTabParamList>();
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <NavigationContainer ref={navigationRef}>
          <Tab.Navigator
            initialRouteName="SequenceEditor"
            screenOptions={{ headerShown: false }}
          >
            <Tab.Screen name="Drills" component={Blank} />
            <Tab.Screen
              name="SequenceEditor"
              component={SequenceEditorScreen}
              initialParams={id === undefined ? {} : { id }}
            />
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
    openDrill: async nextId => {
      act(() => {
        navigationRef.navigate('SequenceEditor', { id: nextId });
      });
      await settle();
    },
    currentRoute: () => navigationRef.getCurrentRoute(),
  };
};

/** Mount the editor and wait until it shows what is in storage. */
const renderEditor = async (id?: string): Promise<Harness> => {
  const harness = mountEditor(id);
  await settle();
  return harness;
};

const byTestId = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({ testID });

const has = (tree: ReactTestRenderer, testID: string): boolean =>
  byTestId(tree, testID).length > 0;

const first = (tree: ReactTestRenderer, testID: string): ReactTestInstance => {
  const [node] = byTestId(tree, testID);
  if (node === undefined) {
    throw new Error(`nothing is rendered for "${testID}"`);
  }
  return node;
};

/**
 * The first element with this `testID` that was given `prop`. A `testID`
 * is forwarded through several nested elements, and a wrapper such as
 * `Select` carries it without the handler or state of the control inside.
 */
const withProp = (
  tree: ReactTestRenderer,
  testID: string,
  prop: string,
): ReactTestInstance => {
  const node = byTestId(tree, testID).find(
    candidate => candidate.props[prop] !== undefined,
  );
  if (node === undefined) {
    throw new Error(`nothing with "${prop}" is rendered for "${testID}"`);
  }
  return node;
};

/** Every string rendered under `node`, in the order it is shown. */
const textsUnder = (node: ReactTestInstance): string[] =>
  node.children.flatMap(child =>
    typeof child === 'string' ? [child] : textsUnder(child),
  );

/** What the element with this `testID` shows, as one string. */
const textOf = (tree: ReactTestRenderer, testID: string): string =>
  textsUnder(first(tree, testID)).join('');

/** Every string on the screen, to look for a line that has no `testID`. */
const allText = (tree: ReactTestRenderer): string[] => textsUnder(tree.root);

const press = async (tree: ReactTestRenderer, testID: string) => {
  await act(async () => {
    withProp(tree, testID, 'onPress').props.onPress();
  });
};

const pressLabelled = async (tree: ReactTestRenderer, label: string) => {
  await act(async () => {
    tree.root.findAllByProps({ label })[0].props.onPress();
  });
  await settle();
};

const type = async (tree: ReactTestRenderer, testID: string, text: string) => {
  await act(async () => {
    first(tree, testID).props.onChangeText(text);
  });
};

const isDisabled = (tree: ReactTestRenderer, testID: string): boolean =>
  withProp(tree, testID, 'accessibilityState').props.accessibilityState
    .disabled === true;

const spokenLabel = (tree: ReactTestRenderer, testID: string): string =>
  first(tree, testID).props.accessibilityLabel;

/** How many step rows are on screen. */
const stepCount = (tree: ReactTestRenderer): number => {
  let count = 0;
  while (has(tree, `row-step-${count}`)) {
    count += 1;
  }
  return count;
};

/** The type each step's dropdown shows, top to bottom. */
const stepTypes = (tree: ReactTestRenderer): string[] =>
  Array.from({ length: stepCount(tree) }, (_, i) =>
    textOf(tree, `select-step-${i}`),
  );

/** What each step's par control shows, top to bottom. */
const stepPars = (tree: ReactTestRenderer): string[] =>
  Array.from({ length: stepCount(tree) }, (_, i) =>
    textOf(tree, `btn-par-step-${i}`),
  );

/** The types on offer in the open dropdown of the step at `position`. */
const offeredTypes = (tree: ReactTestRenderer, position: number): string[] => {
  const prefix = `select-step-${position}-option-`;
  const values = tree.root
    .findAll(
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith(prefix),
    )
    .map(node => (node.props.testID as string).slice(prefix.length));
  // A `testID` is forwarded through several nested elements.
  return [...new Set(values)];
};

const addSteps = async (tree: ReactTestRenderer, count: number) => {
  for (let i = 0; i < count; i += 1) {
    await press(tree, 'btn-add-step');
  }
};

const chooseType = async (
  tree: ReactTestRenderer,
  position: number,
  stepType: string,
) => {
  await press(tree, `select-step-${position}`);
  await press(tree, `select-step-${position}-option-${stepType}`);
};

const choosePreset = async (
  tree: ReactTestRenderer,
  position: number,
  preset: string,
) => {
  await press(tree, `btn-par-step-${position}`);
  await press(tree, `opt-par-${preset}`);
};

const typeCustomPar = async (
  tree: ReactTestRenderer,
  position: number,
  text: string,
) => {
  await press(tree, `btn-par-step-${position}`);
  await type(tree, 'input-par-custom', text);
};

const parPickerIsOpen = (tree: ReactTestRenderer): boolean =>
  has(tree, 'text-par-heading');

/** The subtitle under the screen title: the line after it. */
const subtitle = (tree: ReactTestRenderer): string => {
  const texts = allText(tree);
  const title = texts.findIndex(
    text => text === 'New drill' || text === 'Edit drill',
  );
  return texts[title + 1];
};

describe('SequenceEditorScreen', () => {
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

  describe('a new drill', () => {
    it('opens empty, ready to be named', async () => {
      const { tree } = await renderEditor();

      expect(allText(tree)).toContain('New drill');
      expect(subtitle(tree)).toBe('Name it, then add the actions in order');
      expect(first(tree, 'input-drill-name').props.value).toBe('');
      expect(has(tree, 'text-editor-loading')).toBe(false);
    });

    it('says there are no steps yet and where to start', async () => {
      const { tree } = await renderEditor();

      expect(textsUnder(first(tree, 'state-steps-empty'))).toEqual([
        'No steps yet',
        'Add your first action — most strings open with a draw.',
      ]);
      expect(stepCount(tree)).toBe(0);
      expect(has(tree, 'text-preview')).toBe(false);
    });

    it('does not read storage', async () => {
      const loadById = jest.spyOn(DrillStorageService, 'loadById');

      await renderEditor();

      expect(loadById).not.toHaveBeenCalled();
    });

    it('takes a name no longer than a drill may have', async () => {
      const { tree } = await renderEditor();

      await type(tree, 'input-drill-name', 'Bill Drill');

      expect(first(tree, 'input-drill-name').props.value).toBe('Bill Drill');
      expect(first(tree, 'input-drill-name').props.maxLength).toBe(
        MAX_DRILL_NAME_LENGTH,
      );
    });
  });

  describe('adding steps', () => {
    it('opens the drill with a draw, then adds shots', async () => {
      const { tree } = await renderEditor();

      await addSteps(tree, 3);

      expect(stepTypes(tree)).toEqual(['Draw', 'Shot', 'Shot']);
      expect(has(tree, 'state-steps-empty')).toBe(false);
    });

    it('adds each step untimed', async () => {
      const { tree } = await renderEditor();

      await addSteps(tree, 2);

      expect(stepPars(tree)).toEqual(['+ par', '+ par']);
      expect(spokenLabel(tree, 'btn-par-step-1')).toBe('Set par for step 2');
    });

    it('numbers the steps in order', async () => {
      const { tree } = await renderEditor();

      await addSteps(tree, 3);

      expect(textsUnder(first(tree, 'row-step-0'))[0]).toBe('1');
      expect(textsUnder(first(tree, 'row-step-2'))[0]).toBe('3');
    });

    it('counts the steps and shots under the title', async () => {
      const { tree } = await renderEditor();

      await addSteps(tree, 1);
      expect(subtitle(tree)).toBe('1 step · 0 shots');

      await addSteps(tree, 1);
      expect(subtitle(tree)).toBe('2 steps · 1 shot');

      await addSteps(tree, 1);
      expect(subtitle(tree)).toBe('3 steps · 2 shots');
    });

    it('follows a drill whose draw was removed with a draw again', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);
      await press(tree, 'btn-remove-step-0');

      await addSteps(tree, 1);

      expect(stepTypes(tree)).toEqual(['Draw']);
    });

    it('tells a screen reader which step was added', async () => {
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockClear();
      const { tree } = await renderEditor();

      await addSteps(tree, 2);

      expect(announce.mock.calls).toEqual([
        ['Added step 1, Draw'],
        ['Added step 2, Shot'],
      ]);
    });

    it('stops at the most steps a drill may have', async () => {
      const full = await saveDrill({
        name: 'Endurance',
        steps: Array.from({ length: MAX_DRILL_STEPS }, () => ({
          type: 'shot' as const,
        })),
      });
      const { tree } = await renderEditor(full.id);
      expect(stepCount(tree)).toBe(MAX_DRILL_STEPS);

      expect(isDisabled(tree, 'btn-add-step')).toBe(true);
      expect(first(tree, 'btn-add-step').props.disabled).toBe(true);
      expect(textOf(tree, 'text-step-limit')).toBe(
        `A drill can have at most ${MAX_DRILL_STEPS} steps.`,
      );

      await press(tree, 'btn-remove-step-0');

      expect(isDisabled(tree, 'btn-add-step')).toBe(false);
      expect(has(tree, 'text-step-limit')).toBe(false);
    });
  });

  describe('changing a step type', () => {
    it('offers draw, shot, reload, rack and holster', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await press(tree, 'select-step-0');

      expect(offeredTypes(tree, 0)).toEqual([
        'draw',
        'shot',
        'reload',
        'rack',
        'holster',
      ]);
    });

    it('changes only the step that was picked', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 3);

      await chooseType(tree, 1, 'reload');

      expect(stepTypes(tree)).toEqual(['Draw', 'Reload', 'Shot']);
      expect(subtitle(tree)).toBe('3 steps · 1 shot');
    });

    it('keeps the par the step already had', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 2);
      await choosePreset(tree, 1, '0.25');

      await chooseType(tree, 1, 'rack');

      expect(stepTypes(tree)).toEqual(['Draw', 'Rack']);
      expect(stepPars(tree)).toEqual(['+ par', '0.25s']);
    });
  });

  describe('setting a step par', () => {
    it('opens a picker headed by the step it is for', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 2);
      expect(parPickerIsOpen(tree)).toBe(false);

      await press(tree, 'btn-par-step-1');

      expect(textOf(tree, 'text-par-heading')).toBe('STEP 2 PAR');
      expect(allText(tree)).toContain(
        'Max time from the previous step to this one.',
      );
    });

    it('says the first step is timed from the timer start', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 2);

      await press(tree, 'btn-par-step-0');

      expect(allText(tree)).toContain(
        'Max time from the timer start to this step.',
      );
    });

    it('sets a preset par and closes the picker', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 2);

      await choosePreset(tree, 1, '0.25');

      expect(stepPars(tree)).toEqual(['+ par', '0.25s']);
      expect(spokenLabel(tree, 'btn-par-step-1')).toBe(
        'Change par for step 2, currently 0.25 seconds',
      );
      expect(parPickerIsOpen(tree)).toBe(false);
    });

    it('says a one-second par in the singular', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await choosePreset(tree, 0, '1');

      expect(spokenLabel(tree, 'btn-par-step-0')).toBe(
        'Change par for step 1, currently 1 second',
      );
    });

    it('sets a typed par to the hundredth of a second', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await typeCustomPar(tree, 0, '1.756');
      await press(tree, 'btn-par-custom-set');

      expect(stepPars(tree)).toEqual(['1.76s']);
      expect(parPickerIsOpen(tree)).toBe(false);
    });

    it('reads a comma as the decimal separator', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await typeCustomPar(tree, 0, '0,35');
      await press(tree, 'btn-par-custom-set');

      expect(stepPars(tree)).toEqual(['0.35s']);
    });

    it.each<[string, string]>([
      ['nothing', ''],
      ['zero', '0'],
      ['a time over the limit', '60.01'],
      ['text that is not a time', '1.2.3'],
    ])('will not set %s as a par', async (_case, text) => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await typeCustomPar(tree, 0, text);

      expect(isDisabled(tree, 'btn-par-custom-set')).toBe(true);
      await press(tree, 'btn-par-custom-set');
      expect(parPickerIsOpen(tree)).toBe(true);
      expect(textOf(tree, 'text-par-custom-hint')).toBe(
        'Enter a time from 0.01 to 60 seconds.',
      );
    });

    it('accepts the longest par a step may have', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await typeCustomPar(tree, 0, '60');
      expect(isDisabled(tree, 'btn-par-custom-set')).toBe(false);
      await press(tree, 'btn-par-custom-set');

      expect(stepPars(tree)).toEqual(['60.00s']);
    });

    it('starts the custom field from the par the step has', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 2);
      await choosePreset(tree, 0, '1.5');

      await press(tree, 'btn-par-step-0');
      expect(first(tree, 'input-par-custom').props.value).toBe('1.50');
      await press(tree, 'btn-par-close');

      await press(tree, 'btn-par-step-1');
      expect(first(tree, 'input-par-custom').props.value).toBe('');
    });

    it('forgets what was typed when the picker is closed', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);
      await typeCustomPar(tree, 0, '9.99');
      await press(tree, 'btn-par-close');

      await press(tree, 'btn-par-step-0');

      expect(first(tree, 'input-par-custom').props.value).toBe('');
    });

    it('marks the preset the step is set to', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await press(tree, 'btn-par-step-0');
      expect(first(tree, 'opt-par-none').props.accessibilityState).toEqual({
        selected: true,
      });
      await press(tree, 'opt-par-0.5');

      await press(tree, 'btn-par-step-0');
      expect(first(tree, 'opt-par-0.5').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(first(tree, 'opt-par-none').props.accessibilityState).toEqual({
        selected: false,
      });
    });

    it('says each preset in words', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await press(tree, 'btn-par-step-0');

      expect(spokenLabel(tree, 'opt-par-none')).toBe('No par, Untimed step');
      expect(spokenLabel(tree, 'opt-par-0.25')).toBe(
        '0.25 seconds, Comfortable split',
      );
      expect(spokenLabel(tree, 'opt-par-1')).toBe('1 second');
    });

    it('offers only presets a drill can be saved with', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);
      await press(tree, 'btn-par-step-0');
      const prefix = 'opt-par-';
      const presets = [
        ...new Set(
          tree.root
            .findAll(
              node =>
                typeof node.props.testID === 'string' &&
                node.props.testID.startsWith(prefix),
            )
            .map(node => (node.props.testID as string).slice(prefix.length)),
        ),
      ].filter(preset => preset !== 'none');
      await press(tree, 'btn-par-close');
      expect(presets.length).toBeGreaterThan(0);

      for (const preset of presets) {
        expect(isStepPar(Number(preset))).toBe(true);
        await choosePreset(tree, 0, preset);
        expect(stepPars(tree)).toEqual([`${Number(preset).toFixed(2)}s`]);
      }
    });

    it('closes from a backdrop that is announced as a button', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await press(tree, 'btn-par-step-0');

      const backdrop = withProp(tree, 'btn-par-close', 'onPress');
      expect(backdrop.props.accessibilityRole).toBe('button');
      expect(backdrop.props.accessibilityLabel).toBe('Close par picker');
    });

    it('clears the par with "No par"', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);
      await choosePreset(tree, 0, '0.25');

      await choosePreset(tree, 0, 'none');

      expect(stepPars(tree)).toEqual(['+ par']);
      expect(spokenLabel(tree, 'btn-par-step-0')).toBe('Set par for step 1');
    });

    it('leaves the par alone when the picker is dismissed', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);
      await choosePreset(tree, 0, '0.25');

      await press(tree, 'btn-par-step-0');
      await press(tree, 'btn-par-close');

      expect(parPickerIsOpen(tree)).toBe(false);
      expect(stepPars(tree)).toEqual(['0.25s']);
    });

    it('adds up the pars under the title once every step has one', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 2);

      await choosePreset(tree, 0, '1.5');
      expect(subtitle(tree)).toBe('2 steps · 1 shot');

      await choosePreset(tree, 1, '0.25');
      expect(subtitle(tree)).toBe('2 steps · 1 shot · Par 1.75s');
    });
  });

  describe('removing a step', () => {
    it('removes that step and closes the gap in the numbering', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 3);
      await chooseType(tree, 1, 'reload');

      await press(tree, 'btn-remove-step-0');

      expect(stepTypes(tree)).toEqual(['Reload', 'Shot']);
      expect(textsUnder(first(tree, 'row-step-0'))[0]).toBe('1');
    });

    it('leaves the type and par of the steps around it', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 3);
      await choosePreset(tree, 0, '1.5');
      await choosePreset(tree, 2, '0.25');

      await press(tree, 'btn-remove-step-1');

      expect(stepTypes(tree)).toEqual(['Draw', 'Shot']);
      expect(stepPars(tree)).toEqual(['1.50s', '0.25s']);
    });

    it('names the step it removes for a screen reader', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 3);

      expect(spokenLabel(tree, 'btn-remove-step-0')).toBe(
        'Remove step 1, Draw',
      );
      expect(spokenLabel(tree, 'btn-remove-step-2')).toBe(
        'Remove step 3, Shot 2',
      );
    });

    it('tells a screen reader which step was removed', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 3);
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockClear();

      await press(tree, 'btn-remove-step-2');

      expect(announce.mock.calls).toEqual([['Removed step 3, Shot 2']]);
    });

    it('shows the empty state again once the last step is gone', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await press(tree, 'btn-remove-step-0');

      expect(has(tree, 'state-steps-empty')).toBe(true);
      expect(has(tree, 'text-preview')).toBe(false);
      expect(subtitle(tree)).toBe('Name it, then add the actions in order');
    });
  });

  describe('the preview', () => {
    it('shows the sequence in order with each par', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 3);
      await choosePreset(tree, 0, '1.5');
      await choosePreset(tree, 2, '0.25');

      expect(textOf(tree, 'text-preview')).toBe(
        'Draw (1.50s)  →  Shot 1  →  Shot 2 (0.25s)',
      );
    });

    it('follows every change to the steps', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 2);
      expect(textOf(tree, 'text-preview')).toBe('Draw  →  Shot');

      await chooseType(tree, 0, 'shot');
      expect(textOf(tree, 'text-preview')).toBe('Shot 1  →  Shot 2');

      await press(tree, 'btn-remove-step-1');
      expect(textOf(tree, 'text-preview')).toBe('Shot');
    });

    it('reads as one sentence to a screen reader', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 3);
      await choosePreset(tree, 0, '1.5');
      await choosePreset(tree, 2, '1');

      expect(first(tree, 'text-preview').props.accessible).toBe(true);
      expect(spokenLabel(tree, 'text-preview')).toBe(
        'Draw, 1.5 seconds; then Shot 1; then Shot 2, 1 second',
      );
    });
  });

  describe('the save button', () => {
    it('stays disabled until the drill has a name and a step', async () => {
      const { tree } = await renderEditor();
      const note = 'Name the drill and add at least one step to save.';
      expect(isDisabled(tree, 'btn-save-drill')).toBe(true);
      expect(allText(tree)).toContain(note);

      await type(tree, 'input-drill-name', 'Bill Drill');
      expect(isDisabled(tree, 'btn-save-drill')).toBe(true);

      await addSteps(tree, 1);
      expect(isDisabled(tree, 'btn-save-drill')).toBe(false);
      expect(allText(tree)).not.toContain(note);
    });

    it('does not count a name made of spaces', async () => {
      const { tree } = await renderEditor();
      await addSteps(tree, 1);

      await type(tree, 'input-drill-name', '   ');

      expect(isDisabled(tree, 'btn-save-drill')).toBe(true);
    });

    it('reads "Create drill" for a new drill', async () => {
      const { tree } = await renderEditor();

      expect(first(tree, 'btn-save-drill').props.label).toBe('Create drill');
    });

    it('says a drill with steps still needs a name', async () => {
      const { tree } = await renderEditor();

      await addSteps(tree, 1);

      expect(textOf(tree, 'text-save-hint')).toBe('Name the drill to save.');
    });

    it('says a named drill still needs a step', async () => {
      const { tree } = await renderEditor();

      await type(tree, 'input-drill-name', 'Bill Drill');

      expect(textOf(tree, 'text-save-hint')).toBe(
        'Add at least one step to save.',
      );
    });

    it('stores nothing when pressed before the drill is ready', async () => {
      const { tree, currentRoute } = await renderEditor();
      await type(tree, 'input-drill-name', 'Bill Drill');

      await press(tree, 'btn-save-drill');
      await settle();

      expect(currentRoute()?.name).toBe('SequenceEditor');
      expect(await loadDrills()).toEqual([]);
    });
  });

  describe('creating a drill', () => {
    /** Name a new drill and give it a draw and two shots. */
    const buildBillDrill = async (tree: ReactTestRenderer, name: string) => {
      await type(tree, 'input-drill-name', name);
      await addSteps(tree, 3);
    };

    it('stores it and goes back to the drills', async () => {
      const { tree, currentRoute } = await renderEditor();
      await buildBillDrill(tree, 'Bill Drill');
      await choosePreset(tree, 0, '1.5');
      await typeCustomPar(tree, 1, '0.25');
      await press(tree, 'btn-par-custom-set');

      await press(tree, 'btn-save-drill');
      await settle();

      expect(currentRoute()?.name).toBe('Drills');
      expect(await loadDrills()).toMatchObject([
        {
          name: 'Bill Drill',
          steps: [
            { type: 'draw', par: 1.5 },
            { type: 'shot', par: 0.25 },
            { type: 'shot' },
          ],
        },
      ]);
    });

    it('works out the total par and the shot count', async () => {
      const { tree } = await renderEditor();
      await buildBillDrill(tree, 'Bill Drill');
      await choosePreset(tree, 0, '1.5');
      await choosePreset(tree, 1, '0.5');
      await choosePreset(tree, 2, '0.5');

      await press(tree, 'btn-save-drill');
      await settle();

      const [stored] = await loadDrills();
      expect(stored.totalPar).toBe(2.5);
      expect(stored.shotCount).toBe(2);
    });

    it('leaves the total par out when a step is untimed', async () => {
      const { tree } = await renderEditor();
      await buildBillDrill(tree, 'Bill Drill');
      await choosePreset(tree, 0, '1.5');

      await press(tree, 'btn-save-drill');
      await settle();

      const [stored] = await loadDrills();
      expect(stored.totalPar).toBeNull();
      expect(stored.shotCount).toBe(2);
    });

    it('stores the name without the spaces around it', async () => {
      const { tree } = await renderEditor();
      await buildBillDrill(tree, '  Bill Drill ');

      await press(tree, 'btn-save-drill');
      await settle();

      expect((await loadDrills()).map(drill => drill.name)).toEqual([
        'Bill Drill',
      ]);
    });

    it('tells a screen reader the drill was created', async () => {
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const { tree } = await renderEditor();
      await buildBillDrill(tree, 'Bill Drill');

      await press(tree, 'btn-save-drill');
      await settle();

      expect(announce).toHaveBeenLastCalledWith('Created Bill Drill');
    });

    it('reads "Saving…" and cannot be pressed while it is stored', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockImplementationOnce(() => new Promise<Drill>(() => {}));
      const { tree, currentRoute } = await renderEditor();
      await buildBillDrill(tree, 'Bill Drill');

      await press(tree, 'btn-save-drill');

      expect(first(tree, 'btn-save-drill').props.label).toBe('Saving…');
      expect(isDisabled(tree, 'btn-save-drill')).toBe(true);
      expect(currentRoute()?.name).toBe('SequenceEditor');
    });

    it('takes no more changes once it is being stored', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockImplementationOnce(() => new Promise<Drill>(() => {}));
      const { tree } = await renderEditor();
      await buildBillDrill(tree, 'Bill Drill');
      await press(tree, 'btn-save-drill');

      await press(tree, 'btn-add-step');
      await press(tree, 'btn-remove-step-0');
      await chooseType(tree, 1, 'reload');

      expect(first(tree, 'input-drill-name').props.editable).toBe(false);
      expect(stepTypes(tree)).toEqual(['Draw', 'Shot', 'Shot']);
    });

    it('stores one drill when the button is pressed twice', async () => {
      const { tree } = await renderEditor();
      await buildBillDrill(tree, 'Bill Drill');
      const { onPress } = withProp(tree, 'btn-save-drill', 'onPress').props;

      // Both from the same render, as two taps before a redraw would be.
      await act(async () => {
        onPress();
        onPress();
      });
      await settle();

      expect(await loadDrills()).toHaveLength(1);
    });
  });

  describe('a save that fails', () => {
    const buildDrill = async (tree: ReactTestRenderer) => {
      await type(tree, 'input-drill-name', 'Bill Drill');
      await addSteps(tree, 2);
    };

    it('stays on the editor and says the drill was not saved', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        );
      const { tree, currentRoute } = await renderEditor();
      await buildDrill(tree);

      await press(tree, 'btn-save-drill');
      await settle();

      expect(currentRoute()?.name).toBe('SequenceEditor');
      expect(textOf(tree, 'text-drill-save-error')).toBe(
        'Could not save the drill. Try again.',
      );
      expect(await loadDrills()).toEqual([]);
    });

    it('keeps what was built and saves it on the next try', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        );
      const { tree, currentRoute } = await renderEditor();
      await buildDrill(tree);
      await press(tree, 'btn-save-drill');
      await settle();

      expect(first(tree, 'input-drill-name').props.value).toBe('Bill Drill');
      expect(stepTypes(tree)).toEqual(['Draw', 'Shot']);
      expect(first(tree, 'btn-save-drill').props.label).toBe('Create drill');
      expect(isDisabled(tree, 'btn-save-drill')).toBe(false);

      await press(tree, 'btn-save-drill');
      await settle();

      expect(currentRoute()?.name).toBe('Drills');
      expect((await loadDrills()).map(drill => drill.name)).toEqual([
        'Bill Drill',
      ]);
    });

    it('takes the message away while it tries again', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        )
        .mockImplementationOnce(() => new Promise<Drill>(() => {}));
      const { tree } = await renderEditor();
      await buildDrill(tree);
      await press(tree, 'btn-save-drill');
      await settle();

      await press(tree, 'btn-save-drill');

      expect(has(tree, 'text-drill-save-error')).toBe(false);
    });

    it('says to check the drill when the service turns it down', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Step 1 has an unknown type', 'INVALID_INPUT'),
        );
      const { tree } = await renderEditor();
      await buildDrill(tree);

      await press(tree, 'btn-save-drill');
      await settle();

      expect(textOf(tree, 'text-drill-save-error')).toBe(
        'This drill cannot be saved as it is. Check its name and steps, then try again.',
      );
    });

    it('does not show the service’s own wording', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        );
      const { tree } = await renderEditor();
      await buildDrill(tree);

      await press(tree, 'btn-save-drill');
      await settle();

      expect(allText(tree)).not.toContain('Failed to save drill');
    });

    it('announces the failure to a screen reader', async () => {
      jest
        .spyOn(DrillStorageService, 'save')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to save drill', 'STORAGE_FAILURE'),
        );
      const { tree } = await renderEditor();
      await buildDrill(tree);

      await press(tree, 'btn-save-drill');
      await settle();

      expect(
        withProp(tree, 'text-drill-save-error', 'accessibilityLiveRegion').props
          .accessibilityLiveRegion,
      ).toBe('polite');
    });
  });

  it('goes back from the header', async () => {
    const { tree, currentRoute } = await renderEditor();

    await press(tree, 'btn-back');

    expect(currentRoute()?.name).toBe('Drills');
  });

  describe('a saved drill', () => {
    it('says it is loading until storage answers', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const { tree } = mountEditor(drill.id);

      expect(has(tree, 'text-editor-loading')).toBe(true);
      expect(allText(tree)).toContain('Edit drill');
      expect(has(tree, 'input-drill-name')).toBe(false);

      await settle();

      expect(has(tree, 'text-editor-loading')).toBe(false);
      expect(has(tree, 'input-drill-name')).toBe(true);
    });

    it('opens on its name, steps and pars', async () => {
      const drill = await saveDrill(BILL_DRILL);

      const { tree } = await renderEditor(drill.id);

      expect(allText(tree)).toContain('Edit drill');
      expect(first(tree, 'input-drill-name').props.value).toBe('Bill Drill');
      expect(stepTypes(tree)).toEqual(['Draw', 'Shot', 'Shot']);
      expect(stepPars(tree)).toEqual(['1.50s', '0.25s', '0.20s']);
      expect(subtitle(tree)).toBe('3 steps · 2 shots · Par 1.95s');
      expect(textOf(tree, 'text-preview')).toBe(
        'Draw (1.50s)  →  Shot 1 (0.25s)  →  Shot 2 (0.20s)',
      );
    });

    it('leaves the total par out when a step is untimed', async () => {
      const drill = await saveDrill(MOZAMBIQUE);

      const { tree } = await renderEditor(drill.id);

      expect(subtitle(tree)).toBe('3 steps · 1 shot');
      expect(stepPars(tree)).toEqual(['1.50s', '+ par', '+ par']);
    });

    it('reads "Save changes" and can be saved as it stands', async () => {
      const drill = await saveDrill(BILL_DRILL);

      const { tree } = await renderEditor(drill.id);

      expect(first(tree, 'btn-save-drill').props.label).toBe('Save changes');
      expect(isDisabled(tree, 'btn-save-drill')).toBe(false);
    });

    it('can be edited like a new one', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const { tree } = await renderEditor(drill.id);

      await press(tree, 'btn-remove-step-2');
      await addSteps(tree, 1);
      await chooseType(tree, 2, 'holster');
      await choosePreset(tree, 0, '2');

      expect(stepTypes(tree)).toEqual(['Draw', 'Shot', 'Holster']);
      expect(stepPars(tree)).toEqual(['2.00s', '0.25s', '+ par']);
    });

    it('leaves the stored drill alone when left without saving', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const { tree, currentRoute } = await renderEditor(drill.id);

      await type(tree, 'input-drill-name', 'Renamed');
      await press(tree, 'btn-remove-step-0');
      await press(tree, 'btn-back');
      await settle();

      expect(currentRoute()?.name).toBe('Drills');
      expect(await loadDrillById(drill.id)).toEqual(drill);
    });

    it('saves the changes to that drill and goes back', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const { tree, currentRoute } = await renderEditor(drill.id);

      await type(tree, 'input-drill-name', 'Bill Drill, slow');
      await press(tree, 'btn-remove-step-2');
      await choosePreset(tree, 0, '2');
      await press(tree, 'btn-save-drill');
      await settle();

      expect(currentRoute()?.name).toBe('Drills');
      const stored = await loadDrills();
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        id: drill.id,
        name: 'Bill Drill, slow',
        steps: [
          { id: drill.steps[0].id, type: 'draw', par: 2 },
          { id: drill.steps[1].id, type: 'shot', par: 0.25 },
        ],
        totalPar: 2.25,
        shotCount: 1,
        createdAt: drill.createdAt,
      });
    });

    it('drops the total par once a step is left untimed', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const { tree } = await renderEditor(drill.id);

      await addSteps(tree, 1);
      await press(tree, 'btn-save-drill');
      await settle();

      const stored = await loadDrillById(drill.id);
      expect(stored?.totalPar).toBeNull();
      expect(stored?.shotCount).toBe(3);
    });

    it('tells a screen reader the drill was saved', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const { tree } = await renderEditor(drill.id);

      await press(tree, 'btn-save-drill');
      await settle();

      expect(announce).toHaveBeenLastCalledWith('Saved Bill Drill');
    });

    it('reads "Saving…" while the changes are stored', async () => {
      const drill = await saveDrill(BILL_DRILL);
      jest
        .spyOn(DrillStorageService, 'update')
        .mockImplementationOnce(() => new Promise<Drill>(() => {}));
      const { tree } = await renderEditor(drill.id);

      await press(tree, 'btn-save-drill');

      expect(first(tree, 'btn-save-drill').props.label).toBe('Saving…');
      expect(isDisabled(tree, 'btn-save-drill')).toBe(true);
    });

    it('says so when the drill was deleted before it was saved', async () => {
      const drill = await saveDrill(BILL_DRILL);
      const { tree, currentRoute } = await renderEditor(drill.id);
      await deleteDrillById(drill.id);

      await type(tree, 'input-drill-name', 'Renamed');
      await press(tree, 'btn-save-drill');
      await settle();

      expect(currentRoute()?.name).toBe('SequenceEditor');
      expect(textOf(tree, 'text-drill-save-error')).toBe(
        'This drill is no longer saved on this device, so it cannot be changed.',
      );
      expect(await loadDrills()).toEqual([]);
    });

    it('says the changes were not saved when storage fails', async () => {
      const drill = await saveDrill(BILL_DRILL);
      jest
        .spyOn(DrillStorageService, 'update')
        .mockRejectedValueOnce(
          new DrillStorageError('Failed to update drill', 'STORAGE_FAILURE'),
        );
      const { tree, currentRoute } = await renderEditor(drill.id);

      await type(tree, 'input-drill-name', 'Renamed');
      await press(tree, 'btn-save-drill');
      await settle();

      expect(currentRoute()?.name).toBe('SequenceEditor');
      expect(textOf(tree, 'text-drill-save-error')).toBe(
        'Could not save your changes. Try again.',
      );
      expect(first(tree, 'input-drill-name').props.value).toBe('Renamed');
      expect(await loadDrillById(drill.id)).toEqual(drill);
    });

    it('still shows a step type the editor no longer offers', async () => {
      const drill = await saveDrill(EL_PRESIDENTE);

      const { tree } = await renderEditor(drill.id);

      expect(stepTypes(tree)).toEqual(['Shot', 'Transition', 'Shot']);
      expect(textOf(tree, 'text-preview')).toBe(
        'Shot 1 (0.30s)  →  Transition (0.40s)  →  Shot 2 (0.30s)',
      );
    });

    it('offers that type only on the step that already has it', async () => {
      const drill = await saveDrill(EL_PRESIDENTE);
      const { tree } = await renderEditor(drill.id);

      await press(tree, 'select-step-1');
      expect(offeredTypes(tree, 1)).toEqual([
        'draw',
        'shot',
        'reload',
        'rack',
        'holster',
        'transition',
      ]);

      await press(tree, 'select-step-0');
      expect(offeredTypes(tree, 0)).not.toContain('transition');
    });

    it('starts over when pointed at another drill', async () => {
      const opened = await saveDrill(BILL_DRILL);
      const second = await saveDrill(MOZAMBIQUE);
      const { tree, openDrill } = await renderEditor(opened.id);
      await type(tree, 'input-drill-name', 'Half-typed');
      await addSteps(tree, 4);

      await openDrill(second.id);

      expect(first(tree, 'input-drill-name').props.value).toBe('Mozambique');
      expect(stepTypes(tree)).toEqual(['Draw', 'Shot', 'Holster']);
    });
  });

  describe('a saved drill that cannot be shown', () => {
    const failure = () =>
      new DrillStorageError('Failed to load drill', 'STORAGE_FAILURE');

    it('says the drill is gone when it is not stored', async () => {
      const { tree, currentRoute } = await renderEditor('no-such-drill');

      expect(has(tree, 'state-editor-missing')).toBe(true);
      expect(textsUnder(first(tree, 'state-editor-missing'))).toContain(
        'Drill not found',
      );
      expect(has(tree, 'input-drill-name')).toBe(false);
      expect(has(tree, 'btn-save-drill')).toBe(false);

      await pressLabelled(tree, 'Back to drills');

      expect(currentRoute()?.name).toBe('Drills');
    });

    it('treats a stored entry that cannot be read as gone', async () => {
      await AsyncStorage.setItem(
        `@BrassCount:${DrillStorageService.namespace}:${DrillStorageService.version}:broken`,
        '{not json',
      );

      const { tree } = await renderEditor('broken');

      expect(has(tree, 'state-editor-missing')).toBe(true);
    });

    it('treats an id that is not an id as gone, with no retry', async () => {
      const { tree } = await renderEditor('');

      expect(has(tree, 'state-editor-missing')).toBe(true);
      expect(tree.root.findAllByProps({ label: 'Try again' })).toHaveLength(0);
    });

    it('says so when storage fails, and recovers on retry', async () => {
      const drill = await saveDrill(BILL_DRILL);
      jest
        .spyOn(DrillStorageService, 'loadById')
        .mockRejectedValueOnce(failure());

      const { tree } = await renderEditor(drill.id);

      expect(has(tree, 'state-editor-error')).toBe(true);
      expect(has(tree, 'state-editor-missing')).toBe(false);
      expect(has(tree, 'input-drill-name')).toBe(false);

      await pressLabelled(tree, 'Try again');

      expect(has(tree, 'state-editor-error')).toBe(false);
      expect(first(tree, 'input-drill-name').props.value).toBe('Bill Drill');
    });

    it('says it is loading again while a retry is read', async () => {
      let answer: (drill: Drill | null) => void = () => {};
      jest
        .spyOn(DrillStorageService, 'loadById')
        .mockRejectedValueOnce(failure())
        .mockImplementationOnce(
          () =>
            new Promise<Drill | null>(resolve => {
              answer = resolve;
            }),
        );
      const { tree } = await renderEditor('some-drill');

      await pressLabelled(tree, 'Try again');

      expect(has(tree, 'text-editor-loading')).toBe(true);
      expect(has(tree, 'state-editor-error')).toBe(false);

      await act(async () => {
        answer(null);
      });

      expect(has(tree, 'state-editor-missing')).toBe(true);
    });

    it('announces the failure to a screen reader', async () => {
      jest
        .spyOn(DrillStorageService, 'loadById')
        .mockRejectedValueOnce(failure());

      const { tree } = await renderEditor('some-drill');

      const announced = tree.root.findAllByProps({
        accessibilityLiveRegion: 'polite',
      });
      expect(announced.flatMap(textsUnder)).toContain(
        'Could not load this drill',
      );
    });

    it('ignores the first drill when it answers after a second was opened', async () => {
      const slow = await saveDrill(BILL_DRILL);
      const quick = await saveDrill(MOZAMBIQUE);
      let answerSlow: (loaded: Drill | null) => void = () => {};
      jest
        .spyOn(DrillStorageService, 'loadById')
        .mockImplementationOnce(
          () =>
            new Promise<Drill | null>(resolve => {
              answerSlow = resolve;
            }),
        )
        .mockResolvedValueOnce(quick);
      const { tree, openDrill } = mountEditor(slow.id);

      await openDrill(quick.id);
      await act(async () => {
        answerSlow(slow);
      });

      expect(first(tree, 'input-drill-name').props.value).toBe('Mozambique');
    });
  });
});
