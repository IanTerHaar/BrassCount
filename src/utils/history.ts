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
