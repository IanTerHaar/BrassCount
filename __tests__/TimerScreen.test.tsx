import {
  AccessibilityInfo,
  DeviceEventEmitter,
  PermissionsAndroid,
  Platform,
} from 'react-native';

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

import { useCalibration } from '../src/hooks/useCalibration';
import { TimerScreen } from '../src/screens/TimerScreen';
import {
  AUDIO_AMPLITUDE_EVENT,
  AUDIO_CAPTURE_ERROR_EVENT,
} from '../src/services/audioCapture';
import {
  deleteDrillById,
  loadDrillById,
  saveDrill,
  updateDrill,
} from '../src/services/drillStorage';
import { loadSessions } from '../src/services/sessionStorage';
import {
  StartSequenceAbortError,
  StartSequenceError,
  StartSequenceService,
  type StartSequenceOptions,
  type StartSequenceResult,
} from '../src/services/startSequence';
import NativeAudioCapture from '../src/specs/NativeAudioCapture';
import {
  CalibrationProvider,
  type CalibrationContextValue,
} from '../src/store/CalibrationContext';
import type { DrillInput } from '../src/types/drill';
import { formatElapsed } from '../src/utils/format';

jest.mock('../src/services/startSequence', () => {
  const actual = jest.requireActual('../src/services/startSequence');
  return {
    ...actual,
    StartSequenceService: {
      ...actual.StartSequenceService,
      prepare: jest.fn(async () => {}),
      release: jest.fn(async () => {}),
      start: jest.fn(),
    },
  };
});

const startMock = jest.mocked(StartSequenceService.start);
const prepareMock = jest.mocked(StartSequenceService.prepare);
// The native module itself is mocked globally in jest.setup.js.
const mockedNativeAudioCapture = jest.mocked(NativeAudioCapture);

type TestTabParamList = {
  Timer: undefined;
  Elsewhere: undefined;
  /** Stands in for the editor the empty library sends the shooter to. */
  SequenceEditor: { id?: string };
};

/** The drills the tests run, oldest first: the last is on the timer first. */
const LIBRARY: DrillInput[] = [
  {
    name: 'Dot Torture',
    steps: [
      { type: 'draw', par: 1.5 },
      { type: 'shot' },
      { type: 'shot' },
      { type: 'reload', par: 2 },
      { type: 'shot' },
      { type: 'shot' },
      { type: 'rack' },
      { type: 'shot' },
      { type: 'holster' },
    ],
  },
  {
    name: 'Mozambique',
    steps: [
      { type: 'draw', par: 1.5 },
      { type: 'shot', par: 0.25 },
      { type: 'shot', par: 0.25 },
      { type: 'shot', par: 0.5 },
      { type: 'holster' },
    ],
  },
  {
    name: 'Failure to Stop',
    steps: [
      { type: 'draw', par: 1.5 },
      { type: 'shot', par: 0.25 },
      { type: 'shot', par: 0.25 },
      { type: 'shot', par: 0.5 },
    ],
  },
  {
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
  },
];

/** Stored drill ids by name, filled in by `seedLibrary`. */
let drillIds: Record<string, string> = {};

/** Store the library, a minute apart, so the newest is Bill Drill. */
const seedLibrary = async (): Promise<void> => {
  drillIds = {};
  for (const [index, input] of LIBRARY.entries()) {
    const at = new Date(Date.UTC(2026, 9, 1, 8, index)).toISOString();
    const drill = await saveDrill(input, { getTimestamp: () => at });
    drillIds[drill.name] = drill.id;
  }
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Tab = createBottomTabNavigator<TestTabParamList>();

/** Stands in for the other tabs. */
const Blank = () => null;

/** Sits beside the screen so a test can calibrate the sounds it listens for. */
const StoreHandle = ({
  onValue,
}: {
  onValue: (value: CalibrationContextValue) => void;
}) => {
  onValue(useCalibration());
  return null;
};

const ROOM_DB = -70;
/** What the capture clock reads when the beep is requested. */
const REQUESTED_AT = 50_000;
/** When the microphone hears the beep begin. */
const ZERO = REQUESTED_AT + 84;

/** The start sequence the screen is waiting on, once it has asked for one. */
type PendingStart = {
  options: StartSequenceOptions;
  resolve: (result: StartSequenceResult) => void;
  reject: (error: unknown) => void;
};

let pendingStart: PendingStart | undefined;
/** What the capture clock reads now. */
let captureNow = REQUESTED_AT - 3000;

const mounted: ReactTestRenderer[] = [];

/**
 * Mount the screen as a tab, the way the app does: it stops a run when its
 * tab loses focus, so it needs a navigator to tell it.
 */
const renderScreen = async ({
  calibrate = true,
}: { calibrate?: boolean } = {}) => {
  const navigationRef = createNavigationContainerRef<TestTabParamList>();
  let store: CalibrationContextValue | undefined;
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <CalibrationProvider>
          <StoreHandle
            onValue={value => {
              store = value;
            }}
          />
          <NavigationContainer ref={navigationRef}>
            <Tab.Navigator screenOptions={{ headerShown: false }}>
              <Tab.Screen name="Timer" component={TimerScreen} />
              <Tab.Screen name="Elsewhere" component={Blank} />
              <Tab.Screen name="SequenceEditor" component={Blank} />
            </Tab.Navigator>
          </NavigationContainer>
        </CalibrationProvider>
      </SafeAreaProvider>,
      // Host elements get a stand-in, so the screen has a ref to focus.
      { createNodeMock: () => ({}) },
    );
  });
  if (tree === undefined || store === undefined) {
    throw new Error('render failed');
  }
  mounted.push(tree);
  const { setThreshold } = store;
  if (calibrate) {
    act(() => {
      setThreshold('shot', -10);
      setThreshold('reload', -30);
      setThreshold('rack', -25);
    });
  }
  // The drills are read from storage before there is anything to time.
  await settle();
  return {
    tree,
    navigationRef,
    setThreshold: (...args: Parameters<typeof setThreshold>): void => {
      act(() => setThreshold(...args));
    },
    /** Switch to another tab, or back to the Timer. */
    goTo: async (tab: 'Timer' | 'Elsewhere'): Promise<void> => {
      await act(async () => {
        navigationRef.navigate(tab);
        await jest.advanceTimersByTimeAsync(0);
      });
    },
  };
};

