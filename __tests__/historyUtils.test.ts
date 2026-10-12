import type { Drill } from '../src/types/drill';
import type { Session } from '../src/types/session';
import {
  DELETED_DRILL_NAME,
  summarizeDrillHistory,
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
