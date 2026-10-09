import { MAX_DRILL_STEPS, MAX_STEP_PAR_SECONDS } from '@/types/drill';
import {
  MAX_SESSION_SECONDS,
  MAX_SPLIT_LABEL_LENGTH,
  type Session,
  type SessionInput,
  type SessionSplit,
} from '@/types/session';
import { isStepPar } from '@utils/drill';
import { isNonEmptyString, isRecord, isTimestamp } from '@utils/guards';
import { generateId as defaultGenerateId } from '@utils/id';
import { splitDelta } from '@utils/session';
import { getTimestamp as defaultGetTimestamp } from '@utils/timestamp';

import { createStorageNamespace, StorageError } from './storage';

/**
 * SessionStorageService
 * ---------------------
 * Local persistence layer for sessions: the completed runs of a drill that
 * History is built from. It is the one place that knows how a run is
 * stored, and the one place a split's `delta` is worked out.
 *
 * Design notes:
 *   - Each session is stored under its own key
 *     (`@BrassCount:sessions:v1:<id>`), so saving a run never rewrites
 *     the history that came before it.
 *   - Every stored value is an envelope, `{ schemaVersion, session }`.
 *     When the `Session` shape changes, bump `SESSION_SCHEMA_VERSION` and
 *     upgrade older envelopes in `parseStoredSession` — existing history
 *     is migrated in place rather than abandoned under an old key.
 *   - The key version is still `v1` although this replaced an earlier
 *     placeholder `Session` shape: nothing ever saved that shape outside
 *     tests, and a bare value without the envelope is skipped on read.
 *   - A session is a record of something that happened, so it is written
 *     once and never updated. The service generates its id and stamps
 *     `createdAt`; callers supply the drill, the total time and the
 *     splits and get the full `Session` back.
 *   - Anything read back from storage is untrusted: it is checked field
 *     by field, each `delta` is recomputed from the split's par and
 *     actual, and an entry that does not pass is skipped like corrupt JSON
 *     instead of failing the whole read.
 *   - A session is bounded (`MAX_DRILL_STEPS` splits,
 *     `MAX_SESSION_SECONDS`, `MAX_SPLIT_LABEL_LENGTH`) on save and on read
 *     alike.
 *   - Every failure surfaces as `SessionStorageError`, which is also a
 *     `StorageError`, so UI code can catch either.
 */

export const SESSION_NAMESPACE = 'sessions';
export const SESSION_STORAGE_VERSION = 'v1';
/** Version of the `Session` shape written inside each stored envelope. */
export const SESSION_SCHEMA_VERSION = 1;

/**
 * Why a session operation failed: the caller passed something unusable,
 * or the device storage itself failed.
 */
export type SessionStorageErrorCode = 'INVALID_INPUT' | 'STORAGE_FAILURE';

/**
 * Error thrown by this service. Branch on `code` to tell a rejected run
 * from a storage failure; the underlying error, if any, is on `cause`.
 */
export class SessionStorageError extends StorageError {
  readonly code: SessionStorageErrorCode;

  constructor(message: string, code: SessionStorageErrorCode, cause?: unknown) {
    super(message, cause);
    this.name = 'SessionStorageError';
    this.code = code;
  }
}

export interface SessionStorageOptions {
  /** Source of the new session id. Defaults to a UUID v4. */
  generateId?: () => string;
  /** Source of the ISO-8601 timestamp stamped on the session. */
  getTimestamp?: () => string;
}

/** What is actually written under a session's key. */
interface StoredSession {
  schemaVersion: number;
  session: Session;
}

// Typed `unknown` on purpose: the storage layer only promises valid JSON,
// so every read goes through `parseStoredSession` before it is a `Session`.
const sessions = createStorageNamespace<unknown>({
  name: SESSION_NAMESPACE,
  version: SESSION_STORAGE_VERSION,
});

const invalid = (message: string): SessionStorageError =>
  new SessionStorageError(message, 'INVALID_INPUT');

/** A length of time a run or a split can have taken, in seconds. */
const isDuration = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= MAX_SESSION_SECONDS;

