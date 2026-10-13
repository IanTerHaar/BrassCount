import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useCalibration } from '../src/hooks/useCalibration';
import { useDrillRun, type UseDrillRunResult } from '../src/hooks/useDrillRun';
import { AUDIO_AMPLITUDE_EVENT } from '../src/services/audioCapture';
import { DrillRunError } from '../src/services/drillRunEngine';
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
import type { DrillStep } from '../src/types/drill';

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
const releaseMock = jest.mocked(StartSequenceService.release);
// The native module itself is mocked globally in jest.setup.js.
const mockedNativeAudioCapture = jest.mocked(NativeAudioCapture);

const Tab = createBottomTabNavigator<{ Probe: undefined }>();

const ROOM_DB = -70;
const REQUESTED_AT = 50_000;
const ZERO = REQUESTED_AT + 84;

const TWO_SHOTS: DrillStep[] = [
  { id: 'a', type: 'shot', par: 1.5 },
  { id: 'b', type: 'shot' },
];

type PendingStart = {
  options: StartSequenceOptions;
  resolve: (result: StartSequenceResult) => void;
};

let pendingStarts: PendingStart[] = [];
let captureNow = REQUESTED_AT - 3000;

const mounted: ReactTestRenderer[] = [];

/** Mount the hook on a screen of its own, with the store it reads from. */
const renderHook = () => {
  let hook: UseDrillRunResult | undefined;
  let store: CalibrationContextValue | undefined;
  const Probe = () => {
    hook = useDrillRun();
    store = useCalibration();
    return null;
  };
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <CalibrationProvider>
        <NavigationContainer>
          <Tab.Navigator screenOptions={{ headerShown: false }}>
            <Tab.Screen name="Probe" component={Probe} />
          </Tab.Navigator>
        </NavigationContainer>
      </CalibrationProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  mounted.push(tree);
  const read = (): UseDrillRunResult => {
    if (hook === undefined) {
      throw new Error('the hook has not rendered');
    }
    return hook;
  };
  const calibrate = (thresholdDbfs = -10): void => {
    act(() => store?.setThreshold('shot', thresholdDbfs));
  };
  calibrate();
  return { tree, read, calibrate };
};

const settle = async (): Promise<void> => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);
  });
};

const hear = (at: number, peakDb: number): void => {
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
    });
  });
};

/** The newest start sequence reaches its beep. */
const beep = async (): Promise<void> => {
  const pending = pendingStarts[pendingStarts.length - 1];
  await act(async () => {
    captureNow = REQUESTED_AT;
    pending.options.onTrigger?.();
    pending.resolve({ startedAt: 0, delayMs: 2000 });
    await jest.advanceTimersByTimeAsync(0);
  });
};

/** Start a run and take it to where its beep has been heard. */
const startRun = async (read: () => UseDrillRunResult): Promise<void> => {
  act(() => read().start(TWO_SHOTS));
  await settle();
  hear(REQUESTED_AT - 40, ROOM_DB);
  await beep();
  hear(ZERO, -20);
  hear(ZERO + 400, ROOM_DB);
};

