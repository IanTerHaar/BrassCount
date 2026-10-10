import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PROFILE_ID,
  PROFILE_NAMESPACE,
  PROFILE_SCHEMA_VERSION,
  PROFILE_STORAGE_VERSION,
  ProfileStorageError,
  ProfileStorageService,
  clearProfile,
  loadProfile,
  updateProfile,
  type ProfileStorageOptions,
} from '../src/services/profileStorage';
import { STORAGE_ROOT, StorageError } from '../src/services/storage';
import {
  APPEARANCE_PREFERENCES,
  DEFAULT_PROFILE,
  MAX_PROFILE_HANDLE_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  type Profile,
  type ProfileChanges,
} from '../src/types/profile';

const SAVED_AT = '2026-10-01T08:00:00.000Z';
const UPDATED_AT = '2026-10-02T09:30:00.000Z';

const PROFILE_KEY = `${STORAGE_ROOT}:profile:v1:local`;

const at = (timestamp: string = SAVED_AT): ProfileStorageOptions => ({
  getTimestamp: () => timestamp,
});

const marty: ProfileChanges = { name: 'Marty McFly', handle: '@martymcfly' };

const readStored = async (): Promise<unknown> => {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw === null ? null : JSON.parse(raw);
};

/** Write a raw value, bypassing the service, as an older build might. */
const writeStored = (value: unknown): Promise<void> =>
  AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(value));

const storedProfile = (overrides: Record<string, unknown> = {}): unknown => ({
  schemaVersion: PROFILE_SCHEMA_VERSION,
  profile: {
    name: 'Stored Name',
    handle: '@stored',
    appearance: 'dark',
    updatedAt: SAVED_AT,
    ...overrides,
  },
});

const expectRejection = async (
  promise: Promise<unknown>,
  code: ProfileStorageError['code'],
): Promise<ProfileStorageError> => {
  const error: unknown = await promise.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(ProfileStorageError);
  expect((error as ProfileStorageError).code).toBe(code);
  return error as ProfileStorageError;
};

