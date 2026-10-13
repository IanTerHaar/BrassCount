import {
  CALIBRATION_SOUNDS,
  DBFS_MIN,
  type CalibrationSound,
  type CalibrationState,
} from '@/types/calibration';
import type { DrillStep } from '@/types/drill';
import type {
  RunClockSource,
  RunResult,
  RunStep,
  RunZero,
  StepDetection,
  StepResult,
} from '@/types/run';

import { roundPar } from './drill';
import { splitDelta } from './session';

/**
 * The rules of a run: which steps of a drill can be heard, when the run
 * starts, and when a reading off the microphone counts as the next step.
 * Pure functions, no side effects — `DrillRunEngine` feeds them the live
 * stream.
 *
 * Every time here is a monotonic millisecond on the capture clock, taken
 * from the readings themselves. Nothing is timed by when a reading reaches
 * JavaScript, so a busy JS thread delays what the screen shows and never
 * what a run records.
 */

/** The margins the rules below work to. All can be overridden per run. */
export interface DetectionTuning {
  /**
   * How long after the start beep is requested the microphone is given to
   * hear it. A phone plays a sound some tens of milliseconds after it is
   * asked to, a slow one or a wireless speaker a few hundred; anything
   * first heard later than this is not taken for it.
   */
  beepSearchMs: number;
  /**
   * Most a reading's peak may stand over its average level and still be a
   * tone, which is what tells the beep from a shot. See `isTone`.
   */
  toneCrestMaxDb: number;
  /** How far over the room's usual level a sound must rise to be the beep. */
  beepRiseDb: number;
  /** Quietest a sound may be and still be the beep, however quiet the room. */
  beepMinDbfs: number;
  /** How long past its nominal length the beep is allowed to ring on. */
  beepTailMs: number;
  /**
   * How much louder than the beep a sound must be to count as a step while
   * the beep is still sounding.
   */
  beepMarginDb: number;
  /**
   * How soon after the start signal a step can first count. Nobody reacts
   * faster, and it keeps the beep's own attack from counting.
   */
  anticipationGuardMs: number;
  /**
   * How far under a step's threshold the level must fall before that step
   * is listened for, so the tail of one sound is not taken as the next.
   */
  rearmHysteresisDb: number;
  /** Shortest time between two steps. */
  minStepGapMs: number;
  /**
   * How long a sound is given to finish rising. A sound that crosses its
   * threshold in the last moments of a buffer may only be the leading edge
   * of one that peaks in the next, so a step that peaks this close to the
   * end of its buffer waits for the next reading, and is timed at that
   * reading's peak when it is louder and no further off than this.
   */
  peakSettleMs: number;
}

export const DEFAULT_DETECTION_TUNING: Readonly<DetectionTuning> = {
  beepSearchMs: 600,
  toneCrestMaxDb: 7,
  beepRiseDb: 12,
  beepMinDbfs: -50,
  beepTailMs: 40,
  beepMarginDb: 6,
  anticipationGuardMs: 60,
  rearmHysteresisDb: 3,
  minStepGapMs: 70,
  peakSettleMs: 5,
};

/**
 * How many readings from just before the beep describe the room: about a
 * quarter of a second of them.
 */
const ROOM_READINGS = 12;

/** Step times are measured to the millisecond. */
const MS_PER_SECOND = 1000;
/** How late the beep was heard is reported to a tenth of a millisecond. */
const BEEP_DELAY_UNITS_PER_MS = 10;
/**
 * How far into its buffer a tone may seem to begin and still have been
 * sounding from the buffer's first sample: a tone takes a fraction of a
 * cycle to reach half its level.
 */
const TONE_START_SLACK_MS = 1;
/**
 * Half a level, in decibels: what a reading's onset is measured at. The
 * native module finds that onset (`ONSET_PEAK_DIVISOR` in
 * `AudioLevels.kt`), and the two must stay in step.
 */
