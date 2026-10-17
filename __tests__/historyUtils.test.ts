import type { Drill } from '../src/types/drill';
import type { Session } from '../src/types/session';
import {
  compareRuns,
  DELETED_DRILL_NAME,
  describeRuns,
  findPersonalBest,
  shownDeltaSign,
  summarizeDrillHistory,
  summarizeRuns,
} from '../src/utils/history';

const drill = (id: string, name: string): Drill => ({
  id,
  name,
  steps: [{ id: `${id}-step-1`, type: 'shot' }],
  totalPar: null,
  shotCount: 1,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
});

let nextSessionNumber = 0;

const session = (
  drillId: string,
  totalTime: number,
  createdAt: string,
  completed = true,
): Session => {
  nextSessionNumber += 1;
  return {
    id: `session-${nextSessionNumber}`,
    drillId,
    createdAt,
    totalTime,
    completed,
    splits: [
      { stepId: 'step-1', label: 'Shot 1', actual: totalTime, delta: null },
    ],
  };
};

describe('summarizeDrillHistory', () => {
  it('returns nothing when there are no runs', () => {
    expect(summarizeDrillHistory([], [drill('a', 'Bill Drill')])).toEqual([]);
  });

  it('rolls the runs of one drill up into a single summary', () => {
    const summaries = summarizeDrillHistory(
      [
        session('a', 3.1, '2026-10-03T10:00:00.000Z'),
        session('a', 2.4, '2026-10-02T10:00:00.000Z'),
        session('a', 2.9, '2026-10-01T10:00:00.000Z'),
      ],
      [drill('a', 'Bill Drill')],
    );

    expect(summaries).toEqual([
      {
        drillId: 'a',
        drillName: 'Bill Drill',
        runCount: 3,
        bestTime: 2.4,
        lastRunAt: '2026-10-03T10:00:00.000Z',
      },
    ]);
  });

  it('keeps the runs of different drills apart', () => {
    const summaries = summarizeDrillHistory(
      [
        session('a', 3.1, '2026-10-03T10:00:00.000Z'),
        session('b', 1.2, '2026-10-02T10:00:00.000Z'),
        session('a', 2.4, '2026-10-01T10:00:00.000Z'),
      ],
      [drill('a', 'Bill Drill'), drill('b', 'Mozambique')],
    );

    expect(
      summaries.map(({ drillName, runCount, bestTime }) => ({
        drillName,
        runCount,
        bestTime,
      })),
    ).toEqual([
      { drillName: 'Bill Drill', runCount: 2, bestTime: 2.4 },
      { drillName: 'Mozambique', runCount: 1, bestTime: 1.2 },
    ]);
  });

  it('counts a run stopped early but leaves it out of the best time', () => {
    const [summary] = summarizeDrillHistory(
      [
        session('a', 1.1, '2026-10-03T10:00:00.000Z', false),
        session('a', 2.4, '2026-10-02T10:00:00.000Z'),
      ],
      [drill('a', 'Bill Drill')],
    );

    expect(summary).toMatchObject({
      runCount: 2,
      bestTime: 2.4,
      lastRunAt: '2026-10-03T10:00:00.000Z',
    });
  });

  it('has no best time for a drill whose every run was stopped early', () => {
    const [summary] = summarizeDrillHistory(
      [
        session('a', 1.1, '2026-10-03T10:00:00.000Z', false),
        session('a', 0.9, '2026-10-02T10:00:00.000Z', false),
      ],
      [drill('a', 'Bill Drill')],
    );

    expect(summary).toMatchObject({ runCount: 2, bestTime: null });
  });

  it('takes the best time from a completed run that comes after one stopped early', () => {
    const [summary] = summarizeDrillHistory(
      [
        session('a', 1.1, '2026-10-02T10:00:00.000Z', false),
        session('a', 2.4, '2026-10-03T10:00:00.000Z'),
      ],
      [drill('a', 'Bill Drill')],
    );

    expect(summary.bestTime).toBe(2.4);
  });

  it('leaves out a drill that has never been run', () => {
    const summaries = summarizeDrillHistory(
      [session('a', 3.1, '2026-10-03T10:00:00.000Z')],
      [drill('a', 'Bill Drill'), drill('b', 'Mozambique')],
    );

    expect(summaries.map(summary => summary.drillId)).toEqual(['a']);
  });

  it('lists the most recently run drill first, whatever order the runs come in', () => {
    const summaries = summarizeDrillHistory(
      [
        session('a', 3.1, '2026-10-01T10:00:00.000Z'),
        session('b', 1.2, '2026-10-02T10:00:00.000Z'),
        session('c', 5.0, '2026-09-20T10:00:00.000Z'),
        session('a', 2.4, '2026-10-05T10:00:00.000Z'),
      ],
      [
        drill('a', 'Bill Drill'),
        drill('b', 'Mozambique'),
        drill('c', 'El Prez'),
      ],
    );

    expect(summaries.map(summary => summary.drillId)).toEqual(['a', 'b', 'c']);
    expect(summaries[0].lastRunAt).toBe('2026-10-05T10:00:00.000Z');
  });

  it('orders drills last run at the same moment by name', () => {
    const at = '2026-10-01T10:00:00.000Z';

    const summaries = summarizeDrillHistory(
      [session('a', 3.1, at), session('b', 1.2, at)],
      [drill('a', 'Mozambique'), drill('b', 'Bill Drill')],
    );

    expect(summaries.map(summary => summary.drillName)).toEqual([
      'Bill Drill',
      'Mozambique',
    ]);
  });

  it('keeps the runs of a deleted drill under a stand-in name', () => {
    const summaries = summarizeDrillHistory(
      [
        session('gone', 3.1, '2026-10-02T10:00:00.000Z'),
        session('gone', 2.8, '2026-10-01T10:00:00.000Z'),
      ],
      [drill('a', 'Bill Drill')],
    );

    expect(summaries).toEqual([
      {
        drillId: 'gone',
        drillName: DELETED_DRILL_NAME,
        runCount: 2,
        bestTime: 2.8,
        lastRunAt: '2026-10-02T10:00:00.000Z',
      },
    ]);
  });

  it('keeps two deleted drills as two rows', () => {
    const summaries = summarizeDrillHistory(
      [
        session('gone-1', 3.1, '2026-10-02T10:00:00.000Z'),
        session('gone-2', 2.8, '2026-10-01T10:00:00.000Z'),
      ],
      [],
    );

    expect(summaries.map(summary => summary.drillId)).toEqual([
      'gone-1',
      'gone-2',
    ]);
  });

  it('does not change the lists it is given', () => {
    const sessions = Object.freeze([
      Object.freeze(session('a', 3.1, '2026-10-01T10:00:00.000Z')),
      Object.freeze(session('a', 2.4, '2026-10-02T10:00:00.000Z')),
    ]);
    const drills = Object.freeze([Object.freeze(drill('a', 'Bill Drill'))]);

    expect(() => summarizeDrillHistory(sessions, drills)).not.toThrow();
  });
});

