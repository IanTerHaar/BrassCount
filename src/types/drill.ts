/**
 * Domain model for a drill: a named, ordered list of steps the shooter
 * performs and the detector listens for. Persistence is handled by
 * `DrillStorageService`, which is also what fills in the ids, timestamps
 * and derived totals — callers hand it a `DrillInput`.
 */

/**
 * Every kind of step a drill can contain, in the order the editor lists
 * them. `shot`, `reload` and `rack` map onto the calibrated sounds of the
 * same name; `draw` and `holster` bookend a string.
 */
export const DRILL_STEP_TYPES = [
  'draw',
  'shot',
  'reload',
  'rack',
  'transition',
  'holster',
] as const;

export type DrillStepType = (typeof DRILL_STEP_TYPES)[number];

/**
 * Upper bounds on what a drill may hold. The storage service enforces
 * them on every save and read, so a drill can never carry a total par
 * that overflows or a list too large to load; an editor should offer no
 * more than these allow.
 *
 * Raising a limit is safe. Lowering one hides every stored drill over the
 * new value, so it needs a migration, not just a smaller number here.
 */
/** Longest a single step par may be, in seconds. */
export const MAX_STEP_PAR_SECONDS = 60;
/** Most steps one drill may have. */
export const MAX_DRILL_STEPS = 100;
/** Longest a drill name may be once trimmed, in characters. */
export const MAX_DRILL_NAME_LENGTH = 60;

/** One action in a drill. */
export interface DrillStep {
  /** Stable id, so a run's splits can point back at the step they timed. */
  id: string;
  type: DrillStepType;
  /**
   * Step par in seconds: the longest the shooter is allowed between the
   * previous step (or the timer start, for the first step) and this one.
   * Left off when the step is untimed.
   */
  par?: number;
}

export interface Drill {
  /** Stable, unique identifier (UUID) for the drill. */
  id: string;
  name: string;
  /** Steps in the order they are performed. */
  steps: DrillStep[];
  /**
   * Sum of every step's par, in seconds. `null` when any step is untimed,
   * so "no drill par" stays distinct from a par that happens to be short.
   * Derived from `steps` by the storage service; never set by a caller.
   */
  totalPar: number | null;
  /** Number of `shot` steps. Derived from `steps` like `totalPar`. */
  shotCount: number;
  /** ISO-8601 timestamp of when the drill was created. */
  createdAt: string;
  /** ISO-8601 timestamp of the last change to the drill. */
  updatedAt: string;
}

/**
 * A step as a caller supplies it. Leave `id` off for a new step and the
 * service generates one; pass the existing `id` back when editing so the
 * step keeps its identity.
 */
export type DrillStepInput = Omit<DrillStep, 'id'> &
  Partial<Pick<DrillStep, 'id'>>;

/** What a caller supplies to create a drill. */
export interface DrillInput {
  name: string;
  steps: readonly DrillStepInput[];
}

/** Fields that can be changed on an existing drill; omitted ones are kept. */
export type DrillChanges = Partial<DrillInput>;