const assertId = (id: string, action: string): void => {
  if (!isNonEmptyString(id)) {
    throw invalid(`Cannot ${action} session without a valid id`);
  }
};

const normalizeLabel = (label: unknown, position: string): string => {
  if (typeof label !== 'string' || label.trim().length === 0) {
    throw invalid(`${position} needs a label`);
  }
  const trimmed = label.trim();
  if (trimmed.length > MAX_SPLIT_LABEL_LENGTH) {
    throw invalid(
      `${position} label can be at most ${MAX_SPLIT_LABEL_LENGTH} characters`,
    );
  }
  return trimmed;
};

/**
 * Check one split and return a clean copy holding only the known fields,
 * with `delta` worked out from its par and actual. Any `delta` on the
 * value passed in is ignored.
 */
const normalizeSplit = (split: unknown, index: number): SessionSplit => {
  const position = `Split ${index + 1}`;
  if (!isRecord(split)) {
    throw invalid(`${position} is not a split`);
  }

  const { stepId, par, actual } = split;
  if (!isNonEmptyString(stepId)) {
    throw invalid(`${position} has no valid step id`);
  }
  const label = normalizeLabel(split.label, position);
  if (par !== undefined && !isStepPar(par)) {
    throw invalid(
      `${position} par must be more than 0 and at most ${MAX_STEP_PAR_SECONDS} seconds`,
    );
  }
  if (!isDuration(actual)) {
    throw invalid(
      `${position} actual time must be between 0 and ${MAX_SESSION_SECONDS} seconds`,
    );
  }

  const delta = splitDelta(actual, par);
  return par === undefined
    ? { stepId, label, actual, delta }
    : { stepId, label, par, actual, delta };
};

const normalizeSplits = (splits: unknown): SessionSplit[] => {
  if (!Array.isArray(splits) || splits.length === 0) {
    throw invalid('A session needs at least one split');
  }
  if (splits.length > MAX_DRILL_STEPS) {
    throw invalid(`A session can have at most ${MAX_DRILL_STEPS} splits`);
  }

  const normalized = splits.map((split, index) => normalizeSplit(split, index));
  const stepIds = new Set(normalized.map(split => split.stepId));
  if (stepIds.size !== normalized.length) {
    throw invalid('A session can have only one split per step');
  }
  return normalized;
};

/** The parts of a session that have not been checked yet. */
interface UncheckedSessionFields {
  drillId: unknown;
  totalTime: unknown;
  splits: unknown;
}

/**
 * Assemble a session from an id and timestamp that are already known to
 * be good and the fields that still need checking, whether they came from
 * a caller or from storage.
 */
const buildSession = (
  id: string,
  createdAt: string,
  { drillId, totalTime, splits }: UncheckedSessionFields,
): Session => {
  if (!isNonEmptyString(drillId)) {
    throw invalid('A session needs the id of the drill it was run against');
  }
  if (!isDuration(totalTime)) {
    throw invalid(
      `A session total time must be between 0 and ${MAX_SESSION_SECONDS} seconds`,
    );
  }
  return { id, drillId, createdAt, totalTime, splits: normalizeSplits(splits) };
};

/**
 * Turn a value read from storage back into a `Session`, or `null` when it
 * cannot be trusted: not an envelope, a schema version this build does not
 * know, or a session that fails the same checks a save applies.
 */
const parseStoredSession = (stored: unknown): Session | null => {
  if (!isRecord(stored) || !isRecord(stored.session)) {
    return null;
  }
  // Only one schema exists so far. When version 2 lands, upgrade older
  // envelopes here before the checks below. A version newer than this
  // build understands is left alone on disk rather than guessed at.
  if (stored.schemaVersion !== SESSION_SCHEMA_VERSION) {
    return null;
  }

  const { id, drillId, createdAt, totalTime, splits } = stored.session;
  if (!isNonEmptyString(id) || !isTimestamp(createdAt)) {
    return null;
  }

  try {
    return buildSession(id, createdAt, { drillId, totalTime, splits });
  } catch (err) {
    // A stored session that fails validation is skipped, the same way the
    // storage layer skips corrupt JSON, so one bad entry cannot block
    // loading the rest of the history.
    if (err instanceof SessionStorageError) {
      return null;
    }
    throw err;
  }
};

