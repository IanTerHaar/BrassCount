import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  SESSION_NAMESPACE,
  SESSION_SCHEMA_VERSION,
  SESSION_STORAGE_VERSION,
  SessionStorageError,
  SessionStorageService,
  clearSessions,
  deleteSessionById,
  loadSessionById,
  loadSessions,
  loadSessionsByDrillId,
  saveSession,
  type SessionStorageOptions,
} from '../src/services/sessionStorage';
import { STORAGE_ROOT, StorageError } from '../src/services/storage';
import { MAX_DRILL_STEPS, MAX_STEP_PAR_SECONDS } from '../src/types/drill';
import {
  MAX_SESSION_SECONDS,
  MAX_SPLIT_LABEL_LENGTH,
  type Session,
  type SessionInput,
  type SessionSplitInput,
} from '../src/types/session';

const CREATED_AT = '2026-10-01T08:00:00.000Z';

const keyFor = (id: string): string => `${STORAGE_ROOT}:sessions:v1:${id}`;

/** Ids `id-1`, `id-2`, … in the order the service asks for them. */
const sequentialIds = (): (() => string) => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
};

const fakes = (timestamp: string = CREATED_AT): SessionStorageOptions => ({
  generateId: sequentialIds(),
  getTimestamp: () => timestamp,
});

/** A Mozambique run: three timed steps and an untimed holster. */
const mozambiqueRun: SessionInput = {
  drillId: 'drill-1',
  totalTime: 3.63,
  splits: [
    { stepId: 'step-1', label: 'Draw', par: 1.5, actual: 1.32 },
    { stepId: 'step-2', label: 'Shot 1', par: 0.25, actual: 0.22 },
    { stepId: 'step-3', label: 'Shot 2', par: 0.5, actual: 0.62 },
    { stepId: 'step-4', label: 'Holster', actual: 1.47 },
  ],
};

const oneSplit: SessionSplitInput = {
  stepId: 'step-1',
  label: 'Shot',
  par: 0.5,
  actual: 0.4,
};

const readStored = async (id: string): Promise<unknown> => {
  const raw = await AsyncStorage.getItem(keyFor(id));
  return raw === null ? null : JSON.parse(raw);
};

/** Write a raw envelope, bypassing the service, as an older build might. */
const writeStored = (id: string, value: unknown): Promise<void> =>
  AsyncStorage.setItem(keyFor(id), JSON.stringify(value));

const storedSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'stored-1',
  drillId: 'drill-1',
  createdAt: CREATED_AT,
  totalTime: 0.4,
  splits: [{ ...oneSplit, delta: -0.1 }],
  ...overrides,
});

const envelope = (session: unknown, schemaVersion: unknown = 1): unknown => ({
  schemaVersion,
  session,
});

const expectRejection = async (
  promise: Promise<unknown>,
  code: SessionStorageError['code'],
): Promise<SessionStorageError> => {
  const error: unknown = await promise.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(SessionStorageError);
  expect((error as SessionStorageError).code).toBe(code);
  return error as SessionStorageError;
};