const first = (tree: ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({ testID })[0];

const has = (tree: ReactTestRenderer, testID: string): boolean =>
  tree.root.findAllByProps({ testID }).length > 0;

const textsUnder = (node: ReactTestInstance): string[] =>
  node.children.flatMap(child =>
    typeof child === 'string' ? [child] : textsUnder(child),
  );

/** Every string under the element with this `testID`, in order. */
const textsOf = (tree: ReactTestRenderer, testID: string): string[] =>
  textsUnder(first(tree, testID));

/** Put the drill with this name on the timer, through the picker. */
const pick = async (tree: ReactTestRenderer, name: string): Promise<void> => {
  await act(async () => {
    first(tree, 'select-drill').props.onChange(drillIds[name]);
  });
  await settle();
};

const pickerLocked = (tree: ReactTestRenderer): boolean =>
  first(tree, 'select-drill').props.disabled === true;

const buttonLabel = (tree: ReactTestRenderer): string =>
  first(tree, 'btn-start').props.accessibilityLabel;

const subtitle = (tree: ReactTestRenderer): string =>
  first(tree, 'screen-timer').props.subtitle;

const elapsedText = (tree: ReactTestRenderer): string =>
  first(tree, 'text-elapsed').props.children;

const clockCaption = (tree: ReactTestRenderer): string =>
  first(tree, 'text-elapsed-caption').props.children;

/** One row of the Splits card, as the screen hands it to `ListRow`. */
const split = (tree: ReactTestRenderer, index: number) => {
  const {
    title,
    subtitle: line,
    value,
    valueColor,
    accessibilityLabel,
  } = first(tree, `row-split-${index}`).props;
  return { title, subtitle: line, value, valueColor, accessibilityLabel };
};

const timingNote = (tree: ReactTestRenderer): string | null => {
  const notes = tree.root.findAllByProps({ testID: 'text-run-timing' });
  return notes.length === 0 ? null : notes[0].props.children;
};

/** Let whatever a press started run until it next has to wait. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);
  });
};

const press = async (tree: ReactTestRenderer, testID: string) => {
  await act(async () => {
    first(tree, testID).props.onPress();
  });
  await settle();
};

/** Deliver a reading whose sound peaked (and began) at `at`. */
const hear = (at: number, peakDb: number, overrides: object = {}): void => {
  act(() => {
    DeviceEventEmitter.emit(AUDIO_AMPLITUDE_EVENT, {
      amplitude: 0.1,
      db: peakDb - 3,
      peak: 0.2,
      peakDb,
      timestamp: at + 5,
      peakTimestamp: at,
      onsetTimestamp: at,
      frameTimed: true,
      ...overrides,
    });
  });
};

/** The start sequence reaches its beep: the request is stamped, then it resolves. */
const beep = async (): Promise<void> => {
  const pending = pendingStart;
  if (pending === undefined) {
    throw new Error('the screen has not asked for a start sequence');
  }
  await act(async () => {
    captureNow = REQUESTED_AT;
    pending.options.onTrigger?.();
    pending.resolve({ startedAt: 0, delayMs: 2000 });
    await jest.advanceTimersByTimeAsync(0);
  });
};

/** Let the clock on screen redraw with the capture clock reading `now`. */
const tickAt = async (now: number): Promise<void> => {
  await act(async () => {
    captureNow = now;
    await jest.advanceTimersByTimeAsync(50);
  });
};

/** Press Start, sound the beep, and let the microphone hear it and the quiet after. */
const startRun = async (tree: ReactTestRenderer): Promise<void> => {
  await press(tree, 'btn-start');
  hear(REQUESTED_AT - 40, ROOM_DB);
  await beep();
  hear(ZERO, -20);
  hear(ZERO + 400, ROOM_DB);
};

/** A shot, and the quiet after it that lets the next one count. */
const shoot = (at: number): void => {
  hear(at, -4);
  hear(at + 23, ROOM_DB);
};

/** A rejection shaped like the one React Native builds from `promise.reject(code, message)`. */
const nativeRejection = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code });

