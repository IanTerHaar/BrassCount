import type {
  CalibrationState,
  SoundCalibration,
} from '../src/types/calibration';
import type { DrillStep } from '../src/types/drill';
import type { RunStep } from '../src/types/run';
import {
  DEFAULT_DETECTION_TUNING,
  createDetector,
  detect,
  markTrigger,
  missingCalibration,
  planRun,
  summarizeRun,
  thresholdsFrom,
  type DetectorEvent,
  type DetectorReading,
  type DetectorState,
} from '../src/utils/runDetection';

const calibrated = (thresholdDbfs: number): SoundCalibration => ({
  status: 'calibrated',
  thresholdDbfs,
  lastTestDbfs: null,
});

const uncalibrated: SoundCalibration = {
  status: 'uncalibrated',
  thresholdDbfs: null,
  lastTestDbfs: null,
};

const calibration = (
  overrides: Partial<CalibrationState> = {},
): CalibrationState => ({
  shot: calibrated(-10),
  reload: calibrated(-30),
  rack: calibrated(-25),
  ...overrides,
});

const step = (id: string, type: DrillStep['type'], par?: number): DrillStep =>
  par === undefined ? { id, type } : { id, type, par };

/** How long one microphone buffer lasts, near enough. */
const BUFFER_MS = 23;
const ROOM_DB = -70;
const TRIGGER_AT = 10_000;
const BEEP_MS = 300;

/** How far the peak of an impulse (a shot, a click) stands over its level. */
const IMPULSE_CREST_DB = 15;
/** The same for a steady tone. */
const TONE_CREST_DB = 3;

/**
 * A reading of an impulse that peaked (and began) at `at`, in a buffer
 * that ended a few milliseconds later.
 */
const heard = (
  at: number,
  peakDb: number,
  overrides: Partial<DetectorReading> = {},
): DetectorReading => ({
  db: peakDb - IMPULSE_CREST_DB,
  peakDb,
  timestamp: at + 5,
  peakTimestamp: at,
  onsetTimestamp: at,
  frameTimed: true,
  ...overrides,
});

/** A reading filled by a steady tone, as the start beep is. */
const tone = (
  at: number,
  peakDb: number,
  overrides: Partial<DetectorReading> = {},
): DetectorReading =>
  heard(at, peakDb, { db: peakDb - TONE_CREST_DB, ...overrides });

const TWO_SHOTS: RunStep[] = [
  { stepId: 'a', sound: 'shot', par: 1.5 },
  { stepId: 'b', sound: 'shot' },
];

const newDetector = (steps: readonly RunStep[] = TWO_SHOTS): DetectorState =>
  createDetector({
    steps,
    thresholds: thresholdsFrom(calibration()),
    beepMs: BEEP_MS,
  });

type Fed = { state: DetectorState; events: DetectorEvent[] };

const feed = (state: DetectorState, readings: DetectorReading[]): Fed =>
  readings.reduce<Fed>(
    (fed, reading) => {
      const next = detect(fed.state, reading);
      return { state: next.state, events: [...fed.events, ...next.events] };
    },
    { state, events: [] },
  );

/** A quiet room for a quarter of a second, up to just before `until`. */
const room = (until: number, level = ROOM_DB): DetectorReading[] =>
  Array.from({ length: 12 }, (_unused, index) =>
    heard(until - (12 - index) * BUFFER_MS, level),
  );

/** A detector that has heard the room and had the beep requested. */
const triggered = (steps: readonly RunStep[] = TWO_SHOTS): DetectorState =>
  markTrigger(feed(newDetector(steps), room(TRIGGER_AT)).state, TRIGGER_AT);

/** The start beep as the microphone hears it, from `zero` on. */
const beep = (zero: number, level = -20): DetectorReading[] =>
  Array.from({ length: 14 }, (_unused, index) =>
    index === 0
      ? // The buffer the beep starts in holds too little of it to be a tone.
        heard(zero, level, { db: level - 9 })
      : tone(zero + index * BUFFER_MS, level, {
          // A tone fills the buffer: it "begins" where the buffer does.
          onsetTimestamp: zero + index * BUFFER_MS - BUFFER_MS,
        }),
  ).filter(reading => reading.peakTimestamp < zero + BEEP_MS);

/** A detector whose beep was heard 80 ms after the trigger and has ended. */
const started = (
  steps: readonly RunStep[] = TWO_SHOTS,
): { state: DetectorState; zero: number } => {
  const zero = TRIGGER_AT + 80;
  const fed = feed(triggered(steps), [
    ...beep(zero),
    heard(zero + BEEP_MS + 50, ROOM_DB),
  ]);
  return { state: fed.state, zero };
};

const stepEvents = (events: DetectorEvent[]) =>
  events.flatMap(event => (event.type === 'step' ? [event.detection] : []));

