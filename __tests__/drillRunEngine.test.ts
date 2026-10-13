import { AudioCaptureError } from '../src/services/audioCapture';
import {
  DrillRunAbortError,
  DrillRunEngine,
  DrillRunError,
  createDrillRun,
  type DrillRun,
  type DrillRunAudio,
} from '../src/services/drillRunEngine';
import type { AmplitudeReading } from '../src/types/audio';
import type {
  CalibrationState,
  SoundCalibration,
} from '../src/types/calibration';
import type { DrillStep } from '../src/types/drill';
import type { RunResult, RunZero, StepDetection } from '../src/types/run';

const calibrated = (thresholdDbfs: number): SoundCalibration => ({
  status: 'calibrated',
  thresholdDbfs,
  lastTestDbfs: null,
});

const uncalibrated: SoundCalibration = {
  status: 'uncalibrated',
  thresholdDbfs: null,
  lastTestDbfs: null,
};

const calibration = (
  overrides: Partial<CalibrationState> = {},
): CalibrationState => ({
  shot: calibrated(-10),
  reload: calibrated(-30),
  rack: calibrated(-25),
  ...overrides,
});

/** Draw, two shots: the first shot is due 1.75 s after the start. */
const DRILL: DrillStep[] = [
  { id: 'draw', type: 'draw', par: 1.5 },
  { id: 'shot-1', type: 'shot', par: 0.25 },
  { id: 'shot-2', type: 'shot', par: 0.2 },
];

const ROOM_DB = -70;
/** What the capture clock reads when the beep is requested. */
const REQUESTED_AT = 50_000;
/** When the microphone hears the beep begin. */
const ZERO = REQUESTED_AT + 84;

/** A reading the engine takes: a shot, 1.402 s after the beep. */
const WELL_FORMED = {
  db: -17,
  peakDb: -2,
  timestamp: ZERO + 1420,
  peakTimestamp: ZERO + 1402,
  onsetTimestamp: ZERO + 1402,
  frameTimed: true,
};

type FakeAudio = {
  audio: jest.Mocked<DrillRunAudio>;
  /** Deliver a reading whose sound peaked (and began) at `at`. */
  hear: (at: number, peakDb: number, overrides?: object) => void;
  /** Deliver whatever crossed the bridge, well formed or not. */
  emit: (reading: unknown) => void;
  /** Stop the stream on its own, as the native module reports it. */
  breakStream: (error: AudioCaptureError) => void;
  /** Listeners still attached to either stream. */
  listenerCount: () => number;
  /** What the capture clock reads now. */
  setNow: (now: number) => void;
};

const createFakeAudio = (): FakeAudio => {
  const amplitudeListeners = new Set<(reading: AmplitudeReading) => void>();
  const errorListeners = new Set<(error: AudioCaptureError) => void>();
  let now = REQUESTED_AT;

  const audio: jest.Mocked<DrillRunAudio> = {
    hasPermission: jest.fn(async () => true),
    requestPermission: jest.fn(async () => 'granted' as const),
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    now: jest.fn(() => now),
    subscribeToAmplitude: jest.fn(listener => {
      amplitudeListeners.add(listener);
      return () => {
        amplitudeListeners.delete(listener);
      };
    }),
    subscribeToErrors: jest.fn(listener => {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    }),
  };

  const emit = (reading: unknown): void => {
    [...amplitudeListeners].forEach(listener =>
      listener(reading as AmplitudeReading),
    );
  };

  return {
    audio,
    emit,
    hear: (at, peakDb, overrides = {}) =>
      emit({
        amplitude: 0.1,
        db: peakDb - 3,
        peak: 0.2,
        peakDb,
        timestamp: at + 5,
        peakTimestamp: at,
        onsetTimestamp: at,
        frameTimed: true,
        ...overrides,
      }),
    breakStream: error => {
      [...errorListeners].forEach(listener => listener(error));
    },
    listenerCount: () => amplitudeListeners.size + errorListeners.size,
    setNow: value => {
      now = value;
    },
  };
};