/** Run a storage call, rethrowing its failure as a `SessionStorageError`. */
const withStorage = async <T>(
  action: string,
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    throw new SessionStorageError(
      `Failed to ${action}`,
      'STORAGE_FAILURE',
      err,
    );
  }
};

const byNewest = (a: Session, b: Session): number =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);

/**
 * Save a completed run.
 *
 * The service generates the session id, stamps `createdAt` and derives
 * each split's `delta` (`actual - par`, or `null` for an untimed step).
 * Split labels are trimmed. Every call stores a new session; a saved run
 * is never changed afterwards.
 *
 * Returns the stored `Session` so callers can update local state without
 * a follow-up read. Rejects with `INVALID_INPUT` when `drillId` is empty,
 * `totalTime` or a split's `actual` is outside 0 to `MAX_SESSION_SECONDS`,
 * there are no splits or more than `MAX_DRILL_STEPS`, two splits share a
 * `stepId`, a label is blank or longer than `MAX_SPLIT_LABEL_LENGTH`, or
 * a par is outside 0 (exclusive) to `MAX_STEP_PAR_SECONDS`.
 */
export async function saveSession(
  input: SessionInput,
  options: SessionStorageOptions = {},
): Promise<Session> {
  const { generateId = defaultGenerateId, getTimestamp = defaultGetTimestamp } =
    options;

  if (!isRecord(input)) {
    throw invalid('saveSession requires a session payload');
  }

  const session = buildSession(generateId(), getTimestamp(), input);

  const stored: StoredSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    session,
  };
  await withStorage('save session', () => sessions.setItem(session.id, stored));
  return session;
}

/**
 * Load every session stored on the device, newest first. Entries that are
 * corrupt or fail validation are left out.
 */
export async function loadSessions(): Promise<Session[]> {
  const stored = await withStorage('load sessions', () => sessions.getAll());
  return stored
    .map(entry => parseStoredSession(entry))
    .filter((session): session is Session => session !== null)
    .sort(byNewest);
}

/**
 * Load the sessions run against one drill, newest first. Resolves to an
 * empty list when the drill has no runs.
 *
 * Sessions are stored one per key with no index by drill, so this reads
 * them all and keeps the matches. Call it once per screen visit, not per
 * render.
 */
export async function loadSessionsByDrillId(
  drillId: string,
): Promise<Session[]> {
  if (!isNonEmptyString(drillId)) {
    throw invalid('Cannot load sessions without a valid drill id');
  }
  const all = await loadSessions();
  return all.filter(session => session.drillId === drillId);
}

/**
 * Load a single session by id. Resolves to `null` when the id is unknown
 * or the stored value is corrupt or fails validation.
 */
export async function loadSessionById(id: string): Promise<Session | null> {
  assertId(id, 'load');
  const stored = await withStorage('load session', () => sessions.getItem(id));
  return parseStoredSession(stored);
}

/**
 * Delete a session by id. Idempotent: deleting an unknown id is a no-op.
 */
export async function deleteSessionById(id: string): Promise<void> {
  assertId(id, 'delete');
  await withStorage('delete session', () => sessions.removeItem(id));
}

/**
 * Remove every session from storage. Primarily useful for tests and "reset
 * app data" flows.
 */
export async function clearSessions(): Promise<void> {
  await withStorage('clear sessions', () => sessions.clear());
}

/** Object-form export for callers that prefer a service handle. */
export const SessionStorageService = {
  namespace: SESSION_NAMESPACE,
  version: SESSION_STORAGE_VERSION,
  schemaVersion: SESSION_SCHEMA_VERSION,
  save: saveSession,
  loadAll: loadSessions,
  loadByDrillId: loadSessionsByDrillId,
  loadById: loadSessionById,
  deleteById: deleteSessionById,
  clear: clearSessions,
};

export type SessionStorageServiceType = typeof SessionStorageService;