describe('planRun', () => {
  it('keeps the steps that have a calibrated sound, in order', () => {
    const plan = planRun([
      step('s1', 'shot', 0.25),
      step('r1', 'reload', 2),
      step('k1', 'rack', 1),
    ]);

    expect(plan).toEqual([
      { stepId: 's1', sound: 'shot', par: 0.25 },
      { stepId: 'r1', sound: 'reload', par: 2 },
      { stepId: 'k1', sound: 'rack', par: 1 },
    ]);
  });

  it('counts the par of a silent step towards the next heard step', () => {
    const plan = planRun([
      step('d', 'draw', 1.5),
      step('s1', 'shot', 0.25),
      step('s2', 'shot', 0.2),
    ]);

    expect(plan).toEqual([
      { stepId: 's1', sound: 'shot', par: 1.75 },
      { stepId: 's2', sound: 'shot', par: 0.2 },
    ]);
  });

  it('counts a silent step between two heard steps towards the later one', () => {
    const plan = planRun([
      step('s1', 'shot', 0.3),
      step('t', 'transition', 0.4),
      step('s2', 'shot', 0.3),
    ]);

    expect(plan.map(planned => planned.par)).toEqual([0.3, 0.7]);
  });

  it('adds up several silent steps in a row', () => {
    const plan = planRun([
      step('d', 'draw', 1.5),
      step('t', 'transition', 0.4),
      step('s1', 'shot', 0.25),
    ]);

    expect(plan).toEqual([{ stepId: 's1', sound: 'shot', par: 2.15 }]);
  });

  it('gives a heard step its own par when the silent step before it is untimed', () => {
    const plan = planRun([step('d', 'draw'), step('s1', 'shot', 1.5)]);

    expect(plan).toEqual([{ stepId: 's1', sound: 'shot', par: 1.5 }]);
  });

  it('gives an untimed heard step the par of the silent step before it', () => {
    const plan = planRun([step('d', 'draw', 1.5), step('s1', 'shot')]);

    expect(plan).toEqual([{ stepId: 's1', sound: 'shot', par: 1.5 }]);
  });

  it('leaves a step untimed when nothing counted towards it has a par', () => {
    const plan = planRun([step('d', 'draw'), step('s1', 'shot')]);

    expect(plan).toEqual([{ stepId: 's1', sound: 'shot' }]);
    expect(plan[0]).not.toHaveProperty('par');
  });

  it('drops a silent step that nothing heard follows', () => {
    const plan = planRun([step('s1', 'shot', 0.5), step('h', 'holster', 2)]);

    expect(plan).toEqual([{ stepId: 's1', sound: 'shot', par: 0.5 }]);
  });

  it('keeps float error out of an added par', () => {
    const plan = planRun([step('d', 'draw', 0.1), step('s1', 'shot', 0.2)]);

    expect(plan[0].par).toBe(0.3);
  });

  it('plans nothing for a drill with no heard step', () => {
    expect(planRun([])).toEqual([]);
    expect(planRun([step('d', 'draw', 1.5), step('h', 'holster')])).toEqual([]);
  });
});

describe('missingCalibration', () => {
  const plan: RunStep[] = [
    { stepId: 'k', sound: 'rack' },
    { stepId: 's1', sound: 'shot' },
    { stepId: 's2', sound: 'shot' },
  ];

  it('finds nothing missing when every sound the run needs is calibrated', () => {
    expect(missingCalibration(plan, calibration())).toEqual([]);
  });

  it('names each uncalibrated sound the run needs once, shot first', () => {
    const state = calibration({ shot: uncalibrated, rack: uncalibrated });

    expect(missingCalibration(plan, state)).toEqual(['shot', 'rack']);
  });

  it('does not ask for a sound the run never listens for', () => {
    const state = calibration({ reload: uncalibrated });

    expect(missingCalibration(plan, state)).toEqual([]);
  });
});

describe('thresholdsFrom', () => {
  it('holds the threshold of each calibrated sound and nothing for the rest', () => {
    const thresholds = thresholdsFrom(calibration({ rack: uncalibrated }));

    expect(thresholds).toEqual({ shot: -10, reload: -30 });
  });
});