type Recorded = {
  zeros: RunZero[];
  steps: StepDetection[];
  completions: RunResult[];
  errors: DrillRunError[];
};

const record = (run: DrillRun): Recorded => {
  const recorded: Recorded = {
    zeros: [],
    steps: [],
    completions: [],
    errors: [],
  };
  run.on('zero', zero => recorded.zeros.push(zero));
  run.on('stepDetected', step => recorded.steps.push(step));
  run.on('runComplete', result => recorded.completions.push(result));
  run.on('error', error => recorded.errors.push(error));
  return recorded;
};

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected the promise to reject');
};

const thrownBy = (action: () => void): unknown => {
  try {
    action();
  } catch (err) {
    return err;
  }
  throw new Error('Expected the call to throw');
};

/** A run that is armed, begun, and has heard its beep and the quiet after it. */
const startedRun = async (
  steps: readonly DrillStep[] = DRILL,
): Promise<{ fake: FakeAudio; run: DrillRun; recorded: Recorded }> => {
  const fake = createFakeAudio();
  const run = createDrillRun({
    steps,
    calibration: calibration(),
    beepMs: 300,
    audio: fake.audio,
  });
  const recorded = record(run);
  await run.arm();
  fake.hear(REQUESTED_AT - 40, ROOM_DB);
  run.begin();
  fake.hear(ZERO, -20);
  fake.hear(ZERO + 400, ROOM_DB);
  return { fake, run, recorded };
};

describe('createDrillRun', () => {
  it('plans around the steps it cannot hear', () => {
    const run = createDrillRun({ steps: DRILL, calibration: calibration() });

    expect(run.steps).toEqual([
      { stepId: 'shot-1', sound: 'shot', par: 1.75 },
      { stepId: 'shot-2', sound: 'shot', par: 0.2 },
    ]);
  });

  it('opens nothing until it is armed', () => {
    const fake = createFakeAudio();

    createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      audio: fake.audio,
    });

    expect(fake.audio.hasPermission).not.toHaveBeenCalled();
    expect(fake.audio.start).not.toHaveBeenCalled();
    expect(fake.listenerCount()).toBe(0);
  });

  it('is what the service handle creates', () => {
    expect(DrillRunEngine.create).toBe(createDrillRun);
  });
});

