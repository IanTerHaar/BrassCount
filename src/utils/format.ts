/** Presentation-layer formatters. Pure functions, no side effects. */

/**
 * Seconds → `M:SS.hh` while a drill runs, or `S.hh` under a minute so the
 * timer stays readable at a glance.
 */
export const formatElapsed = (totalSeconds: number): string => {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;

  if (minutes === 0) {
    return seconds.toFixed(2);
  }

  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
};

/** Seconds → `1.24s`, for split and result rows. */
export const formatSeconds = (seconds: number): string =>
  `${seconds.toFixed(2)}s`;

/** ISO-8601 → `15 Aug 2026`. */
export const formatDate = (iso: string): string => {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/** `3` → `3 drills`, `1` → `1 drill`. */
export const pluralize = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;