describe('the zero point', () => {
  it('times the run from where the start beep began, as the microphone heard it', () => {
    const { events } = feed(triggered(), beep(TRIGGER_AT + 80));

    expect(events).toEqual([
      {
        type: 'zero',
        zero: { timestamp: TRIGGER_AT + 80, source: 'beep', beepDelayMs: 80 },
      },
    ]);
  });

  it('waits for the tone to follow before taking a rise as the beep', () => {
    const [start, next] = beep(TRIGGER_AT + 80);

    const afterStart = feed(triggered(), [start]);
    expect(afterStart.events).toEqual([]);

    const afterNext = feed(afterStart.state, [next]);
    expect(afterNext.events).toMatchObject([
      { zero: { timestamp: TRIGGER_AT + 80, source: 'beep' } },
    ]);
  });

  it('times the beep from the next buffer when the first held only the foot of its rise', () => {
    // The tone had not reached half its level when the first buffer ended.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 78, -30, { timestamp: TRIGGER_AT + 80 }),
      tone(TRIGGER_AT + 95, -20, { onsetTimestamp: TRIGGER_AT + 80.1 }),
    ]);

    expect(events).toMatchObject([
      { zero: { timestamp: TRIGGER_AT + 80.1, source: 'beep' } },
    ]);
  });

  it('times the beep from the first buffer when the tone got to half its level there', () => {
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 78, -26, { timestamp: TRIGGER_AT + 80 }),
      tone(TRIGGER_AT + 95, -20, { onsetTimestamp: TRIGGER_AT + 80.1 }),
    ]);

    expect(events).toMatchObject([
      { zero: { timestamp: TRIGGER_AT + 78, source: 'beep' } },
    ]);
  });

  it('follows the rise to half the full level when the first buffer ended part-way up it', () => {
    // The first buffer saw the tone reach -23 dBFS; it went on to -20. Half
    // of -20 lies 41% of the way from where the buffer's sound began to
    // where it peaked.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 79.9, -23, {
        onsetTimestamp: TRIGGER_AT + 76,
        timestamp: TRIGGER_AT + 80,
      }),
      tone(TRIGGER_AT + 95, -20, { onsetTimestamp: TRIGGER_AT + 80.1 }),
    ]);

    const [event] = events;
    expect(event).toMatchObject({ type: 'zero', zero: { source: 'beep' } });
    expect(event.type === 'zero' ? event.zero.timestamp : NaN).toBeCloseTo(
      TRIGGER_AT + 77.609,
      2,
    );
  });

  it('times the beep from where the first buffer peaked at most', () => {
    // The first buffer got exactly half-way: the crossing is at its peak.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 79.9, -26, {
        onsetTimestamp: TRIGGER_AT + 76,
        timestamp: TRIGGER_AT + 80,
      }),
      tone(TRIGGER_AT + 95, -20, { onsetTimestamp: TRIGGER_AT + 80.1 }),
    ]);

    const [event] = events;
    expect(event.type === 'zero' ? event.zero.timestamp : NaN).toBeCloseTo(
      TRIGGER_AT + 79.88,
      1,
    );
  });

  it('takes a reading that is already a tone as the beep straight away', () => {
    const { events } = feed(triggered(), [tone(TRIGGER_AT + 80, -20)]);

    expect(events).toMatchObject([
      { zero: { timestamp: TRIGGER_AT + 80, source: 'beep' } },
    ]);
  });

  it('uses where the tone began, not where its buffer peaked', () => {
    const { events } = feed(triggered(), [
      tone(TRIGGER_AT + 95, -20, { onsetTimestamp: TRIGGER_AT + 81.4 }),
    ]);

    expect(events).toMatchObject([
      { zero: { timestamp: TRIGGER_AT + 81.4, beepDelayMs: 81.4 } },
    ]);
  });

  it('hears a beep that the phone plays a few hundred milliseconds late', () => {
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 200, ROOM_DB),
      ...beep(TRIGGER_AT + 382),
    ]);

    expect(events).toEqual([
      {
        type: 'zero',
        zero: { timestamp: TRIGGER_AT + 382, source: 'beep', beepDelayMs: 382 },
      },
    ]);
  });

  it('does not take a sound that is not a tone as the beep', () => {
    // A bang 80 ms after the request, too quiet to be the first shot.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 80, -20),
      heard(TRIGGER_AT + 103, -35),
      heard(TRIGGER_AT + 126, ROOM_DB),
    ]);

    expect(events).toEqual([]);
  });

  it('still hears the beep after a noise that was not it', () => {
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 40, -20),
      heard(TRIGGER_AT + 63, ROOM_DB),
      ...beep(TRIGGER_AT + 120),
    ]);

    expect(events).toMatchObject([
      { zero: { timestamp: TRIGGER_AT + 120, source: 'beep' } },
    ]);
  });

  it('takes the reading after a noise as the beep when that reading is a tone', () => {
    // The beep starts in the buffer right after a bang that was not it.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 40, -30),
      heard(TRIGGER_AT + 63, -40, { db: -52 }),
      tone(TRIGGER_AT + 90, -20, { onsetTimestamp: TRIGGER_AT + 70 }),
    ]);

    expect(events).toMatchObject([
      { zero: { timestamp: TRIGGER_AT + 70, source: 'beep' } },
    ]);
  });

  it('does not count a bang made just before the beep as a step', () => {
    // Loud enough to be a shot, but the beep had not sounded yet.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 40, -4),
      tone(TRIGGER_AT + 90, -20, { onsetTimestamp: TRIGGER_AT + 70 }),
    ]);

    expect(events).toEqual([
      {
        type: 'zero',
        zero: { timestamp: TRIGGER_AT + 70, source: 'beep', beepDelayMs: 70 },
      },
    ]);
  });

  it('takes nothing for a step while the beep may still come', () => {
    // Loud enough to be a shot, but the beep has 600 ms to turn up.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 250, -4),
      heard(TRIGGER_AT + 273, ROOM_DB),
      heard(TRIGGER_AT + 590, ROOM_DB),
    ]);

    expect(events).toEqual([]);
  });

  it('does not let a bang before the beep stand in for it', () => {
    // A shot from the next lane 90 ms after the request, then quiet, then
    // the beep 160 ms after it, then the shooter's own shot 0.8 s on.
    const zero = TRIGGER_AT + 160;
    const { state, events } = feed(triggered(), [
      heard(TRIGGER_AT + 90, -4),
      heard(TRIGGER_AT + 113, -60),
      heard(TRIGGER_AT + 136, ROOM_DB),
      ...beep(zero),
      heard(zero + BEEP_MS + 50, ROOM_DB),
      heard(zero + 800, -3),
    ]);

    expect(events).toEqual([
      {
        type: 'zero',
        zero: { timestamp: zero, source: 'beep', beepDelayMs: 160 },
      },
      {
        type: 'step',
        detection: {
          stepId: 'a',
          timestamp: zero + 800,
          result: { stepId: 'a', par: 1.5, actual: 0.8, delta: -0.7 },
        },
      },
    ]);
    expect(summarizeRun(state).completed).toBe(false);
  });

  it('does not count a beep louder than the step threshold as a step after a bang', () => {
    // The same, with the beep heard at -8: over the -10 a shot counts from.
    const zero = TRIGGER_AT + 160;
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 90, -4),
      heard(TRIGGER_AT + 113, -60),
      heard(TRIGGER_AT + 136, ROOM_DB),
      ...beep(zero, -8),
      heard(zero + BEEP_MS + 50, ROOM_DB),
    ]);

    expect(events).toMatchObject([{ type: 'zero', zero: { source: 'beep' } }]);
  });

  it('takes the steps heard while it waited, in order, once the beep has not come', () => {
    // The beep sounded unheard (volume off). Two shots inside the 600 ms.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 250, -4),
      heard(TRIGGER_AT + 273, ROOM_DB),
      heard(TRIGGER_AT + 450, -5),
      heard(TRIGGER_AT + 473, ROOM_DB),
      heard(TRIGGER_AT + 620, ROOM_DB),
    ]);

    expect(events.map(event => event.type)).toEqual([
      'zero',
      'step',
      'step',
      'complete',
    ]);
    expect(
      stepEvents(events).map(detection => detection.result.actual),
    ).toEqual([0.25, 0.2]);
  });

  it('stops waiting if the readings stop moving on in time', () => {
    // Timestamps that never pass the 600 ms must not hold readings for ever.
    const stuck = Array.from({ length: 70 }, () =>
      heard(TRIGGER_AT + 100, ROOM_DB),
    );

    const { events } = feed(triggered(), stuck);

    expect(events).toMatchObject([{ zero: { source: 'trigger' } }]);
  });

  it('takes a step heard before any beep as a step, timed from the request', () => {
    // The beep sounded unheard (volume off): the first loud thing is a shot.
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 250, -4),
      heard(TRIGGER_AT + 273, ROOM_DB),
      heard(TRIGGER_AT + 620, ROOM_DB),
    ]);

    expect(events).toEqual([
      {
        type: 'zero',
        zero: { timestamp: TRIGGER_AT, source: 'trigger', beepDelayMs: null },
      },
      {
        type: 'step',
        detection: {
          stepId: 'a',
          timestamp: TRIGGER_AT + 250,
          result: { stepId: 'a', par: 1.5, actual: 0.25, delta: -1.25 },
        },
      },
    ]);
  });

  it('takes only the first tone as the beep', () => {
    const { events } = feed(triggered(), beep(TRIGGER_AT + 80));

    expect(events.filter(event => event.type === 'zero')).toHaveLength(1);
  });

  it('ignores a tone captured before the beep was requested', () => {
    const { state, events } = feed(triggered(), [tone(TRIGGER_AT - 10, -5)]);

    expect(events).toEqual([]);
    expect(summarizeRun(state).beepDelayMs).toBeNull();
  });

  it('ignores a tone that began before the beep was requested', () => {
    const { events } = feed(triggered(), [
      tone(TRIGGER_AT + 6, -5, { onsetTimestamp: TRIGGER_AT - 3 }),
    ]);

    expect(events).toEqual([]);
  });

  it('counts a reading that arrives after the request but was captured before it as the room', () => {
    // The room turns noisy just before the trigger, and those readings are
    // still on their way across the bridge when the beep is requested.
    const late = room(TRIGGER_AT, -30);
    const state = markTrigger(newDetector(), TRIGGER_AT);

    const { events } = feed(state, [...late, tone(TRIGGER_AT + 80, -20)]);

    // -20 is only 10 dB over a -30 room: not the beep.
    expect(events).toEqual([]);
  });

  it('does not take a rise of less than 12 dB over the room as the beep', () => {
    const state = markTrigger(
      feed(newDetector(), room(TRIGGER_AT, -30)).state,
      TRIGGER_AT,
    );

    expect(feed(state, [tone(TRIGGER_AT + 80, -18.1)]).events).toEqual([]);
    expect(feed(state, [tone(TRIGGER_AT + 80, -18)]).events).toHaveLength(1);
  });

  it('judges the rise against the usual level of the room, not one loud moment in it', () => {
    const noisyMoment = room(TRIGGER_AT).map((reading, index) =>
      index === 10 ? { ...reading, peakDb: -3 } : reading,
    );
    const state = markTrigger(
      feed(newDetector(), noisyMoment).state,
      TRIGGER_AT,
    );

    expect(feed(state, [tone(TRIGGER_AT + 80, -20)]).events).toHaveLength(1);
  });

  it('does not take a sound under -50 dBFS as the beep, however quiet the room', () => {
    const state = markTrigger(
      feed(newDetector(), room(TRIGGER_AT, -90)).state,
      TRIGGER_AT,
    );

    expect(feed(state, [tone(TRIGGER_AT + 80, -51)]).events).toEqual([]);
    expect(feed(state, [tone(TRIGGER_AT + 80, -50)]).events).toHaveLength(1);
  });

  it('listens for the beep with no reading of the room to go on', () => {
    const state = markTrigger(newDetector(), TRIGGER_AT);

    expect(feed(state, [tone(TRIGGER_AT + 80, -40)]).events).toHaveLength(1);
  });

  it('takes a tone whose peak stands 7 dB over its level, and not one that stands further', () => {
    const state = triggered();

    expect(
      feed(state, [heard(TRIGGER_AT + 80, -20, { db: -27 })]).events,
    ).toHaveLength(1);
    expect(
      feed(state, [heard(TRIGGER_AT + 80, -20, { db: -27.1 })]).events,
    ).toEqual([]);
  });

  it('times the run from the request when no beep is heard within 600 ms of it', () => {
    const { events } = feed(triggered(), [
      heard(TRIGGER_AT + 100, ROOM_DB),
      heard(TRIGGER_AT + 590, ROOM_DB),
      heard(TRIGGER_AT + 610, ROOM_DB),
    ]);

    expect(events).toEqual([
      {
        type: 'zero',
        zero: { timestamp: TRIGGER_AT, source: 'trigger', beepDelayMs: null },
      },
    ]);
  });

  it('does not take a tone that begins after the 600 ms as the beep', () => {
    const { events } = feed(triggered(), [tone(TRIGGER_AT + 601, -20)]);

    expect(events).toMatchObject([{ zero: { source: 'trigger' } }]);
  });

  it('keeps the first trigger when the beep is requested twice', () => {
    const state = markTrigger(triggered(), TRIGGER_AT + 500);

    const { events } = feed(state, [tone(TRIGGER_AT + 80, -20)]);

    expect(events).toMatchObject([{ zero: { beepDelayMs: 80 } }]);
  });
});

