import {
  formatDate,
  formatDecibels,
  formatElapsed,
  formatSeconds,
  pluralize,
  spokenDecibels,
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

  it('formats a level in whole decibels, or a dash when there is none', () => {
    expect(formatDecibels(-12.4)).toBe('-12 dB');
    expect(formatDecibels(0)).toBe('0 dB');
    expect(formatDecibels(-0.4)).toBe('0 dB');
    expect(formatDecibels(null)).toBe('—');
  });

  it('words a level for a screen reader', () => {
    expect(spokenDecibels(-12.4)).toBe('minus 12 decibels');
    expect(spokenDecibels(0)).toBe('0 decibels');
    expect(spokenDecibels(-0.4)).toBe('0 decibels');
    expect(spokenDecibels(null)).toBe('not set');
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
