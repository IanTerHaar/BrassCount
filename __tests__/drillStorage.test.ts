import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DRILL_NAMESPACE,
  DRILL_SCHEMA_VERSION,
  DRILL_STORAGE_VERSION,
  DrillStorageError,
  DrillStorageService,
  clearDrills,
  deleteDrillById,
  loadDrillById,
  loadDrills,
  saveDrill,
  updateDrill,
  type DrillStorageOptions,
} from '../src/services/drillStorage';
import { STORAGE_ROOT, StorageError } from '../src/services/storage';
import {
  MAX_DRILL_NAME_LENGTH,
  MAX_DRILL_STEPS,
  MAX_STEP_PAR_SECONDS,
  type Drill,
  type DrillInput,
} from '../src/types/drill';

const CREATED_AT = '2026-10-01T08:00:00.000Z';
const UPDATED_AT = '2026-10-02T09:30:00.000Z';

const keyFor = (id: string): string => `${STORAGE_ROOT}:drills:v1:${id}`;

/** Ids `id-1`, `id-2`, … in the order the service asks for them. */
const sequentialIds = (): (() => string) => {
  let next = 0;
  return () => {
    next += 1;
    return `id-${next}`;
  };
};

const fakes = (timestamp: string = CREATED_AT): DrillStorageOptions => ({
  generateId: sequentialIds(),
  getTimestamp: () => timestamp,
});

const billDrill: DrillInput = {
  name: 'Bill Drill',
  steps: [
    { type: 'draw', par: 1.5 },
    { type: 'shot', par: 0.25 },
    { type: 'shot', par: 0.2 },
  ],
};

const readStored = async (id: string): Promise<unknown> => {
  const raw = await AsyncStorage.getItem(keyFor(id));
  return raw === null ? null : JSON.parse(raw);
};

/** Write a raw envelope, bypassing the service, as an older build might. */
const writeStored = (id: string, value: unknown): Promise<void> =>
  AsyncStorage.setItem(keyFor(id), JSON.stringify(value));

const storedDrill = (overrides: Partial<Drill> = {}): Drill => ({
  id: 'stored-1',
  name: 'Stored drill',
  steps: [{ id: 'step-1', type: 'shot', par: 0.5 }],
  totalPar: 0.5,
  shotCount: 1,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  ...overrides,
});

const expectRejection = async (
  promise: Promise<unknown>,
  code: DrillStorageError['code'],
): Promise<DrillStorageError> => {
  const error: unknown = await promise.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(DrillStorageError);
  expect((error as DrillStorageError).code).toBe(code);
  return error as DrillStorageError;
};