describe('detecting a step', () => {
  it('hears nothing before the beep is requested', () => {
    const { events } = feed(newDetector(), [heard(5000, -2), heard(5100, -2)]);

    expect(events).toEqual([]);
  });

  it('reports a step when its sound reaches the threshold, timed at the peak', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1402, -4, { timestamp: zero + 1420 }),
    ]);

    expect(stepEvents(events)).toEqual([
      {
        stepId: 'a',
        timestamp: zero + 1402,
        result: { stepId: 'a', par: 1.5, actual: 1.402, delta: -0.098 },
      },
    ]);
  });

  it('counts a sound that lands exactly on the threshold', () => {
    const { state, zero } = started();

    expect(
      stepEvents(feed(state, [heard(zero + 900, -10)]).events),
    ).toHaveLength(1);
  });

  it('does not count a sound under the threshold', () => {
    const { state, zero } = started();

    expect(feed(state, [heard(zero + 900, -10.1)]).events).toEqual([]);
  });

  it('times each step from the one before it', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4),
      heard(zero + 1023, ROOM_DB),
      heard(zero + 1212, -3),
    ]);

    expect(stepEvents(events).map(detection => detection.result)).toEqual([
      { stepId: 'a', par: 1.5, actual: 1, delta: -0.5 },
      { stepId: 'b', actual: 0.212, delta: null },
    ]);
  });

  it('rounds a step time to the millisecond', () => {
    const { state, zero } = started();

    const { events } = feed(state, [heard(zero + 1402.4567, -4)]);

    expect(stepEvents(events)[0].result.actual).toBe(1.402);
  });

  it('counts one long sound once', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4),
      heard(zero + 1023, -5),
      heard(zero + 1046, -6),
      heard(zero + 1100, -8),
      heard(zero + 1200, -9),
    ]);

    expect(stepEvents(events)).toHaveLength(1);
  });

  it('listens for the next step once the level has dropped 3 dB under its threshold', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4),
      heard(zero + 1023, -13.1),
      heard(zero + 1200, -4),
    ]);

    expect(stepEvents(events).map(detection => detection.stepId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('does not count a second sound when the level only dipped under the threshold', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4),
      heard(zero + 1023, -12.9),
      heard(zero + 1200, -4),
    ]);

    expect(stepEvents(events)).toHaveLength(1);
  });

  it('does not count a second sound within 70 ms of the first', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4),
      heard(zero + 1023, ROOM_DB),
      heard(zero + 1069, -4),
    ]);

    expect(stepEvents(events)).toHaveLength(1);
  });

  it('counts a second sound 70 ms after the first', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4),
      heard(zero + 1023, ROOM_DB),
      heard(zero + 1070, -4),
    ]);

    expect(stepEvents(events)).toHaveLength(2);
  });

  it('reports a sound that peaks well inside its buffer straight away', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4, { timestamp: zero + 1005 }),
    ]);

    expect(stepEvents(events)).toHaveLength(1);
  });

  it('waits for the next reading when a sound is still rising at the end of its buffer', () => {
    const { state, zero } = started();

    // The leading edge of the sound, 0.4 ms before its buffer ends.
    const edge = feed(state, [
      heard(zero + 1000, -8, { timestamp: zero + 1000.4 }),
    ]);
    expect(edge.events).toEqual([]);

    // Its real peak, 2.4 ms on, in the buffer after.
    const peak = feed(edge.state, [heard(zero + 1002.4, -3)]);
    expect(stepEvents(peak.events)).toEqual([
      {
        stepId: 'a',
        timestamp: zero + 1002.4,
        result: { stepId: 'a', par: 1.5, actual: 1.002, delta: -0.498 },
      },
    ]);
  });

  it('keeps the first peak when the next reading is only the tail of the sound', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -4, { timestamp: zero + 1000.6 }),
      heard(zero + 1003, -9),
    ]);

    expect(stepEvents(events).map(detection => detection.timestamp)).toEqual([
      zero + 1000,
    ]);
  });

  it('keeps the first peak when the next reading is exactly as loud', () => {
    const { state, zero } = started();

    // Two clipped readings: the first full-scale sample is the sound.
    const { events } = feed(state, [
      heard(zero + 1000, 0, { timestamp: zero + 1000.6 }),
      heard(zero + 1001, 0),
    ]);

    expect(stepEvents(events).map(detection => detection.timestamp)).toEqual([
      zero + 1000,
    ]);
  });

  it('keeps the first peak when the louder one comes more than 5 ms after it', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -8, { timestamp: zero + 1000.4 }),
      // An echo, not the rest of the same rise.
      heard(zero + 1005.1, -3),
    ]);

    expect(stepEvents(events).map(detection => detection.timestamp)).toEqual([
      zero + 1000,
    ]);
  });

  it('times the step after a late-peaking one from where that one was settled', () => {
    const { state, zero } = started();

    const { events } = feed(state, [
      heard(zero + 1000, -8, { timestamp: zero + 1000.4 }),
      heard(zero + 1002.4, -3),
      heard(zero + 1025, ROOM_DB),
      heard(zero + 1302.4, -4),
    ]);

    expect(
      stepEvents(events).map(detection => detection.result.actual),
    ).toEqual([1.002, 0.3]);
  });

  it('completes the run one reading after a last step that was still rising', () => {
    const { state, zero } = started([{ stepId: 'only', sound: 'shot' }]);

    const edge = feed(state, [
      heard(zero + 1000, -8, { timestamp: zero + 1000.4 }),
    ]);
    expect(summarizeRun(edge.state).completed).toBe(true);
    expect(edge.events).toEqual([]);

    const next = feed(edge.state, [heard(zero + 1023, ROOM_DB)]);
    expect(next.events.map(event => event.type)).toEqual(['step', 'complete']);
  });

  it('listens for each step with the threshold of its own sound', () => {
    const { state, zero } = started([
      { stepId: 's', sound: 'shot' },
      { stepId: 'r', sound: 'reload' },
    ]);

    const { events } = feed(state, [
      // Loud enough for a reload, not for a shot.
      heard(zero + 800, -20),
      heard(zero + 900, -4),
      heard(zero + 923, ROOM_DB),
      heard(zero + 2900, -20),
    ]);

    expect(stepEvents(events).map(detection => detection.timestamp)).toEqual([
      zero + 900,
      zero + 2900,
    ]);
  });

  it("does not take a shot's own tail as the quieter step that follows it", () => {
    const { state, zero } = started([
      { stepId: 's', sound: 'shot' },
      { stepId: 'r', sound: 'reload' },
    ]);

    const { events } = feed(state, [
      heard(zero + 900, -4),
      // Still ringing well over the reload threshold of -30.
      heard(zero + 923, -12),
      heard(zero + 946, -18),
      heard(zero + 1000, -25),
      heard(zero + 1100, -31),
    ]);

    expect(stepEvents(events)).toHaveLength(1);
  });

  it('completes the run on its last step and hears nothing after it', () => {
    const { state, zero } = started();

    const fed = feed(state, [
      heard(zero + 1000, -4),
      heard(zero + 1023, ROOM_DB),
      heard(zero + 1200, -4),
      heard(zero + 1223, ROOM_DB),
      heard(zero + 1400, -4),
    ]);

    expect(fed.events.map(event => event.type)).toEqual([
      'step',
      'step',
      'complete',
    ]);
    expect(summarizeRun(fed.state).completed).toBe(true);
  });

  it('times the first step from the request when the beep was not heard', () => {
    const fed = feed(triggered(), [
      heard(TRIGGER_AT + 150, ROOM_DB),
      heard(TRIGGER_AT + 620, ROOM_DB),
      heard(TRIGGER_AT + 1250, -4),
    ]);

    expect(stepEvents(fed.events)[0].result.actual).toBe(1.25);
  });

  it('counts a step on the reading that shows the beep was not heard', () => {
    const fed = feed(triggered(), [
      heard(TRIGGER_AT + 150, ROOM_DB),
      // The first reading past the 600 ms is itself the first shot.
      heard(TRIGGER_AT + 720, -4),
    ]);

    expect(fed.events.map(event => event.type)).toEqual(['zero', 'step']);
    expect(stepEvents(fed.events)[0].result.actual).toBe(0.72);
  });

  it('counts a step heard with no room reading in between, once the room was quiet before the request', () => {
    // The first reading after the request is already the first shot.
    const fed = feed(triggered(), [
      heard(TRIGGER_AT + 250, -4),
      heard(TRIGGER_AT + 273, ROOM_DB),
      heard(TRIGGER_AT + 620, ROOM_DB),
    ]);

    expect(stepEvents(fed.events)).toHaveLength(1);
  });

  it('does not count a sound as the first step in a room that was never quiet', () => {
    const noisy = markTrigger(
      feed(newDetector(), room(TRIGGER_AT, -8)).state,
      TRIGGER_AT,
    );

    const fed = feed(noisy, [
      heard(TRIGGER_AT + 250, -4),
      heard(TRIGGER_AT + 273, -8),
      heard(TRIGGER_AT + 620, -8),
    ]);

    expect(fed.events.map(event => event.type)).toEqual(['zero']);
  });
});

