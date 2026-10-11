import {
  DRILL_STEP_TYPES,
  MAX_DRILL_STEPS,
  MAX_STEP_PAR_SECONDS,
  type DrillStep,
} from '../src/types/drill';
import {
  EDITOR_STEP_TYPES,
  addStep,
  canAddStep,
  changeStepType,
  nextStepType,
  parseParInput,
  removeStep,
  setStepPar,
  stepTypeChoices,
} from '../src/utils/drillDraft';

/** Ids `step-1`, `step-2`, … in the order they are asked for. */
const sequentialIds = (): (() => string) => {
  let count = 0;
  return () => `step-${++count}`;
};

const DRAW: DrillStep = { id: 'a', type: 'draw', par: 1.5 };
const FIRST_SHOT: DrillStep = { id: 'b', type: 'shot', par: 0.25 };
const SECOND_SHOT: DrillStep = { id: 'c', type: 'shot' };
const STEPS: readonly DrillStep[] = [DRAW, FIRST_SHOT, SECOND_SHOT];

const fullDrill = (): DrillStep[] =>
  Array.from({ length: MAX_DRILL_STEPS }, (_, i) => ({
    id: `full-${i}`,
    type: 'shot',
  }));

describe('EDITOR_STEP_TYPES', () => {
  it('offers the five types a drill is built from', () => {
    expect(EDITOR_STEP_TYPES).toEqual([
      'draw',
      'shot',
      'reload',
      'rack',
      'holster',
    ]);
  });

  it('offers only types the storage service accepts', () => {
    for (const type of EDITOR_STEP_TYPES) {
      expect(DRILL_STEP_TYPES).toContain(type);
    }
  });
});

describe('stepTypeChoices', () => {
  it('is the editor list for a type that is on it', () => {
    expect(stepTypeChoices('reload')).toEqual(EDITOR_STEP_TYPES);
  });

  it('adds the type of a stored step the editor no longer offers', () => {
    expect(stepTypeChoices('transition')).toEqual([
      ...EDITOR_STEP_TYPES,
      'transition',
    ]);
  });
});

describe('nextStepType', () => {
  it('opens an empty drill with a draw', () => {
    expect(nextStepType([])).toBe('draw');
  });

  it('follows any existing step with a shot', () => {
    expect(nextStepType([{ type: 'draw' }])).toBe('shot');
    expect(nextStepType([{ type: 'holster' }, { type: 'reload' }])).toBe(
      'shot',
    );
  });
});

describe('addStep', () => {
  it('starts an empty drill with an untimed draw', () => {
    expect(addStep([], sequentialIds())).toEqual([
      { id: 'step-1', type: 'draw' },
    ]);
  });

  it('adds an untimed shot after the existing steps', () => {
    expect(addStep(STEPS, sequentialIds())).toEqual([
      DRAW,
      FIRST_SHOT,
      SECOND_SHOT,
      { id: 'step-1', type: 'shot' },
    ]);
  });

  it('gives every added step its own id', () => {
    const steps = addStep(addStep(addStep([])));

    expect(new Set(steps.map(step => step.id)).size).toBe(3);
  });

  it('leaves the list it was given untouched', () => {
    const steps: readonly DrillStep[] = [DRAW];

    addStep(steps, sequentialIds());

    expect(steps).toEqual([DRAW]);
  });

  it('adds nothing to a drill that is already full', () => {
    const steps = fullDrill();
    const generateId = jest.fn(() => 'unused');

    expect(addStep(steps, generateId)).toBe(steps);
    expect(generateId).not.toHaveBeenCalled();
  });
});

describe('canAddStep', () => {
  it('is true until the drill holds the most steps it may', () => {
    expect(canAddStep([])).toBe(true);
    expect(canAddStep(fullDrill().slice(1))).toBe(true);
    expect(canAddStep(fullDrill())).toBe(false);
  });
});

