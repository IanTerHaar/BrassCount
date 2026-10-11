import { DBFS_MIN } from '@/types/calibration';
import type { SoundCalibration } from '@/types/calibration';

/** How long a calibration sample or a test listens for the sound. */
export const CALIBRATION_LISTEN_MS = 3000;

/**
 * How far below the loudest level of a sample its threshold is set. The
 * same sound is never exactly as loud twice, so a threshold at the peak
 * itself would be missed by about every other repeat.
 */
export const THRESHOLD_MARGIN_DB = 6;

/**
 * Quietest peak a sample may have and still count as the sound having been
 * made. Below this the microphone heard only the room.
 */
export const MIN_SAMPLE_DBFS = -60;

/** Whether a sample's loudest level is loud enough to calibrate from. */
export const isAudibleSample = (peakDbfs: number): boolean =>
  peakDbfs >= MIN_SAMPLE_DBFS;

/** The threshold a sample with this loudest level calibrates its sound to. */
export const thresholdFromPeak = (peakDbfs: number): number =>
  Math.max(peakDbfs - THRESHOLD_MARGIN_DB, DBFS_MIN);

export type CalibrationTestOutcome = 'passed' | 'failed';

/**
 * How the last test of a sound went: it passes when the level it measured
 * reached the threshold. `null` while there is no test to judge — the sound
 * is uncalibrated, or has not been tested since its threshold was set.
 */
export const testOutcome = (
  calibration: Readonly<SoundCalibration>,
): CalibrationTestOutcome | null => {
  if (
    calibration.status === 'uncalibrated' ||
    calibration.lastTestDbfs === null
  ) {
    return null;
  }
  return calibration.lastTestDbfs >= calibration.thresholdDbfs
    ? 'passed'
    : 'failed';
};
