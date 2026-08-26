import {
  formatDate,
  formatElapsed,
  formatSeconds,
  pluralize,
} from '@utils/format';
import { generateId } from '@utils/id';
import { getTimestamp } from '@utils/timestamp';

describe('format utilities', () => {
  it('formats elapsed time', () => {
    expect(formatElapsed(0)).toBe('0.00');
    expect(formatElapsed(65.25)).toBe('1:05.25');
    expect(formatElapsed(-1)).toBe('0.00');
  });

  it('formats seconds', () => {
    expect(formatSeconds(1.236)).toBe('1.24s');
  });

  it('formats dates and handles invalid input', () => {
    expect(formatDate('invalid-date')).toBe('—');
    expect(formatDate('2026-08-15T00:00:00.000Z')).toContain('2026');
  });

  it('pluralizes nouns', () => {
    expect(pluralize(1, 'drill')).toBe('1 drill');
    expect(pluralize(3, 'drill')).toBe('3 drills');
  });
});

describe('timestamp utility', () => {
  it('returns a valid ISO timestamp', () => {
    const timestamp = getTimestamp();

    expect(timestamp).toBe(new Date(timestamp).toISOString());
  });
});

describe('uuid generate utility', () => {
  it('generates a valid UUID v4', () => {
    const id = generateId();

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates unique IDs', () => {
    expect(generateId()).not.toBe(generateId());
  });
});