describe('arm', () => {
  const newRun = (
    fake: FakeAudio,
    overrides: Partial<Parameters<typeof createDrillRun>[0]> = {},
  ): DrillRun =>
    createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      audio: fake.audio,
      ...overrides,
    });

  it('opens the microphone with both streams already subscribed', async () => {
    const fake = createFakeAudio();
    let listenersAtStart = -1;
    fake.audio.start.mockImplementation(async () => {
      listenersAtStart = fake.listenerCount();
    });

    await newRun(fake).arm();

    expect(fake.audio.start).toHaveBeenCalledTimes(1);
    expect(listenersAtStart).toBe(2);
  });

  it('does not ask for a permission that is already granted', async () => {
    const fake = createFakeAudio();

    await newRun(fake).arm();

    expect(fake.audio.requestPermission).not.toHaveBeenCalled();
  });

  it('asks for the microphone when the permission is missing', async () => {
    const fake = createFakeAudio();
    fake.audio.hasPermission.mockResolvedValue(false);

    await newRun(fake).arm();

    expect(fake.audio.requestPermission).toHaveBeenCalledTimes(1);
    expect(fake.audio.start).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['denied', 'PERMISSION_DENIED'],
    ['blocked', 'PERMISSION_BLOCKED'],
  ] as const)(
    'rejects without opening the microphone when the permission is %s',
    async (status, code) => {
      const fake = createFakeAudio();
      fake.audio.hasPermission.mockResolvedValue(false);
      fake.audio.requestPermission.mockResolvedValue(status);

      const error = await rejectionOf(newRun(fake).arm());

      expect(error).toBeInstanceOf(DrillRunError);
      expect(error).toMatchObject({ code });
      expect(fake.audio.start).not.toHaveBeenCalled();
      expect(fake.listenerCount()).toBe(0);
    },
  );

  it('reports a permission check that fails as CAPTURE_FAILED, keeping the cause', async () => {
    const fake = createFakeAudio();
    const boom = new AudioCaptureError('check failed');
    fake.audio.hasPermission.mockRejectedValue(boom);

    const error = await rejectionOf(newRun(fake).arm());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause: boom });
  });

  it('names the sounds that still need calibrating, before asking for anything', async () => {
    const fake = createFakeAudio();
    const run = newRun(fake, {
      steps: [
        { id: 's', type: 'shot' },
        { id: 'r', type: 'reload' },
        { id: 'k', type: 'rack' },
      ],
      calibration: calibration({ shot: uncalibrated, rack: uncalibrated }),
    });

    const error = await rejectionOf(run.arm());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({
      code: 'NOT_CALIBRATED',
      sounds: ['shot', 'rack'],
    });
    expect(fake.audio.hasPermission).not.toHaveBeenCalled();
    expect(fake.audio.start).not.toHaveBeenCalled();
  });

  it('does not need a sound the drill never uses to be calibrated', async () => {
    const fake = createFakeAudio();
    const run = newRun(fake, {
      calibration: calibration({ reload: uncalibrated, rack: uncalibrated }),
    });

    await expect(run.arm()).resolves.toBeUndefined();
  });

  it('rejects a drill with no step it can hear', async () => {
    const fake = createFakeAudio();
    const run = newRun(fake, {
      steps: [
        { id: 'd', type: 'draw', par: 1.5 },
        { id: 'h', type: 'holster' },
      ],
    });

    const error = await rejectionOf(run.arm());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({ code: 'NO_DETECTABLE_STEPS' });
    expect(fake.audio.start).not.toHaveBeenCalled();
  });

  it.each([
    ['PERMISSION_DENIED', 'PERMISSION_DENIED'],
    ['NOT_IN_FOREGROUND', 'INTERRUPTED'],
    ['INIT_FAILED', 'CAPTURE_FAILED'],
    ['UNKNOWN', 'CAPTURE_FAILED'],
  ] as const)(
    'reports a microphone that fails to open with %s as %s',
    async (nativeCode, code) => {
      const fake = createFakeAudio();
      const boom = new AudioCaptureError(
        'no microphone',
        undefined,
        nativeCode,
      );
      fake.audio.start.mockRejectedValue(boom);

      const error = await rejectionOf(newRun(fake).arm());

      expect(error).toBeInstanceOf(DrillRunError);
      expect(error).toMatchObject({ code, cause: boom });
    },
  );

  it('does not touch a microphone it never asked for', async () => {
    const fake = createFakeAudio();
    fake.audio.hasPermission.mockResolvedValue(false);
    fake.audio.requestPermission.mockResolvedValue('denied');

    await rejectionOf(newRun(fake).arm());

    // Another capture may own it: calibration uses the same microphone.
    expect(fake.audio.stop).not.toHaveBeenCalled();
  });

  it('leaves no listener and a closed microphone behind when it fails to open', async () => {
    const fake = createFakeAudio();
    fake.audio.start.mockRejectedValue(new Error('no microphone'));

    await rejectionOf(newRun(fake).arm());

    expect(fake.listenerCount()).toBe(0);
    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
  });

  it('reports the failure to open even when closing fails as well', async () => {
    const fake = createFakeAudio();
    const boom = new AudioCaptureError('busy', undefined, 'INIT_FAILED');
    fake.audio.start.mockRejectedValue(boom);
    fake.audio.stop.mockRejectedValue(new Error('close failed'));

    const error = await rejectionOf(newRun(fake).arm());

    expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause: boom });
  });

  it('rejects with DrillRunAbortError for a signal that is already aborted', async () => {
    const fake = createFakeAudio();
    const controller = new AbortController();
    controller.abort();

    const error = await rejectionOf(
      newRun(fake).arm({ signal: controller.signal }),
    );

    expect(error).toBeInstanceOf(DrillRunAbortError);
    expect(fake.audio.hasPermission).not.toHaveBeenCalled();
    expect(fake.audio.start).not.toHaveBeenCalled();
  });

  it('does not open the microphone when aborted while the permission dialog is up', async () => {
    const fake = createFakeAudio();
    const controller = new AbortController();
    fake.audio.hasPermission.mockResolvedValue(false);
    fake.audio.requestPermission.mockImplementation(async () => {
      controller.abort();
      return 'granted';
    });

    const error = await rejectionOf(
      newRun(fake).arm({ signal: controller.signal }),
    );

    expect(error).toBeInstanceOf(DrillRunAbortError);
    expect(fake.audio.start).not.toHaveBeenCalled();
  });

  it('closes the microphone again when aborted while it was opening', async () => {
    const fake = createFakeAudio();
    const controller = new AbortController();
    fake.audio.start.mockImplementation(async () => {
      controller.abort();
    });

    const error = await rejectionOf(
      newRun(fake).arm({ signal: controller.signal }),
    );

    expect(error).toBeInstanceOf(DrillRunAbortError);
    expect(fake.audio.stop).toHaveBeenCalled();
    expect(fake.listenerCount()).toBe(0);
  });

  it('rejects when the run is stopped while the microphone was opening', async () => {
    const fake = createFakeAudio();
    let finishOpening: () => void = () => {};
    fake.audio.start.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finishOpening = resolve;
        }),
    );
    const run = newRun(fake);
    const arming = rejectionOf(run.arm());
    await Promise.resolve();
    await Promise.resolve();

    await run.stop();
    finishOpening();

    expect(await arming).toBeInstanceOf(DrillRunAbortError);
    expect(fake.listenerCount()).toBe(0);
  });

  it('rejects when the stream stops while the microphone was opening', async () => {
    const fake = createFakeAudio();
    fake.audio.start.mockImplementation(async () => {
      fake.breakStream(
        new AudioCaptureError('left the app', undefined, 'INTERRUPTED'),
      );
    });
    const run = newRun(fake);
    const recorded = record(run);

    const error = await rejectionOf(run.arm());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({ code: 'INTERRUPTED' });
    // Reported once, by the rejection, not as an event as well.
    expect(recorded.errors).toEqual([]);
  });

  it('cannot be armed twice', async () => {
    const fake = createFakeAudio();
    const run = newRun(fake);
    await run.arm();

    const error = await rejectionOf(run.arm());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({ code: 'INVALID_STATE' });
    expect(fake.audio.start).toHaveBeenCalledTimes(1);
  });
});

