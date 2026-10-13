import type { CalibrationSound } from './calibration';

/**
 * Domain model for a run in progress: what the drill run detection engine
 * listens for and what it reports. Nothing here is stored; a finished run
 * becomes a `Session` (see `src/types/session.ts`) when the shooter saves
 * it.
 */

/**
 * A drill step the engine can hear. Steps with no calibrated sound (draw,
 * transition, holster) are not in a run: the engine cannot tell when they
 * happen, so their par is counted towards the next step that has one.
 */
export interface RunStep {
  /** Id of the drill step this is. */
  stepId: string;
  /** The calibrated sound that marks the step as done. */
  sound: CalibrationSound;
  /**
   * Seconds allowed between the previous heard step (or the start signal,
   * for the first) and this one: the step's own par plus the par of every
   * silent step in front of it. Left off when none of them has a par.
   */
  par?: number;
}

/** How one heard step of a run went. */
export interface StepResult {
  stepId: string;
  /** The par the step was judged against; see `RunStep.par`. */
  par?: number;
  /**
   * Seconds the step took, measured from the previous heard step (or from
   * the start signal, for the first) and rounded to the millisecond.
   */
  actual: number;
  /** `actual - par` in seconds, or `null` when the step has no par. */
  delta: number | null;
}

/** A step being heard, as the engine reports it the moment it happens. */
export interface StepDetection {
  stepId: string;
  /**
   * When the sound was captured, in monotonic milliseconds on the capture
   * clock (`AudioCaptureService.now()`), not wall-clock time.
   */
  timestamp: number;
  /** The same entry `runComplete` will carry for this step. */
  result: StepResult;
}

/**
 * Where a run's zero point came from. `beep` is the start beep as the
 * microphone heard it, which is when the shooter heard it too. `trigger`
 * is the moment the beep was requested, used when it was not heard (volume
 * off, headphones); the phone plays a sound some tens of milliseconds
 * after it is asked to, so the first step of such a run reads long by that
 * much.
 */
export type RunZeroSource = 'beep' | 'trigger';

/** The instant a run is timed from. */
export interface RunZero {
  /** Monotonic milliseconds on the capture clock. */
  timestamp: number;
  source: RunZeroSource;
  /**
   * How long after it was requested the beep was heard, in milliseconds.
   * `null` when it was not heard.
   */
  beepDelayMs: number | null;
}

/**
 * Which clock stamped the sounds of a run. `frame` is the audio hardware's
 * own frame counter, exact to the sample. `read` means the device has no
 * such counter and each buffer was stamped as it was read instead, which
 * can put a step off by the length of a hardware burst (around 20 ms).
 */
export type RunClockSource = 'frame' | 'read';

/** A run as far as it got. */
export interface RunResult {
  /** Whether every heard step of the drill was detected. */
  completed: boolean;
  /** One entry per step detected, in the order they happened. */
  results: StepResult[];
  /** Seconds from the zero point to the last step detected; 0 with none. */
  totalTime: number;
  zeroSource: RunZeroSource;
  /** See `RunZero.beepDelayMs`. */
  beepDelayMs: number | null;
  clockSource: RunClockSource;
}
