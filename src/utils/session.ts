import type { Drill } from '@/types/drill';
import type { RunResult } from '@/types/run';
import type { SessionInput, SessionSplitInput } from '@/types/session';
import { stepLabel } from '@utils/drill';

/**
 * Values derived from a run's splits, and the session a finished run
 * saves as. Pure functions, no side effects — the storage service stamps
 * the delta onto a session at save time, and the run engine can call it
 * for a live reading before anything is saved.
 */

/** Split times are measured to the millisecond. */
const SPLIT_UNITS_PER_SECOND = 1000;

/**
 * How far a step landed from its par, in seconds: negative is under par,
 * positive is over. `null` when the step has no par.
 *
 * Rounded to the millisecond so float error (`1.28 - 1.5`) never reaches a
 * stored session.
 */
export const splitDelta = (
  actual: number,
  par: number | undefined,
): number | null => {
  if (par === undefined) {
    return null;
  }
  // `+ 0` turns the -0 that rounding a hair under par gives into a plain 0.
  return (
    Math.round((actual - par) * SPLIT_UNITS_PER_SECOND) /
      SPLIT_UNITS_PER_SECOND +
    0
  );
};

/**
 * What a finished run saves as: the drill it was run against, its total
 * time, whether every step was heard, and one split per step heard, named
 * the way the drill names it (`Shot 2`).
 *
 * A split carries the par the step was judged against, which already
 * counts any silent step in front of it, and no delta: the storage
 * service works that out.
 *
 * `null` when there is nothing to save: no step was heard, or a result
 * points at a step the drill does not have (the drill is not the one that
 * was run).
 */
export const sessionFromRun = (
  drill: Pick<Drill, 'id' | 'steps'>,
  run: Pick<RunResult, 'completed' | 'results' | 'totalTime'>,
): SessionInput | null => {
  if (run.results.length === 0) {
    return null;
  }

  const positions = new Map(drill.steps.map((step, index) => [step.id, index]));
  const splits: SessionSplitInput[] = [];
  for (const { stepId, par, actual } of run.results) {
    const position = positions.get(stepId);
    if (position === undefined) {
      return null;
    }
    const label = stepLabel(drill.steps, position);
    splits.push(
      par === undefined
        ? { stepId, label, actual }
        : { stepId, label, par, actual },
    );
  }

  return {
    drillId: drill.id,
    totalTime: run.totalTime,
    completed: run.completed,
    splits,
  };
};