describe('TimerScreen', () => {
  const originalPlatformOS = Platform.OS;
  let announce: jest.SpiedFunction<
    typeof AccessibilityInfo.announceForAccessibility
  >;
  let requestPermission: jest.SpiedFunction<typeof PermissionsAndroid.request>;
  let checkPermission: jest.SpiedFunction<typeof PermissionsAndroid.check>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });

    pendingStart = undefined;
    captureNow = REQUESTED_AT - 3000;
    startMock.mockReset();
    startMock.mockImplementation(
      (options = {}) =>
        new Promise<StartSequenceResult>((resolve, reject) => {
          pendingStart = { options, resolve, reject };
          options.signal?.addEventListener('abort', () =>
            reject(new StartSequenceAbortError()),
          );
        }),
    );
    prepareMock.mockReset();
    prepareMock.mockResolvedValue(undefined);

    mockedNativeAudioCapture.start.mockReset();
    mockedNativeAudioCapture.start.mockResolvedValue(undefined);
    mockedNativeAudioCapture.stop.mockReset();
    mockedNativeAudioCapture.stop.mockResolvedValue(undefined);
    mockedNativeAudioCapture.now.mockReset();
    mockedNativeAudioCapture.now.mockImplementation(() => captureNow);

    checkPermission = jest
      .spyOn(PermissionsAndroid, 'check')
      .mockResolvedValue(true);
    requestPermission = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    // A spy on the same function carries the calls of the test before it.
    announce.mockClear();

    await AsyncStorage.clear();
    await seedLibrary();
  });

  afterEach(() => {
    // Unmount, or the navigator's pending work outlives the test.
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
    jest.useRealTimers();
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatformOS,
      configurable: true,
    });
  });

  describe('before a run', () => {
    it('is ready to start', async () => {
      const { tree } = await renderScreen();

      expect(buttonLabel(tree)).toBe('Start timer');
      expect(subtitle(tree)).toBe('Ready when you are');
      expect(elapsedText(tree)).toBe(formatElapsed(0));
      expect(timingNote(tree)).toBeNull();
    });

    it('shows a silent step as counting towards the step after it', async () => {
      const { tree } = await renderScreen();

      expect(split(tree, 0)).toMatchObject({
        title: 'Draw',
        subtitle: 'par 1.50s, counted with the next step',
        value: '—',
        accessibilityLabel:
          'Draw, not timed. Its par of 1.5 seconds counts towards the next step',
      });
    });

    it('shows a heard step with the par it will be judged against', async () => {
      const { tree } = await renderScreen();

      // Its own 0.25 s plus the draw's 1.50 s.
      expect(split(tree, 1)).toMatchObject({
        title: 'Shot 1',
        subtitle: 'par 1.75s',
        value: '—',
        accessibilityLabel: 'Shot 1, par 1.75 seconds, not heard yet',
      });
    });

    it('shows a silent step with nothing heard after it as not timed', async () => {
      const { tree } = await renderScreen();

      // Mozambique ends on a holster.
      await pick(tree, 'Mozambique');

      expect(split(tree, 4)).toMatchObject({
        title: 'Holster',
        subtitle: 'not timed',
        accessibilityLabel: 'Holster, not timed',
      });
    });

    it('shows no par on a step that has none', async () => {
      const { tree } = await renderScreen();

      // Dot Torture: a rack with no par, straight after a shot with none.
      await pick(tree, 'Dot Torture');

      expect(split(tree, 6)).toMatchObject({
        title: 'Rack',
        subtitle: undefined,
        accessibilityLabel: 'Rack, no par, not heard yet',
      });
    });

    it('says so when the audio output could not be set up', async () => {
      prepareMock.mockRejectedValue(new Error('no audio'));

      const { tree } = await renderScreen();
      await settle();

      expect(subtitle(tree)).toBe('Audio unavailable');
    });
  });

  describe('starting', () => {
    it('opens the microphone before it starts the delay', async () => {
      const order: string[] = [];
      mockedNativeAudioCapture.start.mockImplementation(async () => {
        order.push('microphone');
      });
      startMock.mockImplementation(() => {
        order.push('delay');
        return new Promise(() => {});
      });
      const { tree } = await renderScreen();

      await press(tree, 'btn-start');

      expect(order).toEqual(['microphone', 'delay']);
      expect(buttonLabel(tree)).toBe('Cancel start');
      expect(subtitle(tree)).toBe('Stand by…');
      expect(elapsedText(tree)).toBe(formatElapsed(0));
    });

    it('names the sounds that still need calibrating and opens nothing', async () => {
      const { tree } = await renderScreen({ calibrate: false });

      await press(tree, 'btn-start');

      expect(subtitle(tree)).toBe('Calibrate Shot first');
      expect(buttonLabel(tree)).toBe('Start timer');
      expect(mockedNativeAudioCapture.start).not.toHaveBeenCalled();
      expect(startMock).not.toHaveBeenCalled();
      expect(announce).toHaveBeenCalledWith('Calibrate Shot first');
    });

    it('names every sound a drill needs that is not calibrated', async () => {
      const { tree, setThreshold } = await renderScreen({ calibrate: false });
      setThreshold('reload', -30);

      // Dot Torture uses shots, a reload and a rack.
      await pick(tree, 'Dot Torture');
      await press(tree, 'btn-start');

      expect(subtitle(tree)).toBe('Calibrate Shot and Rack first');
    });

    it('starts once the missing sound has been calibrated', async () => {
      const { tree, setThreshold } = await renderScreen({ calibrate: false });
      await press(tree, 'btn-start');

      setThreshold('shot', -10);
      await press(tree, 'btn-start');

      expect(buttonLabel(tree)).toBe('Cancel start');
      expect(subtitle(tree)).toBe('Stand by…');
    });

    it('asks for the microphone when it has not been granted', async () => {
      checkPermission.mockResolvedValue(false);
      const { tree } = await renderScreen();

      await press(tree, 'btn-start');

      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(buttonLabel(tree)).toBe('Cancel start');
    });

    it.each([
      [
        PermissionsAndroid.RESULTS.DENIED,
        'Microphone access is needed to time a run',
      ],
      [
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        'Microphone access is turned off. Allow it in Settings.',
      ],
    ])(
      'says what to do when the microphone is refused (%s)',
      async (answer, message) => {
        checkPermission.mockResolvedValue(false);
        requestPermission.mockResolvedValue(answer);
        const { tree } = await renderScreen();

        await press(tree, 'btn-start');

        expect(subtitle(tree)).toBe(message);
        expect(buttonLabel(tree)).toBe('Start timer');
        expect(mockedNativeAudioCapture.start).not.toHaveBeenCalled();
        expect(startMock).not.toHaveBeenCalled();
      },
    );

    it('says so when the microphone cannot be opened', async () => {
      mockedNativeAudioCapture.start.mockRejectedValue(
        nativeRejection('INIT_FAILED', 'AudioRecord failed to initialize'),
      );
      const { tree } = await renderScreen();

      await press(tree, 'btn-start');

      expect(subtitle(tree)).toBe('The microphone could not be used');
      expect(buttonLabel(tree)).toBe('Start timer');
      expect(startMock).not.toHaveBeenCalled();
    });

    it('cancels the start and closes the microphone when pressed during the wait', async () => {
      const { tree } = await renderScreen();
      await press(tree, 'btn-start');

      await press(tree, 'btn-start');

      expect(buttonLabel(tree)).toBe('Start timer');
      expect(subtitle(tree)).toBe('Ready when you are');
      expect(pendingStart?.options.signal?.aborted).toBe(true);
      expect(mockedNativeAudioCapture.stop).toHaveBeenCalled();
    });

    it('closes the microphone and says so when the beep cannot be played', async () => {
      startMock.mockRejectedValue(new StartSequenceError('no audio'));
      const { tree } = await renderScreen();

      await press(tree, 'btn-start');

      expect(subtitle(tree)).toBe('Could not play the start beep');
      expect(buttonLabel(tree)).toBe('Start timer');
      expect(mockedNativeAudioCapture.stop).toHaveBeenCalled();
    });

    it('goes back to ready when the app is left during the wait', async () => {
      const { tree } = await renderScreen();
      await press(tree, 'btn-start');

      act(() => {
        DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
          code: 'INTERRUPTED',
          message: 'left the app',
        });
      });
      await settle();

      expect(subtitle(tree)).toBe('The run stopped because the app was left');
      expect(buttonLabel(tree)).toBe('Start timer');
      // The beep must not sound for a run that is not listening.
      expect(pendingStart?.options.signal?.aborted).toBe(true);
    });
  });

  describe('during a run', () => {
    it('listens once the beep is requested', async () => {
      const { tree } = await renderScreen();
      await press(tree, 'btn-start');

      await beep();

      expect(buttonLabel(tree)).toBe('Stop timer');
      expect(subtitle(tree)).toBe('Listening…');
    });

    it('holds the clock at zero until the beep is heard', async () => {
      const { tree } = await renderScreen();
      await press(tree, 'btn-start');
      await beep();

      await tickAt(REQUESTED_AT + 60);

      expect(elapsedText(tree)).toBe(formatElapsed(0));
    });

    it('runs the clock from when the beep was heard, not when it was requested', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);

      await tickAt(ZERO + 1000);

      expect(elapsedText(tree)).toBe(formatElapsed(1));
    });

    it('fills in a step with its time and how it did against par when it is heard', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);

      shoot(ZERO + 1400);

      expect(split(tree, 1)).toEqual({
        title: 'Shot 1',
        subtitle: 'par 1.75s · 0.35s under',
        value: '1.40s',
        valueColor: 'success',
        accessibilityLabel:
          'Shot 1, par 1.75 seconds, took 1.4 seconds, 0.35 seconds under par',
      });
      expect(split(tree, 2).value).toBe('—');
    });

    it('words a step that ran over its par as over, not by colour alone', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);

      shoot(ZERO + 1400);
      shoot(ZERO + 1700);

      expect(split(tree, 2)).toEqual({
        title: 'Shot 2',
        subtitle: 'par 0.20s · 0.10s over',
        value: '0.30s',
        valueColor: 'danger',
        accessibilityLabel:
          'Shot 2, par 0.2 seconds, took 0.3 seconds, 0.1 seconds over par',
      });
    });

    it('words a step that landed on its par as on par', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);

      shoot(ZERO + 1750);

      expect(split(tree, 1)).toMatchObject({
        subtitle: 'par 1.75s · on par',
        valueColor: 'textSecondary',
        accessibilityLabel:
          'Shot 1, par 1.75 seconds, took 1.75 seconds, on par',
      });
    });

    it('shows the time of a step that has no par', async () => {
      const { tree } = await renderScreen();
      // Dot Torture: its shots have no par, so the first is judged against
      // the draw's 1.50 s alone and the second against nothing.
      await pick(tree, 'Dot Torture');
      await startRun(tree);

      shoot(ZERO + 1400);
      shoot(ZERO + 1900);

      expect(split(tree, 2)).toEqual({
        title: 'Shot 2',
        subtitle: undefined,
        value: '0.50s',
        valueColor: 'textSecondary',
        accessibilityLabel: 'Shot 2, no par, took 0.5 seconds',
      });
    });

    it('turns the clock to OVER PAR once the drill par has passed', async () => {
      const { tree } = await renderScreen();
      // Failure to Stop: 1.50 + 0.25 + 0.25 + 0.50 = 2.50 s.
      await pick(tree, 'Failure to Stop');
      await startRun(tree);

      await tickAt(ZERO + 2400);
      expect(clockCaption(tree)).toBe('SECONDS');

      await tickAt(ZERO + 2600);
      expect(clockCaption(tree)).toBe('OVER PAR');
    });
  });

  describe('when the run completes', () => {
    /** Failure to Stop: a draw and three shots. */
    const completeRun = async (tree: ReactTestRenderer): Promise<void> => {
      await pick(tree, 'Failure to Stop');
      await startRun(tree);
      shoot(ZERO + 1400);
      shoot(ZERO + 1700);
      shoot(ZERO + 2200);
      await settle();
    };

    it('stops on the last step and shows the run time', async () => {
      const { tree } = await renderScreen();

      await completeRun(tree);

      expect(buttonLabel(tree)).toBe('Start timer');
      expect(subtitle(tree)).toBe('Run complete');
      expect(elapsedText(tree)).toBe(formatElapsed(2.2));
      expect([1, 2, 3].map(index => split(tree, index).value)).toEqual([
        '1.40s',
        '0.30s',
        '0.50s',
      ]);
    });

    it('holds the run time however long the screen stays open', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);

      await tickAt(ZERO + 60_000);

      expect(elapsedText(tree)).toBe(formatElapsed(2.2));
    });

    it('closes the microphone', async () => {
      const { tree } = await renderScreen();

      await completeRun(tree);

      expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
    });

    it('says how the run was timed', async () => {
      const { tree } = await renderScreen();

      await completeRun(tree);

      expect(timingNote(tree)).toBe(
        "Timed from the start beep as it was heard, 84 ms after it was requested. Steps timed by the microphone hardware's own clock.",
      );
    });

    it('announces the run time, once', async () => {
      const { tree } = await renderScreen();

      await completeRun(tree);
      await tickAt(ZERO + 5000);

      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        'Run complete, 2.2 seconds. Save it or discard it',
      );
    });

    it('does not call a run over par when its time reads the same as the par', async () => {
      const { tree } = await renderScreen();
      // Failure to Stop has a par of 2.50 s.
      await pick(tree, 'Failure to Stop');
      await startRun(tree);

      shoot(ZERO + 1400);
      shoot(ZERO + 1700);
      shoot(ZERO + 2504);
      await settle();

      expect(elapsedText(tree)).toBe(formatElapsed(2.5));
      expect(clockCaption(tree)).toBe('SECONDS');
    });

    it('calls a run over par once its time reads a hundredth over', async () => {
      const { tree } = await renderScreen();
      await pick(tree, 'Failure to Stop');
      await startRun(tree);

      shoot(ZERO + 1400);
      shoot(ZERO + 1700);
      shoot(ZERO + 2506);
      await settle();

      expect(elapsedText(tree)).toBe(formatElapsed(2.51));
      expect(clockCaption(tree)).toBe('OVER PAR');
    });

    it('starts the next run on the clock at zero, not where the last one stopped', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);

      await press(tree, 'btn-start');
      hear(REQUESTED_AT - 40, ROOM_DB);
      await beep();

      // Running, and the clock has not ticked yet.
      expect(buttonLabel(tree)).toBe('Stop timer');
      expect(elapsedText(tree)).toBe(formatElapsed(0));
    });

    it('starts a fresh run from the finished one', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);

      await press(tree, 'btn-start');

      expect(buttonLabel(tree)).toBe('Cancel start');
      expect(elapsedText(tree)).toBe(formatElapsed(0));
      expect(split(tree, 1).value).toBe('—');
      expect(timingNote(tree)).toBeNull();
    });

    it('says so when the beep was not heard', async () => {
      const { tree } = await renderScreen();
      await pick(tree, 'Failure to Stop');
      await press(tree, 'btn-start');
      await beep();

      // Nothing but the room for the 600 ms the beep is given.
      hear(REQUESTED_AT + 150, ROOM_DB);
      hear(REQUESTED_AT + 620, ROOM_DB);
      shoot(REQUESTED_AT + 1400);
      shoot(REQUESTED_AT + 1700);
      shoot(REQUESTED_AT + 2200);
      await settle();

      expect(timingNote(tree)).toBe(
        "The start beep was not heard, so the run is timed from when it was requested and its first step may read long. Steps timed by the microphone hardware's own clock.",
      );
    });

    it('says so when the device has no exact microphone clock', async () => {
      const { tree } = await renderScreen();
      await pick(tree, 'Failure to Stop');
      await startRun(tree);

      hear(ZERO + 1400, -4, { frameTimed: false });
      hear(ZERO + 1423, ROOM_DB);
      shoot(ZERO + 1700);
      shoot(ZERO + 2200);
      await settle();

      expect(timingNote(tree)).toBe(
        'Timed from the start beep as it was heard, 84 ms after it was requested. This device gives no hardware microphone clock, so a step may be up to 20 ms off.',
      );
    });
  });

  describe('stopping a run', () => {
    it('keeps the steps that were heard when stopped early', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);

      await press(tree, 'btn-start');

      expect(buttonLabel(tree)).toBe('Start timer');
      expect(subtitle(tree)).toBe('Run stopped early');
      expect(elapsedText(tree)).toBe(formatElapsed(1.4));
      expect(split(tree, 1).value).toBe('1.40s');
      expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        'Run stopped early, 1 step heard. Save it or discard it',
      );
    });

    it('hears nothing after it is stopped', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      await press(tree, 'btn-start');

      shoot(ZERO + 1400);

      expect(split(tree, 1).value).toBe('—');
    });

    it('clears the run on Reset', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);

      await press(tree, 'btn-reset');

      expect(buttonLabel(tree)).toBe('Start timer');
      expect(subtitle(tree)).toBe('Ready when you are');
      expect(elapsedText(tree)).toBe(formatElapsed(0));
      expect(split(tree, 1).value).toBe('—');
      expect(timingNote(tree)).toBeNull();
      expect(mockedNativeAudioCapture.stop).toHaveBeenCalled();
    });

    it('does not let a drill be picked while a run is on', async () => {
      const { tree } = await renderScreen();

      await press(tree, 'btn-start');
      // Waiting for the beep, then running: a stray touch must not end it.
      expect(pickerLocked(tree)).toBe(true);

      hear(REQUESTED_AT - 40, ROOM_DB);
      await beep();
      expect(pickerLocked(tree)).toBe(true);

      await press(tree, 'btn-start');
      expect(pickerLocked(tree)).toBe(false);
    });

    it('clears the finished run when another drill is picked', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);
      await press(tree, 'btn-start');

      await pick(tree, 'Failure to Stop');

      expect(subtitle(tree)).toBe('Ready when you are');
      expect(elapsedText(tree)).toBe(formatElapsed(0));
      expect(split(tree, 1).value).toBe('—');
      expect(timingNote(tree)).toBeNull();
    });

    it('keeps the finished run when the drill already picked is pressed again', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);
      await press(tree, 'btn-start');

      await pick(tree, 'Bill Drill');

      expect(subtitle(tree)).toBe('Run stopped early');
      expect(split(tree, 1).value).toBe('1.40s');
    });

    it('finishes the run once when Stop is pressed twice', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);

      await act(async () => {
        first(tree, 'btn-start').props.onPress();
        first(tree, 'btn-start').props.onPress();
      });
      await settle();

      expect(subtitle(tree)).toBe('Run stopped early');
      expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(startMock).toHaveBeenCalledTimes(1);
    });

    it('hears nothing after a Reset in the middle of a run', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      await press(tree, 'btn-reset');

      shoot(ZERO + 1400);
      await settle();

      expect(subtitle(tree)).toBe('Ready when you are');
      expect(split(tree, 1).value).toBe('—');
    });

    it('ends the run with what was heard when the app is left', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);

      act(() => {
        DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
          code: 'INTERRUPTED',
          message: 'left the app',
        });
      });
      await settle();

      expect(subtitle(tree)).toBe('The run stopped because the app was left');
      expect(buttonLabel(tree)).toBe('Start timer');
      expect(split(tree, 1).value).toBe('1.40s');
      expect(elapsedText(tree)).toBe(formatElapsed(1.4));
    });

    it('ends the run when the Timer tab is left, and still shows it on return', async () => {
      const { tree, goTo } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);

      await goTo('Elsewhere');
      expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
      // Nothing is said over the tab the shooter went to.
      expect(announce).not.toHaveBeenCalled();

      await goTo('Timer');
      expect(subtitle(tree)).toBe('Run stopped early');
      expect(split(tree, 1).value).toBe('1.40s');
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        'Run stopped early, 1 step heard. Save it or discard it',
      );
    });

    it('says why and what was heard in one announcement when the app is left mid-run', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);
      shoot(ZERO + 1400);

      act(() => {
        DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
          code: 'INTERRUPTED',
          message: 'left the app',
        });
      });
      await settle();

      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(
        'The run stopped because the app was left. Run stopped early, 1 step heard. Save it or discard it',
      );
    });

    it('cancels a start that is still waiting when the Timer tab is left', async () => {
      const { tree, goTo } = await renderScreen();
      await press(tree, 'btn-start');

      await goTo('Elsewhere');
      await goTo('Timer');

      expect(pendingStart?.options.signal?.aborted).toBe(true);
      expect(buttonLabel(tree)).toBe('Start timer');
      expect(subtitle(tree)).toBe('Ready when you are');
    });

    it('closes the microphone when the screen goes away mid-run', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);

      await act(async () => {
        mounted.splice(0).forEach(rendered => rendered.unmount());
        await jest.advanceTimersByTimeAsync(0);
      });

      expect(tree.toJSON()).toBeNull();
      expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('the drill library', () => {
    it('puts the drill changed most recently on the timer', async () => {
      const { tree } = await renderScreen();

      expect(first(tree, 'select-drill').props.value).toBe(
        drillIds['Bill Drill'],
      );
      expect(split(tree, 6).title).toBe('Shot 6');
    });

    it('offers every stored drill, with its shots and par', async () => {
      const { tree } = await renderScreen();

      const options = first(tree, 'select-drill').props.options;
      expect(options).toHaveLength(LIBRARY.length);
      expect(options[0]).toEqual({
        value: drillIds['Bill Drill'],
        label: 'Bill Drill',
        description: '6 shots · Par 2.75s',
      });
    });

    it('says it is reading the drills until storage answers', async () => {
      const getAll = jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockImplementation(() => new Promise(() => {}));

      const { tree } = await renderScreen();

      expect(has(tree, 'text-timer-drills-loading')).toBe(true);
      expect(has(tree, 'btn-start')).toBe(false);
      getAll.mockRestore();
    });

    it('sends the shooter to create a drill when there is none', async () => {
      await AsyncStorage.clear();
      const { tree, navigationRef } = await renderScreen();

      expect(has(tree, 'state-timer-drills-empty')).toBe(true);
      expect(has(tree, 'btn-start')).toBe(false);
      expect(subtitle(tree)).toBe('Create a drill to start');

      await act(async () => {
        first(tree, 'state-timer-drills-empty')
          .findAllByProps({ accessibilityRole: 'button' })[0]
          .props.onPress();
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(navigationRef.getCurrentRoute()?.name).toBe('SequenceEditor');
    });

    it('offers to read the drills again when they cannot be read', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('disk'));

      const { tree } = await renderScreen();
      expect(has(tree, 'state-timer-drills-error')).toBe(true);

      await act(async () => {
        first(tree, 'state-timer-drills-error')
          .findAllByProps({ accessibilityRole: 'button' })[0]
          .props.onPress();
      });
      await settle();

      expect(has(tree, 'state-timer-drills-error')).toBe(false);
      expect(has(tree, 'btn-start')).toBe(true);
    });

    it('shows a drill created on another tab when it comes back', async () => {
      const { tree, goTo } = await renderScreen();
      await goTo('Elsewhere');

      const made = await saveDrill(
        { name: 'Box Drill', steps: [{ type: 'shot', par: 2 }] },
        { getTimestamp: () => '2026-10-02T08:00:00.000Z' },
      );
      await goTo('Timer');
      await settle();

      expect(first(tree, 'select-drill').props.value).toBe(made.id);
    });

    it('runs the drill that was picked', async () => {
      const { tree } = await renderScreen();
      await pick(tree, 'Failure to Stop');

      await startRun(tree);
      shoot(ZERO + 1400);
      shoot(ZERO + 1700);
      shoot(ZERO + 2200);
      await settle();

      expect(subtitle(tree)).toBe('Run complete');
    });
  });

  describe('saving a run', () => {
    /** Failure to Stop, start to finish: 2.20 s over three shots. */
    const completeRun = async (tree: ReactTestRenderer): Promise<void> => {
      await pick(tree, 'Failure to Stop');
      await startRun(tree);
      shoot(ZERO + 1400);
      shoot(ZERO + 1700);
      shoot(ZERO + 2200);
      await settle();
    };

    /** Failure to Stop, stopped after its first shot. */
    const stoppedRun = async (tree: ReactTestRenderer): Promise<void> => {
      await pick(tree, 'Failure to Stop');
      await startRun(tree);
      shoot(ZERO + 1400);
      await press(tree, 'btn-start');
    };

    it('offers to save a run when it completes, and stores nothing until asked', async () => {
      const { tree } = await renderScreen();

      await completeRun(tree);

      expect(textsOf(tree, 'card-save-run')).toEqual([
        'Save this run?',
        '2.20s · 3 steps heard.',
        'Discard',
        'Save run',
      ]);
      expect(await loadSessions()).toEqual([]);
    });

    it('offers nothing before a run has finished', async () => {
      const { tree } = await renderScreen();
      expect(has(tree, 'card-save-run')).toBe(false);

      await startRun(tree);
      shoot(ZERO + 1400);

      expect(has(tree, 'card-save-run')).toBe(false);
    });

    it('stores the run against its drill, each step named and judged as it was shown', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);

      await press(tree, 'btn-save-run');

      const [session] = await loadSessions();
      expect(session).toMatchObject({
        drillId: drillIds['Failure to Stop'],
        totalTime: 2.2,
        completed: true,
        splits: [
          { label: 'Shot 1', par: 1.75, actual: 1.4, delta: -0.35 },
          { label: 'Shot 2', par: 0.25, actual: 0.3, delta: 0.05 },
          { label: 'Shot 3', par: 0.5, actual: 0.5, delta: 0 },
        ],
      });
    });

    it('says the run is saved, and announces it', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);
      announce.mockClear();

      await press(tree, 'btn-save-run');

      expect(textsOf(tree, 'card-save-run')).toEqual(['Saved to History']);
      expect(announce).toHaveBeenCalledWith('Run saved to History');
      // The run stays on show.
      expect(elapsedText(tree)).toBe(formatElapsed(2.2));
    });

    it('saves a run once however often Save is pressed', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);

      await act(async () => {
        first(tree, 'btn-save-run').props.onPress();
        first(tree, 'btn-save-run').props.onPress();
      });
      await settle();

      expect(await loadSessions()).toHaveLength(1);
    });

    it('offers to save a run stopped early as incomplete', async () => {
      const { tree } = await renderScreen();

      await stoppedRun(tree);

      expect(first(tree, 'btn-save-run').props.label).toBe(
        'Save as incomplete',
      );
      expect(textsOf(tree, 'text-save-run-summary')).toEqual([
        'Stopped early at 1.40s: 1 of 3 steps heard. It is kept as incomplete and left out of your best and average.',
      ]);
    });

    it('stores a run stopped early marked as incomplete', async () => {
      const { tree } = await renderScreen();
      await stoppedRun(tree);
      announce.mockClear();

      await press(tree, 'btn-save-run');

      const [session] = await loadSessions();
      expect(session).toMatchObject({
        totalTime: 1.4,
        completed: false,
        splits: [{ label: 'Shot 1', actual: 1.4 }],
      });
      expect(textsOf(tree, 'card-save-run')).toEqual([
        'Saved to History as incomplete',
      ]);
      expect(announce).toHaveBeenCalledWith(
        'Run saved to History as incomplete',
      );
    });

    it('offers to save a run ended by leaving the tab, once back', async () => {
      const { tree, goTo } = await renderScreen();
      await pick(tree, 'Failure to Stop');
      await startRun(tree);
      shoot(ZERO + 1400);

      await goTo('Elsewhere');
      await goTo('Timer');
      await press(tree, 'btn-save-run');

      expect(await loadSessions()).toEqual([
        expect.objectContaining({ completed: false, totalTime: 1.4 }),
      ]);
    });

    it('has nothing to save when nothing was heard', async () => {
      const { tree } = await renderScreen();
      await startRun(tree);

      await press(tree, 'btn-start');

      expect(has(tree, 'card-save-run')).toBe(false);
      expect(has(tree, 'text-nothing-to-save')).toBe(true);
      expect(announce).toHaveBeenCalledWith('Run stopped early, nothing heard');
    });

    it('drops the run on Discard and stores nothing', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);
      announce.mockClear();

      await press(tree, 'btn-discard-run');

      expect(await loadSessions()).toEqual([]);
      expect(has(tree, 'card-save-run')).toBe(false);
      expect(subtitle(tree)).toBe('Ready when you are');
      expect(elapsedText(tree)).toBe(formatElapsed(0));
      expect(announce).toHaveBeenCalledWith('Run discarded');
    });

    it('drops an unsaved run when the next one starts, and offers the new one', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);

      await startRun(tree);
      shoot(ZERO + 1400);
      await press(tree, 'btn-start');

      expect(await loadSessions()).toEqual([]);
      expect(first(tree, 'btn-save-run').props.label).toBe(
        'Save as incomplete',
      );
    });

    it('offers the next run for saving after one was saved', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);
      await press(tree, 'btn-save-run');

      await startRun(tree);
      shoot(ZERO + 1400);
      await press(tree, 'btn-start');

      expect(textsOf(tree, 'card-save-run')[0]).toBe('Save this run?');
      await press(tree, 'btn-save-run');
      expect(await loadSessions()).toHaveLength(2);
    });

    it('keeps the run and says so when it cannot be saved, then saves on a retry', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('disk full'));

      await press(tree, 'btn-save-run');

      expect(textsOf(tree, 'text-save-run-error')).toEqual([
        'Could not save this run. Try again.',
      ]);
      expect(first(tree, 'btn-save-run').props.disabled).toBe(false);
      expect(await loadSessions()).toEqual([]);

      await press(tree, 'btn-save-run');

      expect(await loadSessions()).toHaveLength(1);
      expect(has(tree, 'text-save-run-error')).toBe(false);
    });

    it('holds the run still while it is being saved', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockImplementationOnce(() => new Promise(() => {}));

      await press(tree, 'btn-save-run');

      expect(first(tree, 'btn-save-run').props).toMatchObject({
        label: 'Saving…',
        disabled: true,
      });
      expect(first(tree, 'btn-discard-run').props.disabled).toBe(true);
      expect(first(tree, 'btn-start').props.disabled).toBe(true);
      expect(first(tree, 'btn-reset').props.disabled).toBe(true);
      expect(pickerLocked(tree)).toBe(true);
    });

    it('drops an unsaved run when another drill is picked', async () => {
      const { tree } = await renderScreen();
      await completeRun(tree);

      await pick(tree, 'Mozambique');

      expect(has(tree, 'card-save-run')).toBe(false);
      expect(await loadSessions()).toEqual([]);
    });

    it('drops an unsaved run whose drill was deleted on another tab', async () => {
      const { tree, goTo } = await renderScreen();
      await completeRun(tree);

      await goTo('Elsewhere');
      await deleteDrillById(drillIds['Failure to Stop']);
      await goTo('Timer');
      await settle();

      expect(has(tree, 'card-save-run')).toBe(false);
      expect(subtitle(tree)).toBe('Ready when you are');
      expect(announce).toHaveBeenCalledWith(
        'Run discarded: its drill was deleted',
      );
    });

    it('keeps a saved run on show when its drill is deleted afterwards', async () => {
      const { tree, goTo } = await renderScreen();
      await completeRun(tree);
      await press(tree, 'btn-save-run');

      await goTo('Elsewhere');
      await deleteDrillById(drillIds['Failure to Stop']);
      await goTo('Timer');
      await settle();

      expect(textsOf(tree, 'card-save-run')).toEqual(['Saved to History']);
      expect(elapsedText(tree)).toBe(formatElapsed(2.2));
    });

    it('puts a screen reader on the Start button once the run is saved or discarded', async () => {
      const focus = jest
        .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
        .mockImplementation(() => {});
      // A spy on the same function carries the calls of the tests before.
      focus.mockClear();
      const { tree } = await renderScreen();
      await completeRun(tree);

      await press(tree, 'btn-save-run');
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus).toHaveBeenLastCalledWith(expect.anything(), 'focus');

      await completeRun(tree);
      await press(tree, 'btn-discard-run');
      expect(focus).toHaveBeenCalledTimes(2);
    });

    it('saves the run as it was shown when its drill was edited meanwhile', async () => {
      const { tree, goTo } = await renderScreen();
      await completeRun(tree);

      await goTo('Elsewhere');
      // The first shot is made a reload, which would rename every shot.
      const id = drillIds['Failure to Stop'];
      const drill = await loadDrillById(id);
      await updateDrill(id, {
        steps: (drill?.steps ?? []).map((step, index) =>
          index === 1 ? { ...step, type: 'reload' } : step,
        ),
      });
      await goTo('Timer');
      await settle();

      expect(split(tree, 1).title).toBe('Shot 1');
      await press(tree, 'btn-save-run');

      const [session] = await loadSessions();
      expect(session.splits.map(item => item.label)).toEqual([
        'Shot 1',
        'Shot 2',
        'Shot 3',
      ]);
    });
  });
});
