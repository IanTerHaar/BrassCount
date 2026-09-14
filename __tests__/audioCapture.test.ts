import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';

jest.mock('@/specs/NativeAudioCapture', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    stop: jest.fn(),
    isCapturing: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

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
} from '@/services/audioCapture';
import NativeAudioCapture from '@/specs/NativeAudioCapture';

const mockedNativeAudioCapture = jest.mocked(NativeAudioCapture);

describe('audioCapture service', () => {
  const originalPlatformOS = Platform.OS;
  let mockedRequest: jest.SpiedFunction<typeof PermissionsAndroid.request>;
  let mockedCheck: jest.SpiedFunction<typeof PermissionsAndroid.check>;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatformOS,
      configurable: true,
    });
  });

  beforeEach(() => {
    mockedRequest = jest.spyOn(PermissionsAndroid, 'request');
    mockedCheck = jest.spyOn(PermissionsAndroid, 'check');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestMicrophonePermission', () => {
    it('should return granted when the user grants the permission', async () => {
      mockedRequest.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);

      const result = await requestMicrophonePermission();

      expect(result).toBe('granted');
      expect(mockedRequest).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
    });

    it('should return blocked when the user selects never ask again', async () => {
      mockedRequest.mockResolvedValue(
        PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      );

      const result = await requestMicrophonePermission();

      expect(result).toBe('blocked');
    });

    it('should return denied when the user declines the permission', async () => {
      mockedRequest.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);

      const result = await requestMicrophonePermission();

      expect(result).toBe('denied');
    });

    it('should throw AudioCaptureError when the native request rejects', async () => {
      mockedRequest.mockRejectedValue(new Error('native failure'));

      await expect(requestMicrophonePermission()).rejects.toThrow(
        AudioCaptureError,
      );
    });
  });

  describe('hasMicrophonePermission', () => {
    it('should resolve with the current grant state', async () => {
      mockedCheck.mockResolvedValue(true);

      await expect(hasMicrophonePermission()).resolves.toBe(true);
    });
  });

  describe('startAudioCapture / stopAudioCapture', () => {
    it('should delegate to the native module and resolve', async () => {
      mockedNativeAudioCapture.start.mockResolvedValue(undefined);

      await startAudioCapture();

      expect(mockedNativeAudioCapture.start).toHaveBeenCalledTimes(1);
    });

    it('should wrap a native start failure in AudioCaptureError', async () => {
      mockedNativeAudioCapture.start.mockRejectedValue(
        new Error('PERMISSION_DENIED'),
      );

      await expect(startAudioCapture()).rejects.toThrow(AudioCaptureError);
    });

    it('should delegate stop to the native module and resolve', async () => {
      mockedNativeAudioCapture.stop.mockResolvedValue(undefined);

      await stopAudioCapture();

      expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAudioCaptureActive', () => {
    it('should return the native capturing state', () => {
      mockedNativeAudioCapture.isCapturing.mockReturnValue(true);

      expect(isAudioCaptureActive()).toBe(true);
    });
  });

  describe('subscribeToAmplitude', () => {
    it('should invoke the listener with readings emitted by the native side', () => {
      const listener = jest.fn();
      const reading = { amplitude: 0.42, db: -12.3, timestamp: 1000 };

      const unsubscribe = subscribeToAmplitude(listener);
      DeviceEventEmitter.emit(AUDIO_AMPLITUDE_EVENT, reading);

      expect(listener).toHaveBeenCalledWith(reading);

      unsubscribe();
      DeviceEventEmitter.emit(AUDIO_AMPLITUDE_EVENT, reading);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeToAudioCaptureErrors', () => {
    it('should invoke the listener with the error message', () => {
      const listener = jest.fn();

      const unsubscribe = subscribeToAudioCaptureErrors(listener);
      DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
        message: 'mic disappeared',
      });

      expect(listener).toHaveBeenCalledWith('mic disappeared');

      unsubscribe();
    });
  });
});
