import { DBFS_MIN } from '../src/types/calibration';
import type { SoundCalibration } from '../src/types/calibration';
import {
  isAudibleSample,
  MIN_SAMPLE_DBFS,
  testOutcome,
  THRESHOLD_MARGIN_DB,
  thresholdFromPeak,
} from '../src/utils/calibration';

const calibrated = (
  thresholdDbfs: number,
  lastTestDbfs: number | null,
): SoundCalibration => ({ status: 'calibrated', thresholdDbfs, lastTestDbfs });

describe('isAudibleSample', () => {
  it('accepts a sample whose peak is exactly at the quietest usable level', () => {
    expect(isAudibleSample(MIN_SAMPLE_DBFS)).toBe(true);
  });

  it('rejects a sample that never rose above the room', () => {
    expect(isAudibleSample(MIN_SAMPLE_DBFS - 0.1)).toBe(false);
    expect(isAudibleSample(DBFS_MIN)).toBe(false);
  });

  it('accepts a sample at full scale', () => {
    expect(isAudibleSample(0)).toBe(true);
  });
});

describe('thresholdFromPeak', () => {
  it('sets the threshold a margin below the loudest level', () => {
    expect(thresholdFromPeak(-12)).toBe(-12 - THRESHOLD_MARGIN_DB);
    expect(thresholdFromPeak(0)).toBe(-THRESHOLD_MARGIN_DB);
  });

  it('never goes below the bottom of the dBFS scale', () => {
    expect(thresholdFromPeak(DBFS_MIN)).toBe(DBFS_MIN);
    expect(thresholdFromPeak(DBFS_MIN + 1)).toBe(DBFS_MIN);
  });
});

describe('testOutcome', () => {
  it('has no outcome for a sound that is not calibrated', () => {
    expect(
      testOutcome({
        status: 'uncalibrated',
        thresholdDbfs: null,
        lastTestDbfs: null,
      }),
    ).toBeNull();
  });

  it('has no outcome until a calibrated sound is tested', () => {
    expect(testOutcome(calibrated(-30, null))).toBeNull();
  });

  it('passes a test that is louder than the threshold', () => {
    expect(testOutcome(calibrated(-30, -12))).toBe('passed');
  });

  it('passes a test that lands exactly on the threshold', () => {
    expect(testOutcome(calibrated(-30, -30))).toBe('passed');
  });

  it('fails a test that is quieter than the threshold', () => {
    expect(testOutcome(calibrated(-30, -30.1))).toBe('failed');
    expect(testOutcome(calibrated(-30, DBFS_MIN))).toBe('failed');
  });
});
