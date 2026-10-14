import { MAX_DRILL_STEPS, MAX_STEP_PAR_SECONDS } from './drill';

/**
 * Domain model for a session: one saved run of a drill, with the time
 * every step heard took. A run stopped before its last step can be saved
 * too, marked `completed: false`. Persistence is handled by
 * `SessionStorageService`, which is also what fills in the id, the
 * timestamp and each split's delta — callers hand it a `SessionInput`.
 */

/**
 * Upper bounds on what a session may hold, alongside `MAX_DRILL_STEPS`
 * from the drill model (a run has at most one split per step). The
 * storage service enforces them on every save and read, so a stored time
 * is always a number the history screens can add up and a session is
 * never too large to load.
 *
 * Raising a limit is safe. Lowering one hides every stored session over
 * the new value, so it needs a migration, not just a smaller number here.
 */
/** Longest a run, or a single split of one, may be, in seconds: a day. */
export const MAX_SESSION_SECONDS = 86_400;
/** Longest a split label may be once trimmed, in characters. */
export const MAX_SPLIT_LABEL_LENGTH = 40;
/**
 * Longest par a split may carry, in seconds. A step that cannot be heard
 * (a draw, a holster) has its par counted into the next step that can, so
 * a split's par can be the sum of every par in a drill: at most
 * `MAX_DRILL_STEPS` steps of `MAX_STEP_PAR_SECONDS` each.
 */
export const MAX_SPLIT_PAR_SECONDS = MAX_DRILL_STEPS * MAX_STEP_PAR_SECONDS;

/** How one step of a run went. */
export interface SessionSplit {
  /** Id of the drill step this split timed. */
  stepId: string;
  /**
   * What the step was called when the run was made, e.g. `Shot 2`. Kept
   * on the split so history still reads correctly after the drill is
   * edited or deleted.
   */
  label: string;
  /**
   * The par the step was judged against at the time of the run, in
   * seconds: its own par plus that of any silent step in front of it (see
   * `RunStep.par`). Left off when none of them had one.
   */
  par?: number;
  /**
   * Seconds this step took, measured from the previous step (or from the
   * timer start, for the first step).
   */
  actual: number;
  /**
   * `actual - par` in seconds: negative is under par, positive is over.
   * `null` when the step has no par, so "no par to beat" stays distinct
   * from landing exactly on it. Derived by the storage service; never set
   * by a caller.
   */
  delta: number | null;
}

export interface Session {
  /** Stable, unique identifier (UUID) for the run. */
  id: string;
  /** Id of the drill this run was made against. */
  drillId: string;
  /** ISO-8601 timestamp of when the run was saved. */
  createdAt: string;
  /**
   * Seconds from the start signal to the last step heard. For a run that
   * was stopped early that is not the time of the whole drill.
   */
  totalTime: number;
  /**
   * Whether every step the run listened for was heard. `false` for a run
   * stopped early, which History lists but leaves out of its best and
   * average times.
   */
  completed: boolean;
  /** One entry per step the run timed, in the order they happened. */
  splits: SessionSplit[];
}

/** A split as a caller supplies it; the service works out `delta`. */
export type SessionSplitInput = Omit<SessionSplit, 'delta'>;

/** What a caller supplies to save a run. */
export interface SessionInput {
  drillId: string;
  totalTime: number;
  completed: boolean;
  splits: readonly SessionSplitInput[];
}