describe('the start beep and the steps', () => {
  const RELOAD_FIRST: RunStep[] = [
    { stepId: 'r', sound: 'reload' },
    { stepId: 's', sound: 'shot' },
  ];

  it('does not count the beep as a step, even one with a threshold under it', () => {
    const zero = TRIGGER_AT + 80;

    // The beep is heard at -20; a reload counts from -30.
    const { events } = feed(triggered(RELOAD_FIRST), beep(zero));

    expect(stepEvents(events)).toEqual([]);
  });

  it('does not count the end of the beep as a step once its time is up', () => {
    const zero = TRIGGER_AT + 80;

    const { events } = feed(triggered(RELOAD_FIRST), [
      ...beep(zero),
      // The speaker rings on past the 300 ms and the tail allowed for it.
      heard(zero + BEEP_MS + 45, -20),
      heard(zero + BEEP_MS + 68, -22),
    ]);

    expect(stepEvents(events)).toEqual([]);
  });

  it('counts a step once the beep has died away', () => {
    const zero = TRIGGER_AT + 80;

    const { events } = feed(triggered(RELOAD_FIRST), [
      ...beep(zero),
      heard(zero + BEEP_MS + 45, -20),
      heard(zero + BEEP_MS + 68, ROOM_DB),
      heard(zero + 900, -22),
    ]);

    expect(stepEvents(events).map(detection => detection.timestamp)).toEqual([
      zero + 900,
    ]);
  });

  it('counts a shot fired while the beep is still sounding', () => {
    const zero = TRIGGER_AT + 80;

    const { events } = feed(triggered(), [
      ...beep(zero).filter(reading => reading.peakTimestamp < zero + 240),
      heard(zero + 250, -3),
    ]);

    expect(stepEvents(events)).toMatchObject([
      { stepId: 'a', result: { actual: 0.25 } },
    ]);
  });

  it('does not count a sound during the beep that is under 6 dB louder than it', () => {
    const zero = TRIGGER_AT + 80;
    const steps: RunStep[] = [{ stepId: 'r', sound: 'reload' }];

    const { events } = feed(triggered(steps), [
      ...beep(zero).filter(reading => reading.peakTimestamp < zero + 240),
      heard(zero + 250, -14.1),
    ]);

    expect(stepEvents(events)).toEqual([]);
  });

  it('counts a sound during the beep that is 6 dB louder than it', () => {
    const zero = TRIGGER_AT + 80;
    const steps: RunStep[] = [{ stepId: 'r', sound: 'reload' }];

    const { events } = feed(triggered(steps), [
      ...beep(zero).filter(reading => reading.peakTimestamp < zero + 240),
      heard(zero + 250, -14),
    ]);

    expect(stepEvents(events)).toHaveLength(1);
  });

  it('does not count anything in the first 60 ms after the beep begins', () => {
    const zero = TRIGGER_AT + 80;

    const { events } = feed(triggered(), [
      tone(zero, -20),
      heard(zero + 59, -1),
    ]);

    expect(stepEvents(events)).toEqual([]);
  });
});

