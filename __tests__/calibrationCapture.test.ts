import { AudioCaptureError } from '../src/services/audioCapture';
import {
  CalibrationCaptureAbortError,
  CalibrationCaptureError,
  captureSample,
  type CalibrationCaptureAudio,
} from '../src/services/calibrationCapture';
import type { AmplitudeReading } from '../src/types/audio';
import { DBFS_MIN } from '../src/types/calibration';
import { CALIBRATION_LISTEN_MS } from '../src/utils/calibration';

type FakeAudio = {
  audio: jest.Mocked<CalibrationCaptureAudio>;
  /** Deliver a reading with this peak level, as the microphone stream would. */
  hear: (peakDb: number) => void;
  /** Deliver whatever crossed the bridge, well formed or not. */
  emit: (reading: unknown) => void;
  /** Stop the stream on its own, as the native module reports it. */
  breakStream: (error: AudioCaptureError) => void;
  /** Listeners still attached to either stream. */
  listenerCount: () => number;
};

const createFakeAudio = (): FakeAudio => {
  const amplitudeListeners = new Set<(reading: AmplitudeReading) => void>();
  const errorListeners = new Set<(error: AudioCaptureError) => void>();

  const audio: jest.Mocked<CalibrationCaptureAudio> = {
    hasPermission: jest.fn(async () => true),
    requestPermission: jest.fn(async () => 'granted' as const),
    start: jest.fn(async () => {}),
    stop: jest.fn(async () => {}),
    subscribeToAmplitude: jest.fn(listener => {
      amplitudeListeners.add(listener);
      return () => {
        amplitudeListeners.delete(listener);
      };
    }),
    subscribeToErrors: jest.fn(listener => {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    }),
  };

  const emit = (reading: unknown): void => {
    [...amplitudeListeners].forEach(listener =>
      listener(reading as AmplitudeReading),
    );
  };

  return {
    audio,
    emit,
    hear: peakDb =>
      emit({
        amplitude: 0.1,
        db: peakDb - 3,
        peak: 0.2,
        peakDb,
        timestamp: 0,
        peakTimestamp: 0,
      }),
    breakStream: error => {
      [...errorListeners].forEach(listener => listener(error));
    },
    listenerCount: () => amplitudeListeners.size + errorListeners.size,
  };
};

/** Let the permission check and the microphone opening resolve. */
const untilListening = (): Promise<void> => jest.advanceTimersByTimeAsync(0);

