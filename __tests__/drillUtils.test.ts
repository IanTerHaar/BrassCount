import { countShots, totalPar } from '../src/utils/drill';

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