const HALF_LEVEL_DB = 6;
/**
 * Most readings held while the beep is looked for. The search ends on the
 * readings' own timestamps, a couple of dozen readings in; this only stops
 * the list growing if those timestamps were ever to stand still.
 */
const MAX_HELD_READINGS = 64;
/** Decibels in a tenfold change of level. */
const DB_PER_DECADE = 20;

const isCalibrationSound = (type: string): type is CalibrationSound =>
  CALIBRATION_SOUNDS.some(sound => sound === type);

/**
 * The steps of a drill a run can hear, in order.
 *
 * A step with no calibrated sound (draw, transition, holster) cannot be
 * detected, so it is not timed on its own: its par is counted towards the
 * next step that can be. A draw of 1.50 s in front of a shot of 0.25 s
 * makes that shot due 1.75 s after the start. A heard step is untimed only
 * when neither it nor any silent step counted towards it has a par, and a
 * silent step with nothing heard after it is dropped.
 */
export const planRun = (steps: readonly DrillStep[]): RunStep[] => {
  const plan: RunStep[] = [];
  let carriedPar: number | undefined;

  for (const step of steps) {
    const par =
      step.par === undefined
        ? carriedPar
        : roundPar((carriedPar ?? 0) + step.par);

    if (isCalibrationSound(step.type)) {
      plan.push(
        par === undefined
          ? { stepId: step.id, sound: step.type }
          : { stepId: step.id, sound: step.type, par },
      );
      carriedPar = undefined;
    } else {
      carriedPar = par;
    }
  }

  return plan;
};

/**
 * The sounds a run listens for that have no threshold yet, in the order
 * the Calibration screen lists them. Empty when the run can start.
 */
export const missingCalibration = (
  steps: readonly RunStep[],
  calibration: CalibrationState,
): CalibrationSound[] =>
  CALIBRATION_SOUNDS.filter(
    sound =>
      calibration[sound].status === 'uncalibrated' &&
      steps.some(step => step.sound === sound),
  );

/** The threshold of each calibrated sound, in dBFS. */
export type SoundThresholds = Readonly<
  Partial<Record<CalibrationSound, number>>
>;

export const thresholdsFrom = (
  calibration: CalibrationState,
): SoundThresholds =>
  CALIBRATION_SOUNDS.reduce<Partial<Record<CalibrationSound, number>>>(
    (thresholds, sound) => {
      const entry = calibration[sound];
      return entry.status === 'calibrated'
        ? { ...thresholds, [sound]: entry.thresholdDbfs }
        : thresholds;
    },
    {},
  );

/** The parts of an `AmplitudeReading` the rules use. */
export interface DetectorReading {
  /** Average (RMS) level of the buffer, in dBFS. */
  db: number;
  /** Level of the loudest sample in the buffer, in dBFS. */
  peakDb: number;
  /** When the buffer's last sample was captured. */
  timestamp: number;
  /** When its loudest sample was captured. */
  peakTimestamp: number;
  /** When its sound began. */
  onsetTimestamp: number;
  /** Whether the audio hardware's frame clock stamped it. */
  frameTimed: boolean;
}

/**
 * `listening`: the microphone is open and the beep has not been requested.
 * `seeking`: it has, and the zero point is not settled yet.
 * `running`: steps are being listened for.
 * `complete`: the last step was heard.
 */
export type DetectorPhase = 'listening' | 'seeking' | 'running' | 'complete';

