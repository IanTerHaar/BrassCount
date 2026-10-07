/**
 * A single live input-level sample from the Microphone Audio Capture
 * Service. This service only reports "current input level" — it does not
 * interpret what the sound means (see DrillRunEngine for that).
 *
 * All timestamps are monotonic milliseconds (Android
 * `SystemClock.elapsedRealtimeNanos()`, so they carry sub-millisecond
 * precision). They are only comparable to other readings from the same
 * capture session — not wall-clock time.
 */
export interface AmplitudeReading {
  /** Normalized RMS amplitude for this buffer, from 0 (silence) to 1 (full scale). */
  amplitude: number;
  /** The same reading expressed in dBFS, roughly -160 (silence) to 0 (full scale). */
  db: number;
  /** Normalized absolute level of the loudest sample in this buffer, 0 to 1. */
  peak: number;
  /** `peak` expressed in dBFS, roughly -160 (silence) to 0 (full scale). */
  peakDb: number;
  /** When the last sample of this buffer was captured. */
  timestamp: number;
  /**
   * When the loudest sample of this buffer was captured. Use this, not
   * `timestamp`, to time an impulse such as a shot: it locates the sound
   * within the buffer instead of rounding it to the buffer's end.
   */
  peakTimestamp: number;
}

/** Outcome of a runtime microphone permission request or check. */
export type MicrophonePermissionStatus = 'granted' | 'denied' | 'blocked';

/**
 * Why an audio capture operation failed. The native module's promise
 * rejection codes and error-event codes map onto this union one to one;
 * anything unrecognised becomes `UNKNOWN`.
 */
export const AUDIO_CAPTURE_ERROR_CODES = [
  /** `RECORD_AUDIO` has not been granted (or was revoked). */
  'PERMISSION_DENIED',
  /** Start was attempted while the app was not in the foreground. */
  'NOT_IN_FOREGROUND',
  /** The device rejected the sample rate / channel / format. */
  'UNSUPPORTED_CONFIG',
  /** The audio input could not be opened (e.g. held by another app). */
  'INIT_FAILED',
  /** The audio input opened but recording did not begin. */
  'START_FAILED',
  /** A read failed after capture had started. */
  'READ_FAILED',
  /** Capture was stopped because the app left the foreground. */
  'INTERRUPTED',
  /** Called on a platform other than Android. */
  'UNSUPPORTED_PLATFORM',
  'UNKNOWN',
] as const;

export type AudioCaptureErrorCode = (typeof AUDIO_CAPTURE_ERROR_CODES)[number];
