import type { MicrophonePermissionStatus } from '@/types/audio';
import {
  DBFS_MAX,
  type CalibrationSound,
  type CalibrationState,
} from '@/types/calibration';
import type { DrillStep } from '@/types/drill';
import type { RunResult, RunStep, RunZero, StepDetection } from '@/types/run';
import { isRecord } from '@utils/guards';
import {
  createDetector,
  detect,
  markTrigger,
  missingCalibration,
  planRun,
  summarizeRun,
  thresholdsFrom,
  type DetectionTuning,
  type DetectorEvent,
  type DetectorReading,
} from '@utils/runDetection';

import {
  AudioCaptureError,
  AudioCaptureService,
  resolveMicrophonePermission,
  type AudioCaptureServiceType,
} from './audioCapture';
import { DEFAULT_BEEP } from './beepPlayer';

/**
 * DrillRunEngine
 * --------------
 * Listens to the microphone during a run and reports each step of the
 * drill as its sound is heard: a shot, a reload, a rack. It is given the
 * drill's steps and the calibration thresholds, and it emits `stepDetected`
 * for each step in order and `runComplete` with every step's time once the
 * last one is heard.
 *
 * A run has three moments, each driven by the caller:
 *
 *   arm()    asks for the microphone if it has to and opens it. Done before
 *            the random delay, so the microphone is already listening when
 *            the beep sounds, and its timestamps have settled
 *            (`CAPTURE_CLOCK_SETTLE_MS`) by then.
 *   begin()  is called at the instant the start beep is requested. The
 *            engine then listens for the beep itself and times the run
 *            from when it was actually heard.
 *   stop()   ends the run early and resolves what was heard so far.
 *
 * What counts as the beep or as a step is decided by the pure rules in
 * `src/utils/runDetection.ts`; this module owns the microphone and the
 * events. The handler that takes each reading does a fixed, small amount
 * of work and nothing else runs between the start signal and the last
 * step, and every time comes from the readings' own timestamps, so a slow
 * JS thread cannot change what a run records.
 */

/** Why a run could not start, or stopped. */
export type DrillRunErrorCode =
  /** The drill has no shot, reload or rack step. */
  | 'NO_DETECTABLE_STEPS'
  /** A sound the drill needs has no threshold yet; see `sounds`. */
  | 'NOT_CALIBRATED'
  /** The user declined the permission dialog; asking again will show it. */
  | 'PERMISSION_DENIED'
  /** The permission can now only be granted from the system settings. */
  | 'PERMISSION_BLOCKED'
  /** The app left the foreground, which closes the microphone. */
  | 'INTERRUPTED'
  | 'CAPTURE_FAILED'
  /** The run was used out of order: armed twice, or begun before arming. */
  | 'INVALID_STATE';

/** Error thrown and emitted by this service. Branch on `code`. */
export class DrillRunError extends Error {
  cause?: unknown;
  code: DrillRunErrorCode;
  /** For `NOT_CALIBRATED`: the sounds that still need calibrating. */
  sounds: readonly CalibrationSound[];

  constructor(
    message: string,
    cause?: unknown,
    code: DrillRunErrorCode = 'CAPTURE_FAILED',
    sounds: readonly CalibrationSound[] = [],
  ) {
    super(message);
    this.name = 'DrillRunError';
    this.cause = cause;
    this.code = code;
    this.sounds = sounds;
  }
}

/** Thrown by `arm` when the run is cancelled before the microphone is ready. */
export class DrillRunAbortError extends Error {
  constructor(message = 'Drill run aborted before it was armed') {
    super(message);
    this.name = 'DrillRunAbortError';
  }
}

/** The part of the audio capture service a run uses. */
export type DrillRunAudio = Pick<
  AudioCaptureServiceType,
  | 'hasPermission'
  | 'requestPermission'
  | 'start'
  | 'stop'
  | 'now'
  | 'subscribeToAmplitude'
  | 'subscribeToErrors'
>;

export interface DrillRunOptions {
  /** The drill's steps, in order. Steps with no sound are planned around. */
  steps: readonly DrillStep[];
  /** The thresholds to listen with, as the calibration store holds them. */
  calibration: CalibrationState;
  /** Nominal length of the start beep, in milliseconds. */
  beepMs?: number;
  /** Overrides for the detection margins. */
  tuning?: Partial<DetectionTuning>;
  audio?: DrillRunAudio;
}

/** What a run emits, by event name. */
export interface DrillRunEvents {
  /** The run's zero point is settled: the beep was heard, or was not. */
  zero: RunZero;
  /** The next step of the drill was heard. */
  stepDetected: StepDetection;
  /** The last step was heard. The microphone is closed by now. */
  runComplete: RunResult;
  /** The microphone stopped on its own. The run is over. */
  error: DrillRunError;
}