/** Everything a run knows so far. Immutable: `detect` returns the next one. */
export interface DetectorState {
  readonly steps: readonly RunStep[];
  readonly thresholds: SoundThresholds;
  readonly tuning: DetectionTuning;
  /** Nominal length of the start beep, in milliseconds. */
  readonly beepMs: number;
  readonly phase: DetectorPhase;
  /** Levels of the last readings captured before the beep was requested. */
  readonly roomLevels: readonly number[];
  /** When the beep was requested; `null` until it is. */
  readonly triggerAt: number | null;
  readonly zero: RunZero | null;
  /**
   * A reading that may hold the start of the beep, waiting for the next
   * one to show whether a tone followed it.
   */
  readonly beepCandidate: DetectorReading | null;
  /**
   * Every reading since the beep was requested, kept until the zero point
   * is settled. If the beep turns up they came before it and are dropped;
   * if it does not, they are listened to for steps, timed from the request.
   */
  readonly held: readonly DetectorReading[];
  /** Loudest the beep has been heard so far; `null` when it was not heard. */
  readonly beepLevelDb: number | null;
  /**
   * Quietest level since the last step (or since the run began), which is
   * what tells a new sound from the tail of the last one.
   */
  readonly quietestDb: number;
  readonly lastDetectionAt: number | null;
  /**
   * A step that crossed its threshold at the very end of a buffer and is
   * waiting for the next reading to show where it peaked. See
   * `DetectionTuning.peakSettleMs`.
   */
  readonly rising: { readonly at: number; readonly peakDb: number } | null;
  readonly results: readonly StepResult[];
  /** Which clock stamped the readings since the beep was requested. */
  readonly clock: RunClockSource | null;
}

export type DetectorEvent =
  | { type: 'zero'; zero: RunZero }
  | { type: 'step'; detection: StepDetection }
  | { type: 'complete' };

export interface DetectorStep {
  state: DetectorState;
  events: readonly DetectorEvent[];
}

export interface DetectorOptions {
  steps: readonly RunStep[];
  thresholds: SoundThresholds;
  beepMs: number;
  tuning?: Partial<DetectionTuning>;
}

/** The default margins with a run's own put over them. */
const withOverrides = (
  overrides: Partial<DetectionTuning> | undefined,
): DetectionTuning => {
  // A key passed as `undefined` is not an override: spread on its own, it
  // would replace a margin with nothing and no comparison would ever hold.
  const given = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, value]) => value !== undefined),
  );
  return { ...DEFAULT_DETECTION_TUNING, ...given };
};

export const createDetector = ({
  steps,
  thresholds,
  beepMs,
  tuning,
}: DetectorOptions): DetectorState => ({
  steps,
  thresholds,
  tuning: withOverrides(tuning),
  beepMs,
  phase: 'listening',
  roomLevels: [],
  triggerAt: null,
  zero: null,
  beepCandidate: null,
  held: [],
  beepLevelDb: null,
  quietestDb: Infinity,
  lastDetectionAt: null,
  rising: null,
  results: [],
  clock: null,
});

/**
 * Note that the start beep was requested at `triggerAt`. From here the
 * rules look for the beep, then for the steps. Only the first request
 * counts.
 */
export const markTrigger = (
  state: DetectorState,
  triggerAt: number,
): DetectorState =>
  state.phase === 'listening'
    ? {
        ...state,
        phase: 'seeking',
        triggerAt,
        // The room as heard so far already counts as quiet between steps.
        quietestDb: Math.min(Infinity, ...state.roomLevels),
      }
    : state;

const roundToMs = (seconds: number): number =>
  Math.round(seconds * MS_PER_SECOND) / MS_PER_SECOND;