describe('begin', () => {
  it('needs an armed run', () => {
    const fake = createFakeAudio();
    const run = createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      audio: fake.audio,
    });

    const error = thrownBy(() => run.begin());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({ code: 'INVALID_STATE' });
  });

  it('stamps the request with the capture clock, the one the readings use', async () => {
    const { recorded } = await startedRun();

    expect(recorded.zeros).toEqual([
      { timestamp: ZERO, source: 'beep', beepDelayMs: 84 },
    ]);
  });

  it('reports a capture clock that cannot be read as CAPTURE_FAILED', async () => {
    const fake = createFakeAudio();
    const run = createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      audio: fake.audio,
    });
    await run.arm();
    const boom = new AudioCaptureError('no clock');
    fake.audio.now.mockImplementation(() => {
      throw boom;
    });

    const error = thrownBy(() => run.begin());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause: boom });
  });

  it('hears no step before it is called', async () => {
    const fake = createFakeAudio();
    const run = createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      audio: fake.audio,
    });
    const recorded = record(run);
    await run.arm();

    fake.hear(REQUESTED_AT - 500, -2);
    fake.hear(REQUESTED_AT - 400, ROOM_DB);
    fake.hear(REQUESTED_AT - 300, -2);

    expect(recorded.steps).toEqual([]);
    expect(recorded.zeros).toEqual([]);
  });
});

