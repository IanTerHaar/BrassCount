/**
 * Display-only fixtures for the UI layer.
 *
 * These exist purely so screens render with realistic content while the
 * front end is being designed. Nothing here is persisted and nothing here
 * is wired to `@services` or `@store` — swap each `preview*` export for the
 * real selector when the data layer lands, and delete this file.
 */

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
export type SequenceAction =
  'draw' | 'shot' | 'reload' | 'rack' | 'transition' | 'holster';

export const sequenceActionOptions: {
  value: SequenceAction;
  label: string;
  description: string;
}[] = [
  { value: 'draw', label: 'Draw', description: 'From the holster' },
  { value: 'shot', label: 'Shot', description: 'One round downrange' },
  { value: 'reload', label: 'Reload', description: 'Magazine change' },
  { value: 'rack', label: 'Rack', description: 'Cycle the slide' },
  {
    value: 'transition',
    label: 'Transition',
    description: 'Move to the next target',
  },
  { value: 'holster', label: 'Holster', description: 'Make safe' },
];

export const sequenceActionLabel = (action: SequenceAction): string =>
  sequenceActionOptions.find(option => option.value === action)?.label ??
  action;

export type SessionResult = {
  id: string;
  /** Links back to the drill definition this run was made against. */
  drillId: string;
  drillName: string;
  /** ISO-8601. Formatted at render time. */
  completedAt: string;
  /** Total elapsed time in seconds. */
  timeSeconds: number;
  /** True when this beat the previous best for the drill. */
  personalBest?: boolean;
  /** Per-step splits, one entry per step of the drill's sequence. */
  steps: RunStep[];
};

/**
 * One step of a completed run: the action the detector recorded, the par
 * the drill expected for it (if any), and how long it actually took from
 * the previous action (or timer start, for step 1).
 */
export type RunStep = {
  action: SequenceAction;
  parSeconds?: number;
  actualSeconds: number;
};

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

