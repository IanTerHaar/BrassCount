import {
  MAX_DRILL_NAME_LENGTH,
  MAX_DRILL_STEPS,
  type DrillStep,
  type DrillStepType,
} from '@/types/drill';

import { isStepPar, roundPar } from './drill';
import { generateId as defaultGenerateId } from './id';

/**
 * The step list of a drill while it is being built in the editor. Pure
 * functions, no side effects: each takes the current steps and returns
 * the next ones, leaving the list it was given untouched, so the editor
 * can hand them straight to `setState`.
 *
 * A draft step has the stored shape (`DrillStep`). A step added here is
 * given its id up front, which is what keeps a row's identity stable as
 * the rows around it are removed, and the storage service keeps an id it
 * is handed.
 */

/**
 * The step types the editor offers, in the order its dropdown lists them.
 *
 * `transition` is left out on purpose. It is still a type the storage
 * service accepts, so a stored drill can hold one — see
 * `stepTypeChoices`.
 */
export const EDITOR_STEP_TYPES = [
  'draw',
  'shot',
  'reload',
  'rack',
  'holster',
] as const satisfies readonly DrillStepType[];

/**
 * The types the dropdown of one step offers: the editor's list, plus the
 * step's own type when that is not on it. Without that, a stored
 * `transition` step would show as a blank dropdown and silently change
 * type the first time it was opened.
 */
export const stepTypeChoices = (
  current: DrillStepType,
): readonly DrillStepType[] =>
  EDITOR_STEP_TYPES.some(type => type === current)
    ? EDITOR_STEP_TYPES
    : [...EDITOR_STEP_TYPES, current];

/**
 * The type a step added to `steps` starts as: a draw to open the string,
 * a shot after that. Either can be changed from the step's dropdown.
 */
export const nextStepType = (
  steps: readonly Pick<DrillStep, 'type'>[],
): DrillStepType => (steps.length === 0 ? 'draw' : 'shot');

/** Whether `steps` has room for another step. */
export const canAddStep = (steps: readonly DrillStep[]): boolean =>
  steps.length < MAX_DRILL_STEPS;

/**
 * `steps` with a new, untimed step at the end. A list that already holds
 * `MAX_DRILL_STEPS` comes back unchanged.
 */
export const addStep = (
  steps: readonly DrillStep[],
  generateId: () => string = defaultGenerateId,
): readonly DrillStep[] =>
  canAddStep(steps)
    ? [...steps, { id: generateId(), type: nextStepType(steps) }]
    : steps;

/** `steps` without the step that has this id. */
export const removeStep = (
  steps: readonly DrillStep[],
  id: string,
): readonly DrillStep[] => steps.filter(step => step.id !== id);

/** `steps` with the type of one step changed; its par is kept. */
export const changeStepType = (
  steps: readonly DrillStep[],
  id: string,
  type: DrillStepType,
): readonly DrillStep[] =>
  steps.map(step => (step.id === id ? { ...step, type } : step));

/**
 * `steps` with the par of one step set, or cleared when `par` is
 * `undefined`. An untimed step carries no `par` key at all, the way the
 * storage service writes one.
 *
 * Throws `RangeError` for a par the storage service would reject. Pars
 * typed by the shooter go through `parseParInput` first, so reaching
 * that is a caller bug.
 */
export const setStepPar = (
  steps: readonly DrillStep[],
  id: string,
  par: number | undefined,
): readonly DrillStep[] => {
  if (par !== undefined && !isStepPar(par)) {
    throw new RangeError('A step par must be a usable number of seconds');
  }

  return steps.map(step => {
    if (step.id !== id) {
      return step;
    }
    return par === undefined
      ? { id: step.id, type: step.type }
      : { id: step.id, type: step.type, par };
  });
};

// Plain digits with at most one decimal separator: "1", "1.", "1.25",
// ".5". A comma is accepted too, since that is what the decimal keypad
// types in a locale that writes 0,25.
const PAR_INPUT_PATTERN = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * The par a shooter typed, in seconds rounded to the hundredth, or `null`
 * when the text is not a par the storage service would accept: not a
 * number, zero once rounded, or over `MAX_STEP_PAR_SECONDS`.
 *
 * A comma is always the decimal separator, never a thousands one:
 * "1,000" is one second.
 */
export const parseParInput = (text: string): number | null => {
  const trimmed = text.trim();
  if (!PAR_INPUT_PATTERN.test(trimmed)) {
    return null;
  }

  const seconds = roundPar(Number(trimmed.replace(',', '.')));
  return isStepPar(seconds) ? seconds : null;
};

/**
 * One reason a draft cannot be saved yet. A missing name and an empty
 * step list are what a shooter runs into building a drill; the editor's
 * own limits (the name field's length, `addStep`) keep a draft clear of
 * the other two.
 */
export type DrillDraftProblem =
  'name-missing' | 'name-too-long' | 'no-steps' | 'too-many-steps';

/**
 * Everything that stops a draft from being saved, the name's problem
 * before the steps', or an empty list when the storage service would
 * accept it. The service still enforces the same rules on save; this is
 * what lets the editor say what is missing before the shooter tries.
 *
 * The name is measured the way it is stored: trimmed. A step's type, par
 * and id are not checked here — the functions above only ever produce
 * steps the service accepts.
 */
export const drillDraftProblems = (
  name: string,
  steps: readonly DrillStep[],
): readonly DrillDraftProblem[] => {
  const problems: DrillDraftProblem[] = [];
  const storedName = name.trim();

  if (storedName.length === 0) {
    problems.push('name-missing');
  } else if (storedName.length > MAX_DRILL_NAME_LENGTH) {
    problems.push('name-too-long');
  }

  if (steps.length === 0) {
    problems.push('no-steps');
  } else if (steps.length > MAX_DRILL_STEPS) {
    problems.push('too-many-steps');
  }

  return problems;
};
