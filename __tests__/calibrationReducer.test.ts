import {
  CalibrationError,
  calibrationReducer,
  createInitialCalibrationState,
  normalizeDbfs,
} from '../src/store/calibrationReducer';
import { CALIBRATION_SOUNDS, DBFS_MIN } from '../src/types/calibration';
import type { CalibrationState } from '../src/types/calibration';

const UNCALIBRATED = {
  thresholdDbfs: null,
  status: 'uncalibrated',
  lastTestDbfs: null,
};

const calibratedShot = (): CalibrationState =>
  calibrationReducer(createInitialCalibrationState(), {
    type: 'setThreshold',
    sound: 'shot',
    thresholdDbfs: -12,
  });

describe('calibrationReducer', () => {
  it('starts with every sound uncalibrated', () => {
    const state = createInitialCalibrationState();

    expect(Object.keys(state).sort()).toEqual([...CALIBRATION_SOUNDS].sort());
    CALIBRATION_SOUNDS.forEach(sound => {
      expect(state[sound]).toEqual(UNCALIBRATED);
    });
  });

  it('marks a sound calibrated when its threshold is set', () => {
    const state = calibratedShot();

    expect(state.shot).toEqual({
      thresholdDbfs: -12,
      status: 'calibrated',
      lastTestDbfs: null,
    });
  });

  it('leaves the other sounds alone when one threshold is set', () => {
    const state = calibratedShot();

    expect(state.reload).toEqual(UNCALIBRATED);
    expect(state.rack).toEqual(UNCALIBRATED);
  });

  it('records a test reading without changing the threshold or status', () => {
    const state = calibrationReducer(calibratedShot(), {
      type: 'recordTestReading',
      sound: 'shot',
      dbfs: -9.5,
    });

    expect(state.shot).toEqual({
      thresholdDbfs: -12,
      status: 'calibrated',
      lastTestDbfs: -9.5,
    });
  });

  it('ignores a test reading for a sound with no threshold', () => {
    const before = createInitialCalibrationState();

    const state = calibrationReducer(before, {
      type: 'recordTestReading',
      sound: 'rack',
      dbfs: -30,
    });

    expect(state).toBe(before);
  });

  it('clears the last test reading when a sound is reset', () => {
    const tested = calibrationReducer(calibratedShot(), {
      type: 'recordTestReading',
      sound: 'shot',
      dbfs: -9.5,
    });

    const state = calibrationReducer(tested, {
      type: 'resetSound',
      sound: 'shot',
    });

    expect(state.shot).toEqual(UNCALIBRATED);
  });

  it('discards the last test reading when the threshold changes', () => {
    const tested = calibrationReducer(calibratedShot(), {
      type: 'recordTestReading',
      sound: 'shot',
      dbfs: -9.5,
    });

    const state = calibrationReducer(tested, {
      type: 'setThreshold',
      sound: 'shot',
      thresholdDbfs: -20,
    });

    expect(state.shot).toEqual({
      thresholdDbfs: -20,
      status: 'calibrated',
      lastTestDbfs: null,
    });
  });

  it('resets only the requested sound', () => {
    const both = calibrationReducer(calibratedShot(), {
      type: 'setThreshold',
      sound: 'reload',
      thresholdDbfs: -25,
    });

    const state = calibrationReducer(both, {
      type: 'resetSound',
      sound: 'shot',
    });

    expect(state.shot).toEqual(UNCALIBRATED);
    expect(state.reload.thresholdDbfs).toBe(-25);
  });

  it('returns every sound to uncalibrated on resetAll', () => {
    const state = calibrationReducer(calibratedShot(), { type: 'resetAll' });

    expect(state).toEqual(createInitialCalibrationState());
  });

  it('does not mutate the state it is given', () => {
    const before = createInitialCalibrationState();
    const snapshot = JSON.parse(JSON.stringify(before));

    const after = calibrationReducer(before, {
      type: 'setThreshold',
      sound: 'shot',
      thresholdDbfs: -12,
    });

    expect(after).not.toBe(before);
    expect(before).toEqual(snapshot);
  });
});

describe('normalizeDbfs', () => {
  it.each([-160, -42.5, 0])('returns %p dBFS unchanged', value => {
    expect(normalizeDbfs(value)).toBe(value);
  });

  it.each([-160.1, -1000, -Infinity])(
    'raises %p to the dBFS floor instead of throwing',
    value => {
      expect(normalizeDbfs(value)).toBe(DBFS_MIN);
    },
  );

  it.each([NaN, Infinity, 0.1, 96])(
    'rejects %p with CalibrationError',
    value => {
      expect(() => normalizeDbfs(value)).toThrow(CalibrationError);
    },
  );
});
