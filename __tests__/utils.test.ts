import {
  formatDate,
  formatDecibels,
  formatElapsed,
  formatSeconds,
  formatTimeAgo,
  pluralize,
  spokenDecibels,
  spokenSeconds,
  spokenTimeAgo,
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

describe('spokenSeconds', () => {
  it('says a duration in words', () => {
    expect(spokenSeconds(0.25)).toBe('0.25 seconds');
    expect(spokenSeconds(1.5)).toBe('1.5 seconds');
    expect(spokenSeconds(60)).toBe('60 seconds');
  });

  it('says exactly one second in the singular', () => {
    expect(spokenSeconds(1)).toBe('1 second');
  });
});

describe('time ago', () => {
  const NOW = Date.parse('2026-10-12T12:00:00.000Z');
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  /** The ISO-8601 time `ms` before `NOW`. */
  const ago = (ms: number): string => new Date(NOW - ms).toISOString();

  it('says just now for anything under a minute', () => {
    expect(formatTimeAgo(ago(0), NOW)).toBe('just now');
    expect(formatTimeAgo(ago(MINUTE - 1), NOW)).toBe('just now');
  });

  it('counts in the largest unit that fits', () => {
    expect(formatTimeAgo(ago(MINUTE), NOW)).toBe('1m ago');
    expect(formatTimeAgo(ago(59 * MINUTE), NOW)).toBe('59m ago');
    expect(formatTimeAgo(ago(HOUR), NOW)).toBe('1h ago');
    expect(formatTimeAgo(ago(23 * HOUR), NOW)).toBe('23h ago');
    expect(formatTimeAgo(ago(DAY), NOW)).toBe('1d ago');
    expect(formatTimeAgo(ago(6 * DAY), NOW)).toBe('6d ago');
    expect(formatTimeAgo(ago(7 * DAY), NOW)).toBe('1w ago');
    expect(formatTimeAgo(ago(29 * DAY), NOW)).toBe('4w ago');
    expect(formatTimeAgo(ago(30 * DAY), NOW)).toBe('1mo ago');
    expect(formatTimeAgo(ago(364 * DAY), NOW)).toBe('12mo ago');
    expect(formatTimeAgo(ago(365 * DAY), NOW)).toBe('1y ago');
    expect(formatTimeAgo(ago(800 * DAY), NOW)).toBe('2y ago');
  });

  it('rounds down, so a time is never made out to be older than it is', () => {
    expect(formatTimeAgo(ago(2 * DAY - 1), NOW)).toBe('1d ago');
    expect(formatTimeAgo(ago(2 * HOUR - 1), NOW)).toBe('1h ago');
  });

  it('says just now for a time stamped by a clock that was ahead', () => {
    expect(formatTimeAgo(ago(-3 * DAY), NOW)).toBe('just now');
    expect(spokenTimeAgo(ago(-3 * DAY), NOW)).toBe('just now');
  });

  it('shows a dash for text that is not a time', () => {
    expect(formatTimeAgo('invalid-date', NOW)).toBe('—');
  });

  it('measures from the current time when none is given', () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    try {
      expect(formatTimeAgo(ago(3 * HOUR))).toBe('3h ago');
      expect(spokenTimeAgo(ago(3 * HOUR))).toBe('3 hours ago');
    } finally {
      jest.useRealTimers();
    }
  });

  it('words a time ago for a screen reader', () => {
    expect(spokenTimeAgo(ago(30_000), NOW)).toBe('just now');
    expect(spokenTimeAgo(ago(MINUTE), NOW)).toBe('1 minute ago');
    expect(spokenTimeAgo(ago(5 * HOUR), NOW)).toBe('5 hours ago');
    expect(spokenTimeAgo(ago(DAY), NOW)).toBe('1 day ago');
    expect(spokenTimeAgo(ago(15 * DAY), NOW)).toBe('2 weeks ago');
    expect(spokenTimeAgo(ago(90 * DAY), NOW)).toBe('3 months ago');
    expect(spokenTimeAgo(ago(365 * DAY), NOW)).toBe('1 year ago');
    expect(spokenTimeAgo('invalid-date', NOW)).toBe('at an unknown time');
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
