import { MAX_STEP_PAR_SECONDS } from '../src/types/drill';
import { countShots, isStepPar, totalPar } from '../src/utils/drill';

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
