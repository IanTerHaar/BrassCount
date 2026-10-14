import type { Drill } from '../src/types/drill';
import type { RunResult } from '../src/types/run';
import { sessionFromRun, splitDelta } from '../src/utils/session';

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

describe('sessionFromRun', () => {
  /** Mozambique: a draw, three shots and a holster. */
  const mozambique: Pick<Drill, 'id' | 'steps'> = {
    id: 'drill-1',
    steps: [
      { id: 'draw', type: 'draw', par: 1.5 },
      { id: 'shot-1', type: 'shot', par: 0.25 },
      { id: 'shot-2', type: 'shot', par: 0.25 },
      { id: 'shot-3', type: 'shot' },
      { id: 'holster', type: 'holster' },
    ],
  };

  const run = (overrides: Partial<RunResult> = {}): RunResult => ({
    completed: true,
    results: [
      { stepId: 'shot-1', par: 1.75, actual: 1.4, delta: -0.35 },
      { stepId: 'shot-2', par: 0.25, actual: 0.3, delta: 0.05 },
      { stepId: 'shot-3', actual: 0.5, delta: null },
    ],
    totalTime: 2.2,
    zeroSource: 'beep',
    beepDelayMs: 84,
    clockSource: 'frame',
    ...overrides,
  });

  it('saves a split for each step heard, named the way the drill names it', () => {
    expect(sessionFromRun(mozambique, run())).toEqual({
      drillId: 'drill-1',
      totalTime: 2.2,
      completed: true,
      splits: [
        { stepId: 'shot-1', label: 'Shot 1', par: 1.75, actual: 1.4 },
        { stepId: 'shot-2', label: 'Shot 2', par: 0.25, actual: 0.3 },
        { stepId: 'shot-3', label: 'Shot 3', actual: 0.5 },
      ],
    });
  });

  it('keeps the par a step was judged against, with the silent steps before it counted in', () => {
    const session = sessionFromRun(mozambique, run());

    // The draw's 1.50 s and the shot's own 0.25 s.
    expect(session?.splits[0].par).toBe(1.75);
  });

  it('leaves the delta to the storage service', () => {
    const session = sessionFromRun(mozambique, run());

    expect(session?.splits.some(split => 'delta' in split)).toBe(false);
  });

  it('keeps a run stopped early, marked as incomplete', () => {
    const stopped = run({
      completed: false,
      results: [{ stepId: 'shot-1', par: 1.75, actual: 1.4, delta: -0.35 }],
      totalTime: 1.4,
    });

    expect(sessionFromRun(mozambique, stopped)).toEqual({
      drillId: 'drill-1',
      totalTime: 1.4,
      completed: false,
      splits: [{ stepId: 'shot-1', label: 'Shot 1', par: 1.75, actual: 1.4 }],
    });
  });

  it('has nothing to save when no step was heard', () => {
    expect(
      sessionFromRun(
        mozambique,
        run({ completed: false, results: [], totalTime: 0 }),
      ),
    ).toBeNull();
  });

  it('has nothing to save when a step heard is not in the drill', () => {
    const stray = run({
      results: [{ stepId: 'elsewhere', actual: 1, delta: null }],
    });

    expect(sessionFromRun(mozambique, stray)).toBeNull();
  });

  it('does not change the run or the drill', () => {
    const ran = run();
    const before = JSON.stringify([mozambique, ran]);

    sessionFromRun(mozambique, ran);

    expect(JSON.stringify([mozambique, ran])).toBe(before);
  });
});
