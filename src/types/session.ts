/**
 * Domain model for a session: one completed run of a drill, with the time
 * every step took. Persistence is handled by `SessionStorageService`,
 * which is also what fills in the id, the timestamp and each split's
 * delta — callers hand it a `SessionInput`.
 */

/**
 * Upper bounds on what a session may hold, alongside `MAX_DRILL_STEPS`
 * (a run has at most one split per step) and `MAX_STEP_PAR_SECONDS` from
 * the drill model. The storage service enforces them on every save and
 * read, so a stored time is always a number the history screens can add
 * up and a session is never too large to load.
 *
 * Raising a limit is safe. Lowering one hides every stored session over
 * the new value, so it needs a migration, not just a smaller number here.
 */
/** Longest a run, or a single split of one, may be, in seconds: a day. */
export const MAX_SESSION_SECONDS = 86_400;
/** Longest a split label may be once trimmed, in characters. */
export const MAX_SPLIT_LABEL_LENGTH = 40;

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
   * The step's par in seconds at the time of the run. Left off when the
   * step was untimed.
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
  /** Total elapsed time of the run, in seconds. */
  totalTime: number;
  /** One entry per step the run timed, in the order they happened. */
  splits: SessionSplit[];
}

/** A split as a caller supplies it; the service works out `delta`. */
export type SessionSplitInput = Omit<SessionSplit, 'delta'>;

/** What a caller supplies to save a completed run. */
export interface SessionInput {
  drillId: string;
  totalTime: number;
  splits: readonly SessionSplitInput[];
}
