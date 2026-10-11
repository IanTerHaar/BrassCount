import {
  MAX_STEP_PAR_SECONDS,
  type DrillStep,
  type DrillStepType,
} from '@/types/drill';

/**
 * Totals derived from a drill's steps. Pure functions, no side effects —
 * the storage service stamps them onto a drill at save time, and the
 * editor can call them for a live count before anything is saved.
 */

/** Pars are entered and shown to the hundredth of a second. */
const PAR_UNITS_PER_SECOND = 100;

/** A number of seconds rounded to the precision a par is kept at. */
export const roundPar = (seconds: number): number =>
  Math.round(seconds * PAR_UNITS_PER_SECOND) / PAR_UNITS_PER_SECOND;

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

const countOfType = (
  steps: readonly Pick<DrillStep, 'type'>[],
  type: DrillStepType,
): number => steps.filter(step => step.type === type).length;

/** Number of `shot` steps in an ordered step list. */
export const countShots = (steps: readonly Pick<DrillStep, 'type'>[]): number =>
  countOfType(steps, 'shot');

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

  return roundPar(sum);
};

const STEP_TYPE_LABELS: Record<DrillStepType, string> = {
  draw: 'Draw',
  shot: 'Shot',
  reload: 'Reload',
  rack: 'Rack',
  transition: 'Transition',
  holster: 'Holster',
};

/** A step type as it is named on screen: `shot` reads "Shot". */
export const stepTypeLabel = (type: DrillStepType): string =>
  STEP_TYPE_LABELS[type];

/**
 * What to call the step at `position` in an ordered step list.
 *
 * A type that repeats is numbered the way a shooter would call it — the
 * second `shot` reads "Shot 2" — while a type that appears once stays
 * plain, so a string with one draw reads "Draw", not "Draw 1".
 *
 * Throws `RangeError` when there is no step at `position`.
 */
export const stepLabel = (
  steps: readonly Pick<DrillStep, 'type'>[],
  position: number,
): string => {
  const step = steps[position];
  if (step === undefined) {
    throw new RangeError(`There is no step at position ${position}`);
  }

  const label = stepTypeLabel(step.type);
  const total = countOfType(steps, step.type);
  if (total < 2) {
    return label;
  }

  const ordinal = countOfType(steps.slice(0, position + 1), step.type);
  return `${label} ${ordinal}`;
};