describe('summarizeRun', () => {
  it('reports a run that has not started as empty and timed from the request', () => {
    expect(summarizeRun(newDetector())).toEqual({
      completed: false,
      results: [],
      totalTime: 0,
      zeroSource: 'trigger',
      beepDelayMs: null,
      clockSource: 'read',
    });
  });

  it('reports the steps heard so far when the run is not finished', () => {
    const { state, zero } = started();

    const fed = feed(state, [heard(zero + 1402, -4)]);

    expect(summarizeRun(fed.state)).toEqual({
      completed: false,
      results: [{ stepId: 'a', par: 1.5, actual: 1.402, delta: -0.098 }],
      totalTime: 1.402,
      zeroSource: 'beep',
      beepDelayMs: 80,
      clockSource: 'frame',
    });
  });

  it('totals the run from the zero point to its last step, not by adding rounded steps', () => {
    const { state, zero } = started();

    const fed = feed(state, [
      heard(zero + 1000.4, -4),
      heard(zero + 1023, ROOM_DB),
      heard(zero + 1200.8, -4),
    ]);

    // 1.000 + 0.200 would add up to 1.2; the run took 1.2008.
    expect(summarizeRun(fed.state).totalTime).toBe(1.201);
  });

  it('counts a step that was heard just before the run was stopped', () => {
    const { state, zero } = started();

    // Still waiting on the next reading to settle where it peaked.
    const fed = feed(state, [
      heard(zero + 1000, -8, { timestamp: zero + 1000.4 }),
    ]);

    expect(summarizeRun(fed.state)).toMatchObject({
      completed: false,
      results: [{ stepId: 'a', actual: 1 }],
      totalTime: 1,
    });
  });

  it('rounds how late the beep was heard to a tenth of a millisecond', () => {
    const fed = feed(triggered(), [tone(TRIGGER_AT + 81.4567, -20)]);

    expect(summarizeRun(fed.state).beepDelayMs).toBe(81.5);
  });

  it('says the run was read-timed when any reading after the request was', () => {
    const { state, zero } = started();

    const fed = feed(state, [heard(zero + 1402, -4, { frameTimed: false })]);

    expect(summarizeRun(fed.state).clockSource).toBe('read');
  });

  it('does not let a read-timed reading from before the request decide the clock', () => {
    const before = room(TRIGGER_AT).map(reading => ({
      ...reading,
      frameTimed: false,
    }));
    const state = markTrigger(feed(newDetector(), before).state, TRIGGER_AT);

    const fed = feed(state, [tone(TRIGGER_AT + 80, -20)]);

    expect(summarizeRun(fed.state).clockSource).toBe('frame');
  });
});