describe('a run', () => {
  it('emits stepDetected with the step, when it was heard and how it went', async () => {
    const { fake, recorded } = await startedRun();

    fake.hear(ZERO + 1402, -4);

    expect(recorded.steps).toEqual([
      {
        stepId: 'shot-1',
        timestamp: ZERO + 1402,
        result: { stepId: 'shot-1', par: 1.75, actual: 1.402, delta: -0.348 },
      },
    ]);
    expect(recorded.completions).toEqual([]);
  });

  it('emits runComplete with every step once the last one is heard', async () => {
    const { fake, recorded } = await startedRun();

    fake.hear(ZERO + 1402, -4);
    fake.hear(ZERO + 1425, ROOM_DB);
    fake.hear(ZERO + 1633, -5);

    expect(recorded.steps.map(step => step.stepId)).toEqual([
      'shot-1',
      'shot-2',
    ]);
    expect(recorded.completions).toEqual([
      {
        completed: true,
        results: [
          { stepId: 'shot-1', par: 1.75, actual: 1.402, delta: -0.348 },
          { stepId: 'shot-2', par: 0.2, actual: 0.231, delta: 0.031 },
        ],
        totalTime: 1.633,
        zeroSource: 'beep',
        beepDelayMs: 84,
        clockSource: 'frame',
      },
    ]);
  });

  it('reports the last step before the run completing', async () => {
    const { fake, run } = await startedRun();
    const order: string[] = [];
    run.on('stepDetected', step => order.push(step.stepId));
    run.on('runComplete', () => order.push('complete'));

    fake.hear(ZERO + 1402, -4);
    fake.hear(ZERO + 1425, ROOM_DB);
    fake.hear(ZERO + 1633, -5);

    expect(order).toEqual(['shot-1', 'shot-2', 'complete']);
  });

  it('closes the microphone and stops listening when the run completes', async () => {
    const { fake } = await startedRun();

    fake.hear(ZERO + 1402, -4);
    fake.hear(ZERO + 1425, ROOM_DB);
    fake.hear(ZERO + 1633, -5);

    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(0);
  });

  it('still completes when closing the microphone fails afterwards', async () => {
    const { fake, recorded } = await startedRun();
    fake.audio.stop.mockRejectedValue(new Error('close failed'));

    fake.hear(ZERO + 1402, -4);
    fake.hear(ZERO + 1425, ROOM_DB);
    fake.hear(ZERO + 1633, -5);
    await Promise.resolve();

    expect(recorded.completions).toHaveLength(1);
    expect(recorded.errors).toEqual([]);
  });

  it('times the run from the request, and says so, when the beep is not heard', async () => {
    const fake = createFakeAudio();
    const run = createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      beepMs: 300,
      audio: fake.audio,
    });
    const recorded = record(run);
    await run.arm();
    run.begin();

    fake.hear(REQUESTED_AT + 150, ROOM_DB);
    fake.hear(REQUESTED_AT + 620, ROOM_DB);
    fake.hear(REQUESTED_AT + 1500, -4);

    expect(recorded.zeros).toEqual([
      { timestamp: REQUESTED_AT, source: 'trigger', beepDelayMs: null },
    ]);
    expect(recorded.steps[0].result.actual).toBe(1.5);
  });

  it('passes its tuning on to the rules', async () => {
    const fake = createFakeAudio();
    const run = createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      audio: fake.audio,
      tuning: { beepSearchMs: 50 },
    });
    const recorded = record(run);
    await run.arm();
    run.begin();

    fake.hear(REQUESTED_AT + 84, -20);

    expect(recorded.zeros).toMatchObject([{ source: 'trigger' }]);
  });

  it.each([
    ['nothing at all', undefined],
    ['a string', 'loud'],
    ['an array', [1, 2, 3]],
    ['an average level that is missing', { db: undefined }],
    ['an average level that is NaN', { db: NaN }],
    ['a level that is not a number', { peakDb: 'loud' }],
    ['a level that is NaN', { peakDb: NaN }],
    ['a level over full scale', { peakDb: 3 }],
    ['no peak time', { peakTimestamp: undefined }],
    ['an infinite peak time', { peakTimestamp: Infinity }],
    ['no buffer time', { timestamp: undefined }],
    ['no onset time', { onsetTimestamp: undefined }],
  ])('ignores a reading that is %s', async (_name, overrides) => {
    const { fake, recorded } = await startedRun();
    const reading = WELL_FORMED;

    fake.emit(
      typeof overrides === 'object' && !Array.isArray(overrides)
        ? { ...reading, ...overrides }
        : overrides,
    );

    expect(recorded.steps).toEqual([]);
  });

  it('takes the same reading when nothing in it is wrong', async () => {
    const { fake, recorded } = await startedRun();

    fake.emit(WELL_FORMED);

    expect(recorded.steps.map(step => step.stepId)).toEqual(['shot-1']);
  });

  it('takes only the fields it knows from a reading', async () => {
    const { fake, recorded } = await startedRun();

    fake.emit({ ...WELL_FORMED, stepId: 'forged', result: { actual: 0 } });

    expect(recorded.steps).toEqual([
      {
        stepId: 'shot-1',
        timestamp: ZERO + 1402,
        result: { stepId: 'shot-1', par: 1.75, actual: 1.402, delta: -0.348 },
      },
    ]);
  });

  it('still closes the microphone and ends the run when a listener throws', async () => {
    const { fake, run } = await startedRun();
    run.on('stepDetected', () => {
      throw new Error('listener bug');
    });
    const shot = (at: number): void =>
      fake.hear(at, -4, { timestamp: at + 18 });

    expect(() => shot(ZERO + 1402)).toThrow('listener bug');
    fake.hear(ZERO + 1425, ROOM_DB);
    expect(() => shot(ZERO + 1633)).toThrow('listener bug');

    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(0);
    await expect(run.stop()).resolves.toMatchObject({
      completed: true,
      results: [{ stepId: 'shot-1' }, { stepId: 'shot-2' }],
    });
  });

  it('treats a reading that does not say which clock stamped it as read-timed', async () => {
    const { fake, run } = await startedRun();

    fake.hear(ZERO + 1402, -4, { frameTimed: undefined });

    expect((await run.stop()).clockSource).toBe('read');
  });
});

