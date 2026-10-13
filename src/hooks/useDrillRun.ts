import { useCallback, useEffect, useRef, useState } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import type { CalibrationSound } from '@/types/calibration';
import type { DrillStep } from '@/types/drill';
import type { RunResult, StepResult } from '@/types/run';
import { useCalibration } from '@hooks/useCalibration';
import { AudioCaptureService } from '@services/audioCapture';
import {
  DrillRunAbortError,
  DrillRunEngine,
  DrillRunError,
  type DrillRun,
} from '@services/drillRunEngine';
import {
  StartSequenceAbortError,
  StartSequenceError,
  StartSequenceService,
} from '@services/startSequence';

/**
 * Where a run is. `arming`: the microphone is being opened. `waiting`: the
 * random delay before the beep. `running`: the beep has been requested and
 * steps are being listened for. `finished`: the run ended, complete or not,
 * and its times are on show.
 */
export type DrillRunPhase =
  'idle' | 'arming' | 'waiting' | 'running' | 'finished';

/** Why a run did not start, or stopped. */
export type DrillRunFailure =
  /** A sound the drill needs has not been calibrated this session. */
  | { kind: 'not-calibrated'; sounds: readonly CalibrationSound[] }
  /** The drill has no shot, reload or rack step. */
  | { kind: 'no-steps' }
  | { kind: 'permission-denied' }
  | { kind: 'permission-blocked' }
  /** The app was left, which closes the microphone. */
  | { kind: 'interrupted' }
  | { kind: 'microphone' }
  /** The start beep could not be played. */
  | { kind: 'beep' }
  /** The audio output could not be set up when the screen opened. */
  | { kind: 'audio-unavailable' };

export type UseDrillRunResult = {
  phase: DrillRunPhase;
  /** How each step heard so far went, in the order they were heard. */
  results: readonly StepResult[];
  /** The run as it ended. `null` until it has. */
  result: RunResult | null;
  failure: DrillRunFailure | null;
  /** Seconds since the run's zero point; 0 until that is settled. */
  readElapsed: () => number;
  /** Open the microphone, wait the random delay, beep and listen. */
  start: (steps: readonly DrillStep[]) => void;
  /**
   * Before the beep: cancel the start. During the run: end it early and
   * keep what was heard.
   */
  stop: () => void;
  /** Drop the run and everything it showed. */
  reset: () => void;
};

const MS_PER_SECOND = 1000;

/** The run's own failure in an error, when there is one to find. */
const runErrorIn = (err: unknown): DrillRunError | null => {
  if (err instanceof DrillRunError) {
    return err;
  }
  // The start sequence wraps whatever its trigger callback threw, and that
  // callback is where the run is told to begin.
  return err instanceof StartSequenceError && err.cause instanceof DrillRunError
    ? err.cause
    : null;
};

const failureFor = (err: unknown): DrillRunFailure => {
  const failed = runErrorIn(err);
  if (failed === null) {
    // Anything else thrown on the way to a run is the start sequence
    // failing to sound its beep.
    return { kind: 'beep' };
  }
  switch (failed.code) {
    case 'NOT_CALIBRATED':
      return { kind: 'not-calibrated', sounds: failed.sounds };
    case 'NO_DETECTABLE_STEPS':
      return { kind: 'no-steps' };
    case 'PERMISSION_DENIED':
      return { kind: 'permission-denied' };
    case 'PERMISSION_BLOCKED':
      return { kind: 'permission-blocked' };
    case 'INTERRUPTED':
      return { kind: 'interrupted' };
    case 'CAPTURE_FAILED':
    case 'INVALID_STATE':
      return { kind: 'microphone' };
  }
};

/**
 * Close a run's microphone and get the run as far as it got. Never
 * rejects: `closed` is false when the microphone would not close.
 */
const endRun = async (
  run: DrillRun,
): Promise<{ result: RunResult; closed: boolean }> => {
  try {
    return { result: await run.stop(), closed: true };
  } catch {
    // The run is marked ended by the first call, so the second only reads
    // what was heard and has nothing left that can fail.
    return { result: await run.stop(), closed: false };
  }
};

/**
 * Runs one drill at a time on the Timer screen: opens the microphone,
 * sounds the start beep after a random delay, and follows the drill run
 * engine as it hears each step.
 *
 * Thresholds come from the calibration store as they are when the run
 * starts. A run is stopped when the screen loses focus or unmounts, so the
 * microphone is never left listening behind another tab, and it ends on
 * its own when the app is left, since capture only runs in the foreground.
 */