describe('removeStep', () => {
  it('removes the step with that id and keeps the others in order', () => {
    expect(removeStep(STEPS, 'b')).toEqual([DRAW, SECOND_SHOT]);
  });

  it('removes only one of two steps that look the same', () => {
    const twins: readonly DrillStep[] = [
      { id: 'x', type: 'shot', par: 0.2 },
      { id: 'y', type: 'shot', par: 0.2 },
    ];

    expect(removeStep(twins, 'x')).toEqual([
      { id: 'y', type: 'shot', par: 0.2 },
    ]);
  });

  it('changes nothing for an id that is not in the list', () => {
    expect(removeStep(STEPS, 'missing')).toEqual(STEPS);
  });

  it('leaves the list it was given untouched', () => {
    const steps: readonly DrillStep[] = [DRAW, FIRST_SHOT];

    removeStep(steps, 'a');

    expect(steps).toEqual([DRAW, FIRST_SHOT]);
  });
});

describe('changeStepType', () => {
  it('changes the type of that step and keeps its par', () => {
    expect(changeStepType(STEPS, 'b', 'reload')).toEqual([
      DRAW,
      { id: 'b', type: 'reload', par: 0.25 },
      SECOND_SHOT,
    ]);
  });

  it('leaves the step it was given untouched', () => {
    changeStepType(STEPS, 'b', 'reload');

    expect(FIRST_SHOT).toEqual({ id: 'b', type: 'shot', par: 0.25 });
  });

  it('changes nothing for an id that is not in the list', () => {
    expect(changeStepType(STEPS, 'missing', 'rack')).toEqual(STEPS);
  });
});

describe('setStepPar', () => {
  it('sets the par of an untimed step', () => {
    expect(setStepPar(STEPS, 'c', 0.2)).toEqual([
      DRAW,
      FIRST_SHOT,
      { id: 'c', type: 'shot', par: 0.2 },
    ]);
  });

  it('replaces the par a step already has', () => {
    expect(setStepPar(STEPS, 'a', 2)[0]).toEqual({
      id: 'a',
      type: 'draw',
      par: 2,
    });
  });

  it('clears a par by dropping the key, as an untimed step is stored', () => {
    const cleared = setStepPar(STEPS, 'a', undefined)[0];

    expect(cleared).toEqual({ id: 'a', type: 'draw' });
    expect('par' in cleared).toBe(false);
  });

  it('accepts the longest par a step may have', () => {
    expect(setStepPar(STEPS, 'c', MAX_STEP_PAR_SECONDS)[2].par).toBe(
      MAX_STEP_PAR_SECONDS,
    );
  });

  it.each<[string, number]>([
    ['zero', 0],
    ['a negative par', -0.5],
    ['a par over the limit', MAX_STEP_PAR_SECONDS + 0.01],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('throws RangeError for %s', (_case, par) => {
    expect(() => setStepPar(STEPS, 'c', par)).toThrow(RangeError);
  });

  it('leaves the step it was given untouched', () => {
    setStepPar(STEPS, 'c', 0.2);

    expect(SECOND_SHOT).toEqual({ id: 'c', type: 'shot' });
  });
});

describe('parseParInput', () => {
  it.each<[string, number]>([
    ['1', 1],
    ['1.5', 1.5],
    ['0.25', 0.25],
    ['.5', 0.5],
    ['2.', 2],
    ['0,25', 0.25],
    ['  0.3  ', 0.3],
    ['60', 60],
    ['0.01', 0.01],
  ])('reads "%s" as %d seconds', (text, seconds) => {
    expect(parseParInput(text)).toBe(seconds);
  });

  it('rounds to the hundredth of a second', () => {
    expect(parseParInput('0.254')).toBe(0.25);
    expect(parseParInput('0.256')).toBe(0.26);
  });

  it.each<[string, string]>([
    ['nothing typed', ''],
    ['only spaces', '   '],
    ['a lone separator', '.'],
    ['zero', '0'],
    ['a time that rounds to zero', '0.004'],
    ['a time over the limit', '60.01'],
    ['a much longer time', '600'],
    ['a negative time', '-1'],
    ['two separators', '1.2.3'],
    ['letters', 'abc'],
    ['a number with a unit', '1.5s'],
    ['exponent notation', '1e1'],
    ['Infinity', 'Infinity'],
  ])('rejects %s', (_case, text) => {
    expect(parseParInput(text)).toBeNull();
  });
});
