/**
 * A single live input-level sample from the Microphone Audio Capture
 * Service. This service only reports "current input level" — it does not
 * interpret what the sound means (see DrillRunEngine for that).
 */
export interface AmplitudeReading {
  /** Normalized RMS amplitude for this buffer, from 0 (silence) to 1 (full scale). */
  amplitude: number;
  /** The same reading expressed in dBFS, roughly -160 (silence) to 0 (full scale). */
  db: number;
  /**
   * Monotonic milliseconds (Android `SystemClock.elapsedRealtime()`) at
   * which this buffer was captured. Only comparable to other readings from
   * the same capture session — not a wall-clock timestamp.
   */
  timestamp: number;
}

/** Outcome of a runtime microphone permission request or check. */
export type MicrophonePermissionStatus = 'granted' | 'denied' | 'blocked';
