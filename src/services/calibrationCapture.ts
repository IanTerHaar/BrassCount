import type { MicrophonePermissionStatus } from '@/types/audio';
import { DBFS_MAX, DBFS_MIN } from '@/types/calibration';
import { CALIBRATION_LISTEN_MS } from '@utils/calibration';

import {
  AudioCaptureError,
  AudioCaptureService,
  type AudioCaptureServiceType,
} from './audioCapture';

/**
 * CalibrationCaptureService
 * -------------------------
 * Listens to the microphone for a fixed window and reports the loudest
 * level it heard. Recalibrate and Test on the Calibration screen are both
 * built on this one measurement: what the level means — a new threshold, or
 * a pass or fail against the current one — is decided by the caller (see
 * `src/utils/calibration.ts`).
 *
 * It asks for microphone permission when it is missing, and always leaves
 * the microphone closed again, however the capture ends.
 */

/**
 * Why a capture failed, reduced to what the user can do about it: grant the
 * permission in the dialog, grant it in Settings, come back to the app, or
 * just try again.
 */
export type CalibrationCaptureErrorCode =
  /** The user declined the permission dialog; asking again will show it. */
  | 'PERMISSION_DENIED'
  /** The permission can now only be granted from the system settings. */
  | 'PERMISSION_BLOCKED'
  /** The app left the foreground, which closes the microphone. */
  | 'INTERRUPTED'
  | 'CAPTURE_FAILED';

/** Error thrown by this service. Branch on `code` to tell failures apart. */
export class CalibrationCaptureError extends Error {
  cause?: unknown;
  code: CalibrationCaptureErrorCode;

  constructor(
    message: string,
    cause?: unknown,
    code: CalibrationCaptureErrorCode = 'CAPTURE_FAILED',
  ) {
    super(message);
    this.name = 'CalibrationCaptureError';
    this.cause = cause;
    this.code = code;
  }
}

/** Thrown when a capture is cancelled through its `AbortSignal`. */
export class CalibrationCaptureAbortError extends Error {
  constructor(message = 'Calibration capture aborted') {
    super(message);
    this.name = 'CalibrationCaptureAbortError';
  }
}

/** The part of the audio capture service a calibration capture uses. */
export type CalibrationCaptureAudio = Pick<
  AudioCaptureServiceType,
  | 'hasPermission'
  | 'requestPermission'
  | 'start'
  | 'stop'
  | 'subscribeToAmplitude'
  | 'subscribeToErrors'
>;

export interface CalibrationCaptureOptions {
  /** How long to listen for, once the microphone is open. */
  durationMs?: number;
  /** Cancels the capture; it then rejects with `CalibrationCaptureAbortError`. */
  signal?: AbortSignal;
  audio?: CalibrationCaptureAudio;
}

export interface CalibrationSample {
  /**
   * Loudest level heard during the window, in dBFS. `DBFS_MIN` when the
   * microphone reported nothing but silence.
   */
  peakDbfs: number;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new CalibrationCaptureAbortError();
  }
}