export const useDrillRun = (): UseDrillRunResult => {
  const { state: calibration } = useCalibration();
  const [phase, setPhase] = useState<DrillRunPhase>('idle');
  const [results, setResults] = useState<readonly StepResult[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [failure, setFailure] = useState<DrillRunFailure | null>(null);

  // What the callbacks below need to read without being rebuilt.
  const phaseRef = useRef<DrillRunPhase>('idle');
  const runRef = useRef<DrillRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The run's zero point on the capture clock; not state, because the
  // clock readout polls it and nothing else is drawn from it.
  const zeroAtRef = useRef<number | null>(null);
  // Bumped by every start, cancel, reset and finish, so a run that has been
  // superseded or has already ended never writes to state.
  const runIdRef = useRef(0);
  // Settles when the last run started here has let go of the microphone.
  const settledRef = useRef<Promise<void>>(Promise.resolve());

  const goTo = useCallback((next: DrillRunPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    StartSequenceService.prepare().catch(() => {
      // Only worth saying while nothing else is: a run that got going has
      // its own header line.
      if (mounted && phaseRef.current === 'idle') {
        setFailure({ kind: 'audio-unavailable' });
      }
    });

    return () => {
      mounted = false;
      // Nothing to tell the shooter about an audio output that would not
      // close as the screen goes away.
      StartSequenceService.release().catch(() => {});
    };
  }, []);

  /** Detach from the current run, cancelling whatever it is waiting on. */
  const abandon = useCallback((): DrillRun | null => {
    runIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const run = runRef.current;
    runRef.current = null;
    return run;
  }, []);

  const finish = useCallback(
    (ended: RunResult) => {
      // The run is over: anything it still has to say comes too late.
      runIdRef.current += 1;
      abortRef.current = null;
      runRef.current = null;
      setResult(ended);
      setResults(ended.results);
      goTo('finished');
    },
    [goTo],
  );

  const start = useCallback(
    (steps: readonly DrillStep[]) => {
      // `endRun` never rejects.
      const previous = abandon();
      if (previous !== null) {
        endRun(previous).catch(() => {});
      }

      const runId = ++runIdRef.current;
      const isCurrent = (): boolean => runIdRef.current === runId;
      const controller = new AbortController();
      abortRef.current = controller;
      const run = DrillRunEngine.create({
        steps,
        calibration,
        beepMs: StartSequenceService.beep.durationMs,
      });
      runRef.current = run;
      zeroAtRef.current = null;

      setFailure(null);
      setResults([]);
      setResult(null);
      goTo('arming');

      run.on('zero', zero => {
        if (isCurrent()) {
          zeroAtRef.current = zero.timestamp;
        }
      });
      run.on('stepDetected', detection => {
        if (isCurrent()) {
          setResults(heard => [...heard, detection.result]);
        }
      });
      run.on('runComplete', ended => {
        if (isCurrent()) {
          finish(ended);
        }
      });
      run.on('error', err => {
        if (!isCurrent()) {
          return;
        }
        const failed = failureFor(err);
        if (phaseRef.current !== 'running') {
          // The microphone went before the beep: there is no run to show,
          // and the beep must not sound for one.
          abandon();
          setFailure(failed);
          goTo('idle');
          return;
        }
        // Taken, so a Stop pressed while it closes finds nothing to stop.
        runRef.current = null;
        endRun(run).then(
          ({ result: ended }) => {
            if (isCurrent()) {
              // Set together, so the screen says why with the result.
              setFailure(failed);
              finish(ended);
            }
          },
          () => {},
        );
      });

      const before = settledRef.current;
      const sequence = async (): Promise<void> => {
        // A run cancelled while its microphone was opening closes it again
        // once the opening finishes. Wait for that, or its close would land
        // on this run's microphone.
        await before;
        if (!isCurrent()) {
          return;
        }
        try {
          await run.arm({ signal: controller.signal });
          if (!isCurrent()) {
            return;
          }
          goTo('waiting');
          await StartSequenceService.start({
            signal: controller.signal,
            onTrigger: () => {
              run.begin();
              if (isCurrent()) {
                goTo('running');
              }
            },
          });
        } catch (err) {
          await endRun(run);
          if (!isCurrent()) {
            return;
          }
          // A cancel bumps the run id, so an abort never reaches here as
          // the current run; the check keeps a stray one from being shown.
          if (
            !(err instanceof DrillRunAbortError) &&
            !(err instanceof StartSequenceAbortError)
          ) {
            setFailure(failureFor(err));
          }
          abortRef.current = null;
          runRef.current = null;
          goTo('idle');
        }
      };
      // `sequence` settles every failure into state, so it never rejects.
      settledRef.current = sequence().catch(() => {});
    },
    [abandon, calibration, finish, goTo],
  );

  const stop = useCallback(() => {
    const run = runRef.current;
    if (run === null) {
      return;
    }

    if (phaseRef.current !== 'running') {
      abandon();
      endRun(run).catch(() => {});
      goTo('idle');
      return;
    }

    const runId = runIdRef.current;
    // Taken, so a second press while the microphone closes, or the blur
    // that follows, finds nothing to stop and the run finishes once.
    runRef.current = null;
    endRun(run).then(
      ({ result: ended, closed }) => {
        if (runIdRef.current !== runId) {
          return;
        }
        if (!closed) {
          setFailure({ kind: 'microphone' });
        }
        finish(ended);
      },
      () => {},
    );
  }, [abandon, finish, goTo]);

  const reset = useCallback(() => {
    const run = abandon();
    if (run !== null) {
      endRun(run).catch(() => {});
    }
    zeroAtRef.current = null;
    setFailure(null);
    setResults([]);
    setResult(null);
    goTo('idle');
  }, [abandon, goTo]);

  const readElapsed = useCallback((): number => {
    const zeroAt = zeroAtRef.current;
    if (zeroAt === null) {
      return 0;
    }
    try {
      return Math.max(0, (AudioCaptureService.now() - zeroAt) / MS_PER_SECOND);
    } catch {
      // The capture clock cannot be read. The readout holds at zero; the
      // run's own times come from the readings and are not affected.
      return 0;
    }
  }, []);

  // Returning `stop` as the cleanup runs it on blur and on unmount.
  useFocusEffect(useCallback(() => stop, [stop]));

  return { phase, results, result, failure, readElapsed, start, stop, reset };
};
