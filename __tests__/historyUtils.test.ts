import type { Drill } from '../src/types/drill';
import type { Session } from '../src/types/session';
import {
  DELETED_DRILL_NAME,
  describeRuns,
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
): Session => {
  nextSessionNumber += 1;
  return {
    id: `session-${nextSessionNumber}`,
    drillId,
    createdAt,
    totalTime,
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