function codeFor(err: unknown): CalibrationCaptureErrorCode {
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

/**
 * The peak level of a reading off the amplitude stream, or `null` when it
 * is not a level on the dBFS scale. Readings cross the native bridge, so
 * their shape is checked rather than trusted.
 */
function readPeakDbfs(reading: unknown): number | null {
  if (typeof reading !== 'object' || reading === null) {
    return null;
  }
  const level = (reading as Record<string, unknown>).peakDb;
  return typeof level === 'number' &&
    Number.isFinite(level) &&
    level <= DBFS_MAX
    ? level
    : null;
}

async function ensureMicrophonePermission(
  audio: CalibrationCaptureAudio,
): Promise<void> {
  let status: MicrophonePermissionStatus;
  try {
    status = (await audio.hasPermission())
      ? 'granted'
      : await audio.requestPermission();
  } catch (err) {
    throw new CalibrationCaptureError(
      'Failed to get microphone permission',
      err,
    );
  }
  if (status === 'blocked') {
    throw new CalibrationCaptureError(
      'Microphone permission is blocked',
      undefined,
      'PERMISSION_BLOCKED',
    );
  }
  if (status === 'denied') {
    throw new CalibrationCaptureError(
      'Microphone permission was denied',
      undefined,
      'PERMISSION_DENIED',
    );
  }
}

/**
 * Open the microphone, listen for `durationMs` and resolve with the
 * loudest peak heard. Rejects as soon as the signal aborts or the stream
 * stops on its own; either way its listeners and timer are gone by the
 * time it settles. Closing the microphone is left to the caller.
 */
function listenForPeak(
  audio: CalibrationCaptureAudio,
  durationMs: number,
  signal: AbortSignal | undefined,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let peakDbfs = DBFS_MIN;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const unsubscribers: (() => void)[] = [];

    const finish = (settle: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      signal?.removeEventListener('abort', onAbort);
      unsubscribers.forEach(unsubscribe => unsubscribe());
      settle();
    };
    const onAbort = (): void =>
      finish(() => reject(new CalibrationCaptureAbortError()));

    signal?.addEventListener('abort', onAbort, { once: true });
    // Subscribed before the microphone opens, so a stream that stops the
    // moment it starts is not missed.
    try {
      // One push each, so the first is still unsubscribed if the second
      // subscription throws.
      unsubscribers.push(
        audio.subscribeToAmplitude(reading => {
          const level = readPeakDbfs(reading);
          if (level !== null && level > peakDbfs) {
            peakDbfs = level;
          }
        }),
      );
      unsubscribers.push(
        audio.subscribeToErrors(err => finish(() => reject(err))),
      );
    } catch (err) {
      finish(() => reject(err));
      return;
    }

    audio.start().then(
      () => {
        if (settled) {
          return;
        }
        // Timed from here, not from the call: opening the microphone
        // takes a moment, and none of it is listening time.
        timeoutId = setTimeout(
          () => finish(() => resolve(peakDbfs)),
          durationMs,
        );
      },
      (err: unknown) => finish(() => reject(err)),
    );
  });
}

/**
 * Listen to the microphone for a fixed window and resolve with the loudest
 * level heard, asking for microphone permission first when it has not been
 * granted.
 *
 * Rejects with `CalibrationCaptureError` when the permission is refused
 * (`PERMISSION_DENIED` / `PERMISSION_BLOCKED`), the app leaves the
 * foreground (`INTERRUPTED`) or the microphone cannot be used
 * (`CAPTURE_FAILED`), and with `CalibrationCaptureAbortError` when
 * `signal` aborts. A permission dialog that is already showing cannot be
 * dismissed, so an abort during it takes effect once the user answers.
 */
export async function captureSample(
  options: CalibrationCaptureOptions = {},
): Promise<CalibrationSample> {
  const {
    durationMs = CALIBRATION_LISTEN_MS,
    signal,
    audio = AudioCaptureService,
  } = options;

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new CalibrationCaptureError(
      'Listening time must be a positive number of milliseconds',
    );
  }

  throwIfAborted(signal);
  await ensureMicrophonePermission(audio);
  throwIfAborted(signal);

  let peakDbfs: number;
  try {
    peakDbfs = await listenForPeak(audio, durationMs, signal);
  } catch (err) {
    // The failure that ended the capture is the one worth reporting; a
    // stop that fails as well would only hide it.
    await audio.stop().catch(() => {});
    if (err instanceof CalibrationCaptureAbortError) {
      throw err;
    }
    throw new CalibrationCaptureError(
      'Failed to capture a calibration sample',
      err,
      codeFor(err),
    );
  }

  try {
    await audio.stop();
  } catch (err) {
    throw new CalibrationCaptureError('Failed to release the microphone', err);
  }
  // An abort that landed while the microphone was closing still counts:
  // the caller no longer wants this sample.
  throwIfAborted(signal);
  return { peakDbfs };
}

/** Object-form export for callers that prefer a service handle. */
export const CalibrationCaptureService = {
  listenMs: CALIBRATION_LISTEN_MS,
  capture: captureSample,
};

export type CalibrationCaptureServiceType = typeof CalibrationCaptureService;
