import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';

import {
  AUDIO_AMPLITUDE_EVENT,
  AUDIO_CAPTURE_ERROR_EVENT,
  AudioCaptureError,
  hasMicrophonePermission,
  isAudioCaptureActive,
  requestMicrophonePermission,
  startAudioCapture,
  stopAudioCapture,
  subscribeToAmplitude,
  subscribeToAudioCaptureErrors,
} from '../src/services/audioCapture';
import NativeAudioCapture from '../src/specs/NativeAudioCapture';
import type { AmplitudeReading } from '../src/types/audio';

// The native module itself is mocked globally in jest.setup.js.
const mockedNativeAudioCapture = jest.mocked(NativeAudioCapture);

const setPlatformOS = (os: typeof Platform.OS): void => {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
};

/** A rejection shaped like the one React Native builds from `promise.reject(code, message)`. */
const nativeRejection = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code });

const captureRejection = async (
  promise: Promise<unknown>,
): Promise<unknown> => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected the promise to reject');
};

describe('audioCapture service', () => {
  const originalPlatformOS = Platform.OS;
  let mockedRequest: jest.SpiedFunction<typeof PermissionsAndroid.request>;
  let mockedCheck: jest.SpiedFunction<typeof PermissionsAndroid.check>;

  beforeEach(() => {
    setPlatformOS('android');
    mockedRequest = jest.spyOn(PermissionsAndroid, 'request');
    mockedCheck = jest.spyOn(PermissionsAndroid, 'check');
    mockedNativeAudioCapture.start.mockResolvedValue(undefined);
    mockedNativeAudioCapture.stop.mockResolvedValue(undefined);
    mockedNativeAudioCapture.isCapturing.mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
    setPlatformOS(originalPlatformOS);
  });

  describe('requestMicrophonePermission', () => {
    it('returns granted when the user grants the permission', async () => {
      mockedRequest.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

      const result = await requestMicrophonePermission();

      expect(result).toBe('granted');
      expect(mockedRequest).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
    });

    it('returns blocked when the user selects never ask again', async () => {
      mockedRequest.mockResolvedValue(
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      );

      const result = await requestMicrophonePermission();

      expect(result).toBe('blocked');
    });

    it('returns denied when the user declines the permission', async () => {
      mockedRequest.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

      const result = await requestMicrophonePermission();

      expect(result).toBe('denied');
    });

    it('throws AudioCaptureError when the native request rejects', async () => {
      mockedRequest.mockRejectedValue(new Error('native failure'));

      await expect(requestMicrophonePermission()).rejects.toBeInstanceOf(
        AudioCaptureError,
      );
    });
  });

  describe('hasMicrophonePermission', () => {
    it('resolves with the current grant state', async () => {
      mockedCheck.mockResolvedValue(true);

      await expect(hasMicrophonePermission()).resolves.toBe(true);
    });
  });

  describe('startAudioCapture / stopAudioCapture', () => {
    it('starts the native capture loop', async () => {
      await startAudioCapture();

      expect(mockedNativeAudioCapture.start).toHaveBeenCalledTimes(1);
    });

    it('stops the native capture loop', async () => {
      await stopAudioCapture();

      expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
    });

    it('reports a missing permission as PERMISSION_DENIED', async () => {
      const rejection = nativeRejection(
        'PERMISSION_DENIED',
        'RECORD_AUDIO permission has not been granted',
      );
      mockedNativeAudioCapture.start.mockRejectedValue(rejection);

      const error = await captureRejection(startAudioCapture());

      expect(error).toBeInstanceOf(AudioCaptureError);
      expect(error).toMatchObject({
        code: 'PERMISSION_DENIED',
        cause: rejection,
      });
    });

    it('tells a microphone that failed to open apart from a missing permission', async () => {
      mockedNativeAudioCapture.start.mockRejectedValue(
        nativeRejection('INIT_FAILED', 'AudioRecord failed to initialize'),
      );

      const error = await captureRejection(startAudioCapture());

      expect(error).toMatchObject({ code: 'INIT_FAILED' });
    });

    it('reports a start attempted in the background as NOT_IN_FOREGROUND', async () => {
      mockedNativeAudioCapture.start.mockRejectedValue(
        nativeRejection(
          'NOT_IN_FOREGROUND',
          'Audio capture can only start while the app is in the foreground',
        ),
      );

      const error = await captureRejection(startAudioCapture());

      expect(error).toMatchObject({ code: 'NOT_IN_FOREGROUND' });
    });

    it('falls back to UNKNOWN when the native failure carries no recognised code', async () => {
      mockedNativeAudioCapture.start.mockRejectedValue(
        nativeRejection('SOMETHING_NEW', 'unexpected'),
      );

      const error = await captureRejection(startAudioCapture());

      expect(error).toBeInstanceOf(AudioCaptureError);
      expect(error).toMatchObject({ code: 'UNKNOWN' });
    });

    it('falls back to UNKNOWN when the native failure is not an object', async () => {
      mockedNativeAudioCapture.start.mockRejectedValue('boom');

      const error = await captureRejection(startAudioCapture());

      expect(error).toMatchObject({ code: 'UNKNOWN', cause: 'boom' });
    });

    it('throws AudioCaptureError when stopping fails', async () => {
      mockedNativeAudioCapture.stop.mockRejectedValue(new Error('stuck'));

      await expect(stopAudioCapture()).rejects.toBeInstanceOf(
        AudioCaptureError,
      );
    });
  });

  describe('isAudioCaptureActive', () => {
    it('returns the native capturing state', () => {
      mockedNativeAudioCapture.isCapturing.mockReturnValue(true);

      expect(isAudioCaptureActive()).toBe(true);
    });
  });

  describe('subscribeToAmplitude', () => {
    it('delivers readings emitted by the native side until unsubscribed', () => {
      const listener = jest.fn();
      const reading: AmplitudeReading = {
        amplitude: 0.42,
        db: -7.5,
        peak: 0.9,
        peakDb: -0.9,
        timestamp: 1023.2,
        peakTimestamp: 1011.6,
      };

      const unsubscribe = subscribeToAmplitude(listener);
      DeviceEventEmitter.emit(AUDIO_AMPLITUDE_EVENT, reading);

      expect(listener).toHaveBeenCalledWith(reading);

      unsubscribe();
      DeviceEventEmitter.emit(AUDIO_AMPLITUDE_EVENT, reading);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeToAudioCaptureErrors', () => {
    it('delivers a mid-stream failure as an AudioCaptureError with its code', () => {
      const listener = jest.fn();

      const unsubscribe = subscribeToAudioCaptureErrors(listener);
      DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
        code: 'READ_FAILED',
        message: 'mic disappeared',
      });
      unsubscribe();

      expect(listener).toHaveBeenCalledTimes(1);
      const [error] = listener.mock.calls[0];
      expect(error).toBeInstanceOf(AudioCaptureError);
      expect(error).toMatchObject({
        code: 'READ_FAILED',
        message: 'mic disappeared',
      });
    });

    it('reports capture stopped by the app leaving the foreground as INTERRUPTED', () => {
      const listener = jest.fn();

      const unsubscribe = subscribeToAudioCaptureErrors(listener);
      DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
        code: 'INTERRUPTED',
        message: 'Audio capture stopped because the app left the foreground',
      });
      unsubscribe();

      expect(listener.mock.calls[0][0]).toMatchObject({ code: 'INTERRUPTED' });
    });

    it('still delivers an error when the native payload is malformed', () => {
      const listener = jest.fn();

      const unsubscribe = subscribeToAudioCaptureErrors(listener);
      DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, undefined);
      unsubscribe();

      const [error] = listener.mock.calls[0];
      expect(error).toBeInstanceOf(AudioCaptureError);
      expect(error).toMatchObject({ code: 'UNKNOWN' });
    });

    it('stops delivering errors once unsubscribed', () => {
      const listener = jest.fn();

      const unsubscribe = subscribeToAudioCaptureErrors(listener);
      unsubscribe();
      DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
        code: 'READ_FAILED',
        message: 'late',
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('on a platform other than Android', () => {
    beforeEach(() => {
      setPlatformOS('ios');
    });

    it('rejects a start with UNSUPPORTED_PLATFORM without touching the native module', async () => {
      const error = await captureRejection(startAudioCapture());

      expect(error).toBeInstanceOf(AudioCaptureError);
      expect(error).toMatchObject({ code: 'UNSUPPORTED_PLATFORM' });
      expect(mockedNativeAudioCapture.start).not.toHaveBeenCalled();
    });

    it('reports capture as inactive', () => {
      mockedNativeAudioCapture.isCapturing.mockReturnValue(true);

      expect(isAudioCaptureActive()).toBe(false);
    });
  });
});