/** The middle level of the room, so one loud moment in it does not count. */
const usualLevel = (levels: readonly number[]): number => {
  if (levels.length === 0) {
    return DBFS_MIN;
  }
  const sorted = [...levels].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const withRoomLevel = (state: DetectorState, level: number): DetectorState => ({
  ...state,
  roomLevels: [...state.roomLevels, level].slice(-ROOM_READINGS),
});

const NO_EVENTS: readonly DetectorEvent[] = [];

/**
 * Whether a reading could be the start beep arriving: a sound that rises
 * well clear of the room and begins inside the time the phone is given to
 * play it. Whether it is the beep depends on its being a tone; see
 * `seekZero`.
 */
const couldStartBeep = (
  state: DetectorState,
  reading: DetectorReading,
  triggerAt: number,
): boolean =>
  isBeepLoud(state, reading) &&
  reading.onsetTimestamp >= triggerAt &&
  reading.onsetTimestamp <= triggerAt + state.tuning.beepSearchMs;

/** Whether a reading rises as far over the room as the beep must. */
const isBeepLoud = (state: DetectorState, reading: DetectorReading): boolean =>
  reading.peakDb >=
  Math.max(
    usualLevel(state.roomLevels) + state.tuning.beepRiseDb,
    state.tuning.beepMinDbfs,
  );

/**
 * Whether a reading is a steady tone rather than an impulse. A tone's peak
 * sits about 3 dB over its average level; a shot, a click or plain noise
 * has a peak 10 dB or more over its own.
 */
const isTone = (state: DetectorState, reading: DetectorReading): boolean =>
  reading.peakDb - reading.db <= state.tuning.toneCrestMaxDb;

/**
 * When a tone that went on to reach `levelDb` first got to half of that
 * level, given that it did so inside the buffer of `rising`.
 *
 * The reading's onset marks half of its own peak, which is earlier than
 * half of the tone's full level when the buffer ended before the tone had
 * finished rising. The rise from that onset to that peak is taken as a
 * straight line and followed as far as the level wanted, so the answer is
 * never outside the two.
 */
const halfLevelWithin = (rising: DetectorReading, levelDb: number): number => {
  const overPeak = 10 ** ((levelDb - rising.peakDb) / DB_PER_DECADE);
  const along = Math.min(Math.max(overPeak - 1, 0), 1);
  return (
    rising.onsetTimestamp +
    along * (rising.peakTimestamp - rising.onsetTimestamp)
  );
};

/** Record the next step as heard at `at`, and the run as complete if it is. */
const confirmStep = (
  state: DetectorState,
  zero: RunZero,
  at: number,
  events: readonly DetectorEvent[],
): DetectorStep => {
  const step = state.steps[state.results.length];
  if (step === undefined) {
    return { state, events };
  }

  const actual = roundToMs(
    (at - (state.lastDetectionAt ?? zero.timestamp)) / MS_PER_SECOND,
  );
  const delta = splitDelta(actual, step.par);
  const result: StepResult =
    step.par === undefined
      ? { stepId: step.stepId, actual, delta }
      : { stepId: step.stepId, par: step.par, actual, delta };
  const results = [...state.results, result];
  const complete = results.length === state.steps.length;

  return {
    state: {
      ...state,
      phase: complete ? 'complete' : 'running',
      // The detected sound is not the beep, and its tail has to die away
      // before the next step is listened for.
      quietestDb: Infinity,
      lastDetectionAt: at,
      rising: null,
      results,
    },
    events: [
      ...events,
      {
        type: 'step',
        detection: { stepId: step.stepId, timestamp: at, result },
      },
      ...(complete ? [{ type: 'complete' } as const] : []),
    ],
  };
};

/** Listen for the next step in a reading. `zero` is settled by now. */
const detectStep = (
  state: DetectorState,
  reading: DetectorReading,
  zero: RunZero,
  events: readonly DetectorEvent[],
): DetectorStep => {
  const { tuning } = state;
  const step = state.steps[state.results.length];
  const threshold =
    step === undefined ? undefined : state.thresholds[step.sound];
  const at = reading.peakTimestamp;

  const duringBeep =
    state.beepLevelDb !== null &&
    at < zero.timestamp + state.beepMs + tuning.beepTailMs;
  const quietestDb = Math.min(state.quietestDb, reading.peakDb);
  const heard: DetectorState = {
    ...state,
    quietestDb,
    beepLevelDb:
      duringBeep && state.beepLevelDb !== null
        ? Math.max(state.beepLevelDb, reading.peakDb)
        : state.beepLevelDb,
  };

  // No step left to hear, or one whose sound has no threshold: the engine
  // checks both before a run starts, so this is only a guard.
  if (step === undefined || threshold === undefined) {
    return { state: heard, events };
  }

  // While the beep sounds, a step has to stand clear of it as well.
  const level =
    duringBeep && state.beepLevelDb !== null
      ? Math.max(threshold, state.beepLevelDb + tuning.beepMarginDb)
      : threshold;
  const isStep =
    reading.peakDb >= level &&
    quietestDb < level - tuning.rearmHysteresisDb &&
    at >= zero.timestamp + tuning.anticipationGuardMs &&
    (state.lastDetectionAt === null ||
      at >= state.lastDetectionAt + tuning.minStepGapMs);
  if (!isStep) {
    return { state: heard, events };
  }

  // Peaking in the last moments of its buffer, the sound may still be
  // rising: the next reading says where it really peaked.
  if (reading.timestamp - at < tuning.peakSettleMs) {
    return {
      state: { ...state, rising: { at, peakDb: reading.peakDb } },
      events,
    };
  }
  return confirmStep(state, zero, at, events);
};

/**
 * Take a reading while steps are being listened for: settle a step that
 * was still rising when the last buffer ended, then listen for the next.
 */
const listen = (
  state: DetectorState,
  reading: DetectorReading,
  zero: RunZero,
  events: readonly DetectorEvent[] = NO_EVENTS,
): DetectorStep => {
  const { rising } = state;
  if (rising === null) {
    return detectStep(state, reading, zero, events);
  }

  const peakedLater =
    reading.peakDb > rising.peakDb &&
    reading.peakTimestamp - rising.at <= state.tuning.peakSettleMs;
  const settled = confirmStep(
    state,
    zero,
    peakedLater ? reading.peakTimestamp : rising.at,
    events,
  );
  // The reading is the rest of the step's own sound; it is still heard,
  // so that its level counts towards when the next step may be listened for.
  return settled.state.phase === 'complete'
    ? settled
    : detectStep(settled.state, reading, zero, settled.events);
};

/** Keep a reading until the zero point is settled; see `seekZero`. */
const holding = (
  state: DetectorState,
  reading: DetectorReading,
  beepCandidate: DetectorReading | null,
): DetectorState => ({
  ...state,
  beepCandidate,
  held: [...state.held, reading],
});

/** Settle the zero point on the start beep, which began at `onsetAt`. */
const zeroOnBeep = (
  state: DetectorState,
  onsetAt: number,
  levelDb: number,
  triggerAt: number,
): DetectorStep => {
  const zero: RunZero = {
    timestamp: onsetAt,
    source: 'beep',
    beepDelayMs:
      Math.round((onsetAt - triggerAt) * BEEP_DELAY_UNITS_PER_MS) /
      BEEP_DELAY_UNITS_PER_MS,
  };
  return {
    state: {
      ...state,
      phase: 'running',
      zero,
      beepCandidate: null,
      // Whatever was heard before the beep was not a step of this run.
      held: [],
      beepLevelDb: levelDb,
      quietestDb: Infinity,
    },
    events: [{ type: 'zero', zero }],
  };
};

/**
 * Settle the zero point on the request for the beep, which was not heard,
 * and listen for steps in the readings taken since, in the order they
 * came.
 */
const zeroOnTrigger = (
  state: DetectorState,
  triggerAt: number,
  readings: readonly DetectorReading[],
): DetectorStep => {
  const zero: RunZero = {
    timestamp: triggerAt,
    source: 'trigger',
    beepDelayMs: null,
  };
  const started: DetectorStep = {
    state: { ...state, phase: 'running', zero, beepCandidate: null, held: [] },
    events: [{ type: 'zero', zero }],
  };
  return readings.reduce<DetectorStep>(
    (step, reading) =>
      step.state.phase === 'complete'
        ? step
        : listen(step.state, reading, zero, step.events),
    started,
  );
};

/**
 * Take a reading while the zero point is not settled: the beep has been
 * requested and has yet to be heard.
 *
 * The beep is the first sound to rise clear of the room that is also a
 * tone. Its first buffer usually holds only the start of it and does not
 * read as a tone yet, so that reading is held as a candidate and the next
 * one decides: a tone means the beep began where the candidate did; an
 * impulse means the candidate was something else.
 *
 * Nothing is taken for a step while the beep may still come. A bang in the
 * moment between the request and the beep, from the next lane say, is loud
 * enough to be a shot and is not one. So every reading is held until the
 * beep is found, which drops them, or its time is up, which hands them to
 * the step rules with the run timed from the request.
 */
const seekZero = (
  state: DetectorState,
  reading: DetectorReading,
  triggerAt: number,
): DetectorStep => {
  const candidate = state.beepCandidate;
  if (
    candidate !== null &&
    isBeepLoud(state, reading) &&
    isTone(state, reading)
  ) {
    // The beep is timed from where it first reaches half its level. A tone
    // already that loud at the first sample of its buffer got there in the
    // buffer before, where the candidate rose, provided the candidate
    // itself rose that far.
    const reachedHalfBefore =
      candidate.peakDb >= reading.peakDb - HALF_LEVEL_DB &&
      reading.onsetTimestamp - candidate.timestamp <= TONE_START_SLACK_MS;
    if (reachedHalfBefore) {
      return zeroOnBeep(
        state,
        halfLevelWithin(candidate, reading.peakDb),
        Math.max(candidate.peakDb, reading.peakDb),
        triggerAt,
      );
    }
    // Otherwise it got there in this buffer, which the check below finds:
    // the candidate was only the foot of the rise, or some other sound.
  }

  if (couldStartBeep(state, reading, triggerAt)) {
    return isTone(state, reading)
      ? zeroOnBeep(state, reading.onsetTimestamp, reading.peakDb, triggerAt)
      : { state: holding(state, reading, reading), events: NO_EVENTS };
  }

  const timeIsUp =
    reading.timestamp > triggerAt + state.tuning.beepSearchMs ||
    state.held.length >= MAX_HELD_READINGS;
  return timeIsUp
    ? zeroOnTrigger(state, triggerAt, [...state.held, reading])
    : { state: holding(state, reading, null), events: NO_EVENTS };
};

/**
 * Take one reading off the microphone stream and return what the run knows
 * now, with anything that just happened: the zero point being settled, a
 * step being heard, the run completing.
 */
export const detect = (
  state: DetectorState,
  reading: DetectorReading,
): DetectorStep => {
  if (state.phase === 'complete') {
    return { state, events: NO_EVENTS };
  }
  if (state.phase === 'listening' || state.triggerAt === null) {
    return { state: withRoomLevel(state, reading.peakDb), events: NO_EVENTS };
  }
  // Captured before the beep was requested, however late it got here.
  if (reading.timestamp <= state.triggerAt) {
    return {
      state: {
        ...withRoomLevel(state, reading.peakDb),
        quietestDb: Math.min(state.quietestDb, reading.peakDb),
      },
      events: NO_EVENTS,
    };
  }

  const clock: RunClockSource =
    reading.frameTimed && state.clock !== 'read' ? 'frame' : 'read';
  const timed: DetectorState = { ...state, clock };

  if (timed.phase === 'running' && timed.zero !== null) {
    return listen(timed, reading, timed.zero);
  }

  return seekZero(timed, reading, state.triggerAt);
};

/**
 * The run as far as it has got. A step still waiting to be settled when
 * the run is stopped was heard, and counts where it first peaked.
 */
export const summarizeRun = (current: DetectorState): RunResult => {
  const state =
    current.rising === null || current.zero === null
      ? current
      : confirmStep(current, current.zero, current.rising.at, NO_EVENTS).state;

  return {
    completed: state.phase === 'complete',
    results: [...state.results],
    totalTime:
      state.zero === null || state.lastDetectionAt === null
        ? 0
        : roundToMs(
            (state.lastDetectionAt - state.zero.timestamp) / MS_PER_SECOND,
          ),
    zeroSource: state.zero?.source ?? 'trigger',
    beepDelayMs: state.zero?.beepDelayMs ?? null,
    clockSource: state.clock ?? 'read',
  };
};