describe('summarizeRuns', () => {
  it('has nothing to report when there are no runs', () => {
    expect(summarizeRuns([])).toBeNull();
  });

  it('reports the shortest time as the best and the mean as the average', () => {
    const totals = summarizeRuns([
      session('a', 3, '2026-10-03T10:00:00.000Z'),
      session('a', 2, '2026-10-02T10:00:00.000Z'),
      session('a', 2.5, '2026-10-01T10:00:00.000Z'),
    ]);

    expect(totals).toEqual({ bestTime: 2, averageTime: 2.5 });
  });

  it('leaves runs stopped early out of the best and the average', () => {
    expect(
      summarizeRuns([
        session('a', 3, '2026-10-03T10:00:00.000Z'),
        session('a', 0.5, '2026-10-02T10:00:00.000Z', false),
        session('a', 2, '2026-10-01T10:00:00.000Z'),
      ]),
    ).toEqual({ bestTime: 2, averageTime: 2.5 });
  });

  it('has nothing to report when every run was stopped early', () => {
    expect(
      summarizeRuns([session('a', 0.5, '2026-10-02T10:00:00.000Z', false)]),
    ).toBeNull();
  });

  it('reports a single run as both its best and its average', () => {
    expect(
      summarizeRuns([session('a', 3.21, '2026-10-03T10:00:00.000Z')]),
    ).toEqual({ bestTime: 3.21, averageTime: 3.21 });
  });

  it('does not change the list it is given', () => {
    const sessions = Object.freeze([
      Object.freeze(session('a', 3.1, '2026-10-01T10:00:00.000Z')),
      Object.freeze(session('a', 2.4, '2026-10-02T10:00:00.000Z')),
    ]);

    expect(() => summarizeRuns(sessions)).not.toThrow();
  });
});

