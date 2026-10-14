import { DRILL_STEP_TYPES, MAX_STEP_PAR_SECONDS } from '../src/types/drill';
import {
  countShots,
  describeDrill,
  isStepPar,
  roundPar,
  stepLabel,
  stepTypeLabel,
  totalPar,
} from '../src/utils/drill';

describe('countShots', () => {
  it('counts only the shot steps', () => {
    expect(
      countShots([
        { type: 'draw' },
        { type: 'shot' },
        { type: 'reload' },
        { type: 'shot' },
      ]),
    ).toBe(2);
  });

  it('is zero for a drill with no shots', () => {
    expect(countShots([{ type: 'draw' }, { type: 'holster' }])).toBe(0);
    expect(countShots([])).toBe(0);
  });
});

describe('totalPar', () => {
  it('sums the par of every step', () => {
    expect(totalPar([{ par: 1.5 }, { par: 0.5 }, { par: 2 }])).toBe(4);
  });

  it('rounds float error out of the sum', () => {
    // 1.5 + 0.25 + 0.2 * 5 is 2.7500000000000004 in floating point.
    const steps = [
      { par: 1.5 },
      { par: 0.25 },
      { par: 0.2 },
      { par: 0.2 },
      { par: 0.2 },
      { par: 0.2 },
      { par: 0.2 },
    ];

    expect(totalPar(steps)).toBe(2.75);
  });

  it('is null when any step is untimed', () => {
    expect(totalPar([{ par: 1.5 }, {}, { par: 0.25 }])).toBeNull();
  });

  it('is null for an empty step list', () => {
    expect(totalPar([])).toBeNull();
  });
});

describe('isStepPar', () => {
  it('accepts a par between 0 and the limit', () => {
    expect(isStepPar(0.01)).toBe(true);
    expect(isStepPar(1.5)).toBe(true);
    expect(isStepPar(MAX_STEP_PAR_SECONDS)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['zero', 0],
    ['a negative number', -1],
    ['a par over the limit', MAX_STEP_PAR_SECONDS + 0.01],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a number written as text', '0.5'],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_case, value) => {
    expect(isStepPar(value)).toBe(false);
  });
});

describe('roundPar', () => {
  it('rounds to the hundredth of a second', () => {
    expect(roundPar(0.254)).toBe(0.25);
    expect(roundPar(0.256)).toBe(0.26);
    expect(roundPar(2.7500000000000004)).toBe(2.75);
  });
});

describe('stepTypeLabel', () => {
  it('names every step type a drill can hold', () => {
    expect(DRILL_STEP_TYPES.map(stepTypeLabel)).toEqual([
      'Draw',
      'Shot',
      'Reload',
      'Rack',
      'Transition',
      'Holster',
    ]);
  });
});

describe('stepLabel', () => {
  it('leaves a type that appears once without a number', () => {
    const steps = [{ type: 'draw' }, { type: 'shot' }] as const;

    expect(stepLabel(steps, 0)).toBe('Draw');
    expect(stepLabel(steps, 1)).toBe('Shot');
  });

  it('numbers a type that repeats, in the order it is performed', () => {
    const steps = [
      { type: 'draw' },
      { type: 'shot' },
      { type: 'shot' },
      { type: 'reload' },
      { type: 'shot' },
    ] as const;

    expect(steps.map((_, i) => stepLabel(steps, i))).toEqual([
      'Draw',
      'Shot 1',
      'Shot 2',
      'Reload',
      'Shot 3',
    ]);
  });

  it.each([-1, 2, 0.5])(
    'throws RangeError when there is no step at position %d',
    position => {
      expect(() =>
        stepLabel([{ type: 'draw' }, { type: 'shot' }], position),
      ).toThrow(RangeError);
    },
  );
});

describe('describeDrill', () => {
  it('gives the shots and the total par', () => {
    expect(describeDrill({ shotCount: 3, totalPar: 2.5 })).toBe(
      '3 shots · Par 2.50s',
    );
  });

  it('leaves the par out of a drill with an untimed step', () => {
    expect(describeDrill({ shotCount: 1, totalPar: null })).toBe('1 shot');
  });
});
