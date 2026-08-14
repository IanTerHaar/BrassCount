import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin, typed wrapper around AsyncStorage.
 *
 * All persistent data in the app should flow through this module (either
 * directly or via a higher-level domain service) so that we get a single
 * chokepoint for:
 *   - key namespacing / collision safety across features,
 *   - JSON (de)serialization with typed results,
 *   - defensive error handling that never throws raw AsyncStorage errors
 *     into UI code,
 *   - future concerns such as encryption, migrations, or swapping the
 *     underlying storage engine (MMKV, SQLite, etc.).
 *
 * Higher-level services (e.g. SessionStorageService) should build on top
 * of `createStorageNamespace` rather than talking to AsyncStorage directly.
 */

/** Root prefix applied to every key managed by this module. */
export const STORAGE_ROOT = '@BrassCount';

/** Delimiter used to join key segments. */
export const STORAGE_KEY_DELIMITER = ':';

/**
 * Error thrown by the storage layer. Callers can catch this to distinguish
 * storage failures from other runtime errors.
 */
export class StorageError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

/**
 * Build a fully-qualified AsyncStorage key from any number of segments.
 * Keys look like `@BrassCount:sessions:v1:<id>`.
 */
export function buildKey(...segments: Array<string | number>): string {
  return [STORAGE_ROOT, ...segments.map(String)].join(STORAGE_KEY_DELIMITER);
}

/**
 * Options controlling how a namespace is stored.
 *
 * `version` is embedded in the key so we can ship future migrations without
 * touching existing data. Bumping the version effectively starts a fresh
 * bucket and lets a migration read from the previous version key.
 */
export interface StorageNamespaceOptions {
  /** Feature name, e.g. `sessions`. */
  name: string;
  /** Schema version for this namespace. Defaults to `v1`. */
  version?: string;
}

/**
 * A typed handle to a logical collection of items stored in AsyncStorage.
 *
 * A namespace exposes CRUD-style helpers scoped to its own key prefix so
 * different features cannot accidentally read or overwrite each other's
 * data.
 */
export interface StorageNamespace<T> {
  /** Fully-qualified key prefix used by this namespace. */
  readonly prefix: string;

  /** Build the storage key for an item with the given id. */
  keyFor(id: string): string;

  /** Persist an item under `id`, serializing to JSON. */
  setItem(id: string, value: T): Promise<void>;

  /**
   * Read the item stored under `id`. Returns `null` when the item does not
   * exist or when its stored value cannot be parsed as JSON.
   */
  getItem(id: string): Promise<T | null>;

  /** Remove the item stored under `id`. No-op if the id is unknown. */
  removeItem(id: string): Promise<void>;

  /** List every id currently stored in this namespace. */
  getAllIds(): Promise<string[]>;

  /** Read every item currently stored in this namespace. */
  getAll(): Promise<T[]>;

  /** Remove every item currently stored in this namespace. */
  clear(): Promise<void>;
}

/**
 * Create a typed namespace for storing homogeneous items.
 *
 * Example:
 *   const sessions = createStorageNamespace<Session>({ name: 'sessions' });
 *   await sessions.setItem(session.id, session);
 */
export function createStorageNamespace<T>(
  options: StorageNamespaceOptions,
): StorageNamespace<T> {
  const { name, version = 'v1' } = options;

  if (!name) {
    throw new StorageError('createStorageNamespace requires a non-empty name');
  }

  const prefix = buildKey(name, version);
  const idPrefix = `${prefix}${STORAGE_KEY_DELIMITER}`;

  const keyFor = (id: string): string => {
    if (!id) {
      throw new StorageError(`Missing id for namespace "${name}"`);
    }
    return `${idPrefix}${id}`;
  };

  const setItem = async (id: string, value: T): Promise<void> => {
    const key = keyFor(id);
    let payload: string;
    try {
      payload = JSON.stringify(value);
    } catch (err) {
      throw new StorageError(`Failed to serialize value for key "${key}"`, err);
    }

    try {
      await AsyncStorage.setItem(key, payload);
    } catch (err) {
      throw new StorageError(`Failed to write key "${key}"`, err);
    }
  };

  const getItem = async (id: string): Promise<T | null> => {
    const key = keyFor(id);
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(key);
    } catch (err) {
      throw new StorageError(`Failed to read key "${key}"`, err);
    }

    if (raw == null) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const removeItem = async (id: string): Promise<void> => {
    const key = keyFor(id);
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      throw new StorageError(`Failed to remove key "${key}"`, err);
    }
  };

  const getAllKeys = async (): Promise<string[]> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys.filter((key: string) => key.startsWith(idPrefix));
    } catch (err) {
      throw new StorageError(
        `Failed to enumerate keys for namespace "${name}"`,
        err,
      );
    }
  };

  const getAllIds = async (): Promise<string[]> => {
    const keys = await getAllKeys();
    return keys.map(key => key.slice(idPrefix.length));
  };

  const getAll = async (): Promise<T[]> => {
    const keys = await getAllKeys();
    if (keys.length === 0) {
      return [];
    }

    let entries: Record<string, string | null>;
    try {
      entries = await AsyncStorage.getMany(keys);
    } catch (err) {
      throw new StorageError(
        `Failed to read items for namespace "${name}"`,
        err,
      );
    }

    const items: T[] = [];
    for (const value of Object.values(entries)) {
      if (value == null) {
        continue;
      }
      try {
        items.push(JSON.parse(value) as T);
      } catch {
        // Skip corrupt entries rather than failing the whole read.
      }
    }
    return items;
  };

  const clear = async (): Promise<void> => {
    const keys = await getAllKeys();
    if (keys.length === 0) {
      return;
    }
    try {
      await AsyncStorage.removeMany(keys);
    } catch (err) {
      throw new StorageError(`Failed to clear namespace "${name}"`, err);
    }
  };

  return {
    prefix,
    keyFor,
    setItem,
    getItem,
    removeItem,
    getAllIds,
    getAll,
    clear,
  };
}