describe('describeRuns', () => {
  it('returns nothing when there are no runs', () => {
    expect(describeRuns([])).toEqual([]);
  });

  it('lists the newest run first, whatever order the runs come in', () => {
    const oldest = session('a', 2.9, '2026-10-01T10:00:00.000Z');
    const newest = session('a', 3.1, '2026-10-03T10:00:00.000Z');
    const middle = session('a', 2.4, '2026-10-02T10:00:00.000Z');

    const runs = describeRuns([oldest, newest, middle]);

    expect(runs.map(run => run.session.id)).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ]);
  });

  it('compares each run with the one made before it', () => {
    const runs = describeRuns([
      session('a', 3.1, '2026-10-03T10:00:00.000Z'),
      session('a', 2.4, '2026-10-02T10:00:00.000Z'),
      session('a', 2.9, '2026-10-01T10:00:00.000Z'),
    ]);

    // Slower than the run before, then faster, then nothing to compare.
    expect(runs.map(run => run.deltaToPrevious)).toEqual([0.7, -0.5, null]);
  });

  it('does not compare a run stopped early with anything', () => {
    const runs = describeRuns([
      session('a', 2, '2026-10-01T10:00:00.000Z'),
      session('a', 0.5, '2026-10-02T10:00:00.000Z', false),
    ]);

    expect(runs.map(run => run.deltaToPrevious)).toEqual([null, null]);
  });

  it('compares a completed run with the completed run before it, past one stopped early', () => {
    const runs = describeRuns([
      session('a', 2.5, '2026-10-01T10:00:00.000Z'),
      session('a', 0.5, '2026-10-02T10:00:00.000Z', false),
      session('a', 2.2, '2026-10-03T10:00:00.000Z'),
    ]);

    expect(
      runs.map(run => [run.session.totalTime, run.deltaToPrevious]),
    ).toEqual([
      [2.2, -0.3],
      [0.5, null],
      [2.5, null],
    ]);
  });

  it('has nothing to compare a lone run with', () => {
    const [run] = describeRuns([session('a', 3.1, '2026-10-03T10:00:00.000Z')]);

    expect(run.deltaToPrevious).toBeNull();
  });

  it('keeps float error out of the difference', () => {
    const [newest] = describeRuns([
      session('a', 2.14, '2026-10-02T10:00:00.000Z'),
      session('a', 2.22, '2026-10-01T10:00:00.000Z'),
    ]);

    // 2.14 - 2.22 is -0.08000000000000007 in floating point.
    expect(newest.deltaToPrevious).toBe(-0.08);
  });

  it('compares the totals as shown, to the hundredth', () => {
    const [newest] = describeRuns([
      session('a', 2.144, '2026-10-02T10:00:00.000Z'),
      session('a', 2.136, '2026-10-01T10:00:00.000Z'),
    ]);

    // Both read 2.14s, so the chip must not claim they differ by 0.01s.
    expect(newest.deltaToPrevious).toBe(0);
  });

  it('reports two equal runs as no difference, not minus zero', () => {
    const [newest] = describeRuns([
      session('a', 2.5, '2026-10-02T10:00:00.000Z'),
      session('a', 2.5, '2026-10-01T10:00:00.000Z'),
    ]);

    expect(Object.is(newest.deltaToPrevious, 0)).toBe(true);
  });

  it('keeps runs saved at the same moment in a settled order', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const first = session('a', 3.1, at);
    const second = session('a', 2.4, at);

    const forwards = describeRuns([first, second]).map(run => run.session.id);
    const backwards = describeRuns([second, first]).map(run => run.session.id);

    expect(forwards).toEqual(backwards);
  });

  it('does not change the list it is given', () => {
    const sessions = Object.freeze([
      Object.freeze(session('a', 3.1, '2026-10-01T10:00:00.000Z')),
      Object.freeze(session('a', 2.4, '2026-10-02T10:00:00.000Z')),
    ]);

    expect(() => describeRuns(sessions)).not.toThrow();
    expect(sessions[0].totalTime).toBe(3.1);
  });

  it('marks the personal best, and only it', () => {
    const slower = session('a', 2.9, '2026-10-01T10:00:00.000Z');
    const fastest = session('a', 2.4, '2026-10-02T10:00:00.000Z');
    const stopped = session('a', 0.5, '2026-10-03T10:00:00.000Z', false);

    const runs = describeRuns([slower, fastest, stopped]);

    expect(runs.map(run => [run.session.id, run.personalBest])).toEqual([
      [stopped.id, false],
      [fastest.id, true],
      [slower.id, false],
    ]);
  });

  it('marks no run when every run was stopped early', () => {
    const runs = describeRuns([
      session('a', 0.5, '2026-10-01T10:00:00.000Z', false),
    ]);

    expect(runs.map(run => run.personalBest)).toEqual([false]);
  });
});

