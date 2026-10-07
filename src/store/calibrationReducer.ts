import { DBFS_MAX, DBFS_MIN } from '@/types/calibration';
import type {
  CalibrationSound,
  CalibrationState,
  SoundCalibration,
} from '@/types/calibration';

/**
 * Error thrown by the calibration store. Callers can catch this to
 * distinguish a rejected calibration value (or a misuse of the store)
 * from other runtime errors.
 */
export class CalibrationError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CalibrationError';
    this.cause = cause;
  }
}

export type CalibrationAction =
  | { type: 'setThreshold'; sound: CalibrationSound; thresholdDbfs: number }
  | { type: 'recordTestReading'; sound: CalibrationSound; dbfs: number }
  | { type: 'resetSound'; sound: CalibrationSound }
  | { type: 'resetAll' };

const UNCALIBRATED: Readonly<SoundCalibration> = {
  thresholdDbfs: null,
  status: 'uncalibrated',
  lastTestDbfs: null,
};

/** Every sound uncalibrated — the state of a freshly launched app. */
export const createInitialCalibrationState = (): CalibrationState => ({
  shot: UNCALIBRATED,
  reload: UNCALIBRATED,
  rack: UNCALIBRATED,
});

/**
 * Bring a level into the range the store holds. Run this before
 * dispatching, so the reducer never has to throw.
 *
 * Anything quieter than `DBFS_MIN` is raised to it: digital silence
 * measures as `-Infinity` dBFS, so a reading straight off the microphone
 * stream can legitimately arrive below the floor and must not throw.
 *
 * `NaN` and anything above full scale cannot come from the microphone —
 * they mean a caller bug, such as a level on some other dB scale — so
 * those throw `CalibrationError` instead of being stored as a wrong value.
 */
export const normalizeDbfs = (value: number): number => {
  if (Number.isNaN(value) || value > DBFS_MAX) {
    throw new CalibrationError(
      `Level must be a number no greater than ${DBFS_MAX} dBFS`,
    );
  }
  return Math.max(value, DBFS_MIN);
};

export const calibrationReducer = (
  state: CalibrationState,
  action: CalibrationAction,
): CalibrationState => {
  switch (action.type) {
    case 'setThreshold':
      return {
        ...state,
        [action.sound]: {
          thresholdDbfs: action.thresholdDbfs,
          status: 'calibrated',
          // A test measured against the previous threshold no longer applies.
          lastTestDbfs: null,
        },
      };
    case 'recordTestReading':
      // A test measures a sound against its threshold, so with no
      // threshold there is nothing for the reading to belong to.
      if (state[action.sound].status === 'uncalibrated') {
        return state;
      }
      return {
        ...state,
        [action.sound]: { ...state[action.sound], lastTestDbfs: action.dbfs },
      };
    case 'resetSound':
      return { ...state, [action.sound]: UNCALIBRATED };
    case 'resetAll':
      return createInitialCalibrationState();
  }
};
