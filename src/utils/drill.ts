import { MAX_STEP_PAR_SECONDS, type DrillStep } from '@/types/drill';

/**
 * Totals derived from a drill's steps. Pure functions, no side effects —
 * the storage service stamps them onto a drill at save time, and the
 * editor can call them for a live count before anything is saved.
 */

/** Pars are entered and shown to the hundredth of a second. */
const PAR_UNITS_PER_SECOND = 100;

/**
 * Whether `value` is a usable step par: a number of seconds more than 0
 * and at most `MAX_STEP_PAR_SECONDS`. The same rule applies to a drill's
 * step and to the par a run's split was timed against.
 */
export const isStepPar = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_STEP_PAR_SECONDS;

/** Number of `shot` steps in an ordered step list. */
export const countShots = (steps: readonly Pick<DrillStep, 'type'>[]): number =>
  steps.filter(step => step.type === 'shot').length;

/**
 * Sum of every step's par in seconds, if — and only if — every step has
 * one.
 *
 * Returns `null` for an empty list and for one that mixes timed and
 * untimed steps, so callers can tell "no total par" from a short one. The
 * sum is rounded to the hundredth so float error (`1.5 + 0.25 + 0.2 × 5`)
 * never reaches a stored drill.
 */
export const totalPar = (
  steps: readonly Pick<DrillStep, 'par'>[],
): number | null => {
  if (steps.length === 0) {
    return null;
  }

  let sum = 0;
  for (const step of steps) {
    if (step.par === undefined) {
      return null;
    }
    sum += step.par;
  }

  return Math.round(sum * PAR_UNITS_PER_SECOND) / PAR_UNITS_PER_SECOND;
};