describe('findPersonalBest', () => {
  it('has no personal best when there are no runs', () => {
    expect(findPersonalBest([])).toBeNull();
  });

  it('picks the completed run with the shortest total time', () => {
    const fastest = session('a', 2.4, '2026-10-02T10:00:00.000Z');

    const best = findPersonalBest([
      session('a', 2.9, '2026-10-01T10:00:00.000Z'),
      fastest,
      session('a', 3.1, '2026-10-03T10:00:00.000Z'),
    ]);

    expect(best).toBe(fastest.id);
  });

  it('makes a lone completed run the personal best', () => {
    const only = session('a', 3.1, '2026-10-03T10:00:00.000Z');

    expect(findPersonalBest([only])).toBe(only.id);
  });

  it('passes over a run stopped early, however quick', () => {
    const completed = session('a', 2.9, '2026-10-01T10:00:00.000Z');

    const best = findPersonalBest([
      completed,
      session('a', 0.5, '2026-10-02T10:00:00.000Z', false),
    ]);

    expect(best).toBe(completed.id);
  });

  it('has no personal best when every run was stopped early', () => {
    expect(
      findPersonalBest([
        session('a', 0.5, '2026-10-01T10:00:00.000Z', false),
        session('a', 0.8, '2026-10-02T10:00:00.000Z', false),
      ]),
    ).toBeNull();
  });

  it('leaves the personal best with the run that set it when a later run only matches it', () => {
    const first = session('a', 2.4, '2026-10-01T10:00:00.000Z');
    const matching = session('a', 2.4, '2026-10-02T10:00:00.000Z');

    expect(findPersonalBest([matching, first])).toBe(first.id);
    expect(findPersonalBest([first, matching])).toBe(first.id);
  });

  it('takes a time a thousandth quicker as a new personal best', () => {
    const first = session('a', 2.401, '2026-10-01T10:00:00.000Z');
    const quicker = session('a', 2.4, '2026-10-02T10:00:00.000Z');

    expect(findPersonalBest([first, quicker])).toBe(quicker.id);
  });

  it('does not take float noise under a millisecond as a quicker time', () => {
    const first = session('a', 0.1 + 0.2, '2026-10-01T10:00:00.000Z');
    // 0.1 + 0.2 is 0.30000000000000004: the same time, not a slower one.
    const later = session('a', 0.3, '2026-10-02T10:00:00.000Z');

    expect(findPersonalBest([later, first])).toBe(first.id);
  });

  it('settles a tie between runs saved at the same moment the same way every time', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const one = session('a', 2.4, at);
    const two = session('a', 2.4, at);

    expect(findPersonalBest([one, two])).toBe(findPersonalBest([two, one]));
  });

  it('does not change the list it is given', () => {
    const sessions = Object.freeze([
      Object.freeze(session('a', 3.1, '2026-10-01T10:00:00.000Z')),
      Object.freeze(session('a', 2.4, '2026-10-02T10:00:00.000Z')),
    ]);

    expect(() => findPersonalBest(sessions)).not.toThrow();
  });
});

describe('shownDeltaSign', () => {
  it('points down for a shorter time and up for a longer one', () => {
    expect(shownDeltaSign(-0.08)).toBe(-1);
    expect(shownDeltaSign(0.7)).toBe(1);
  });

  it('reads no difference as none', () => {
    expect(shownDeltaSign(0)).toBe(0);
  });

  it('reads a difference too small to show as none', () => {
    // Both are shown as 0.00s.
    expect(shownDeltaSign(0.004)).toBe(0);
    expect(shownDeltaSign(-0.004)).toBe(0);
  });

  it('reads the smallest difference that shows as a difference', () => {
    expect(shownDeltaSign(0.01)).toBe(1);
    expect(shownDeltaSign(-0.01)).toBe(-1);
    expect(shownDeltaSign(0.006)).toBe(1);
  });
});