export type DrillRunListener<Name extends keyof DrillRunEvents> = (
  payload: DrillRunEvents[Name],
) => void;

export interface DrillRunArmOptions {
  /** Cancels arming; `arm` then rejects with `DrillRunAbortError`. */
  signal?: AbortSignal;
}

/** One run of a drill. Made by `createDrillRun`, used once. */
export interface DrillRun {
  /** The steps the run listens for, with the pars they are judged against. */
  readonly steps: readonly RunStep[];
  /** Listen for an event. Returns the function that stops listening. */
  on<Name extends keyof DrillRunEvents>(
    event: Name,
    listener: DrillRunListener<Name>,
  ): () => void;
  /**
   * Check the run can be heard, get the microphone permission and open the
   * microphone. Rejects with `DrillRunError`, or `DrillRunAbortError` when
   * cancelled; either way the microphone is closed again.
   */
  arm(options?: DrillRunArmOptions): Promise<void>;
  /** Mark the instant the start beep is requested. Needs an armed run. */
  begin(): void;
  /**
   * End the run and close the microphone. Resolves the run as far as it
   * got; safe to call at any time and more than once.
   */
  stop(): Promise<RunResult>;
}

type Stage = 'idle' | 'arming' | 'armed' | 'ended';

function codeFor(err: unknown): DrillRunErrorCode {
  if (!(err instanceof AudioCaptureError)) {
    return 'CAPTURE_FAILED';
  }
  switch (err.code) {
    case 'PERMISSION_DENIED':
      return 'PERMISSION_DENIED';
    case 'INTERRUPTED':
    case 'NOT_IN_FOREGROUND':
      return 'INTERRUPTED';
    default:
      return 'CAPTURE_FAILED';
  }
}

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isLevel = (value: unknown): value is number =>
  isTime(value) && value <= DBFS_MAX;

/**
 * The fields of a reading the rules use, or `null` when it is not a
 * reading. Readings cross the native bridge, so their shape is checked
 * rather than trusted, and only the known fields are taken.
 */
function readReading(raw: unknown): DetectorReading | null {
  if (!isRecord(raw)) {
    return null;
  }
  const { db, peakDb, timestamp, peakTimestamp, onsetTimestamp, frameTimed } =
    raw;
  if (
    !isLevel(db) ||
    !isLevel(peakDb) ||
    !isTime(timestamp) ||
    !isTime(peakTimestamp) ||
    !isTime(onsetTimestamp)
  ) {
    return null;
  }
  return {
    db,
    peakDb,
    timestamp,
    peakTimestamp,
    onsetTimestamp,
    frameTimed: frameTimed === true,
  };
}

async function ensureMicrophonePermission(audio: DrillRunAudio): Promise<void> {
  let status: MicrophonePermissionStatus;
  try {
    status = await resolveMicrophonePermission(audio);
  } catch (err) {
    throw new DrillRunError('Failed to get microphone permission', err);
  }
  if (status === 'blocked') {
    throw new DrillRunError(
      'Microphone permission is blocked',
      undefined,
      'PERMISSION_BLOCKED',
    );
  }
  if (status === 'denied') {
    throw new DrillRunError(
      'Microphone permission was denied',
      undefined,
      'PERMISSION_DENIED',
    );
  }
}

/**
 * Set up one run of a drill. Nothing is opened until `arm` is called.
 */
