/**
 * Values derived from a run's splits. Pure functions, no side effects —
 * the storage service stamps them onto a session at save time, and the
 * run engine can call them for a live reading before anything is saved.
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