const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected the promise to reject');
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('captureSample', () => {
  it('resolves with the loudest peak heard during the window', async () => {
    const fake = createFakeAudio();
    const promise = captureSample({ audio: fake.audio });
    await untilListening();

    fake.hear(-42);
    fake.hear(-11.5);
    fake.hear(-30);
    await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);

    await expect(promise).resolves.toEqual({ peakDbfs: -11.5 });
  });

  it('keeps listening until the whole window has passed', async () => {
    const fake = createFakeAudio();
    const settled = jest.fn();
    captureSample({ audio: fake.audio }).then(settled, settled);
    await untilListening();

    await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('listens for a custom length of time', async () => {
    const fake = createFakeAudio();
    const promise = captureSample({ audio: fake.audio, durationMs: 250 });
    await untilListening();

    fake.hear(-20);
    await jest.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toEqual({ peakDbfs: -20 });
  });

  it('times the window from when the microphone opens, not from the call', async () => {
    const fake = createFakeAudio();
    fake.audio.start.mockImplementation(
      () => new Promise<void>(resolve => setTimeout(resolve, 400)),
    );
    const settled = jest.fn();
    captureSample({ audio: fake.audio, durationMs: 1000 }).then(
      settled,
      settled,
    );

    await jest.advanceTimersByTimeAsync(1399);
    expect(settled).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('resolves to the bottom of the scale when nothing was heard', async () => {
    const fake = createFakeAudio();
    const promise = captureSample({ audio: fake.audio });
    await untilListening();

    await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);

    await expect(promise).resolves.toEqual({ peakDbfs: DBFS_MIN });
  });

  it('ignores readings that are not a level on the dBFS scale', async () => {
    const fake = createFakeAudio();
    const promise = captureSample({ audio: fake.audio });
    await untilListening();

    fake.hear(-25);
    fake.hear(Number.NaN);
    fake.hear(-Infinity);
    fake.hear(12);
    fake.emit({ peakDb: '-1' });
    fake.emit(null);
    fake.emit(undefined);
    await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);

    await expect(promise).resolves.toEqual({ peakDbfs: -25 });
  });

  it('closes the microphone and stops listening to it when the window ends', async () => {
    const fake = createFakeAudio();
    const promise = captureSample({ audio: fake.audio });
    await untilListening();
    expect(fake.listenerCount()).toBe(2);

    await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);
    await promise;

    expect(fake.audio.stop).toHaveBeenCalledTimes(1);
    expect(fake.listenerCount()).toBe(0);
  });

  it('rejects a listening time that is not a positive number', async () => {
    const fake = createFakeAudio();

    for (const durationMs of [0, -1, Number.NaN, Infinity]) {
      await expect(
        captureSample({ audio: fake.audio, durationMs }),
      ).rejects.toBeInstanceOf(CalibrationCaptureError);
    }
    expect(fake.audio.start).not.toHaveBeenCalled();
  });

  describe('microphone permission', () => {
    it('does not ask again when the permission is already granted', async () => {
      const fake = createFakeAudio();
      const promise = captureSample({ audio: fake.audio });
      await untilListening();
      await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);
      await promise;

      expect(fake.audio.requestPermission).not.toHaveBeenCalled();
    });

    it('asks for the permission when it is missing, then listens', async () => {
      const fake = createFakeAudio();
      fake.audio.hasPermission.mockResolvedValue(false);
      const promise = captureSample({ audio: fake.audio });
      await untilListening();

      fake.hear(-18);
      await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);

      await expect(promise).resolves.toEqual({ peakDbfs: -18 });
      expect(fake.audio.requestPermission).toHaveBeenCalledTimes(1);
    });

    it('reports a declined permission without opening the microphone', async () => {
      const fake = createFakeAudio();
      fake.audio.hasPermission.mockResolvedValue(false);
      fake.audio.requestPermission.mockResolvedValue('denied');

      const error = await rejectionOf(captureSample({ audio: fake.audio }));

      expect(error).toBeInstanceOf(CalibrationCaptureError);
      expect(error).toMatchObject({ code: 'PERMISSION_DENIED' });
      expect(fake.audio.start).not.toHaveBeenCalled();
    });

    it('reports a permission that can only be granted from settings', async () => {
      const fake = createFakeAudio();
      fake.audio.hasPermission.mockResolvedValue(false);
      fake.audio.requestPermission.mockResolvedValue('blocked');

      const error = await rejectionOf(captureSample({ audio: fake.audio }));

      expect(error).toBeInstanceOf(CalibrationCaptureError);
      expect(error).toMatchObject({ code: 'PERMISSION_BLOCKED' });
      expect(fake.audio.start).not.toHaveBeenCalled();
    });

    it('reports a failed permission check as a capture failure', async () => {
      const fake = createFakeAudio();
      const cause = new AudioCaptureError('Failed to check');
      fake.audio.hasPermission.mockRejectedValue(cause);

      const error = await rejectionOf(captureSample({ audio: fake.audio }));

      expect(error).toBeInstanceOf(CalibrationCaptureError);
      expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause });
    });

    it('reports a permission revoked between the check and the start', async () => {
      const fake = createFakeAudio();
      fake.audio.start.mockRejectedValue(
        new AudioCaptureError(
          'Failed to start',
          undefined,
          'PERMISSION_DENIED',
        ),
      );

      const error = await rejectionOf(captureSample({ audio: fake.audio }));

      expect(error).toMatchObject({ code: 'PERMISSION_DENIED' });
    });
  });

  describe('when the microphone fails', () => {
    it('reports a microphone that cannot be opened, keeping the cause', async () => {
      const fake = createFakeAudio();
      const cause = new AudioCaptureError(
        'Failed to start',
        undefined,
        'INIT_FAILED',
      );
      fake.audio.start.mockRejectedValue(cause);

      const error = await rejectionOf(captureSample({ audio: fake.audio }));

      expect(error).toBeInstanceOf(CalibrationCaptureError);
      expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause });
      expect(fake.listenerCount()).toBe(0);
    });

    it('leaves no listener behind when the stream cannot be subscribed to', async () => {
      const fake = createFakeAudio();
      const cause = new AudioCaptureError('no emitter');
      fake.audio.subscribeToErrors.mockImplementation(() => {
        throw cause;
      });

      const error = await rejectionOf(captureSample({ audio: fake.audio }));

      expect(error).toBeInstanceOf(CalibrationCaptureError);
      expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause });
      expect(fake.listenerCount()).toBe(0);
      expect(fake.audio.start).not.toHaveBeenCalled();
    });

    it('reports a start outside the foreground as an interruption', async () => {
      const fake = createFakeAudio();
      fake.audio.start.mockRejectedValue(
        new AudioCaptureError(
          'Failed to start',
          undefined,
          'NOT_IN_FOREGROUND',
        ),
      );

      const error = await rejectionOf(captureSample({ audio: fake.audio }));

      expect(error).toMatchObject({ code: 'INTERRUPTED' });
    });

    it('rejects as interrupted when the app leaves the foreground mid-window', async () => {
      const fake = createFakeAudio();
      const promise = captureSample({ audio: fake.audio });
      const rejection = rejectionOf(promise);
      await untilListening();
      fake.hear(-10);

      fake.breakStream(
        new AudioCaptureError('left the foreground', undefined, 'INTERRUPTED'),
      );

      const error = await rejection;
      expect(error).toBeInstanceOf(CalibrationCaptureError);
      expect(error).toMatchObject({ code: 'INTERRUPTED' });
      expect(fake.listenerCount()).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('rejects as a capture failure when a read fails mid-window', async () => {
      const fake = createFakeAudio();
      const rejection = rejectionOf(captureSample({ audio: fake.audio }));
      await untilListening();

      fake.breakStream(
        new AudioCaptureError('read failed', undefined, 'READ_FAILED'),
      );

      expect(await rejection).toMatchObject({ code: 'CAPTURE_FAILED' });
    });

    it('still closes the microphone after a failed capture', async () => {
      const fake = createFakeAudio();
      const rejection = rejectionOf(captureSample({ audio: fake.audio }));
      await untilListening();

      fake.breakStream(
        new AudioCaptureError('read failed', undefined, 'READ_FAILED'),
      );
      await rejection;

      expect(fake.audio.stop).toHaveBeenCalledTimes(1);
    });

    it('reports the failure that ended the capture when closing fails too', async () => {
      const fake = createFakeAudio();
      fake.audio.stop.mockRejectedValue(new AudioCaptureError('stop failed'));
      const cause = new AudioCaptureError(
        'left the foreground',
        undefined,
        'INTERRUPTED',
      );
      const rejection = rejectionOf(captureSample({ audio: fake.audio }));
      await untilListening();

      fake.breakStream(cause);

      expect(await rejection).toMatchObject({ code: 'INTERRUPTED', cause });
    });

    it('rejects when the microphone cannot be closed after a full window', async () => {
      const fake = createFakeAudio();
      const cause = new AudioCaptureError('stop failed');
      fake.audio.stop.mockRejectedValue(cause);
      const rejection = rejectionOf(captureSample({ audio: fake.audio }));
      await untilListening();

      await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);

      const error = await rejection;
      expect(error).toBeInstanceOf(CalibrationCaptureError);
      expect(error).toMatchObject({ code: 'CAPTURE_FAILED', cause });
    });
  });

  describe('cancelling', () => {
    it('rejects without touching the microphone when already aborted', async () => {
      const fake = createFakeAudio();
      const controller = new AbortController();
      controller.abort();

      await expect(
        captureSample({ audio: fake.audio, signal: controller.signal }),
      ).rejects.toBeInstanceOf(CalibrationCaptureAbortError);
      expect(fake.audio.hasPermission).not.toHaveBeenCalled();
      expect(fake.audio.start).not.toHaveBeenCalled();
    });

    it('rejects and closes the microphone when aborted mid-window', async () => {
      const fake = createFakeAudio();
      const controller = new AbortController();
      const rejection = rejectionOf(
        captureSample({ audio: fake.audio, signal: controller.signal }),
      );
      await untilListening();
      fake.hear(-10);

      controller.abort();

      expect(await rejection).toBeInstanceOf(CalibrationCaptureAbortError);
      expect(fake.audio.stop).toHaveBeenCalledTimes(1);
      expect(fake.listenerCount()).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('does not open the microphone when aborted while the permission dialog is up', async () => {
      const fake = createFakeAudio();
      const controller = new AbortController();
      let answerDialog: (status: 'granted') => void = () => {};
      fake.audio.hasPermission.mockResolvedValue(false);
      fake.audio.requestPermission.mockImplementation(
        () =>
          new Promise(resolve => {
            answerDialog = resolve;
          }),
      );
      const rejection = rejectionOf(
        captureSample({ audio: fake.audio, signal: controller.signal }),
      );
      await untilListening();

      controller.abort();
      answerDialog('granted');

      expect(await rejection).toBeInstanceOf(CalibrationCaptureAbortError);
      expect(fake.audio.start).not.toHaveBeenCalled();
    });

    it('rejects when aborted while the microphone is closing', async () => {
      const fake = createFakeAudio();
      const controller = new AbortController();
      let finishClosing: () => void = () => {};
      fake.audio.stop.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finishClosing = resolve;
          }),
      );
      const rejection = rejectionOf(
        captureSample({ audio: fake.audio, signal: controller.signal }),
      );
      await untilListening();
      fake.hear(-10);
      await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);

      controller.abort();
      finishClosing();

      expect(await rejection).toBeInstanceOf(CalibrationCaptureAbortError);
    });

    it('does not start the window when aborted while the microphone is opening', async () => {
      const fake = createFakeAudio();
      const controller = new AbortController();
      let finishOpening: () => void = () => {};
      fake.audio.start.mockImplementation(
        () =>
          new Promise<void>(resolve => {
            finishOpening = resolve;
          }),
      );
      const rejection = rejectionOf(
        captureSample({ audio: fake.audio, signal: controller.signal }),
      );
      await untilListening();

      controller.abort();
      finishOpening();

      expect(await rejection).toBeInstanceOf(CalibrationCaptureAbortError);
      expect(fake.audio.stop).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
