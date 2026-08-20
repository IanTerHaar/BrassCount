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
  /** Shot count the drill expects, e.g. "6 shots". */
  shots: number;
  /** Par time in seconds, if the drill is timed. */
  parSeconds?: number;
  /** Ordered actions the detector listens for during a run. */
  steps: DrillStep[];
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
  drillName: string;
  /** ISO-8601. Formatted at render time. */
  completedAt: string;
  /** Total elapsed time in seconds. */
  timeSeconds: number;
  /** Hit score as a percentage, 0-100. */
  score: number;
  /** True when this beat the previous best for the drill. */
  personalBest?: boolean;
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
  gunIds: string[];
};

export const previewDrills: DrillSummary[] = [
  {
    id: 'd1',
    name: 'Bill Drill',
    shots: 6,
    parSeconds: 2,
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
    shots: 12,
    parSeconds: 10,
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
    shots: 3,
    parSeconds: 3,
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
    shots: 3,
    parSeconds: 4,
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
    shots: 50,
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

export const previewHistory: SessionResult[] = [
  {
    id: 'h1',
    drillName: 'Bill Drill',
    completedAt: '2026-08-15T14:32:00.000Z',
    timeSeconds: 2.14,
    score: 96,
    personalBest: true,
  },
  {
    id: 'h2',
    drillName: 'El Presidente',
    completedAt: '2026-08-14T09:10:00.000Z',
    timeSeconds: 9.62,
    score: 88,
  },
  {
    id: 'h3',
    drillName: 'Failure to Stop',
    completedAt: '2026-08-11T17:45:00.000Z',
    timeSeconds: 3.28,
    score: 72,
  },
  {
    id: 'h4',
    drillName: 'Mozambique',
    completedAt: '2026-08-09T11:02:00.000Z',
    timeSeconds: 4.05,
    score: 81,
  },
];

export const previewGuns: GunProfile[] = [
  {
    id: 'g1',
    name: 'Glock 19 Gen5',
    calibration: { shot: 96, reload: 74, rack: 68 },
  },
  {
    id: 'g2',
    name: 'CZ Shadow 2',
    calibration: { shot: 99, reload: 71, rack: 66 },
  },
  {
    id: 'g3',
    name: 'SIG P320 X5',
    calibration: { shot: 94, reload: 76, rack: 70 },
  },
];

export const previewUser: UserProfile = {
  name: 'Simeon Momberg',
  handle: '@simeon',
  gunIds: ['g1', 'g2', 'g3'],
};
