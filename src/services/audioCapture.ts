import { NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

import NativeAudioCapture from '@/specs/NativeAudioCapture';
import { AUDIO_CAPTURE_ERROR_CODES } from '@/types/audio';
import type {
  AmplitudeReading,
  AudioCaptureErrorCode,
  MicrophonePermissionStatus,
} from '@/types/audio';

/**
 * AudioCaptureService
 * -------------------
 * Thin JS wrapper around the native `AudioCapture` TurboModule (Kotlin,
 * `android/app/src/main/java/com/brasscount/app/audio/`). This is a
 * standalone, low-level service: it requests microphone permission,
 * starts/stops the native capture loop, and streams amplitude/dB readings.
 * It does not decide what a sound means — Calibration and the Drill Run
 * Detection Engine consume this stream to do that.
 *
 * Capture only runs while the app is in the foreground: the native module
 * stops it when the host activity pauses and reports that through the
 * error stream as `INTERRUPTED`. Callers restart it when they regain focus.
 *
 * Android-only: the native module and the app itself target Android first,
 * so every export here throws/no-ops on other platforms rather than
 * touching a TurboModule that doesn't exist there.
 */

/** Error thrown by this service. Callers can catch this to distinguish
 * audio capture failures from other runtime errors, and branch on `code`
 * to tell e.g. a missing permission from a busy microphone. */
export class AudioCaptureError extends Error {
  cause?: unknown;
  code: AudioCaptureErrorCode;

  constructor(
    message: string,
    cause?: unknown,
    code: AudioCaptureErrorCode = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'AudioCaptureError';
    this.cause = cause;
    this.code = code;
  }
}

/** Native event name emitted for each captured amplitude buffer. */
export const AUDIO_AMPLITUDE_EVENT = 'AudioCapture:onAmplitude';
/** Native event name emitted when the capture loop fails mid-stream. */
export const AUDIO_CAPTURE_ERROR_EVENT = 'AudioCapture:onError';

const FALLBACK_STREAM_ERROR_MESSAGE = 'Audio capture stopped unexpectedly';

// Constructed lazily (rather than at module scope) so that reading
// `Platform.OS` here always happens after the platform is known, not at
// import time.
let emitter: NativeEventEmitter | undefined;

function getEmitter(): NativeEventEmitter {
  if (!emitter) {
    emitter = new NativeEventEmitter(NativeAudioCapture);
  }
  return emitter;
}

function assertAndroid(): void {
  if (Platform.OS !== 'android') {
    throw new AudioCaptureError(
      'Audio capture is only supported on Android',
      undefined,
      'UNSUPPORTED_PLATFORM',
    );
  }
}

function toErrorCode(value: unknown): AudioCaptureErrorCode {
  const known = AUDIO_CAPTURE_ERROR_CODES.find(code => code === value);
  return known ?? 'UNKNOWN';
}

/** Read a string field off a value that crossed the native bridge. */
function readStringField(source: unknown, field: string): string | undefined {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }
  const value = (source as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

function mapPermissionResult(result: string): MicrophonePermissionStatus {
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted';
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'blocked';
  }
  return 'denied';
}

/**
 * Prompt the user for microphone access, showing the system permission
 * dialog if it hasn't been resolved yet.
 */
export async function requestMicrophonePermission(): Promise<MicrophonePermissionStatus> {
  assertAndroid();
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    return mapPermissionResult(result);
  } catch (err) {
    throw new AudioCaptureError('Failed to request microphone permission', err);
  }
}

/** Check whether microphone access has already been granted. */
export async function hasMicrophonePermission(): Promise<boolean> {
  assertAndroid();
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
  } catch (err) {
    throw new AudioCaptureError('Failed to check microphone permission', err);
  }
}

/**
 * Start the native capture loop. Resolves once recording has begun;
 * rejects with `AudioCaptureError` if microphone permission is missing
 * (`code: 'PERMISSION_DENIED'`) or the device's audio input can't be
 * opened. Safe to call again while already capturing (no-op).
 */
export async function startAudioCapture(): Promise<void> {
  assertAndroid();
  try {
    await NativeAudioCapture.start();
  } catch (err) {
    throw new AudioCaptureError(
      'Failed to start audio capture',
      err,
      toErrorCode(readStringField(err, 'code')),
    );
  }
}

/**
 * Stop the native capture loop and release the audio input. Safe to call
 * again while already stopped (no-op).
 */
export async function stopAudioCapture(): Promise<void> {
  assertAndroid();
  try {
    await NativeAudioCapture.stop();
  } catch (err) {
    throw new AudioCaptureError(
      'Failed to stop audio capture',
      err,
      toErrorCode(readStringField(err, 'code')),
    );
  }
}

/** Whether the native capture loop is currently running. */
export function isAudioCaptureActive(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }
  return NativeAudioCapture.isCapturing();
}

/**
 * Subscribe to live amplitude/dB readings. Returns an unsubscribe
 * function; call it (e.g. on unmount) to stop receiving events.
 */
export function subscribeToAmplitude(
  listener: (reading: AmplitudeReading) => void,
): () => void {
  assertAndroid();
  const subscription = getEmitter().addListener(
    AUDIO_AMPLITUDE_EVENT,
    listener,
  );
  return () => subscription.remove();
}

/**
 * Subscribe to the capture loop stopping on its own after
 * `startAudioCapture` has already resolved: a failed read
 * (`READ_FAILED`, e.g. the input device disappears mid-run) or the app
 * leaving the foreground (`INTERRUPTED`). Capture is no longer running by
 * the time the listener is called.
 */
export function subscribeToAudioCaptureErrors(
  listener: (error: AudioCaptureError) => void,
): () => void {
  assertAndroid();
  const subscription = getEmitter().addListener(
    AUDIO_CAPTURE_ERROR_EVENT,
    (event: unknown) =>
      listener(
        new AudioCaptureError(
          readStringField(event, 'message') ?? FALLBACK_STREAM_ERROR_MESSAGE,
          event,
          toErrorCode(readStringField(event, 'code')),
        ),
      ),
  );
  return () => subscription.remove();
}

/** Object-form export for callers that prefer a service handle. */
export const AudioCaptureService = {
  requestPermission: requestMicrophonePermission,
  hasPermission: hasMicrophonePermission,
  start: startAudioCapture,
  stop: stopAudioCapture,
  isActive: isAudioCaptureActive,
  subscribeToAmplitude,
  subscribeToErrors: subscribeToAudioCaptureErrors,
};

export type AudioCaptureServiceType = typeof AudioCaptureService;