describe('sessionStorage service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes its namespace, versions and the service handle', () => {
    expect(SESSION_NAMESPACE).toBe('sessions');
    expect(SESSION_STORAGE_VERSION).toBe('v1');
    expect(SESSION_SCHEMA_VERSION).toBe(1);
    expect(SessionStorageService).toEqual({
      namespace: 'sessions',
      version: 'v1',
      schemaVersion: 1,
      save: saveSession,
      loadAll: loadSessions,
      loadByDrillId: loadSessionsByDrillId,
      loadById: loadSessionById,
      deleteById: deleteSessionById,
      clear: clearSessions,
    });
  });

  describe('saving a run', () => {
    it('stamps an id, a timestamp and each split delta onto the session', async () => {
      const saved = await saveSession(mozambiqueRun, fakes());

      expect(saved).toEqual({
        id: 'id-1',
        drillId: 'drill-1',
        createdAt: CREATED_AT,
        totalTime: 3.63,
        splits: [
          {
            stepId: 'step-1',
            label: 'Draw',
            par: 1.5,
            actual: 1.32,
            delta: -0.18,
          },
          {
            stepId: 'step-2',
            label: 'Shot 1',
            par: 0.25,
            actual: 0.22,
            delta: -0.03,
          },
          {
            stepId: 'step-3',
            label: 'Shot 2',
            par: 0.5,
            actual: 0.62,
            delta: 0.12,
          },
          { stepId: 'step-4', label: 'Holster', actual: 1.47, delta: null },
        ],
      });
    });

    it('generates a UUID and an ISO timestamp by default', async () => {
      const saved = await saveSession(mozambiqueRun);

      expect(saved.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(saved.createdAt).toBe(new Date(saved.createdAt).toISOString());
    });

    it('writes the session inside a schemaVersion envelope under a versioned key', async () => {
      const saved = await saveSession(mozambiqueRun, fakes());

      expect(await AsyncStorage.getAllKeys()).toEqual([keyFor('id-1')]);
      expect(await readStored('id-1')).toEqual({
        schemaVersion: 1,
        session: saved,
      });
    });

    it('stores a new session every time, even for the same run', async () => {
      const options = fakes();

      const first = await saveSession(mozambiqueRun, options);
      const second = await saveSession(mozambiqueRun, options);

      expect(second.id).not.toBe(first.id);
      expect(await AsyncStorage.getAllKeys()).toHaveLength(2);
    });

    it('works the delta out itself, ignoring one the caller passes', async () => {
      const split = { ...oneSplit, delta: 42 };

      const saved = await saveSession(
        { ...mozambiqueRun, splits: [split] },
        fakes(),
      );

      expect(saved.splits[0].delta).toBe(-0.1);
    });

    it('stores only the known fields of a session and its splits', async () => {
      const input = {
        ...mozambiqueRun,
        id: 'mine',
        createdAt: '1999-01-01T00:00:00.000Z',
        note: 'not part of the model',
        splits: [{ ...oneSplit, note: 'not part of the model' }],
      };

      const saved = await saveSession(input, fakes());

      expect(saved).toEqual({
        id: 'id-1',
        drillId: 'drill-1',
        createdAt: CREATED_AT,
        totalTime: 3.63,
        splits: [{ ...oneSplit, delta: -0.1 }],
      });
    });

    it('trims a split label', async () => {
      const saved = await saveSession(
        { ...mozambiqueRun, splits: [{ ...oneSplit, label: '  Shot 1  ' }] },
        fakes(),
      );

      expect(saved.splits[0].label).toBe('Shot 1');
    });

    it('accepts a split that took no time at all', async () => {
      const saved = await saveSession(
        {
          drillId: 'drill-1',
          totalTime: 0,
          splits: [{ ...oneSplit, actual: 0 }],
        },
        fakes(),
      );

      expect(saved.totalTime).toBe(0);
      expect(saved.splits[0]).toEqual({ ...oneSplit, actual: 0, delta: -0.5 });
    });

    it('does not mutate the input', async () => {
      const input: SessionInput = {
        drillId: 'drill-1',
        totalTime: 0.4,
        splits: [{ ...oneSplit, label: ' Shot ' }],
      };
      const snapshot = JSON.parse(JSON.stringify(input));

      await saveSession(input, fakes());

      expect(input).toEqual(snapshot);
    });

    it.each<[string, unknown]>([
      ['a missing payload', null],
      ['a payload that is a list', [mozambiqueRun]],
      ['a missing drill id', { ...mozambiqueRun, drillId: undefined }],
      ['an empty drill id', { ...mozambiqueRun, drillId: '' }],
      ['a drill id that is not text', { ...mozambiqueRun, drillId: 7 }],
      ['a missing total time', { ...mozambiqueRun, totalTime: undefined }],
      ['a negative total time', { ...mozambiqueRun, totalTime: -0.01 }],
      ['a NaN total time', { ...mozambiqueRun, totalTime: NaN }],
      ['an infinite total time', { ...mozambiqueRun, totalTime: Infinity }],
      [
        'a total time that is not a number',
        { ...mozambiqueRun, totalTime: '3.63' },
      ],
      ['no splits', { ...mozambiqueRun, splits: [] }],
      ['splits that are not a list', { ...mozambiqueRun, splits: 'Shot' }],
      ['a split that is not an object', { ...mozambiqueRun, splits: ['Shot'] }],
      [
        'a split without a step id',
        { ...mozambiqueRun, splits: [{ ...oneSplit, stepId: '' }] },
      ],
      [
        'a split with a blank label',
        { ...mozambiqueRun, splits: [{ ...oneSplit, label: '   ' }] },
      ],
      [
        'a split with a label that is not text',
        { ...mozambiqueRun, splits: [{ ...oneSplit, label: 3 }] },
      ],
      [
        'a split with a zero par',
        { ...mozambiqueRun, splits: [{ ...oneSplit, par: 0 }] },
      ],
      [
        'a split with a null par',
        { ...mozambiqueRun, splits: [{ ...oneSplit, par: null }] },
      ],
      [
        'a split with a par that is not a number',
        { ...mozambiqueRun, splits: [{ ...oneSplit, par: '0.5' }] },
      ],
      [
        'a split without an actual time',
        { ...mozambiqueRun, splits: [{ stepId: 'step-1', label: 'Shot' }] },
      ],
      [
        'a split with a negative actual time',
        { ...mozambiqueRun, splits: [{ ...oneSplit, actual: -0.4 }] },
      ],
      [
        'a split with a NaN actual time',
        { ...mozambiqueRun, splits: [{ ...oneSplit, actual: NaN }] },
      ],
      [
        'a split with an infinite actual time',
        { ...mozambiqueRun, splits: [{ ...oneSplit, actual: Infinity }] },
      ],
      [
        'two splits for the same step',
        {
          ...mozambiqueRun,
          splits: [oneSplit, { ...oneSplit, label: 'Shot 2' }],
        },
      ],
    ])('rejects %s and writes nothing', async (_case, input) => {
      await expectRejection(
        saveSession(input as SessionInput, fakes()),
        'INVALID_INPUT',
      );

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('wraps a storage failure, keeping the original as the cause', async () => {
      const failure = new Error('disk full');
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(failure);

      const error = await expectRejection(
        saveSession(mozambiqueRun, fakes()),
        'STORAGE_FAILURE',
      );

      expect(error).toBeInstanceOf(StorageError);
      expect(error.cause).toBeInstanceOf(StorageError);
      expect((error.cause as StorageError).cause).toBe(failure);
    });
  });

  describe('loading a session by id', () => {
    it('returns the saved session', async () => {
      const saved = await saveSession(mozambiqueRun, fakes());

      expect(await loadSessionById('id-1')).toEqual(saved);
    });

    it('resolves to null for an unknown id', async () => {
      expect(await loadSessionById('does-not-exist')).toBeNull();
    });

    it('rejects an empty id', async () => {
      await expectRejection(loadSessionById(''), 'INVALID_INPUT');
    });

    it('resolves to null when the stored value is corrupt JSON', async () => {
      await AsyncStorage.setItem(keyFor('corrupt'), '{not-json');

      expect(await loadSessionById('corrupt')).toBeNull();
    });

    it.each<[string, unknown]>([
      ['a bare session with no envelope', storedSession()],
      [
        'the placeholder shape this service replaced',
        {
          id: 'stored-1',
          name: 'Morning count',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          entries: [],
        },
      ],
      ['an unknown schema version', envelope(storedSession(), 2)],
      ['a missing schema version', { session: storedSession() }],
      ['a session that is not an object', envelope('nope')],
      ['a session without an id', envelope(storedSession({ id: '' }))],
      [
        'a session without a drill id',
        envelope({ ...storedSession(), drillId: undefined }),
      ],
      [
        'an unreadable timestamp',
        envelope(storedSession({ createdAt: 'yesterday' })),
      ],
      [
        'a total time that is not a number',
        envelope({ ...storedSession(), totalTime: '0.4' }),
      ],
      [
        // What `JSON.stringify` leaves behind for a NaN or infinite time.
        'a null total time',
        envelope({ ...storedSession(), totalTime: null }),
      ],
      ['a negative total time', envelope(storedSession({ totalTime: -1 }))],
      ['a session without splits', envelope(storedSession({ splits: [] }))],
      [
        'splits that are not a list',
        envelope({ ...storedSession(), splits: 'Shot' }),
      ],
      [
        'a split without a step id',
        envelope({
          ...storedSession(),
          splits: [{ label: 'Shot', actual: 0.4, delta: null }],
        }),
      ],
      [
        'a split without a label',
        envelope({
          ...storedSession(),
          splits: [{ stepId: 'step-1', actual: 0.4, delta: null }],
        }),
      ],
      [
        'a split with an invalid par',
        envelope({
          ...storedSession(),
          splits: [{ ...oneSplit, par: '0.5', delta: -0.1 }],
        }),
      ],
      [
        'a split with an invalid actual time',
        envelope({
          ...storedSession(),
          splits: [{ ...oneSplit, actual: null, delta: null }],
        }),
      ],
      [
        'two splits for the same step',
        envelope({
          ...storedSession(),
          splits: [
            { ...oneSplit, delta: -0.1 },
            { ...oneSplit, delta: -0.1 },
          ],
        }),
      ],
    ])('resolves to null for %s', async (_case, stored) => {
      await writeStored('stored-1', stored);

      expect(await loadSessionById('stored-1')).toBeNull();
    });

    it('recomputes each delta instead of trusting the stored one', async () => {
      await writeStored(
        'stored-1',
        envelope({
          ...storedSession(),
          splits: [
            { ...oneSplit, delta: 99 },
            { stepId: 'step-2', label: 'Holster', actual: 1.2, delta: 5 },
          ],
        }),
      );

      const loaded = await loadSessionById('stored-1');

      expect(loaded?.splits.map(split => split.delta)).toEqual([-0.1, null]);
    });

    it('drops fields the model does not know', async () => {
      await writeStored(
        'stored-1',
        envelope({
          ...storedSession(),
          injected: 'value',
          splits: [{ ...oneSplit, delta: -0.1, injected: 'value' }],
        }),
      );

      expect(await loadSessionById('stored-1')).toEqual(storedSession());
    });
  });

  describe('loading every session', () => {
    it('resolves to an empty list when nothing is stored', async () => {
      expect(await loadSessions()).toEqual([]);
    });

    it('returns sessions newest first', async () => {
      await writeStored(
        'a',
        envelope(
          storedSession({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z' }),
        ),
      );
      await writeStored(
        'b',
        envelope(
          storedSession({ id: 'b', createdAt: '2026-10-03T00:00:00.000Z' }),
        ),
      );
      await writeStored(
        'c',
        envelope(
          storedSession({ id: 'c', createdAt: '2026-10-02T00:00:00.000Z' }),
        ),
      );

      const all = await loadSessions();

      expect(all.map(session => session.id)).toEqual(['b', 'c', 'a']);
    });

    it('keeps sessions saved at the same moment in a stable order', async () => {
      await writeStored('b', envelope(storedSession({ id: 'b' })));
      await writeStored('a', envelope(storedSession({ id: 'a' })));

      const all = await loadSessions();

      expect(all.map(session => session.id)).toEqual(['a', 'b']);
    });

    it('skips corrupt and unreadable entries without failing the read', async () => {
      const saved = await saveSession(mozambiqueRun, fakes());
      await AsyncStorage.setItem(keyFor('corrupt'), '{not-json');
      await writeStored('future', envelope(storedSession({ id: 'future' }), 2));

      expect(await loadSessions()).toEqual([saved]);
    });

    it('wraps a storage failure', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('unavailable'));

      await expectRejection(loadSessions(), 'STORAGE_FAILURE');
    });
  });

  describe('loading the sessions of one drill', () => {
    it('returns only that drill’s runs, newest first', async () => {
      await writeStored(
        'a',
        envelope(
          storedSession({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z' }),
        ),
      );
      await writeStored(
        'b',
        envelope(
          storedSession({
            id: 'b',
            drillId: 'drill-2',
            createdAt: '2026-10-02T00:00:00.000Z',
          }),
        ),
      );
      await writeStored(
        'c',
        envelope(
          storedSession({ id: 'c', createdAt: '2026-10-03T00:00:00.000Z' }),
        ),
      );

      const runs = await loadSessionsByDrillId('drill-1');

      expect(runs.map(session => session.id)).toEqual(['c', 'a']);
      expect(runs.every(session => session.drillId === 'drill-1')).toBe(true);
    });

    it('resolves to an empty list for a drill with no runs', async () => {
      await saveSession(mozambiqueRun, fakes());

      expect(await loadSessionsByDrillId('drill-without-runs')).toEqual([]);
    });

    it('matches the drill id exactly', async () => {
      await saveSession({ ...mozambiqueRun, drillId: 'drill-10' }, fakes());

      expect(await loadSessionsByDrillId('drill-1')).toEqual([]);
    });

    it('leaves out an unreadable run of that drill', async () => {
      const saved = await saveSession(mozambiqueRun, fakes());
      await writeStored(
        'broken',
        envelope({ ...storedSession({ id: 'broken' }), splits: [] }),
      );

      expect(await loadSessionsByDrillId('drill-1')).toEqual([saved]);
    });

    it('rejects an empty drill id', async () => {
      await expectRejection(loadSessionsByDrillId(''), 'INVALID_INPUT');
    });

    it('wraps a storage failure', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('unavailable'));

      await expectRejection(
        loadSessionsByDrillId('drill-1'),
        'STORAGE_FAILURE',
      );
    });
  });

  describe('deleting sessions', () => {
    it('removes one session and leaves the others', async () => {
      const options = fakes();
      const first = await saveSession(mozambiqueRun, options);
      const second = await saveSession(mozambiqueRun, options);

      await deleteSessionById(first.id);

      expect(await loadSessionById(first.id)).toBeNull();
      expect(await loadSessions()).toEqual([second]);
    });

    it('is a no-op for an unknown id', async () => {
      await expect(
        deleteSessionById('does-not-exist'),
      ).resolves.toBeUndefined();
    });

    it('rejects an empty id', async () => {
      await expectRejection(deleteSessionById(''), 'INVALID_INPUT');
    });

    it('wraps a storage failure and leaves the session stored', async () => {
      const saved = await saveSession(mozambiqueRun, fakes());
      jest
        .spyOn(AsyncStorage, 'removeItem')
        .mockRejectedValueOnce(new Error('unavailable'));

      await expectRejection(deleteSessionById(saved.id), 'STORAGE_FAILURE');

      expect(await loadSessionById(saved.id)).toEqual(saved);
    });

    it('clears every session without touching other namespaces', async () => {
      await AsyncStorage.setItem('@BrassCount:drills:v1:x', 'keep-me');
      await saveSession(mozambiqueRun, fakes());

      await clearSessions();

      expect(await loadSessions()).toEqual([]);
      expect(await AsyncStorage.getItem('@BrassCount:drills:v1:x')).toBe(
        'keep-me',
      );
    });
  });

  describe('limits', () => {
    const longestLabel = 'l'.repeat(MAX_SPLIT_LABEL_LENGTH);
    const splits = (count: number): SessionSplitInput[] =>
      Array.from({ length: count }, (_, index) => ({
        stepId: `step-${index + 1}`,
        label: 'Shot',
        actual: 0.2,
      }));

    it('accepts a session that sits exactly on every limit', async () => {
      const saved = await saveSession(
        {
          drillId: 'drill-1',
          totalTime: MAX_SESSION_SECONDS,
          splits: splits(MAX_DRILL_STEPS).map(split => ({
            ...split,
            label: longestLabel,
            par: MAX_STEP_PAR_SECONDS,
            actual: MAX_SESSION_SECONDS,
          })),
        },
        fakes(),
      );

      expect(saved.totalTime).toBe(MAX_SESSION_SECONDS);
      expect(saved.splits).toHaveLength(MAX_DRILL_STEPS);
      expect(saved.splits[0].label).toBe(longestLabel);
      expect(await loadSessionById(saved.id)).toEqual(saved);
    });

    it('measures a label after trimming it', async () => {
      const saved = await saveSession(
        {
          ...mozambiqueRun,
          splits: [{ ...oneSplit, label: `  ${longestLabel}  ` }],
        },
        fakes(),
      );

      expect(saved.splits[0].label).toBe(longestLabel);
    });

    it.each<[string, SessionInput]>([
      [
        'a total time over the limit',
        { ...mozambiqueRun, totalTime: MAX_SESSION_SECONDS + 0.001 },
      ],
      [
        'an actual time over the limit',
        {
          ...mozambiqueRun,
          splits: [{ ...oneSplit, actual: MAX_SESSION_SECONDS + 0.001 }],
        },
      ],
      [
        'a par over the limit',
        {
          ...mozambiqueRun,
          splits: [{ ...oneSplit, par: MAX_STEP_PAR_SECONDS + 0.01 }],
        },
      ],
      [
        'more splits than a drill can have steps',
        { ...mozambiqueRun, splits: splits(MAX_DRILL_STEPS + 1) },
      ],
      [
        'a label longer than the limit',
        {
          ...mozambiqueRun,
          splits: [{ ...oneSplit, label: `${longestLabel}l` }],
        },
      ],
    ])('rejects %s and writes nothing', async (_case, input) => {
      await expectRejection(saveSession(input, fakes()), 'INVALID_INPUT');

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('resolves to null for a stored session with a time over the limit', async () => {
      await writeStored(
        'stored-1',
        envelope(storedSession({ totalTime: 1e308 })),
      );

      expect(await loadSessionById('stored-1')).toBeNull();
    });
  });
});
