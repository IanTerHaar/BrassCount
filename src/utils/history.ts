import type { Drill } from '@/types/drill';
import type { Session } from '@/types/session';

/**
 * How the History tab rolls stored runs up by drill. Pure functions, no
 * side effects.
 */

/**
 * What a drill is called once it has been deleted. Its runs stay stored
 * with a `drillId` that no longer resolves, and a session does not carry
 * the drill's name, so there is nothing else to call it.
 */
export const DELETED_DRILL_NAME = 'Deleted drill';

/** Every run recorded against one drill, rolled up into one row. */
export type DrillHistorySummary = {
  drillId: string;
  /** The drill's current name, or `DELETED_DRILL_NAME`. */
  drillName: string;
  runCount: number;
  /** Shortest total time of any of the runs, in seconds. */
  bestTime: number;
  /** ISO-8601 timestamp of the most recent run. */
  lastRunAt: string;
};

const isLater = (a: string, b: string): boolean =>
  Date.parse(a) > Date.parse(b);

/** Most recently run first; ties settle by name, then id, so they hold still. */
const byLatestRun = (a: DrillHistorySummary, b: DrillHistorySummary): number =>
  Date.parse(b.lastRunAt) - Date.parse(a.lastRunAt) ||
  a.drillName.localeCompare(b.drillName) ||
  a.drillId.localeCompare(b.drillId);

/**
 * Group runs by the drill they were made against: one summary per drill
 * that has at least one run, most recently run first. A drill with no
 * runs is left out, and runs of a drill that is not in `drills` are kept
 * under `DELETED_DRILL_NAME`.
 */
export const summarizeDrillHistory = (
  sessions: readonly Session[],
  drills: readonly Drill[],
): DrillHistorySummary[] => {
  const drillNames = new Map(drills.map(drill => [drill.id, drill.name]));
  const summaries = new Map<string, DrillHistorySummary>();

  for (const session of sessions) {
    const { drillId, totalTime, createdAt } = session;
    const existing = summaries.get(drillId);

    summaries.set(
      drillId,
      existing === undefined
        ? {
            drillId,
            drillName: drillNames.get(drillId) ?? DELETED_DRILL_NAME,
            runCount: 1,
            bestTime: totalTime,
            lastRunAt: createdAt,
          }
        : {
            ...existing,
            runCount: existing.runCount + 1,
            bestTime: Math.min(existing.bestTime, totalTime),
            lastRunAt: isLater(createdAt, existing.lastRunAt)
              ? createdAt
              : existing.lastRunAt,
          },
    );
  }

  return [...summaries.values()].sort(byLatestRun);
};

/** Run times are measured to the millisecond. */
const TIME_UNITS_PER_SECOND = 1000;

/** Places a time is shown to: the hundredth of a second. */
const SHOWN_DECIMALS = 2;

/** The header figures for one drill's runs, in seconds. */
export type RunTotals = {
  /** Shortest total time of any of the runs. */
  bestTime: number;
  /** Mean total time of the runs. */
  averageTime: number;
};

/**
 * Best and average total time of a drill's runs. `null` when there are no
 * runs, so "nothing to show" stays distinct from a time of zero.
 */
export const summarizeRuns = (
  sessions: readonly Session[],
): RunTotals | null => {
  if (sessions.length === 0) {
    return null;
  }

  // Folded rather than spread into `Math.min`: a drill can be run any
  // number of times, and a call takes only so many arguments.
  const times = sessions.map(session => session.totalTime);
  return {
    bestTime: times.reduce((best, time) => Math.min(best, time)),
    averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
  };
};

/** One run as the detail screen lists it. */
export type RunSummary = {
  session: Session;
  /**
   * This run's total time minus that of the run before it, in seconds:
   * negative is faster, positive is slower. `null` for the first run of the
   * drill, which has nothing to be compared with.
   */
  deltaToPrevious: number | null;
};

/** Newest first; runs saved at the same moment settle by id, so they hold still. */
const byNewestRun = (a: Session, b: Session): number =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);

/**
 * A drill's runs newest first, each with how its total time compares to
 * the run made before it. The difference is rounded to the millisecond so
 * float error (`2.14 - 2.22`) never reaches the screen.
 */
export const describeRuns = (sessions: readonly Session[]): RunSummary[] => {
  const newestFirst = [...sessions].sort(byNewestRun);

  return newestFirst.map((session, index) => {
    const previous = newestFirst[index + 1];
    if (previous === undefined) {
      return { session, deltaToPrevious: null };
    }

    const difference = session.totalTime - previous.totalTime;
    return {
      session,
      // `+ 0` turns the -0 that rounding a hair under gives into a plain 0.
      deltaToPrevious:
        Math.round(difference * TIME_UNITS_PER_SECOND) / TIME_UNITS_PER_SECOND +
        0,
    };
  });
};

/**
 * Which way a difference in seconds points once it is shown to the
 * hundredth: `-1` below zero, `1` above, `0` when it reads `0.00`. A
 * difference of two thousandths is shown as no difference, so it must not
 * be coloured or worded as one either.
 */
export const shownDeltaSign = (delta: number): -1 | 0 | 1 => {
  // Rounded the way the figure itself is, so the two always agree.
  const shown = Number(delta.toFixed(SHOWN_DECIMALS));
  if (shown === 0) {
    return 0;
  }
  return shown < 0 ? -1 : 1;
};