describe('profileStorage service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes its namespace, versions and the service handle', () => {
    expect(PROFILE_NAMESPACE).toBe('profile');
    expect(PROFILE_STORAGE_VERSION).toBe('v1');
    expect(PROFILE_SCHEMA_VERSION).toBe(1);
    expect(PROFILE_ID).toBe('local');
    expect(ProfileStorageService).toEqual({
      namespace: 'profile',
      version: 'v1',
      schemaVersion: 1,
      load: loadProfile,
      update: updateProfile,
      clear: clearProfile,
    });
  });

  it('offers system, light and dark as the appearance choices', () => {
    expect(APPEARANCE_PREFERENCES).toEqual(['system', 'light', 'dark']);
  });

  describe('loading the profile', () => {
    it('resolves to the default profile when none has been saved', async () => {
      expect(await loadProfile()).toEqual({
        name: null,
        handle: null,
        appearance: 'system',
        updatedAt: null,
      });
    });

    it('does not write anything when it falls back to the default', async () => {
      await loadProfile();

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('hands out a copy of the default the caller is free to change', async () => {
      const profile = await loadProfile();

      expect(profile).not.toBe(DEFAULT_PROFILE);
      expect(Object.isFrozen(profile)).toBe(false);
    });

    it('returns the saved profile', async () => {
      const saved = await updateProfile(
        { ...marty, appearance: 'dark' },
        at(SAVED_AT),
      );

      expect(await loadProfile()).toEqual(saved);
    });

    it('resolves to the default profile when the stored value is corrupt JSON', async () => {
      await AsyncStorage.setItem(PROFILE_KEY, '{not json');

      expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
    });

    it.each<[string, unknown]>([
      ['a bare profile with no envelope', { name: 'Bare', handle: '@bare' }],
      ['an envelope with no profile', { schemaVersion: 1 }],
      [
        'an envelope whose profile is not an object',
        { schemaVersion: 1, profile: 'Marty McFly' },
      ],
      ['a list', [storedProfile()]],
      ['a string', 'profile'],
      ['null', null],
    ])('resolves to the default profile for %s', async (_case, value) => {
      await writeStored(value);

      expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
    });

    it('resolves to the default profile for a schema version it does not know', async () => {
      await writeStored({
        schemaVersion: PROFILE_SCHEMA_VERSION + 1,
        profile: { name: 'Future', handle: '@future', appearance: 'dark' },
      });

      expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
    });

    it('leaves a value it cannot read untouched in storage', async () => {
      const future = {
        schemaVersion: PROFILE_SCHEMA_VERSION + 1,
        profile: { name: 'Future', handle: '@future', appearance: 'dark' },
      };
      await writeStored(future);

      await loadProfile();

      expect(await readStored()).toEqual(future);
    });

    it('leaves a profile with a bad field untouched in storage', async () => {
      const stored = storedProfile({ appearance: 'sepia' });
      await writeStored(stored);

      await loadProfile();

      expect(await readStored()).toEqual(stored);
    });

    it('drops fields the model does not know', async () => {
      await writeStored(storedProfile({ email: 'marty@example.com' }));

      expect(await loadProfile()).toEqual({
        name: 'Stored Name',
        handle: '@stored',
        appearance: 'dark',
        updatedAt: SAVED_AT,
      });
    });

    it('wraps a storage failure, keeping the original as the cause', async () => {
      const cause = new Error('unavailable');
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(cause);

      const error = await expectRejection(loadProfile(), 'STORAGE_FAILURE');

      expect(error).toBeInstanceOf(StorageError);
      expect(error.name).toBe('ProfileStorageError');
      expect((error.cause as StorageError).cause).toBe(cause);
    });
  });

  describe('a stored field that fails validation', () => {
    it.each<[string, Record<string, unknown>, Partial<Profile>]>([
      ['a name that is not text', { name: 42 }, { name: null }],
      [
        'a name over the limit',
        { name: 'n'.repeat(MAX_PROFILE_NAME_LENGTH + 1) },
        { name: null },
      ],
      ['a handle that is not text', { handle: ['@x'] }, { handle: null }],
      ['a handle with a space', { handle: '@marty mcfly' }, { handle: null }],
      [
        'a handle over the limit',
        { handle: `@${'h'.repeat(MAX_PROFILE_HANDLE_LENGTH + 1)}` },
        { handle: null },
      ],
      [
        'an appearance that is not a choice',
        { appearance: 'sepia' },
        { appearance: 'system' },
      ],
      [
        'a missing appearance',
        { appearance: undefined },
        { appearance: 'system' },
      ],
      [
        'an unreadable timestamp',
        { updatedAt: 'yesterday' },
        { updatedAt: null },
      ],
    ])(
      'reads %s as its default and keeps the other fields',
      async (_case, overrides, expected) => {
        await writeStored(storedProfile(overrides));

        expect(await loadProfile()).toEqual({
          name: 'Stored Name',
          handle: '@stored',
          appearance: 'dark',
          updatedAt: SAVED_AT,
          ...expected,
        });
      },
    );

    it('normalises a stored handle that is missing its @', async () => {
      await writeStored(storedProfile({ handle: 'stored' }));

      expect((await loadProfile()).handle).toBe('@stored');
    });
  });

  describe('updating the profile', () => {
    it('creates the profile on the first update', async () => {
      const saved = await updateProfile(marty, at(SAVED_AT));

      expect(saved).toEqual({
        name: 'Marty McFly',
        handle: '@martymcfly',
        appearance: 'system',
        updatedAt: SAVED_AT,
      });
    });

    it('writes the profile inside a schemaVersion envelope under a versioned key', async () => {
      const saved = await updateProfile(marty, at(SAVED_AT));

      expect(await AsyncStorage.getAllKeys()).toEqual([PROFILE_KEY]);
      expect(await readStored()).toEqual({ schemaVersion: 1, profile: saved });
    });

    it('stamps an ISO timestamp by default', async () => {
      const saved = await updateProfile(marty);

      expect(saved.updatedAt).not.toBeNull();
      expect(saved.updatedAt).toBe(
        new Date(saved.updatedAt as string).toISOString(),
      );
    });

    it('keeps the fields an update leaves out', async () => {
      await updateProfile({ ...marty, appearance: 'dark' }, at(SAVED_AT));

      const updated = await updateProfile(
        { name: 'Doc Brown' },
        at(UPDATED_AT),
      );

      expect(updated).toEqual({
        name: 'Doc Brown',
        handle: '@martymcfly',
        appearance: 'dark',
        updatedAt: UPDATED_AT,
      });
      expect(await loadProfile()).toEqual(updated);
    });

    it.each(APPEARANCE_PREFERENCES)(
      'stores the %s appearance without touching the name or handle',
      async appearance => {
        await updateProfile({ ...marty, appearance: 'light' }, at(SAVED_AT));

        const updated = await updateProfile({ appearance }, at(UPDATED_AT));

        expect(updated).toEqual({
          name: 'Marty McFly',
          handle: '@martymcfly',
          appearance,
          updatedAt: UPDATED_AT,
        });
        expect(await loadProfile()).toEqual(updated);
      },
    );

    it('stores an appearance before any name has been set', async () => {
      const saved = await updateProfile({ appearance: 'dark' }, at(SAVED_AT));

      expect(saved).toEqual({
        name: null,
        handle: null,
        appearance: 'dark',
        updatedAt: SAVED_AT,
      });
    });

    it('trims the name', async () => {
      const saved = await updateProfile({ name: '  Marty McFly \n' }, at());

      expect(saved.name).toBe('Marty McFly');
    });

    it('puts a name with a line break or a run of spaces on one line', async () => {
      const saved = await updateProfile({ name: 'Marty\n\tMc   Fly' }, at());

      expect(saved.name).toBe('Marty Mc Fly');
    });

    it.each<[string, string]>([
      ['with its @', '@martymcfly'],
      ['without its @', 'martymcfly'],
      ['with surrounding spaces', '  @martymcfly  '],
    ])(
      'stores a handle given %s with a single leading @',
      async (_case, handle) => {
        const saved = await updateProfile({ handle }, at());

        expect(saved.handle).toBe('@martymcfly');
      },
    );

    it('keeps the case and the allowed punctuation of a handle', async () => {
      const saved = await updateProfile({ handle: 'Marty.Mc_Fly-85' }, at());

      expect(saved.handle).toBe('@Marty.Mc_Fly-85');
    });

    it.each<[string, ProfileChanges]>([
      ['null', { name: null, handle: null }],
      ['an empty string', { name: '', handle: '' }],
      ['whitespace', { name: '   ', handle: '  ' }],
    ])('clears the name and handle when given %s', async (_case, changes) => {
      await updateProfile({ ...marty, appearance: 'dark' }, at(SAVED_AT));

      const updated = await updateProfile(changes, at(UPDATED_AT));

      expect(updated).toEqual({
        name: null,
        handle: null,
        appearance: 'dark',
        updatedAt: UPDATED_AT,
      });
      expect(await loadProfile()).toEqual(updated);
    });

    it('clears the handle when given a lone @', async () => {
      await updateProfile(marty, at(SAVED_AT));

      const updated = await updateProfile({ handle: '@' }, at(UPDATED_AT));

      expect(updated.handle).toBeNull();
      expect(updated.name).toBe('Marty McFly');
    });

    it('stores only the known fields', async () => {
      const withExtra = { ...marty, email: 'marty@example.com' };

      const saved = await updateProfile(withExtra, at(SAVED_AT));

      expect(saved).toEqual({
        name: 'Marty McFly',
        handle: '@martymcfly',
        appearance: 'system',
        updatedAt: SAVED_AT,
      });
      expect(await readStored()).toEqual({ schemaVersion: 1, profile: saved });
    });

    it('does not mutate the changes it is given', async () => {
      const changes: ProfileChanges = { name: '  Marty  ', handle: 'marty' };
      const snapshot = { ...changes };

      await updateProfile(changes, at());

      expect(changes).toEqual(snapshot);
    });

    it('still stamps updatedAt when the update changes nothing', async () => {
      await updateProfile(marty, at(SAVED_AT));

      const updated = await updateProfile({}, at(UPDATED_AT));

      expect(updated).toEqual({
        name: 'Marty McFly',
        handle: '@martymcfly',
        appearance: 'system',
        updatedAt: UPDATED_AT,
      });
    });

    it.each<[string, string]>([
      ['corrupt JSON', '{not json'],
      ['a value with no envelope', JSON.stringify({ name: 'Bare' })],
      [
        'a schema version it does not know',
        JSON.stringify({ schemaVersion: 2, profile: { name: 'Future' } }),
      ],
    ])('replaces %s with the updated profile', async (_case, raw) => {
      await AsyncStorage.setItem(PROFILE_KEY, raw);

      const saved = await updateProfile({ appearance: 'light' }, at(SAVED_AT));

      expect(saved).toEqual({
        name: null,
        handle: null,
        appearance: 'light',
        updatedAt: SAVED_AT,
      });
      expect(await readStored()).toEqual({ schemaVersion: 1, profile: saved });
    });

    it('keeps the readable fields of a profile with one bad field', async () => {
      await writeStored(storedProfile({ appearance: 'sepia' }));

      const updated = await updateProfile(
        { name: 'Doc Brown' },
        at(UPDATED_AT),
      );

      expect(updated).toEqual({
        name: 'Doc Brown',
        handle: '@stored',
        appearance: 'system',
        updatedAt: UPDATED_AT,
      });
    });

    it('writes the default of a bad stored field back when another field is updated', async () => {
      await writeStored(
        storedProfile({ name: 'n'.repeat(MAX_PROFILE_NAME_LENGTH + 1) }),
      );

      const updated = await updateProfile(
        { appearance: 'light' },
        at(UPDATED_AT),
      );

      expect(updated).toEqual({
        name: null,
        handle: '@stored',
        appearance: 'light',
        updatedAt: UPDATED_AT,
      });
      expect(await readStored()).toEqual({
        schemaVersion: 1,
        profile: updated,
      });
    });

    it.each<[string, unknown]>([
      ['missing changes', null],
      ['changes that are not an object', 'Marty'],
      ['a list of changes', [marty]],
      ['a name that is not text', { name: 42 }],
      [
        'a name over the limit',
        { name: 'n'.repeat(MAX_PROFILE_NAME_LENGTH + 1) },
      ],
      ['a handle that is not text', { handle: 42 }],
      [
        'a handle over the limit',
        { handle: `@${'h'.repeat(MAX_PROFILE_HANDLE_LENGTH + 1)}` },
      ],
      ['a handle with a space', { handle: '@marty mcfly' }],
      ['a handle with a second @', { handle: '@@marty' }],
      ['a handle with an unsupported character', { handle: '@marty!' }],
      ['an appearance that is not a choice', { appearance: 'sepia' }],
      ['a null appearance', { appearance: null }],
    ])(
      'rejects %s and leaves the stored profile alone',
      async (_case, changes) => {
        const saved = await updateProfile(
          { ...marty, appearance: 'dark' },
          at(SAVED_AT),
        );

        await expectRejection(
          updateProfile(changes as ProfileChanges, at(UPDATED_AT)),
          'INVALID_INPUT',
        );

        expect(await loadProfile()).toEqual(saved);
      },
    );

    it('does not create a profile when the first update is rejected', async () => {
      await expectRejection(
        updateProfile({ handle: 'not a handle' }, at()),
        'INVALID_INPUT',
      );

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('wraps a write failure and leaves the stored profile alone', async () => {
      const saved = await updateProfile(marty, at(SAVED_AT));
      const cause = new Error('disk full');
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(cause);

      const error = await expectRejection(
        updateProfile({ name: 'Lost' }, at(UPDATED_AT)),
        'STORAGE_FAILURE',
      );

      expect((error.cause as StorageError).cause).toBe(cause);
      expect(await loadProfile()).toEqual(saved);
    });

    it('wraps a failure to read the profile being updated', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('unavailable'));

      await expectRejection(
        updateProfile({ name: 'Marty' }, at()),
        'STORAGE_FAILURE',
      );

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });
  });

  describe('limits', () => {
    it('accepts a name and a handle that sit exactly on their limits', async () => {
      const name = 'n'.repeat(MAX_PROFILE_NAME_LENGTH);
      const handle = `@${'h'.repeat(MAX_PROFILE_HANDLE_LENGTH)}`;

      const saved = await updateProfile({ name, handle }, at());

      expect(saved.name).toBe(name);
      expect(saved.handle).toBe(handle);
      expect(await loadProfile()).toEqual(saved);
    });

    it('measures the name after trimming it', async () => {
      const name = 'n'.repeat(MAX_PROFILE_NAME_LENGTH);

      const saved = await updateProfile({ name: `  ${name}  ` }, at());

      expect(saved.name).toBe(name);
    });

    it('does not count the @ towards the handle limit', async () => {
      const body = 'h'.repeat(MAX_PROFILE_HANDLE_LENGTH);

      const saved = await updateProfile({ handle: body }, at());

      expect(saved.handle).toBe(`@${body}`);
    });
  });

  describe('clearing the profile', () => {
    it('removes the stored profile so the next load is the default', async () => {
      await updateProfile({ ...marty, appearance: 'dark' }, at());

      await clearProfile();

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
      expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
    });

    it('is a no-op when nothing is stored', async () => {
      await expect(clearProfile()).resolves.toBeUndefined();
    });

    it('leaves other namespaces alone', async () => {
      const otherKey = `${STORAGE_ROOT}:drills:v1:keep-me`;
      await AsyncStorage.setItem(otherKey, '{}');
      await updateProfile(marty, at());

      await clearProfile();

      expect(await AsyncStorage.getAllKeys()).toEqual([otherKey]);
    });

    it('wraps a storage failure', async () => {
      jest
        .spyOn(AsyncStorage, 'removeItem')
        .mockRejectedValueOnce(new Error('unavailable'));

      await expectRejection(clearProfile(), 'STORAGE_FAILURE');
    });
  });

  describe('overlapping changes', () => {
    it('applies both of two overlapping updates', async () => {
      await updateProfile(marty, at(SAVED_AT));

      const [, last] = await Promise.all([
        updateProfile({ name: 'Doc Brown' }, at(UPDATED_AT)),
        updateProfile({ appearance: 'dark' }, at(UPDATED_AT)),
      ]);

      const stored = await loadProfile();
      expect(stored).toEqual({
        name: 'Doc Brown',
        handle: '@martymcfly',
        appearance: 'dark',
        updatedAt: UPDATED_AT,
      });
      expect(stored).toEqual(last);
    });

    it('applies overlapping updates made before any profile is stored', async () => {
      await Promise.all([
        updateProfile({ name: 'Marty McFly' }, at()),
        updateProfile({ handle: 'martymcfly' }, at()),
        updateProfile({ appearance: 'light' }, at()),
      ]);

      expect(await loadProfile()).toEqual({
        name: 'Marty McFly',
        handle: '@martymcfly',
        appearance: 'light',
        updatedAt: SAVED_AT,
      });
    });

    it('lets the later of two overlapping updates to one field win', async () => {
      await Promise.all([
        updateProfile({ appearance: 'light' }, at()),
        updateProfile({ appearance: 'dark' }, at()),
      ]);

      expect((await loadProfile()).appearance).toBe('dark');
    });

    it('starts from the default when an update follows a clear', async () => {
      await updateProfile({ ...marty, appearance: 'dark' }, at(SAVED_AT));

      const [, updated] = await Promise.all([
        clearProfile(),
        updateProfile({ name: 'Doc Brown' }, at(UPDATED_AT)),
      ]);

      expect(updated).toEqual({
        name: 'Doc Brown',
        handle: null,
        appearance: 'system',
        updatedAt: UPDATED_AT,
      });
    });

    it('does not restore a profile cleared while an update was in flight', async () => {
      await updateProfile(marty, at(SAVED_AT));

      await Promise.all([
        updateProfile({ name: 'Doc Brown' }, at(UPDATED_AT)),
        clearProfile(),
      ]);

      expect(await AsyncStorage.getAllKeys()).toEqual([]);
    });

    it('keeps applying changes after one of them fails', async () => {
      await updateProfile(marty, at(SAVED_AT));
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('disk full'));

      const failed = expectRejection(
        updateProfile({ name: 'Lost' }, at(UPDATED_AT)),
        'STORAGE_FAILURE',
      );
      const next = updateProfile({ name: 'Kept' }, at(UPDATED_AT));
      await failed;

      expect((await next).name).toBe('Kept');
      expect((await loadProfile()).name).toBe('Kept');
    });

    it('keeps applying changes after a clear fails', async () => {
      await updateProfile(marty, at(SAVED_AT));
      jest
        .spyOn(AsyncStorage, 'removeItem')
        .mockRejectedValueOnce(new Error('unavailable'));

      const failed = expectRejection(clearProfile(), 'STORAGE_FAILURE');
      const next = updateProfile({ appearance: 'dark' }, at(UPDATED_AT));
      await failed;

      expect(await next).toEqual({
        name: 'Marty McFly',
        handle: '@martymcfly',
        appearance: 'dark',
        updatedAt: UPDATED_AT,
      });
    });
  });
});