describe('a stream that stops on its own', () => {
  it('emits the failure with what the shooter can do about it', async () => {
    const { fake, recorded } = await startedRun();
    const interrupted = new AudioCaptureError(
      'left the app',
      undefined,
      'INTERRUPTED',
    );

    fake.breakStream(interrupted);

    expect(recorded.errors).toHaveLength(1);
    expect(recorded.errors[0]).toBeInstanceOf(DrillRunError);
    expect(recorded.errors[0]).toMatchObject({
      code: 'INTERRUPTED',
      cause: interrupted,
    });
  });

  it('reports a failed read as CAPTURE_FAILED', async () => {
    const { fake, recorded } = await startedRun();

    fake.breakStream(new AudioCaptureError('gone', undefined, 'READ_FAILED'));

    expect(recorded.errors[0]).toMatchObject({ code: 'CAPTURE_FAILED' });
  });

  it('stops listening and leaves the microphone closed', async () => {
    const { fake } = await startedRun();

    fake.breakStream(new AudioCaptureError('gone', undefined, 'READ_FAILED'));

    expect(fake.listenerCount()).toBe(0);
    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps the steps heard before it stopped', async () => {
    const { fake, run } = await startedRun();
    fake.hear(ZERO + 1402, -4);

    fake.breakStream(new AudioCaptureError('gone', undefined, 'READ_FAILED'));

    await expect(run.stop()).resolves.toMatchObject({
      completed: false,
      results: [{ stepId: 'shot-1', actual: 1.402 }],
    });
  });

  it('reports the failure once', async () => {
    const { fake, recorded } = await startedRun();
    const gone = new AudioCaptureError('gone', undefined, 'READ_FAILED');
    // A second listener that outlives the first failure cannot exist, but
    // the native side may still deliver the error twice.
    const listeners: ((error: AudioCaptureError) => void)[] = [];
    fake.audio.subscribeToErrors.mock.calls.forEach(call =>
      listeners.push(call[0]),
    );

    listeners.forEach(listener => listener(gone));
    listeners.forEach(listener => listener(gone));

    expect(recorded.errors).toHaveLength(1);
  });
});