export type UserProfile = {
  name: string;
  handle: string;
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

/**
 * Multiple runs per drill so the History screens have something to plot and
 * compare against. Every run's `timeSeconds` is the sum of its step splits;
 * only the current best run per drill carries `personalBest: true` so the PB
 * badge matches the "best time" number on the summary card.
 */
export const previewHistory: SessionResult[] = [
  // Bill Drill — five runs over the last month, gradually tightening splits.
  {
    id: 'h-bill-1',
    drillId: 'd1',
    drillName: 'Bill Drill',
    completedAt: '2026-08-19T14:32:00.000Z',
    timeSeconds: 2.14,
    personalBest: true,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.28 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.19 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.16 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.14 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.13 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.12 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.12 },
    ],
  },
  {
    id: 'h-bill-2',
    drillId: 'd1',
    drillName: 'Bill Drill',
    completedAt: '2026-08-14T09:11:00.000Z',
    timeSeconds: 2.22,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.32 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.17 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.15 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.14 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.12 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.12 },
    ],
  },
  {
    id: 'h-bill-3',
    drillId: 'd1',
    drillName: 'Bill Drill',
    completedAt: '2026-08-10T18:04:00.000Z',
    timeSeconds: 2.31,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.34 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.22 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.18 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.16 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.14 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.14 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.13 },
    ],
  },
  {
    id: 'h-bill-4',
    drillId: 'd1',
    drillName: 'Bill Drill',
    completedAt: '2026-08-04T09:12:00.000Z',
    timeSeconds: 2.58,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.52 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.24 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.19 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.17 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.16 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.15 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.15 },
    ],
  },
  {
    id: 'h-bill-5',
    drillId: 'd1',
    drillName: 'Bill Drill',
    completedAt: '2026-07-27T17:41:00.000Z',
    timeSeconds: 2.83,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.65 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.28 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.22 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.18 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.17 },
      { action: 'shot', parSeconds: 0.2, actualSeconds: 0.13 },
    ],
  },

  // El Presidente — four runs. Reload split is the swing every time.
  {
    id: 'h-prez-1',
    drillId: 'd2',
    drillName: 'El Presidente',
    completedAt: '2026-08-18T10:20:00.000Z',
    timeSeconds: 8.28,
    personalBest: true,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.42 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.28 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.26 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.38 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.29 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.27 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.41 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.29 },
      { action: 'reload', parSeconds: 2, actualSeconds: 1.85 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.28 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.4 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.29 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.4 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.28 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.28 },
    ],
  },
  {
    id: 'h-prez-2',
    drillId: 'd2',
    drillName: 'El Presidente',
    completedAt: '2026-08-14T09:10:00.000Z',
    timeSeconds: 8.68,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.48 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.28 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.4 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.28 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.42 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'reload', parSeconds: 2, actualSeconds: 1.95 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.29 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.42 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.43 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
    ],
  },
  {
    id: 'h-prez-3',
    drillId: 'd2',
    drillName: 'El Presidente',
    completedAt: '2026-08-07T15:22:00.000Z',
    timeSeconds: 9.03,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.58 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.29 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.44 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.28 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.46 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.32 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'reload', parSeconds: 2, actualSeconds: 2.05 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.33 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.43 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.29 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.44 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.29 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
    ],
  },
  {
    id: 'h-prez-4',
    drillId: 'd2',
    drillName: 'El Presidente',
    completedAt: '2026-07-30T11:05:00.000Z',
    timeSeconds: 9.46,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.68 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.32 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.46 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.32 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.48 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.33 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'reload', parSeconds: 2, actualSeconds: 2.15 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.34 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.45 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.32 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.3 },
      { action: 'transition', parSeconds: 0.4, actualSeconds: 0.46 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.32 },
      { action: 'shot', parSeconds: 0.3, actualSeconds: 0.31 },
    ],
  },

  // Failure to Stop — three runs, all under par once the shooter warms up.
  {
    id: 'h-fts-1',
    drillId: 'd3',
    drillName: 'Failure to Stop',
    completedAt: '2026-08-16T12:00:00.000Z',
    timeSeconds: 2.23,
    personalBest: true,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.38 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.21 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.5, actualSeconds: 0.44 },
    ],
  },
  {
    id: 'h-fts-2',
    drillId: 'd3',
    drillName: 'Failure to Stop',
    completedAt: '2026-08-11T17:45:00.000Z',
    timeSeconds: 2.28,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.42 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.22 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.5, actualSeconds: 0.44 },
    ],
  },
  {
    id: 'h-fts-3',
    drillId: 'd3',
    drillName: 'Failure to Stop',
    completedAt: '2026-08-02T12:19:00.000Z',
    timeSeconds: 2.61,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.53 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.26 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.24 },
      { action: 'shot', parSeconds: 0.5, actualSeconds: 0.58 },
    ],
  },

  // Mozambique — four runs. Holster is untimed, so no Δ shows on that row.
  {
    id: 'h-moz-1',
    drillId: 'd4',
    drillName: 'Mozambique',
    completedAt: '2026-08-20T13:15:00.000Z',
    timeSeconds: 3.63,
    personalBest: true,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.32 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.22 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.2 },
      { action: 'shot', parSeconds: 0.5, actualSeconds: 0.42 },
      { action: 'holster', actualSeconds: 1.47 },
    ],
  },
  {
    id: 'h-moz-2',
    drillId: 'd4',
    drillName: 'Mozambique',
    completedAt: '2026-08-15T16:47:00.000Z',
    timeSeconds: 3.85,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.42 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.24 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.22 },
      { action: 'shot', parSeconds: 0.5, actualSeconds: 0.46 },
      { action: 'holster', actualSeconds: 1.51 },
    ],
  },
  {
    id: 'h-moz-3',
    drillId: 'd4',
    drillName: 'Mozambique',
    completedAt: '2026-08-09T11:02:00.000Z',
    timeSeconds: 4.05,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.48 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.24 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.22 },
      { action: 'shot', parSeconds: 0.5, actualSeconds: 0.51 },
      { action: 'holster', actualSeconds: 1.6 },
    ],
  },
  {
    id: 'h-moz-4',
    drillId: 'd4',
    drillName: 'Mozambique',
    completedAt: '2026-08-01T09:30:00.000Z',
    timeSeconds: 4.35,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.6 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.26 },
      { action: 'shot', parSeconds: 0.25, actualSeconds: 0.24 },
      { action: 'shot', parSeconds: 0.5, actualSeconds: 0.55 },
      { action: 'holster', actualSeconds: 1.7 },
    ],
  },

  // Dot Torture — three runs. Most steps are untimed on this drill.
  {
    id: 'h-dot-1',
    drillId: 'd5',
    drillName: 'Dot Torture',
    completedAt: '2026-08-17T19:22:00.000Z',
    timeSeconds: 7.67,
    personalBest: true,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.42 },
      { action: 'shot', actualSeconds: 0.62 },
      { action: 'shot', actualSeconds: 0.55 },
      { action: 'reload', parSeconds: 2, actualSeconds: 1.85 },
      { action: 'shot', actualSeconds: 0.48 },
      { action: 'shot', actualSeconds: 0.42 },
      { action: 'rack', actualSeconds: 1.15 },
      { action: 'shot', actualSeconds: 0.5 },
      { action: 'holster', actualSeconds: 0.68 },
    ],
  },
  {
    id: 'h-dot-2',
    drillId: 'd5',
    drillName: 'Dot Torture',
    completedAt: '2026-08-05T08:14:00.000Z',
    timeSeconds: 8.54,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.55 },
      { action: 'shot', actualSeconds: 0.68 },
      { action: 'shot', actualSeconds: 0.6 },
      { action: 'reload', parSeconds: 2, actualSeconds: 2.1 },
      { action: 'shot', actualSeconds: 0.55 },
      { action: 'shot', actualSeconds: 0.48 },
      { action: 'rack', actualSeconds: 1.28 },
      { action: 'shot', actualSeconds: 0.55 },
      { action: 'holster', actualSeconds: 0.75 },
    ],
  },
  {
    id: 'h-dot-3',
    drillId: 'd5',
    drillName: 'Dot Torture',
    completedAt: '2026-07-25T10:48:00.000Z',
    timeSeconds: 9.7,
    steps: [
      { action: 'draw', parSeconds: 1.5, actualSeconds: 1.68 },
      { action: 'shot', actualSeconds: 0.8 },
      { action: 'shot', actualSeconds: 0.72 },
      { action: 'reload', parSeconds: 2, actualSeconds: 2.35 },
      { action: 'shot', actualSeconds: 0.65 },
      { action: 'shot', actualSeconds: 0.58 },
      { action: 'rack', actualSeconds: 1.4 },
      { action: 'shot', actualSeconds: 0.62 },
      { action: 'holster', actualSeconds: 0.9 },
    ],
  },
];

export const previewUser: UserProfile = {
  name: 'Marty McFly',
  handle: '@martymcfly',
};