describe('compareRuns', () => {
  const split = (
    stepId: string,
    label: string,
    actual: number,
  ): Session['splits'][number] => ({ stepId, label, actual, delta: null });

  const run = (
    id: string,
    createdAt: string,
    splits: Session['splits'],
    completed = true,
  ): Session => ({
    id,
    drillId: 'a',
    createdAt,
    totalTime: splits.reduce((sum, { actual }) => sum + actual, 0),
    completed,
    splits,
  });

  const older = run('older', '2026-10-01T10:00:00.000Z', [
    split('s1', 'Draw', 1.5),
    split('s2', 'Shot 1', 0.3),
    split('s3', 'Shot 2', 0.25),
  ]);
  const newer = run('newer', '2026-10-02T10:00:00.000Z', [
    split('s1', 'Draw', 1.4),
    split('s2', 'Shot 1', 0.32),
    split('s3', 'Shot 2', 0.25),
  ]);

  it('puts the earlier run first whichever order the runs are given in', () => {
    expect(compareRuns(newer, older)).toEqual(compareRuns(older, newer));
    expect(compareRuns(newer, older).earlier.id).toBe('older');
    expect(compareRuns(newer, older).later.id).toBe('newer');
  });

  it('settles runs saved at the same moment by id', () => {
    const a = { ...older, id: 'a' };
    const b = { ...newer, id: 'b', createdAt: older.createdAt };

    // The same order the run list uses: of two runs at one moment, the
    // one with the lower id is listed first, as the newer.
    expect(compareRuns(a, b).later.id).toBe('a');
    expect(compareRuns(b, a).later.id).toBe('a');
  });

  it('compares every step the two runs share, later minus earlier', () => {
    expect(compareRuns(older, newer).steps).toEqual([
      { stepId: 's1', label: 'Draw', earlier: 1.5, later: 1.4, delta: -0.1 },
      { stepId: 's2', label: 'Shot 1', earlier: 0.3, later: 0.32, delta: 0.02 },
      { stepId: 's3', label: 'Shot 2', earlier: 0.25, later: 0.25, delta: 0 },
    ]);
  });

  it('compares the total times of two completed runs', () => {
    // 1.97 - 2.05, rounded to the millisecond rather than left as float error.
    expect(compareRuns(older, newer).totalDelta).toBe(-0.08);
  });

  it('does not compare the total time when either run was stopped early', () => {
    const stopped = run(
      'stopped',
      '2026-10-03T10:00:00.000Z',
      [split('s1', 'Draw', 1.2)],
      false,
    );

    expect(compareRuns(older, stopped).totalDelta).toBeNull();
    expect(compareRuns(stopped, older).totalDelta).toBeNull();
  });

  it('keeps the steps a run stopped early never reached, uncompared', () => {
    const stopped = run(
      'stopped',
      '2026-10-03T10:00:00.000Z',
      [split('s1', 'Draw', 1.2)],
      false,
    );

    expect(compareRuns(older, stopped).steps).toEqual([
      { stepId: 's1', label: 'Draw', earlier: 1.5, later: 1.2, delta: -0.3 },
      { stepId: 's2', label: 'Shot 1', earlier: 0.3, later: null, delta: null },
      {
        stepId: 's3',
        label: 'Shot 2',
        earlier: 0.25,
        later: null,
        delta: null,
      },
    ]);
  });

  it('places a step only the earlier run has after the step it followed', () => {
    // The drill lost its middle step between the two runs.
    const edited = run('edited', '2026-10-03T10:00:00.000Z', [
      split('s1', 'Draw', 1.4),
      split('s3', 'Shot 1', 0.26),
    ]);

    expect(compareRuns(older, edited).steps.map(step => step.stepId)).toEqual([
      's1',
      's2',
      's3',
    ]);
  });

  it('follows the later run when the steps were reordered, under its labels', () => {
    const reordered = run('reordered', '2026-10-03T10:00:00.000Z', [
      split('s1', 'Draw', 1.4),
      split('s3', 'Shot 1', 0.26),
      split('s2', 'Shot 2', 0.31),
    ]);

    expect(compareRuns(older, reordered).steps).toEqual([
      { stepId: 's1', label: 'Draw', earlier: 1.5, later: 1.4, delta: -0.1 },
      {
        stepId: 's3',
        label: 'Shot 1',
        earlier: 0.25,
        later: 0.26,
        delta: 0.01,
      },
      {
        stepId: 's2',
        label: 'Shot 2',
        earlier: 0.3,
        later: 0.31,
        delta: 0.01,
      },
    ]);
  });

  it('lists a step only the later run has where the later run has it', () => {
    const added = run('added', '2026-10-03T10:00:00.000Z', [
      split('s0', 'Draw', 1.4),
      split('s1', 'Shot 1', 0.5),
    ]);

    expect(compareRuns(older, added).steps).toEqual([
      { stepId: 's0', label: 'Draw', earlier: null, later: 1.4, delta: null },
      { stepId: 's1', label: 'Shot 1', earlier: 1.5, later: 0.5, delta: -1 },
      { stepId: 's2', label: 'Shot 1', earlier: 0.3, later: null, delta: null },
      {
        stepId: 's3',
        label: 'Shot 2',
        earlier: 0.25,
        later: null,
        delta: null,
      },
    ]);
  });

  it('leaves the runs it is given untouched', () => {
    const before = JSON.stringify([older, newer]);

    compareRuns(older, newer);

    expect(JSON.stringify([older, newer])).toBe(before);
  });
});