describe('tuning', () => {
  it('keeps a default margin when its override is passed as undefined', () => {
    const state = markTrigger(
      createDetector({
        steps: TWO_SHOTS,
        thresholds: thresholdsFrom(calibration()),
        beepMs: BEEP_MS,
        tuning: { beepSearchMs: undefined },
      }),
      TRIGGER_AT,
    );

    const { events } = feed(state, [tone(TRIGGER_AT + 150, -20)]);

    expect(events).toMatchObject([{ zero: { source: 'beep' } }]);
  });

  it('takes its margins from the options it is created with', () => {
    const state = markTrigger(
      createDetector({
        steps: TWO_SHOTS,
        thresholds: thresholdsFrom(calibration()),
        beepMs: BEEP_MS,
        tuning: { beepSearchMs: 100 },
      }),
      TRIGGER_AT,
    );

    const { events } = feed(state, [tone(TRIGGER_AT + 150, -20)]);

    expect(events).toMatchObject([{ zero: { source: 'trigger' } }]);
  });

  it('documents its defaults', () => {
    expect(DEFAULT_DETECTION_TUNING).toEqual({
      beepSearchMs: 600,
      toneCrestMaxDb: 7,
      beepRiseDb: 12,
      beepMinDbfs: -50,
      beepTailMs: 40,
      beepMarginDb: 6,
      anticipationGuardMs: 60,
      rearmHysteresisDb: 3,
      minStepGapMs: 70,
      peakSettleMs: 5,
    });
  });
});
