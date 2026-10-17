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
  /** Every run, complete or stopped early. */
  runCount: number;
  /**
   * Shortest total time of the completed runs, in seconds. `null` when
   * every run was stopped early: a run cut short is quicker without being
   * better.
   */
  bestTime: number | null;
  /** ISO-8601 timestamp of the most recent run. */
  lastRunAt: string;
};

const isLater = (a: string, b: string): boolean =>
  Date.parse(a) > Date.parse(b);

/** The shorter of two times, either of which may be missing. */
const shorter = (a: number | null, b: number | null): number | null => {
  if (a === null) {
    return b;
  }
  return b === null ? a : Math.min(a, b);
};

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
    const { drillId, createdAt } = session;
    const existing = summaries.get(drillId);
    const time = session.completed ? session.totalTime : null;

    summaries.set(
      drillId,
      existing === undefined
        ? {
            drillId,
            drillName: drillNames.get(drillId) ?? DELETED_DRILL_NAME,
            runCount: 1,
            bestTime: time,
            lastRunAt: createdAt,
          }
        : {
            ...existing,
            runCount: existing.runCount + 1,
            bestTime: shorter(existing.bestTime, time),
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

/** The header figures for one drill's completed runs, in seconds. */
export type RunTotals = {
  /** Shortest total time of the completed runs. */
  bestTime: number;
  /** Mean total time of the completed runs. */
  averageTime: number;
};

/**
 * Best and average total time of a drill's completed runs; a run stopped
 * early is left out, since its total is not the time of the drill. `null`
 * when no run was completed, so "nothing to show" stays distinct from a
 * time of zero.
 */
export const summarizeRuns = (
  sessions: readonly Session[],
): RunTotals | null => {
  // Folded rather than spread into `Math.min`: a drill can be run any
  // number of times, and a call takes only so many arguments.
  const times = sessions
    .filter(session => session.completed)
    .map(session => session.totalTime);
  if (times.length === 0) {
    return null;
  }

  return {
    bestTime: times.reduce((best, time) => Math.min(best, time)),
    averageTime: times.reduce((sum, time) => sum + time, 0) / times.length,
  };
};

/** One run as the detail screen lists it. */
export type RunSummary = {
  session: Session;
  /**
   * This run's total time minus that of the completed run before it, in
   * seconds: negative is faster, positive is slower. `null` for a run
   * stopped early, and for the first completed run of the drill, which
   * have nothing to be fairly compared with.
   */
  deltaToPrevious: number | null;
  /** Whether this run is the drill's personal best (`findPersonalBest`). */
  personalBest: boolean;
};

/** Newest first; runs saved at the same moment settle by id, so they hold still. */
const byNewestRun = (a: Session, b: Session): number =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);

/** A total time in whole milliseconds, the precision a run is timed to. */
const inTimeUnits = (seconds: number): number =>
  Math.round(seconds * TIME_UNITS_PER_SECOND);

/** A time rounded to the hundredth, the way the screens show it. */
const shownTime = (seconds: number): number =>
  Number(seconds.toFixed(SHOWN_DECIMALS));

/**
 * `later - earlier` in seconds, rounded to the millisecond so float error
 * (`2.14 - 2.22`) never reaches the screen.
 */
const difference = (later: number, earlier: number): number =>
  // `+ 0` turns the -0 that rounding a hair under gives into 0.
  Math.round((later - earlier) * TIME_UNITS_PER_SECOND) /
    TIME_UNITS_PER_SECOND +
  0;

/**
 * The id of a drill's personal best: the completed run with the shortest
 * total time, or `null` when no run was completed. A run stopped early is
 * passed over, since its total is not the time of the drill. Times are
 * compared to the millisecond, and a later run that only matches the best
 * leaves it with the run that set it.
 */
export const findPersonalBest = (
  sessions: readonly Session[],
): string | null => {
  let best: Session | null = null;
  // Oldest first, so on a tie the run that set the time keeps it.
  for (const session of [...sessions].sort(byNewestRun).reverse()) {
    if (
      session.completed &&
      (best === null ||
        inTimeUnits(session.totalTime) < inTimeUnits(best.totalTime))
    ) {
      best = session;
    }
  }
  return best?.id ?? null;
};

/**
 * A drill's runs newest first, each completed one with how its total time
 * compares to the completed run made before it; a run stopped early in
 * between is passed over. The difference is taken between the totals as
 * they are shown, to the hundredth, so two runs that both read `2.14s`
 * never differ by `0.01s`.
 */
export const describeRuns = (sessions: readonly Session[]): RunSummary[] => {
  const newestFirst = [...sessions].sort(byNewestRun);
  const personalBestId = findPersonalBest(sessions);

  // Walked from the oldest run, so each completed run meets the completed
  // run before it in one pass.
  const described: RunSummary[] = [];
  let previous: Session | undefined;
  for (let index = newestFirst.length - 1; index >= 0; index -= 1) {
    const session = newestFirst[index];
    if (!session.completed) {
      described.push({ session, deltaToPrevious: null, personalBest: false });
      continue;
    }

    const deltaToPrevious =
      previous === undefined
        ? null
        : difference(
            shownTime(session.totalTime),
            shownTime(previous.totalTime),
          );
    described.push({
      session,
      deltaToPrevious,
      personalBest: session.id === personalBestId,
    });
    previous = session;
  }
  return described.reverse();
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

/** One step of a drill as two of its runs went. */
export type StepComparison = {
  stepId: string;
  /** What the later run called the step, or the earlier one when only it heard the step. */
  label: string;
  /** Seconds the step took in the earlier run; `null` when it was not heard. */
  earlier: number | null;
  /** Seconds the step took in the later run; `null` when it was not heard. */
  later: number | null;
  /**
   * `later - earlier` in seconds, rounded to the millisecond: negative is
   * faster. `null` unless both runs heard the step.
   */
  delta: number | null;
};

/** Two runs of one drill, side by side. */
export type RunComparison = {
  /** The run made first. */
  earlier: Session;
  /** The run made second. */
  later: Session;
  /**
   * The later run's total time minus the earlier one's, in seconds.
   * `null` when either was stopped early: its total is not the time of the
   * drill, so the two cannot be fairly compared.
   */
  totalDelta: number | null;
  /** Every step either run heard, in the later run's order. */
  steps: StepComparison[];
};

const stepComparison = (
  stepId: string,
  label: string,
  earlier: number | null,
  later: number | null,
): StepComparison => ({
  stepId,
  label,
  earlier,
  later,
  delta: earlier === null || later === null ? null : difference(later, earlier),
});

/**
 * Two runs of the same drill step by step, the earlier one first whichever
 * order they are passed in. Steps are matched by id, which a drill keeps
 * through edits, so a renamed or moved step is still compared with itself.
 *
 * The rows follow the later run. A step only the earlier run heard (one
 * the later run stopped before, or one since removed from the drill) goes
 * after the step it followed in the earlier run, so a run stopped early
 * still lists the steps it never reached.
 */
export const compareRuns = (a: Session, b: Session): RunComparison => {
  // The order the run list uses, so "earlier" agrees with what is shown.
  const [later, earlier] = [a, b].sort(byNewestRun);

  // Built up locally: nothing outside this function sees the list until it
  // is returned.
  const steps = later.splits.map(split =>
    stepComparison(split.stepId, split.label, null, split.actual),
  );
  let insertAt = 0;
  for (const split of earlier.splits) {
    const index = steps.findIndex(step => step.stepId === split.stepId);
    if (index === -1) {
      steps.splice(
        insertAt,
        0,
        stepComparison(split.stepId, split.label, split.actual, null),
      );
      insertAt += 1;
    } else {
      const { stepId, label, later: laterActual } = steps[index];
      steps[index] = stepComparison(stepId, label, split.actual, laterActual);
      insertAt = index + 1;
    }
  }

  return {
    earlier,
    later,
    totalDelta:
      earlier.completed && later.completed
        ? difference(later.totalTime, earlier.totalTime)
        : null,
    steps,
  };
};
