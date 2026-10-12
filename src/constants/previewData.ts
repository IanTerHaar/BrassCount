/**
 * Display-only fixtures for the UI layer.
 *
 * These exist purely so screens render with realistic content while the
 * front end is being designed. Nothing here is persisted and nothing here
 * is wired to `@services` or `@store` — swap each `preview*` export for the
 * real selector when the data layer lands, and delete this file.
 */

import type { DrillStepType } from '@/types/drill';
import { stepLabel } from '@utils/drill';

export type DrillSummary = {
  id: string;
  name: string;
  /** Ordered actions the detector listens for during a run. */
  steps: DrillStep[];
};

/** Number of `shot` actions in an ordered step list. */
export const countShots = (steps: DrillStep[]): number =>
  steps.filter(step => step.action === 'shot').length;

/**
 * Sum of every step's par time, if — and only if — every step has one.
 *
 * Returns `undefined` for drills that mix timed and untimed steps so callers
 * can distinguish "no total par" from "0 second par".
 */
export const totalParSeconds = (steps: DrillStep[]): number | undefined => {
  if (steps.length === 0 || steps.some(step => step.parSeconds === undefined)) {
    return undefined;
  }

  return steps.reduce((sum, step) => sum + (step.parSeconds ?? 0), 0);
};

/**
 * One action in a drill.
 *
 * `parSeconds` is a *step* par: the maximum time the shooter is allowed
 * between the previous action (or timer start, for the first step) and
 * this one. Optional — leave it off when the step is untimed.
 */
export type DrillStep = {
  action: SequenceAction;
  parSeconds?: number;
};

/**
 * A single event in a sequence — what the detector listens for, in order.
 *
 * `shot`, `reload` and `rack` map onto the calibrated dB thresholds set on
 * the Calibration screen; `draw` and `holster` bookend a string.
 */
export type SequenceAction = DrillStepType;

/**
 * Human-readable label for a step at `position` in a sequence.
 *
 * The fixture form of `stepLabel` in `@utils/drill`, which holds the
 * naming rule: it accepts any sequence of items keyed by `action`, the
 * shape the fixture drills (`DrillStep`) have.
 */
export const labelForStep = (
  steps: { action: SequenceAction }[],
  position: number,
): string =>
  stepLabel(
    steps.map(step => ({ type: step.action })),
    position,
  );

export type GunProfile = {
  id: string;
  name: string;
  /** Calibration thresholds in dB, used to detect each event type. */
  calibration: {
    shot: number;
    reload: number;
    rack: number;
  };
};

export const previewDrills: DrillSummary[] = [
  {
    id: 'd1',
    name: 'Bill Drill',
    steps: [
      { action: 'draw', parSeconds: 1.5 },
      { action: 'shot', parSeconds: 0.25 },
      { action: 'shot', parSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.2 },
    ],
  },
  {
    id: 'd2',
    name: 'El Presidente',
    steps: [
      { action: 'draw', parSeconds: 1.5 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'reload', parSeconds: 2 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4 },
      { action: 'shot', parSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3 },
    ],
  },
  {
    id: 'd3',
    name: 'Failure to Stop',
    steps: [
      { action: 'draw', parSeconds: 1.5 },
      { action: 'shot', parSeconds: 0.25 },
      { action: 'shot', parSeconds: 0.25 },
      { action: 'shot', parSeconds: 0.5 },
    ],
  },
  {
    id: 'd4',
    name: 'Mozambique',
    steps: [
      { action: 'draw', parSeconds: 1.5 },
      { action: 'shot', parSeconds: 0.25 },
      { action: 'shot', parSeconds: 0.25 },
      { action: 'shot', parSeconds: 0.5 },
      { action: 'holster' },
    ],
  },
  {
    id: 'd5',
    name: 'Dot Torture',
    steps: [
      { action: 'draw', parSeconds: 1.5 },
      { action: 'shot' },
      { action: 'shot' },
      { action: 'reload', parSeconds: 2 },
      { action: 'shot' },
      { action: 'shot' },
      { action: 'rack' },
      { action: 'shot' },
      { action: 'holster' },
    ],
  },
];
