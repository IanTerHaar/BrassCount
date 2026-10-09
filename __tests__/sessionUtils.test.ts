import { splitDelta } from '../src/utils/session';

describe('splitDelta', () => {
  it('is negative when the step came in under par', () => {
    expect(splitDelta(1.25, 1.5)).toBe(-0.25);
  });

  it('is positive when the step went over par', () => {
    expect(splitDelta(2.25, 2)).toBe(0.25);
  });

  it('is zero when the step landed exactly on par', () => {
    expect(splitDelta(0.5, 0.5)).toBe(0);
  });

  it('is null for a step with no par', () => {
    expect(splitDelta(1.47, undefined)).toBeNull();
  });

  it('rounds float error out of the difference', () => {
    // 1.28 - 1.5 is -0.21999999999999997 in floating point.
    expect(1.28 - 1.5).not.toBe(-0.22);

    expect(splitDelta(1.28, 1.5)).toBe(-0.22);
  });

  it('keeps millisecond precision', () => {
    expect(splitDelta(1.284, 1.5)).toBe(-0.216);
  });

  it('never returns a negative zero', () => {
    // A hair under par rounds to -0, which is not the 0 a reload reads back.
    expect(Object.is(splitDelta(0.4999, 0.5), 0)).toBe(true);
  });
});
