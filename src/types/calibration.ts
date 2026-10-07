/**
 * The sounds the detector needs a threshold for. Each one maps onto a
 * sequence action of the same name; `draw`, `transition` and `holster`
 * are not detected by level and so have no calibration.
 */
export const CALIBRATION_SOUNDS = ['shot', 'reload', 'rack'] as const;

export type CalibrationSound = (typeof CALIBRATION_SOUNDS)[number];

/**
 * Range of a level expressed in dBFS, matching what the audio capture
 * service reports (`AmplitudeReading.db` / `peakDb`): silence at the
 * bottom, full scale at 0. `AmplitudeReading` states this range only in
 * its doc comments, so these are the constants to share if it needs them.
 */
export const DBFS_MIN = -160;
export const DBFS_MAX = 0;

/**
 * Calibration for one sound. Levels are dBFS — the unit the microphone
 * stream is measured in — so a threshold can be compared with a live
 * reading directly, with no conversion.
 *
 * `status` discriminates the threshold: narrowing on `'calibrated'` gives
 * a `number`, so a calibrated sound can never carry a missing threshold.
 */
export type SoundCalibration = {
  /** Level measured by the most recent test since the threshold was last set. */
  lastTestDbfs: number | null;
} & (
  | { status: 'uncalibrated'; thresholdDbfs: null }
  | {
      status: 'calibrated';
      /** Level a reading must reach to count as this sound. */
      thresholdDbfs: number;
    }
);

/**
 * Calibration for every sound. Held in memory only: it is deliberately
 * not persisted, so it resets when the app is closed.
 *
 * It is a plain immutable snapshot. Code outside React — the drill run
 * detection engine — cannot call `useCalibration`, so the screen that
 * starts a run reads this from the hook and hands it over as an argument.
 */
export type CalibrationStatus = SoundCalibration['status'];

export type CalibrationState = Readonly<
  Record<CalibrationSound, Readonly<SoundCalibration>>
>;
