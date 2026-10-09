import { isNonEmptyString, isRecord, isTimestamp } from '../src/utils/guards';

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ id: 'a' })).toBe(true);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['an array', [{ id: 'a' }]],
    ['a string', 'object'],
    ['a number', 1],
  ])('rejects %s', (_case, value) => {
    expect(isRecord(value)).toBe(false);
  });
});

describe('isNonEmptyString', () => {
  it('accepts text', () => {
    expect(isNonEmptyString('a')).toBe(true);
  });

  it.each<[string, unknown]>([
    ['an empty string', ''],
    ['a number', 7],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_case, value) => {
    expect(isNonEmptyString(value)).toBe(false);
  });
});

describe('isTimestamp', () => {
  it('accepts an ISO-8601 timestamp', () => {
    expect(isTimestamp('2026-10-01T08:00:00.000Z')).toBe(true);
  });

  it.each<[string, unknown]>([
    ['text that is not a date', 'yesterday'],
    ['an empty string', ''],
    ['a number of milliseconds', 1_790_000_000_000],
    ['null', null],
  ])('rejects %s', (_case, value) => {
    expect(isTimestamp(value)).toBe(false);
  });
});
