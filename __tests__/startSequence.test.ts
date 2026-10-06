/**
 * @format
 */

import type { BeepPlayer, BeepSpec } from '../src/services/beepPlayer';
import {
  DEFAULT_MAX_DELAY_MS,
  DEFAULT_MIN_DELAY_MS,
  StartSequenceAbortError,
  StartSequenceError,
  startSequence,
} from '../src/services/startSequence';

const createFakePlayer = (
  play: BeepPlayer['play'] = async () => {},
): jest.Mocked<BeepPlayer> => ({
  prepare: jest.fn(async () => {}),
  play: jest.fn(play),
  release: jest.fn(async () => {}),
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(0);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('startSequence', () => {
  it('waits the random delay, then sounds exactly one beep', async () => {
    const player = createFakePlayer();
    const promise = startSequence({ player, random: () => 0.5 });

    await jest.advanceTimersByTimeAsync(DEFAULT_MIN_DELAY_MS - 1);
    expect(player.play).not.toHaveBeenCalled();

    const midpoint = (DEFAULT_MIN_DELAY_MS + DEFAULT_MAX_DELAY_MS) / 2;
    await jest.advanceTimersByTimeAsync(midpoint);
    await expect(promise).resolves.toEqual({
      startedAt: midpoint,
      delayMs: midpoint,
    });
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0, DEFAULT_MIN_DELAY_MS],
    [0.999999, DEFAULT_MAX_DELAY_MS],
  ])(
    'keeps the delay inside the window (random %p)',
    async (roll, expected) => {
      const player = createFakePlayer();
      const promise = startSequence({ player, random: () => roll });

      await jest.advanceTimersByTimeAsync(DEFAULT_MAX_DELAY_MS);
      await expect(promise).resolves.toMatchObject({ delayMs: expected });
    },
  );

  it('reports startedAt at beep onset, not at resolve time', async () => {
    const player = createFakePlayer(async () => {
      jest.setSystemTime(Date.now() + 500); // slow backend
    });
    const promise = startSequence({ player, random: () => 0 });

    await jest.advanceTimersByTimeAsync(DEFAULT_MIN_DELAY_MS);
    await expect(promise).resolves.toMatchObject({
      startedAt: DEFAULT_MIN_DELAY_MS,
    });
  });

  it('honours a custom delay window', async () => {
    const player = createFakePlayer();
    const promise = startSequence({
      player,
      random: () => 0.5,
      minDelayMs: 200,
      maxDelayMs: 400,
    });

    await jest.advanceTimersByTimeAsync(300);
    await expect(promise).resolves.toMatchObject({ delayMs: 300 });
  });

  it('rejects an inverted window instead of silently swapping it', async () => {
    const player = createFakePlayer();
    await expect(
      startSequence({ player, minDelayMs: 4000, maxDelayMs: 1000 }),
    ).rejects.toThrow(StartSequenceError);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('rejects and stays silent when aborted during the wait', async () => {
    const player = createFakePlayer();
    const controller = new AbortController();
    const promise = startSequence({
      player,
      random: () => 1,
      signal: controller.signal,
    });
    const rejects = expect(promise).rejects.toThrow(StartSequenceAbortError);

    await jest.advanceTimersByTimeAsync(500);
    controller.abort();
    await rejects;

    await jest.advanceTimersByTimeAsync(DEFAULT_MAX_DELAY_MS);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('rejects immediately for an already-aborted signal', async () => {
    const player = createFakePlayer();
    const controller = new AbortController();
    controller.abort();

    await expect(
      startSequence({ player, signal: controller.signal }),
    ).rejects.toThrow(StartSequenceAbortError);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('wraps a backend failure in StartSequenceError', async () => {
    const boom = new Error('no audio output');
    const player = createFakePlayer(async () => {
      throw boom;
    });
    const promise = startSequence({ player, random: () => 0 });
    const rejects = expect(promise).rejects.toMatchObject({
      name: 'StartSequenceError',
      cause: boom,
    });

    await jest.advanceTimersByTimeAsync(DEFAULT_MIN_DELAY_MS);
    await rejects;
  });
});