describe('useDrillRun', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
    pendingStarts = [];
    captureNow = REQUESTED_AT - 3000;
    startMock.mockReset();
    startMock.mockImplementation(
      (options = {}) =>
        new Promise<StartSequenceResult>((resolve, reject) => {
          pendingStarts.push({ options, resolve });
          options.signal?.addEventListener('abort', () =>
            reject(new StartSequenceAbortError()),
          );
        }),
    );
    releaseMock.mockClear();
    mockedNativeAudioCapture.start.mockReset();
    mockedNativeAudioCapture.start.mockResolvedValue(undefined);
    mockedNativeAudioCapture.stop.mockReset();
    mockedNativeAudioCapture.stop.mockResolvedValue(undefined);
    mockedNativeAudioCapture.now.mockReset();
    mockedNativeAudioCapture.now.mockImplementation(() => captureNow);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
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

  it('starts idle, with nothing heard', () => {
    const { read } = renderHook();

    expect(read()).toMatchObject({
      phase: 'idle',
      results: [],
      result: null,
      failure: null,
    });
    expect(read().readElapsed()).toBe(0);
  });

  it('moves through arming, waiting and running to finished', async () => {
    const { read } = renderHook();

    act(() => read().start(TWO_SHOTS));
    expect(read().phase).toBe('arming');

    await settle();
    expect(read().phase).toBe('waiting');

    await beep();
    expect(read().phase).toBe('running');

    hear(ZERO, -20);
    hear(ZERO + 400, ROOM_DB);
    hear(ZERO + 1402, -4);
    expect(read().results).toEqual([
      { stepId: 'a', par: 1.5, actual: 1.402, delta: -0.098 },
    ]);

    hear(ZERO + 1425, ROOM_DB);
    hear(ZERO + 1633, -4);
    expect(read().phase).toBe('finished');
    expect(read().result).toMatchObject({
      completed: true,
      totalTime: 1.633,
      zeroSource: 'beep',
      beepDelayMs: 84,
    });
    expect(read().results).toHaveLength(2);
  });

  it('listens with the thresholds as they are when the run starts', async () => {
    const { read, calibrate } = renderHook();
    await startRun(read);

    // Recalibrated mid-run: the run keeps the -10 it started with.
    calibrate(-2);
    hear(ZERO + 1402, -4);

    expect(read().results).toHaveLength(1);
  });

  it('reads the time since the zero point off the capture clock', async () => {
    const { read } = renderHook();
    act(() => read().start(TWO_SHOTS));
    await settle();
    await beep();

    // The beep has been requested but not heard yet.
    captureNow = REQUESTED_AT + 50;
    expect(read().readElapsed()).toBe(0);

    hear(ZERO, -20);
    captureNow = ZERO + 1250;
    expect(read().readElapsed()).toBe(1.25);
  });

  it('holds the elapsed time at zero when the capture clock cannot be read', async () => {
    const { read } = renderHook();
    await startRun(read);

    mockedNativeAudioCapture.now.mockImplementation(() => {
      throw new Error('no clock');
    });

    expect(read().readElapsed()).toBe(0);
  });

  it('drops a run that a newer start replaces', async () => {
    const { read } = renderHook();
    act(() => read().start(TWO_SHOTS));
    await settle();

    act(() => read().start(TWO_SHOTS));
    await settle();

    // The first run was cancelled and its microphone closed.
    expect(pendingStarts[0].options.signal?.aborted).toBe(true);
    expect(mockedNativeAudioCapture.stop).toHaveBeenCalled();
    expect(read().phase).toBe('waiting');
    expect(pendingStarts).toHaveLength(2);
  });

  it('clears the last failure when a new run starts', async () => {
    mockedNativeAudioCapture.start.mockRejectedValueOnce(new Error('busy'));
    const { read } = renderHook();
    act(() => read().start(TWO_SHOTS));
    await settle();
    expect(read().failure).toEqual({ kind: 'microphone' });

    act(() => read().start(TWO_SHOTS));

    expect(read().failure).toBeNull();
    await settle();
  });

  it('starts with the thresholds of the moment, not those it was mounted with', async () => {
    const { read, calibrate } = renderHook();
    calibrate(-2);
    await startRun(read);

    // Loud enough for the -10 the hook was mounted with, not for the -2 now.
    hear(ZERO + 1402, -4);

    expect(read().results).toEqual([]);
  });

  it('finishes the run, and says the microphone failed, when it will not close on stop', async () => {
    const { read } = renderHook();
    await startRun(read);
    hear(ZERO + 1402, -4);
    mockedNativeAudioCapture.stop.mockRejectedValue(new Error('close failed'));

    act(() => read().stop());
    await settle();

    expect(read().phase).toBe('finished');
    expect(read().failure).toEqual({ kind: 'microphone' });
    expect(read().result).toMatchObject({
      completed: false,
      results: [{ stepId: 'a', actual: 1.402 }],
    });
  });

  it('finishes once, and closes the microphone once, when stopped twice', async () => {
    let finishClosing: () => void = () => {};
    const { read } = renderHook();
    await startRun(read);
    hear(ZERO + 1402, -4);
    mockedNativeAudioCapture.stop.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishClosing = resolve;
        }),
    );

    act(() => {
      read().stop();
      read().stop();
    });
    // Still closing: the run is not shown as finished yet.
    expect(read().phase).toBe('running');

    await act(async () => {
      finishClosing();
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(read().phase).toBe('finished');
    expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
  });

  it('opens the microphone for a new run only after a cancelled one has let go of it', async () => {
    const opening: (() => void)[] = [];
    mockedNativeAudioCapture.start.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          opening.push(resolve);
        }),
    );
    const { read } = renderHook();

    // Start, cancel while the microphone is still opening, start again.
    act(() => read().start(TWO_SHOTS));
    await settle();
    act(() => read().stop());
    act(() => read().start(TWO_SHOTS));
    await settle();

    // The second run has not asked for the microphone yet.
    expect(mockedNativeAudioCapture.start).toHaveBeenCalledTimes(1);

    await act(async () => {
      opening[0]();
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(0);
    });

    // Now it has, and nothing closed the microphone after that.
    expect(mockedNativeAudioCapture.start).toHaveBeenCalledTimes(2);
    const lastStop = Math.max(
      ...mockedNativeAudioCapture.stop.mock.invocationCallOrder,
    );
    const secondStart =
      mockedNativeAudioCapture.start.mock.invocationCallOrder[1];
    expect(lastStop).toBeLessThan(secondStart);
  });

  it('says there is nothing to listen for in a drill with no heard step', async () => {
    const { read } = renderHook();

    act(() => read().start([{ id: 'd', type: 'draw', par: 1.5 }]));
    await settle();

    expect(read().phase).toBe('idle');
    expect(read().failure).toEqual({ kind: 'no-steps' });
    expect(mockedNativeAudioCapture.start).not.toHaveBeenCalled();
  });

  it('reports a run that could not begin as a microphone failure, not a beep failure', async () => {
    startMock.mockRejectedValue(
      new StartSequenceError(
        'The start callback failed',
        new DrillRunError('no clock', undefined, 'CAPTURE_FAILED'),
      ),
    );
    const { read } = renderHook();

    act(() => read().start(TWO_SHOTS));
    await settle();

    expect(read().failure).toEqual({ kind: 'microphone' });
  });

  it('reports a beep that could not be played as a beep failure', async () => {
    startMock.mockRejectedValue(new StartSequenceError('no audio'));
    const { read } = renderHook();

    act(() => read().start(TWO_SHOTS));
    await settle();

    expect(read().failure).toEqual({ kind: 'beep' });
  });

  it('cancels the start and closes the microphone when the screen goes away during the wait', async () => {
    const { read } = renderHook();
    act(() => read().start(TWO_SHOTS));
    await settle();
    expect(read().phase).toBe('waiting');

    await act(async () => {
      mounted.splice(0).forEach(tree => tree.unmount());
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(pendingStarts[0].options.signal?.aborted).toBe(true);
    expect(mockedNativeAudioCapture.stop).toHaveBeenCalled();
  });

  it('does nothing when stopped with no run', () => {
    const { read } = renderHook();

    act(() => read().stop());

    expect(read().phase).toBe('idle');
    expect(mockedNativeAudioCapture.stop).not.toHaveBeenCalled();
  });

  it('cancels a run that is still opening the microphone on reset', async () => {
    let finishOpening: () => void = () => {};
    mockedNativeAudioCapture.start.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishOpening = resolve;
        }),
    );
    const { read } = renderHook();
    act(() => read().start(TWO_SHOTS));
    await settle();

    act(() => read().reset());
    await act(async () => {
      finishOpening();
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(read().phase).toBe('idle');
    expect(startMock).not.toHaveBeenCalled();
    expect(mockedNativeAudioCapture.stop).toHaveBeenCalled();
  });

  it('releases the audio output when the screen goes away', () => {
    renderHook();

    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });

    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
