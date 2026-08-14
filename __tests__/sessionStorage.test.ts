/**
 * @format
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SESSION_NAMESPACE,
  SESSION_STORAGE_VERSION,
  SessionStorageService,
  clearSessions,
  deleteSessionById,
  loadSessionById,
  loadSessions,
  saveSession,
} from '../src/services/sessionStorage';
import { STORAGE_ROOT } from '../src/services/storage';
import type { Session } from '../src/types/session';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'session-1',
  name: 'Morning count',
  createdAt: '2025-01-01T08:00:00.000Z',
  updatedAt: '2025-01-01T08:00:00.000Z',
  entries: [],
  ...overrides,
});

describe('sessionStorage service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('exposes a namespace + version and matches the service shape', () => {
    expect(SESSION_NAMESPACE).toBe('sessions');
    expect(SESSION_STORAGE_VERSION).toBe('v1');
    expect(SessionStorageService).toEqual(
      expect.objectContaining({
        namespace: 'sessions',
        version: 'v1',
        save: expect.any(Function),
        loadAll: expect.any(Function),
        loadById: expect.any(Function),
        deleteById: expect.any(Function),
        clear: expect.any(Function),
      }),
    );
  });

  it('saves a new session, stamps timestamps, and writes to a versioned key', async () => {
    const input = makeSession({
      createdAt: undefined as unknown as string,
      updatedAt: undefined as unknown as string,
    });
    const before = Date.now();

    const saved = await saveSession(input);

    expect(saved.id).toBe('session-1');
    expect(saved.name).toBe('Morning count');
    expect(Date.parse(saved.createdAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(before - 1000);

    const expectedKey = `${STORAGE_ROOT}:sessions:v1:session-1`;
    const rawKeys = await AsyncStorage.getAllKeys();
    expect(rawKeys).toContain(expectedKey);

    const raw = await AsyncStorage.getItem(expectedKey);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(saved);
  });

  it('preserves createdAt and refreshes updatedAt on subsequent saves', async () => {
    const initial = await saveSession(
      makeSession({ createdAt: '2025-01-01T00:00:00.000Z' }),
    );

    // Wait a tick so updatedAt strictly moves forward.
    await new Promise(resolve => setTimeout(resolve, 5));

    const updated = await saveSession({
      ...initial,
      name: 'Updated name',
    });

    expect(updated.createdAt).toBe(initial.createdAt);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(initial.updatedAt),
    );
    expect(updated.name).toBe('Updated name');
  });

  it('loads a session by id and returns null for unknown ids', async () => {
    await saveSession(makeSession());

    const found = await loadSessionById('session-1');
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Morning count');

    const missing = await loadSessionById('does-not-exist');
    expect(missing).toBeNull();
  });

  it('loads all sessions sorted by updatedAt descending', async () => {
    await saveSession(
      makeSession({
        id: 'a',
        name: 'A',
        updatedAt: '2025-01-01T00:00:00.000Z',
      }),
    );
    await new Promise(resolve => setTimeout(resolve, 2));
    await saveSession(
      makeSession({
        id: 'b',
        name: 'B',
        updatedAt: '2025-01-02T00:00:00.000Z',
      }),
    );
    await new Promise(resolve => setTimeout(resolve, 2));
    await saveSession(
      makeSession({
        id: 'c',
        name: 'C',
        updatedAt: '2025-01-03T00:00:00.000Z',
      }),
    );

    const all = await loadSessions();
    expect(all.map(s => s.id)).toEqual(['c', 'b', 'a']);
  });

  it('deletes a session by id and is idempotent for unknown ids', async () => {
    await saveSession(makeSession());
    await saveSession(makeSession({ id: 'session-2', name: 'Second' }));

    await deleteSessionById('session-1');

    expect(await loadSessionById('session-1')).toBeNull();
    const remaining = await loadSessions();
    expect(remaining.map(s => s.id)).toEqual(['session-2']);

    await expect(deleteSessionById('does-not-exist')).resolves.toBeUndefined();
  });

  it('clears every session from storage', async () => {
    await saveSession(makeSession({ id: 'a' }));
    await saveSession(makeSession({ id: 'b' }));

    await clearSessions();

    expect(await loadSessions()).toEqual([]);
  });

  it('does not touch keys that belong to other namespaces', async () => {
    await AsyncStorage.setItem('@BrassCount:other:v1:x', 'keep-me');
    await saveSession(makeSession());

    await clearSessions();

    expect(await AsyncStorage.getItem('@BrassCount:other:v1:x')).toBe(
      'keep-me',
    );
  });

  it('rejects invalid ids on read, save, and delete', async () => {
    await expect(loadSessionById('')).rejects.toThrow(/valid id/);
    await expect(deleteSessionById('')).rejects.toThrow(/valid id/);
    await expect(
      saveSession({ id: '', name: 'nope' } as unknown as Session),
    ).rejects.toThrow(/valid id/);
  });

  it('returns null when the stored value is corrupt JSON', async () => {
    const key = `${STORAGE_ROOT}:sessions:v1:corrupt`;
    await AsyncStorage.setItem(key, '{not-json');

    expect(await loadSessionById('corrupt')).toBeNull();
  });
});
