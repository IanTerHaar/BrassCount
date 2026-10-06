import {
  createToneBeepPlayer,
  DEFAULT_BEEP,
  type BeepPlayer,
  type BeepSpec,
} from './beepPlayer';

export const DEFAULT_MIN_DELAY_MS = 1000;
export const DEFAULT_MAX_DELAY_MS = 5000;

export class StartSequenceError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StartSequenceError';
    this.cause = cause;
  }
}

export class StartSequenceAbortError extends Error {
  constructor(message = 'Start sequence aborted before the beep') {
    super(message);
    this.name = 'StartSequenceAbortError';
  }
}

export interface StartSequenceOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  beep?: BeepSpec;
  signal?: AbortSignal;
  random?: () => number;
  player?: BeepPlayer;
}

export interface StartSequenceResult {
  startedAt: number;
  delayMs: number;
}

const sharedPlayer = createToneBeepPlayer();

export async function prepareStartSequence(
  player: BeepPlayer = sharedPlayer,
): Promise<void> {
  try {
    await player.prepare();
  } catch (err) {
    throw new StartSequenceError('Failed to prepare the audio output', err);
  }
}

export async function releaseStartSequence(
  player: BeepPlayer = sharedPlayer,
): Promise<void> {
  await player.release();
}

export async function startSequence(
  options: StartSequenceOptions = {},
): Promise<StartSequenceResult> {
  const {
    minDelayMs = DEFAULT_MIN_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    beep = DEFAULT_BEEP,
    signal,
    random = Math.random,
    player = sharedPlayer,
  } = options;

  if (!Number.isFinite(minDelayMs) || !Number.isFinite(maxDelayMs)) {
    throw new StartSequenceError('Delay bounds must be finite numbers');
  }
  if (minDelayMs < 0) {
    throw new StartSequenceError(`Delay bounds must not be negative`);
  }
  if (minDelayMs > maxDelayMs) {
    throw new StartSequenceError(
      `Invalid delay window: minDelayMs (${minDelayMs}) exceeds maxDelayMs (${maxDelayMs})`,
    );
  }

  const delayMs = Math.round(minDelayMs + random() * (maxDelayMs - minDelayMs));

  return new Promise<StartSequenceResult>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new StartSequenceAbortError());
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const onAbort = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      reject(new StartSequenceAbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      signal?.removeEventListener('abort', onAbort);

      const startedAt = Date.now();

      player.play(beep).then(
        () => resolve({ startedAt, delayMs }),
        (err: unknown) =>
          reject(new StartSequenceError('Failed to play the start beep', err)),
      );
    }, delayMs);
  });
}

export const StartSequenceService = {
  minDelayMs: DEFAULT_MIN_DELAY_MS,
  maxDelayMs: DEFAULT_MAX_DELAY_MS,
  beep: DEFAULT_BEEP,
  prepare: prepareStartSequence,
  start: startSequence,
  release: releaseStartSequence,
};

export type StartSequenceServiceType = typeof StartSequenceService;
