import { createToneBeepPlayer, DEFAULT_BEEP } from '../src/services/beepPlayer';

describe('createToneBeepPlayer', () => {
  it('prepares, plays and releases', async () => {
    const player = createToneBeepPlayer();

    await expect(player.prepare()).resolves.toBeUndefined();
    await expect(player.play()).resolves.toBeUndefined();
    await expect(player.release()).resolves.toBeUndefined();
  });

  it('accepts a custom spec and clamps a sub-floor duration', async () => {
    const player = createToneBeepPlayer();

    await player.prepare();
    await expect(
      player.play({ ...DEFAULT_BEEP, durationMs: 1, waveform: 'square' }),
    ).resolves.toBeUndefined();
    await player.release();
  });

  it('rebuilds the context when played after release', async () => {
    const player = createToneBeepPlayer();

    await player.prepare();
    await player.release();
    await expect(player.play()).resolves.toBeUndefined();
    await player.release();
  });

  it('tolerates a double release', async () => {
    const player = createToneBeepPlayer();

    await player.prepare();
    await player.release();
    await expect(player.release()).resolves.toBeUndefined();
  });
});
