import type { Session, SessionInput } from '@/types/session';

import { createStorageNamespace, StorageError } from './storage';

/**
 * SessionStorageService
 * ---------------------
 * Local persistence layer for counting sessions. This service is the
 * single source of truth for reading and writing `Session` records to the
 * device and is intentionally the only place in the app that knows how
 * sessions are stored.
 *
 * Design notes:
 *   - Each session is stored under its own AsyncStorage key so writes are
 *     O(1) and independent of the total number of sessions.
 *   - Keys live in the `sessions` namespace with a version segment
 *     (`@BrassCount:sessions:v1:<id>`). Bump the version + write a
 *     migration when the `Session` shape needs breaking changes.
 *   - `updatedAt` (and `createdAt` on first save) are stamped by the
 *     service so callers don't have to remember to keep them in sync.
 *   - All errors from the underlying storage bubble up as `StorageError`
 *     so UI code can catch a single type.
 */

export const SESSION_NAMESPACE = 'sessions';
export const SESSION_STORAGE_VERSION = 'v1';

const sessions = createStorageNamespace<Session>({
  name: SESSION_NAMESPACE,
  version: SESSION_STORAGE_VERSION,
});

const nowIso = (): string => new Date().toISOString();

const assertId = (id: string, action: string): void => {
  if (!id || typeof id !== 'string') {
    throw new StorageError(`Cannot ${action} session without a valid id`);
  }
};

/**
 * Persist a session, creating it if new or updating it in place.
 *
 * Timestamps are managed by the service:
 *   - `createdAt` is preserved on existing sessions and stamped for new ones.
 *   - `updatedAt` is always set to now.
 *
 * Returns the fully-materialized `Session` that was written to storage so
 * callers can update local state without a follow-up read.
 */
export async function saveSession(input: SessionInput): Promise<Session> {
  if (!input || typeof input !== 'object') {
    throw new StorageError('saveSession requires a session payload');
  }
  assertId(input.id, 'save');

  const existing = await sessions.getItem(input.id);
  const timestamp = nowIso();

  const session: Session = {
    ...input,
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  await sessions.setItem(session.id, session);
  return session;
}

/**
 * Load every session stored on the device.
 *
 * Results are sorted by `updatedAt` descending so the UI can render the
 * most recently touched session first without extra work.
 */
export async function loadSessions(): Promise<Session[]> {
  const all = await sessions.getAll();
  return all.sort((a, b) => {
    const left = Date.parse(b.updatedAt) || 0;
    const right = Date.parse(a.updatedAt) || 0;
    return left - right;
  });
}

/**
 * Load a single session by id. Resolves to `null` when the id is unknown
 * or when the stored value is corrupt (unparseable JSON).
 */
export async function loadSessionById(id: string): Promise<Session | null> {
  assertId(id, 'load');
  return sessions.getItem(id);
}

/**
 * Delete a session by id. Idempotent: deleting an unknown id is a no-op.
 */
export async function deleteSessionById(id: string): Promise<void> {
  assertId(id, 'delete');
  await sessions.removeItem(id);
}

/**
 * Remove every session from storage. Primarily useful for tests, "reset
 * app data" flows, and future logout logic.
 */
export async function clearSessions(): Promise<void> {
  await sessions.clear();
}

/** Object-form export for callers that prefer a service handle. */
export const SessionStorageService = {
  namespace: SESSION_NAMESPACE,
  version: SESSION_STORAGE_VERSION,
  save: saveSession,
  loadAll: loadSessions,
  loadById: loadSessionById,
  deleteById: deleteSessionById,
  clear: clearSessions,
};

export type SessionStorageServiceType = typeof SessionStorageService;