describe('stop', () => {
  it('ends the run early with the steps heard so far', async () => {
    const { fake, run, recorded } = await startedRun();
    fake.hear(ZERO + 1402, -4);

    const result = await run.stop();

    expect(result).toEqual({
      completed: false,
      results: [{ stepId: 'shot-1', par: 1.75, actual: 1.402, delta: -0.348 }],
      totalTime: 1.402,
      zeroSource: 'beep',
      beepDelayMs: 84,
      clockSource: 'frame',
    });
    expect(recorded.completions).toEqual([]);
  });

  it('closes the microphone and stops listening', async () => {
    const { fake, run, recorded } = await startedRun();

    await run.stop();
    fake.hear(ZERO + 1402, -4);

    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(0);
    expect(recorded.steps).toEqual([]);
  });

  it('closes the microphone once however often it is called', async () => {
    const { fake, run } = await startedRun();

    await run.stop();
    await run.stop();

    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
  });

  it('resolves the finished run without closing the microphone a second time', async () => {
    const { fake, run } = await startedRun();
    fake.hear(ZERO + 1402, -4);
    fake.hear(ZERO + 1425, ROOM_DB);
    fake.hear(ZERO + 1633, -5);

    const result = await run.stop();

    expect(result.completed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
  });

  it('does not touch a microphone it never opened', async () => {
    const fake = createFakeAudio();
    const run = createDrillRun({
      steps: DRILL,
      calibration: calibration(),
      audio: fake.audio,
    });

    await expect(run.stop()).resolves.toMatchObject({
      completed: false,
      results: [],
    });
    expect(fake.audio.stop).not.toHaveBeenCalled();
  });

  it('reports a microphone that will not close as CAPTURE_FAILED', async () => {
    const { fake, run } = await startedRun();
    const boom = new Error('close failed');
    fake.audio.stop.mockRejectedValue(boom);

    const error = await rejectionOf(run.stop());

    expect(error).toBeInstanceOf(DrillRunError);
    expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause: boom });
  });
});

describe('on', () => {
  it('stops delivering to a listener once it is removed', async () => {
    const { fake, run } = await startedRun();
    const listener = jest.fn();
    const off = run.on('stepDetected', listener);

    off();
    fake.hear(ZERO + 1402, -4);

    expect(listener).not.toHaveBeenCalled();
  });

  it('delivers an event to every listener', async () => {
    const { fake, run } = await startedRun();
    const first = jest.fn();
    const second = jest.fn();
    run.on('stepDetected', first);
    run.on('stepDetected', second);

    fake.hear(ZERO + 1402, -4);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('lets a listener remove itself while it is being called', async () => {
    const { fake, run } = await startedRun();
    const second = jest.fn();
    const off = run.on('stepDetected', () => off());
    run.on('stepDetected', second);

    fake.hear(ZERO + 1402, -4);

    expect(second).toHaveBeenCalledTimes(1);
  });
});
