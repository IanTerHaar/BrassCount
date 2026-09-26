import { AudioContext, type OscillatorType } from 'react-native-audio-api';

export interface BeepSpec {
  frequencyHz: number;
  durationMs: number;
  volume: number;
  waveform: OscillatorType;
}

export const DEFAULT_BEEP: BeepSpec = {
  frequencyHz: 1000,
  durationMs: 300,
  volume: 0.9,
  waveform: 'sine',
};

export interface BeepPlayer {
  prepare(): Promise<void>;

  play(spec?: BeepSpec): Promise<void>;
  release(): Promise<void>;
}

const MIN_DURATION_MS = 20;

export const createToneBeepPlayer = (): BeepPlayer => {
  let context: AudioContext | null = null;

  const ensureContext = async (): Promise<AudioContext> => {
    if (context === null || context.state === 'closed') {
      context = new AudioContext();
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context;
  };

  return {
    prepare: async () => {
      await ensureContext();
    },

    play: async (spec: BeepSpec = DEFAULT_BEEP) => {
      const ctx = await ensureContext();

      const duration = Math.max(spec.durationMs, MIN_DURATION_MS) / 1000;
      const startAt = ctx.currentTime;
      const stopAt = startAt + duration;
      const attack = Math.min(0.005, duration / 4);
      const release = Math.min(0.015, duration / 4);

      const oscillator = ctx.createOscillator();
      oscillator.type = spec.waveform;
      oscillator.frequency.value = spec.frequencyHz;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(spec.volume, startAt + attack);
      gain.gain.setValueAtTime(spec.volume, stopAt - release);
      gain.gain.linearRampToValueAtTime(0, stopAt);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(startAt);
      oscillator.stop(stopAt);
    },

    release: async () => {
      if (context !== null) {
        const closing = context;
        context = null;
        await closing.close();
      }
    },
  };
};