export function createDrillRun(options: DrillRunOptions): DrillRun {
  const {
    steps,
    calibration,
    beepMs = DEFAULT_BEEP.durationMs,
    tuning,
    audio = AudioCaptureService,
  } = options;

  const plan = planRun(steps);
  let detector = createDetector({
    steps: plan,
    thresholds: thresholdsFrom(calibration),
    beepMs,
    tuning,
  });
  let stage: Stage = 'idle';
  let unsubscribers: (() => void)[] = [];
  /** A stream failure that arrived while the microphone was still opening. */
  let armFailure: DrillRunError | null = null;
  /** Whether this run has got as far as opening the microphone. */
  let askedForMicrophone = false;

  const listeners: {
    [Name in keyof DrillRunEvents]: Set<DrillRunListener<Name>>;
  } = {
    zero: new Set(),
    stepDetected: new Set(),
    runComplete: new Set(),
    error: new Set(),
  };

  const emit = <Name extends keyof DrillRunEvents>(
    event: Name,
    payload: DrillRunEvents[Name],
  ): void => {
    // Copied, so a listener may stop listening while it is being called.
    [...listeners[event]].forEach(listener => listener(payload));
  };

  // Read through functions: the stage changes underneath an `await`, which
  // a plain comparison after one would not be allowed to see.
  const isStage = (expected: Stage): boolean => stage === expected;

  const stopListening = (): void => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    unsubscribers = [];
  };

  const closeQuietly = (): void => {
    // The run is already over and its result stands; a close that fails
    // here is nothing the shooter can act on, and the native side closes
    // the microphone itself when the app is left.
    audio.stop().catch(() => {});
  };

  const dispatch = (event: DetectorEvent): void => {
    switch (event.type) {
      case 'zero':
        emit('zero', event.zero);
        return;
      case 'step':
        emit('stepDetected', event.detection);
        return;
      case 'complete':
        emit('runComplete', summarizeRun(detector));
    }
  };

  const onReading = (raw: unknown): void => {
    if (!isStage('armed')) {
      return;
    }
    const reading = readReading(raw);
    if (reading === null) {
      return;
    }
    const step = detect(detector, reading);
    detector = step.state;
    // The run is ended before anyone is told, so a listener that throws
    // cannot leave the microphone open on a run that is over.
    if (step.events.some(event => event.type === 'complete')) {
      stage = 'ended';
      stopListening();
      closeQuietly();
    }
    step.events.forEach(dispatch);
  };

  const onStreamError = (err: AudioCaptureError): void => {
    const failure = new DrillRunError(
      'The microphone stopped during the run',
      err,
      codeFor(err),
    );
    if (isStage('arming')) {
      armFailure = failure;
      return;
    }
    if (!isStage('armed')) {
      return;
    }
    stage = 'ended';
    stopListening();
    closeQuietly();
    emit('error', failure);
  };

  const throwIfCancelled = (signal: AbortSignal | undefined): void => {
    if (signal?.aborted === true || isStage('ended')) {
      throw new DrillRunAbortError();
    }
  };

  const openMicrophone = async (
    signal: AbortSignal | undefined,
  ): Promise<void> => {
    await ensureMicrophonePermission(audio);
    throwIfCancelled(signal);
    // Subscribed before the microphone opens, so a stream that stops the
    // moment it starts is not missed. One push each, so the first is still
    // unsubscribed if the second subscription throws.
    unsubscribers.push(audio.subscribeToAmplitude(onReading));
    unsubscribers.push(audio.subscribeToErrors(onStreamError));
    askedForMicrophone = true;
    await audio.start();
    throwIfCancelled(signal);
    if (armFailure !== null) {
      throw armFailure;
    }
  };

  const arm = async ({ signal }: DrillRunArmOptions = {}): Promise<void> => {
    if (!isStage('idle')) {
      throw new DrillRunError(
        'A run can only be armed once',
        undefined,
        'INVALID_STATE',
      );
    }
    if (plan.length === 0) {
      throw new DrillRunError(
        'The drill has no step the microphone can hear',
        undefined,
        'NO_DETECTABLE_STEPS',
      );
    }
    const missing = missingCalibration(plan, calibration);
    if (missing.length > 0) {
      throw new DrillRunError(
        `Not calibrated: ${missing.join(', ')}`,
        undefined,
        'NOT_CALIBRATED',
        missing,
      );
    }
    throwIfCancelled(signal);

    stage = 'arming';
    try {
      await openMicrophone(signal);
    } catch (err) {
      stage = 'ended';
      stopListening();
      // Only a microphone this run asked for is closed: until then it may
      // be another capture's. The failure that ended arming is the one
      // worth reporting; a close that fails as well would only hide it.
      if (askedForMicrophone) {
        await audio.stop().catch(() => {});
      }
      if (err instanceof DrillRunError || err instanceof DrillRunAbortError) {
        throw err;
      }
      throw new DrillRunError(
        'Failed to open the microphone',
        err,
        codeFor(err),
      );
    }
    stage = 'armed';
  };

  const begin = (): void => {
    if (!isStage('armed')) {
      throw new DrillRunError(
        'A run must be armed before it begins',
        undefined,
        'INVALID_STATE',
      );
    }
    let requestedAt: number;
    try {
      requestedAt = audio.now();
    } catch (err) {
      throw new DrillRunError('Failed to read the capture clock', err);
    }
    detector = markTrigger(detector, requestedAt);
  };

  const stop = async (): Promise<RunResult> => {
    const wasOpen =
      askedForMicrophone && (isStage('arming') || isStage('armed'));
    stage = 'ended';
    stopListening();
    if (wasOpen) {
      try {
        await audio.stop();
      } catch (err) {
        throw new DrillRunError('Failed to release the microphone', err);
      }
    }
    return summarizeRun(detector);
  };

  return {
    steps: plan,
    on: (event, listener) => {
      listeners[event].add(listener);
      return () => {
        listeners[event].delete(listener);
      };
    },
    arm,
    begin,
    stop,
  };
}

/** Object-form export for callers that prefer a service handle. */
export const DrillRunEngine = {
  create: createDrillRun,
};

export type DrillRunEngineType = typeof DrillRunEngine;