describe('drillStorage service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes its namespace, versions and the service handle', () => {
    expect(DRILL_NAMESPACE).toBe('drills');
    expect(DRILL_STORAGE_VERSION).toBe('v1');
    expect(DRILL_SCHEMA_VERSION).toBe(1);
    expect(DrillStorageService).toEqual({
      namespace: 'drills',
      version: 'v1',
      schemaVersion: 1,
      save: saveDrill,
      loadAll: loadDrills,
      loadById: loadDrillById,
      update: updateDrill,
      deleteById: deleteDrillById,
      clear: clearDrills,
    });
  });

  describe('saving a drill', () => {
    it('stamps ids, timestamps and derived totals onto the drill', async () => {
      const saved = await saveDrill(billDrill, fakes());

      expect(saved).toEqual({
        id: 'id-1',
        name: 'Bill Drill',
        steps: [
          { id: 'id-2', type: 'draw', par: 1.5 },
          { id: 'id-3', type: 'shot', par: 0.25 },
          { id: 'id-4', type: 'shot', par: 0.2 },
        ],
        totalPar: 1.95,
        shotCount: 2,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
    });

    it('generates a UUID and an ISO timestamp by default', async () => {
      const saved = await saveDrill(billDrill);

      expect(saved.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(new Set(saved.steps.map(step => step.id)).size).toBe(3);
      expect(saved.createdAt).toBe(new Date(saved.createdAt).toISOString());
      expect(saved.updatedAt).toBe(saved.createdAt);
    });

    it('writes the drill inside a schemaVersion envelope under a versioned key', async () => {
      const saved = await saveDrill(billDrill, fakes());

      expect(await AsyncStorage.getAllKeys()).toEqual([keyFor('id-1')]);
      expect(await readStored('id-1')).toEqual({
        schemaVersion: 1,
        drill: saved,
      });
    });

    it('trims the drill name', async () => {
      const saved = await saveDrill(
        { ...billDrill, name: '  Bill Drill  ' },
        fakes(),
      );

      expect(saved.name).toBe('Bill Drill');
    });

    it('leaves total par null when a step is untimed', async () => {
      const saved = await saveDrill(
        {
          name: 'Mozambique',
          steps: [{ type: 'draw', par: 1.5 }, { type: 'shot' }],
        },
        fakes(),
      );

      expect(saved.totalPar).toBeNull();
      expect(saved.shotCount).toBe(1);
      expect(saved.steps[1]).toEqual({ id: 'id-3', type: 'shot' });
    });

    it('keeps a step id the caller supplies', async () => {
      const saved = await saveDrill(
        { name: 'Pair', steps: [{ id: 'mine', type: 'shot' }] },
        fakes(),
      );

      expect(saved.steps).toEqual([{ id: 'mine', type: 'shot' }]);
    });

    it('stores only the known fields of a step', async () => {
      const step = { type: 'shot', par: 0.3, note: 'not part of the model' };

      const saved = await saveDrill(
        { name: 'Pair', steps: [step as DrillInput['steps'][number]] },
        fakes(),
      );

      expect(saved.steps).toEqual([{ id: 'id-2', type: 'shot', par: 0.3 }]);
    });

    it('does not mutate the input', async () => {
      const input: DrillInput = {
        name: ' Pair ',
        steps: [{ type: 'shot', par: 0.3 }],
      };
      const snapshot = JSON.parse(JSON.stringify(input));

      await saveDrill(input, fakes());

      expect(input).toEqual(snapshot);
    });

    it.each<[string, unknown]>([
      ['a missing payload', null],
      ['a blank name', { ...billDrill, name: '   ' }],
      ['a name that is not text', { ...billDrill, name: 42 }],
      ['no steps', { ...billDrill, steps: [] }],
      ['steps that are not a list', { ...billDrill, steps: 'shot' }],
      ['a step that is not an object', { ...billDrill, steps: ['shot'] }],
      [
        'an unknown step type',
        { ...billDrill, steps: [{ type: 'Shot', par: 0.2 }] },
      ],
      ['a zero par', { ...billDrill, steps: [{ type: 'shot', par: 0 }] }],
      ['a negative par', { ...billDrill, steps: [{ type: 'shot', par: -1 }] }],
      ['a NaN par', { ...billDrill, steps: [{ type: 'shot', par: NaN }] }],
      [
        'an infinite par',
        { ...billDrill, steps: [{ type: 'shot', par: Infinity }] },
      ],
      [
        'a par that is not a number',
        { ...billDrill, steps: [{ type: 'shot', par: '0.2' }] },
      ],
      ['an empty step id', { ...billDrill, steps: [{ id: '', type: 'shot' }] }],
      [
        'duplicate step ids',
        {
          ...billDrill,
          steps: [
            { id: 'same', type: 'shot' },
            { id: 'same', type: 'shot' },
          ],
        },
      ],
    ])('rejects %s and writes nothing', async (_case, input) => {
      await expectRejection(
        saveDrill(input as DrillInput, fakes()),
        'INVALID_INPUT',
      );

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('wraps a storage failure, keeping the original as the cause', async () => {
      const failure = new Error('disk full');
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(failure);

      const error = await expectRejection(
        saveDrill(billDrill, fakes()),
        'STORAGE_FAILURE',
      );

      expect(error).toBeInstanceOf(StorageError);
      expect(error.cause).toBeInstanceOf(StorageError);
      expect((error.cause as StorageError).cause).toBe(failure);
    });
  });

  describe('loading a drill by id', () => {
    it('returns the saved drill', async () => {
      const saved = await saveDrill(billDrill, fakes());

      expect(await loadDrillById('id-1')).toEqual(saved);
    });

    it('resolves to null for an unknown id', async () => {
      expect(await loadDrillById('does-not-exist')).toBeNull();
    });

    it('rejects an empty id', async () => {
      await expectRejection(loadDrillById(''), 'INVALID_INPUT');
    });

    it('resolves to null when the stored value is corrupt JSON', async () => {
      await AsyncStorage.setItem(keyFor('corrupt'), '{not-json');

      expect(await loadDrillById('corrupt')).toBeNull();
    });

    it.each<[string, unknown]>([
      ['a bare drill with no envelope', storedDrill()],
      ['an unknown schema version', { schemaVersion: 2, drill: storedDrill() }],
      ['a missing schema version', { drill: storedDrill() }],
      ['a drill that is not an object', { schemaVersion: 1, drill: 'nope' }],
      [
        'a drill without an id',
        { schemaVersion: 1, drill: storedDrill({ id: '' }) },
      ],
      [
        'an unreadable timestamp',
        { schemaVersion: 1, drill: storedDrill({ updatedAt: 'yesterday' }) },
      ],
      [
        'a drill without steps',
        { schemaVersion: 1, drill: storedDrill({ steps: [] }) },
      ],
      [
        'a step without an id',
        {
          schemaVersion: 1,
          drill: { ...storedDrill(), steps: [{ type: 'shot' }] },
        },
      ],
      [
        'a step with an unknown type',
        {
          schemaVersion: 1,
          drill: { ...storedDrill(), steps: [{ id: 's', type: 'jump' }] },
        },
      ],
      [
        'a step with an invalid par',
        {
          schemaVersion: 1,
          drill: {
            ...storedDrill(),
            steps: [{ id: 's', type: 'shot', par: '0.5' }],
          },
        },
      ],
      [
        'duplicate step ids',
        {
          schemaVersion: 1,
          drill: {
            ...storedDrill(),
            steps: [
              { id: 's', type: 'shot' },
              { id: 's', type: 'shot' },
            ],
          },
        },
      ],
      [
        'steps that are not a list',
        { schemaVersion: 1, drill: { ...storedDrill(), steps: 'shot' } },
      ],
      [
        'a blank name',
        { schemaVersion: 1, drill: storedDrill({ name: '  ' }) },
      ],
    ])('resolves to null for %s', async (_case, stored) => {
      await writeStored('stored-1', stored);

      expect(await loadDrillById('stored-1')).toBeNull();
    });

    it('recomputes the totals instead of trusting the stored ones', async () => {
      await writeStored('stored-1', {
        schemaVersion: 1,
        drill: storedDrill({ totalPar: 99, shotCount: 12 }),
      });

      const loaded = await loadDrillById('stored-1');

      expect(loaded?.totalPar).toBe(0.5);
      expect(loaded?.shotCount).toBe(1);
    });

    it('drops fields the model does not know', async () => {
      await writeStored('stored-1', {
        schemaVersion: 1,
        drill: { ...storedDrill(), injected: 'value' },
      });

      expect(await loadDrillById('stored-1')).toEqual(storedDrill());
    });
  });

  describe('loading every drill', () => {
    it('resolves to an empty list when nothing is stored', async () => {
      expect(await loadDrills()).toEqual([]);
    });

    it('returns drills most recently updated first', async () => {
      await writeStored('a', {
        schemaVersion: 1,
        drill: storedDrill({ id: 'a', updatedAt: '2026-10-01T00:00:00.000Z' }),
      });
      await writeStored('b', {
        schemaVersion: 1,
        drill: storedDrill({ id: 'b', updatedAt: '2026-10-03T00:00:00.000Z' }),
      });
      await writeStored('c', {
        schemaVersion: 1,
        drill: storedDrill({ id: 'c', updatedAt: '2026-10-02T00:00:00.000Z' }),
      });

      const all = await loadDrills();

      expect(all.map(drill => drill.id)).toEqual(['b', 'c', 'a']);
    });

    it('orders drills updated at the same moment by name', async () => {
      await writeStored('a', {
        schemaVersion: 1,
        drill: storedDrill({ id: 'a', name: 'Mozambique' }),
      });
      await writeStored('b', {
        schemaVersion: 1,
        drill: storedDrill({ id: 'b', name: 'Bill Drill' }),
      });

      const all = await loadDrills();

      expect(all.map(drill => drill.name)).toEqual([
        'Bill Drill',
        'Mozambique',
      ]);
    });

    it('skips corrupt and unreadable entries without failing the read', async () => {
      const saved = await saveDrill(billDrill, fakes());
      await AsyncStorage.setItem(keyFor('corrupt'), '{not-json');
      await writeStored('future', {
        schemaVersion: 2,
        drill: storedDrill({ id: 'future' }),
      });

      expect(await loadDrills()).toEqual([saved]);
    });

    it('wraps a storage failure', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('unavailable'));

      await expectRejection(loadDrills(), 'STORAGE_FAILURE');
    });
  });

  describe('updating a drill', () => {
    it('renames a drill, keeping its id, steps and createdAt', async () => {
      const saved = await saveDrill(billDrill, fakes());

      const updated = await updateDrill(
        saved.id,
        { name: 'Bill Drill 2' },
        fakes(UPDATED_AT),
      );

      expect(updated).toEqual({
        ...saved,
        name: 'Bill Drill 2',
        updatedAt: UPDATED_AT,
      });
      expect(await loadDrillById(saved.id)).toEqual(updated);
    });

    it('derives the totals again when the steps change', async () => {
      const saved = await saveDrill(billDrill, fakes());

      const updated = await updateDrill(
        saved.id,
        {
          steps: [
            { type: 'shot', par: 0.3 },
            { type: 'shot', par: 0.3 },
            { type: 'shot', par: 0.3 },
          ],
        },
        fakes(UPDATED_AT),
      );

      expect(updated.name).toBe('Bill Drill');
      expect(updated.totalPar).toBe(0.9);
      expect(updated.shotCount).toBe(3);
    });

    it('keeps the id of an existing step and gives new steps their own', async () => {
      const saved = await saveDrill(billDrill, fakes());
      const [draw] = saved.steps;

      const updated = await updateDrill(
        saved.id,
        { steps: [draw, { type: 'reload', par: 2 }] },
        { generateId: () => 'new-step', getTimestamp: () => UPDATED_AT },
      );

      expect(updated.steps).toEqual([
        draw,
        { id: 'new-step', type: 'reload', par: 2 },
      ]);
    });

    it('keeps the schemaVersion envelope on the rewritten value', async () => {
      const saved = await saveDrill(billDrill, fakes());

      const updated = await updateDrill(
        saved.id,
        { name: 'Renamed' },
        fakes(UPDATED_AT),
      );

      expect(await readStored(saved.id)).toEqual({
        schemaVersion: 1,
        drill: updated,
      });
    });

    it('wraps a storage failure and leaves the stored drill alone', async () => {
      const saved = await saveDrill(billDrill, fakes());
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('disk full'));

      await expectRejection(
        updateDrill(saved.id, { name: 'Renamed' }, fakes(UPDATED_AT)),
        'STORAGE_FAILURE',
      );

      expect(await loadDrillById(saved.id)).toEqual(saved);
    });

    it('rejects an update to a drill that is not stored', async () => {
      await expectRejection(
        updateDrill('does-not-exist', { name: 'Ghost' }, fakes()),
        'NOT_FOUND',
      );

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('does not overwrite an entry written by a newer schema', async () => {
      const future = { schemaVersion: 2, drill: storedDrill({ id: 'future' }) };
      await writeStored('future', future);

      await expectRejection(
        updateDrill('future', { name: 'Clobbered' }, fakes()),
        'NOT_FOUND',
      );

      expect(await readStored('future')).toEqual(future);
    });

    it.each<[string, unknown]>([
      ['missing changes', null],
      ['a blank name', { name: ' ' }],
      ['an empty step list', { steps: [] }],
      ['an invalid par', { steps: [{ type: 'shot', par: -0.2 }] }],
    ])(
      'rejects %s and leaves the stored drill alone',
      async (_case, changes) => {
        const saved = await saveDrill(billDrill, fakes());

        await expectRejection(
          updateDrill(saved.id, changes as DrillInput, fakes(UPDATED_AT)),
          'INVALID_INPUT',
        );

        expect(await loadDrillById(saved.id)).toEqual(saved);
      },
    );

    it('rejects an empty id', async () => {
      await expectRejection(
        updateDrill('', { name: 'Nope' }, fakes()),
        'INVALID_INPUT',
      );
    });
  });

  describe('deleting drills', () => {
    it('removes one drill and leaves the others', async () => {
      const ids = sequentialIds();
      const options = { generateId: ids, getTimestamp: () => CREATED_AT };
      const first = await saveDrill(billDrill, options);
      const second = await saveDrill({ ...billDrill, name: 'Second' }, options);

      await deleteDrillById(first.id);

      expect(await loadDrillById(first.id)).toBeNull();
      expect(await loadDrills()).toEqual([second]);
    });

    it('is a no-op for an unknown id', async () => {
      await expect(deleteDrillById('does-not-exist')).resolves.toBeUndefined();
    });

    it('rejects an empty id', async () => {
      await expectRejection(deleteDrillById(''), 'INVALID_INPUT');
    });

    it('clears every drill without touching other namespaces', async () => {
      await AsyncStorage.setItem('@BrassCount:sessions:v1:x', 'keep-me');
      await saveDrill(billDrill, fakes());

      await clearDrills();

      expect(await loadDrills()).toEqual([]);
      expect(await AsyncStorage.getItem('@BrassCount:sessions:v1:x')).toBe(
        'keep-me',
      );
    });
  });

  describe('limits', () => {
    const longestName = 'n'.repeat(MAX_DRILL_NAME_LENGTH);
    const shots = (count: number): DrillInput['steps'] =>
      Array.from({ length: count }, () => ({ type: 'shot' as const }));

    it('accepts a drill that sits exactly on every limit', async () => {
      const saved = await saveDrill(
        {
          name: longestName,
          steps: shots(MAX_DRILL_STEPS).map(step => ({
            ...step,
            par: MAX_STEP_PAR_SECONDS,
          })),
        },
        fakes(),
      );

      expect(saved.name).toBe(longestName);
      expect(saved.steps).toHaveLength(MAX_DRILL_STEPS);
      expect(saved.totalPar).toBe(MAX_DRILL_STEPS * MAX_STEP_PAR_SECONDS);
    });

    it('measures the name after trimming it', async () => {
      const saved = await saveDrill(
        { name: `  ${longestName}  `, steps: shots(1) },
        fakes(),
      );

      expect(saved.name).toBe(longestName);
    });

    it.each<[string, DrillInput]>([
      [
        'a par over the limit',
        {
          name: 'Slow',
          steps: [{ type: 'shot', par: MAX_STEP_PAR_SECONDS + 0.01 }],
        },
      ],
      [
        'more steps than the limit',
        { name: 'Long', steps: shots(MAX_DRILL_STEPS + 1) },
      ],
      [
        'a name longer than the limit',
        { name: `${longestName}n`, steps: shots(1) },
      ],
    ])('rejects %s and writes nothing', async (_case, input) => {
      await expectRejection(saveDrill(input, fakes()), 'INVALID_INPUT');

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('rejects an update past a limit and leaves the stored drill alone', async () => {
      const saved = await saveDrill(billDrill, fakes());

      await expectRejection(
        updateDrill(
          saved.id,
          { steps: shots(MAX_DRILL_STEPS + 1) },
          fakes(UPDATED_AT),
        ),
        'INVALID_INPUT',
      );

      expect(await loadDrillById(saved.id)).toEqual(saved);
    });

    it('resolves to null for a stored drill with a par over the limit', async () => {
      await writeStored('stored-1', {
        schemaVersion: 1,
        drill: {
          ...storedDrill(),
          steps: [
            { id: 'a', type: 'shot', par: 1e308 },
            { id: 'b', type: 'shot', par: 1e308 },
          ],
        },
      });

      expect(await loadDrillById('stored-1')).toBeNull();
    });
  });

  describe('overlapping changes', () => {
    it('applies both of two overlapping updates', async () => {
      const saved = await saveDrill(billDrill, fakes());

      const [, last] = await Promise.all([
        updateDrill(saved.id, { name: 'Renamed' }, fakes(UPDATED_AT)),
        updateDrill(
          saved.id,
          { steps: [{ type: 'reload', par: 2 }] },
          fakes(UPDATED_AT),
        ),
      ]);

      const stored = await loadDrillById(saved.id);
      expect(stored?.name).toBe('Renamed');
      expect(stored?.steps.map(step => step.type)).toEqual(['reload']);
      expect(stored).toEqual(last);
    });

    it('does not restore a drill deleted while an update was in flight', async () => {
      const saved = await saveDrill(billDrill, fakes());

      await Promise.all([
        updateDrill(saved.id, { name: 'Renamed' }, fakes(UPDATED_AT)),
        deleteDrillById(saved.id),
      ]);

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('does not restore drills cleared while an update was in flight', async () => {
      const saved = await saveDrill(billDrill, fakes());

      await Promise.all([
        updateDrill(saved.id, { name: 'Renamed' }, fakes(UPDATED_AT)),
        clearDrills(),
      ]);

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('rejects an update requested after a delete', async () => {
      const saved = await saveDrill(billDrill, fakes());

      const removal = deleteDrillById(saved.id);
      const rejection = expectRejection(
        updateDrill(saved.id, { name: 'Renamed' }, fakes(UPDATED_AT)),
        'NOT_FOUND',
      );
      await removal;
      await rejection;

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('keeps applying changes after one of them fails', async () => {
      const saved = await saveDrill(billDrill, fakes());
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('disk full'));

      const failed = expectRejection(
        updateDrill(saved.id, { name: 'Lost' }, fakes(UPDATED_AT)),
        'STORAGE_FAILURE',
      );
      const next = updateDrill(saved.id, { name: 'Kept' }, fakes(UPDATED_AT));
      await failed;

      expect((await next).name).toBe('Kept');
      expect((await loadDrillById(saved.id))?.name).toBe('Kept');
    });
  });
});
