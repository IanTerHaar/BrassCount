/**
 * Type guards for values the type system cannot vouch for: a payload a
 * caller cast from somewhere else, and anything read back from storage.
 * Pure functions, no side effects.
 */

/** A plain object, as opposed to `null`, an array or a primitive. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/** A string `Date.parse` can read, such as the ISO-8601 the app stamps. */
export const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));
