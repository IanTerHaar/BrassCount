import {
  APPEARANCE_PREFERENCES,
  DEFAULT_PROFILE,
  HANDLE_BODY_PATTERN,
  HANDLE_PREFIX,
  MAX_PROFILE_HANDLE_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  type AppearancePreference,
  type Profile,
  type ProfileChanges,
} from '@/types/profile';
import { isRecord, isTimestamp } from '@utils/guards';
import { createSerialQueue } from '@utils/serialQueue';
import { getTimestamp as defaultGetTimestamp } from '@utils/timestamp';

import { createStorageNamespace, StorageError } from './storage';

/**
 * ProfileStorageService
 * ---------------------
 * Local persistence layer for the profile: the display name and handle the
 * Profile screen shows, and the Appearance preference the theme follows.
 * There is no account behind it — the profile lives on this device only.
 *
 * Design notes:
 *   - An install has exactly one profile, stored under one key
 *     (`@BrassCount:profile:v1:local`).
 *   - The stored value is an envelope, `{ schemaVersion, profile }`. When
 *     the `Profile` shape changes, bump `PROFILE_SCHEMA_VERSION` and
 *     upgrade older envelopes in `parseStoredProfile` — the existing
 *     profile is migrated in place rather than abandoned under an old key.
 *   - A profile always exists as far as callers are concerned: until one
 *     is saved, `loadProfile` resolves to `DEFAULT_PROFILE` (no name, no
 *     handle, Appearance following the device).
 *   - Anything read back from storage is untrusted and checked field by
 *     field. Unlike a drill or a session, a field that fails falls back to
 *     its default on its own instead of discarding the whole value, so a
 *     name that no longer passes cannot also reset the theme.
 *   - A name or handle is bounded (`MAX_PROFILE_NAME_LENGTH`,
 *     `MAX_PROFILE_HANDLE_LENGTH`) on save and on read alike.
 *   - Updates and clears run one at a time, in the order they were
 *     requested, so a name saved while Appearance is being switched cannot
 *     undo it.
 *   - Every failure surfaces as `ProfileStorageError`, which is also a
 *     `StorageError`, so UI code can catch either.
 */

export const PROFILE_NAMESPACE = 'profile';
export const PROFILE_STORAGE_VERSION = 'v1';
/** Version of the `Profile` shape written inside the stored envelope. */
export const PROFILE_SCHEMA_VERSION = 1;
/** Id the one profile of this install is stored under. */
export const PROFILE_ID = 'local';

/**
 * Why a profile operation failed: the caller passed something unusable, or
 * the device storage itself failed.
 */
export type ProfileStorageErrorCode = 'INVALID_INPUT' | 'STORAGE_FAILURE';

/**
 * Error thrown by this service. Branch on `code` to tell a rejected edit
 * from a storage failure; the underlying error, if any, is on `cause`.
 */
export class ProfileStorageError extends StorageError {
  readonly code: ProfileStorageErrorCode;

  constructor(message: string, code: ProfileStorageErrorCode, cause?: unknown) {
    super(message, cause);
    this.name = 'ProfileStorageError';
    this.code = code;
  }
}

export interface ProfileStorageOptions {
  /** Source of the ISO-8601 timestamp stamped on the profile. */
  getTimestamp?: () => string;
}

/** What is actually written under the profile's key. */
interface StoredProfile {
  schemaVersion: number;
  profile: Profile;
}

// Typed `unknown` on purpose: the storage layer only promises valid JSON,
// so every read goes through `parseStoredProfile` before it is a `Profile`.
const profiles = createStorageNamespace<unknown>({
  name: PROFILE_NAMESPACE,
  version: PROFILE_STORAGE_VERSION,
});

const invalid = (message: string): ProfileStorageError =>
  new ProfileStorageError(message, 'INVALID_INPUT');

const isAppearancePreference = (
  value: unknown,
): value is AppearancePreference =>
  APPEARANCE_PREFERENCES.some(preference => preference === value);

/**
 * Bring a name to its stored form: trimmed, with every run of whitespace
 * (a pasted tab or line break included) reduced to one space, so it always
 * sits on a single line. `null` and a blank name both mean "no name".
 */
const normalizeName = (name: unknown): string | null => {
  if (name === null) {
    return null;
  }
  if (typeof name !== 'string') {
    throw invalid('A profile name must be text');
  }
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_PROFILE_NAME_LENGTH) {
    throw invalid(
      `A profile name can be at most ${MAX_PROFILE_NAME_LENGTH} characters`,
    );
  }
  return trimmed;
};

/**
 * Bring a handle to its stored form: trimmed, with exactly one leading
 * `@` whether or not the caller typed it. `null`, a blank handle and a
 * lone `@` all mean "no handle".
 */
const normalizeHandle = (handle: unknown): string | null => {
  if (handle === null) {
    return null;
  }
  if (typeof handle !== 'string') {
    throw invalid('A profile handle must be text');
  }
  const trimmed = handle.trim();
  const body = trimmed.startsWith(HANDLE_PREFIX)
    ? trimmed.slice(HANDLE_PREFIX.length)
    : trimmed;
  if (body.length === 0) {
    return null;
  }
  if (body.length > MAX_PROFILE_HANDLE_LENGTH) {
    throw invalid(
      `A profile handle can be at most ${MAX_PROFILE_HANDLE_LENGTH} characters`,
    );
  }
  if (!HANDLE_BODY_PATTERN.test(body)) {
    throw invalid(
      'A profile handle can only use letters, digits, ".", "_" and "-"',
    );
  }
  return `${HANDLE_PREFIX}${body}`;
};

/**
 * Read one stored field through the check a save applies, falling back to
 * `fallback` when it does not pass.
 */
const readField = <T>(normalize: () => T, fallback: T): T => {
  try {
    return normalize();
  } catch (err) {
    // A stored field that fails validation reads as unset, the same way
    // the storage layer treats corrupt JSON as missing, so one bad field
    // cannot take the rest of the profile with it.
    if (err instanceof ProfileStorageError) {
      return fallback;
    }
    throw err;
  }
};

/**
 * Turn a value read from storage back into a `Profile`, or `null` when
 * nothing in it can be trusted: not an envelope, or a schema version this
 * build does not know.
 */
const parseStoredProfile = (stored: unknown): Profile | null => {
  if (!isRecord(stored) || !isRecord(stored.profile)) {
    return null;
  }
  // Only one schema exists so far. When version 2 lands, upgrade older
  // envelopes here before the checks below.
  if (stored.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    return null;
  }

  const { name, handle, appearance, updatedAt } = stored.profile;
  return {
    name: readField(() => normalizeName(name), DEFAULT_PROFILE.name),
    handle: readField(() => normalizeHandle(handle), DEFAULT_PROFILE.handle),
    appearance: isAppearancePreference(appearance)
      ? appearance
      : DEFAULT_PROFILE.appearance,
    updatedAt: isTimestamp(updatedAt) ? updatedAt : DEFAULT_PROFILE.updatedAt,
  };
};

/** Run a storage call, rethrowing its failure as a `ProfileStorageError`. */
const withStorage = async <T>(
  action: string,
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    throw new ProfileStorageError(
      `Failed to ${action}`,
      'STORAGE_FAILURE',
      err,
    );
  }
};

// Queue of changes to the stored profile. `updateProfile` reads the
// profile and then writes it back, so two overlapping updates (a name
// being saved while Appearance is switched) could otherwise each write
// back the other's old value. Running every change one after another
// closes that gap.
const inOrder = createSerialQueue();

/**
 * Load the profile of this install.
 *
 * Always resolves to a `Profile`: `DEFAULT_PROFILE` when none has been
 * saved or the stored value is corrupt, and the default for any single
 * field that fails validation.
 */
export async function loadProfile(): Promise<Profile> {
  const stored = await withStorage('load profile', () =>
    profiles.getItem(PROFILE_ID),
  );
  return parseStoredProfile(stored) ?? { ...DEFAULT_PROFILE };
}

/**
 * Change the name, handle and/or Appearance preference.
 *
 * Fields left out of `changes` keep their stored value, and `updatedAt` is
 * set to now. The name is trimmed and its inner whitespace collapsed; the
 * handle is trimmed and stored with a leading `@` whether or not one was
 * passed. `null` or a blank string clears the name or the handle.
 *
 * "Their stored value" is the value `loadProfile` reads: a stored field
 * that no longer passes validation has already fallen back to its default
 * there, and any update writes that default back for good.
 *
 * The first update creates the stored profile. One made over a value this
 * build cannot read (corrupt, or written by a newer schema) replaces it:
 * with a single profile per install, refusing would leave the shooter
 * unable to save one at all.
 *
 * Updates run one at a time, in the order they were requested, so two
 * overlapping updates both apply.
 *
 * Returns the stored `Profile` so callers can update local state without a
 * follow-up read. Rejects with `INVALID_INPUT` when the name is longer
 * than `MAX_PROFILE_NAME_LENGTH`, the handle is longer than
 * `MAX_PROFILE_HANDLE_LENGTH` or uses anything but letters, digits, `.`,
 * `_` and `-`, or the appearance is not one of `APPEARANCE_PREFERENCES`.
 */
export async function updateProfile(
  changes: ProfileChanges,
  options: ProfileStorageOptions = {},
): Promise<Profile> {
  const { getTimestamp = defaultGetTimestamp } = options;

  if (!isRecord(changes)) {
    throw invalid('updateProfile requires the changes to apply');
  }
  // Validate before touching storage so a bad edit fails fast.
  const name =
    changes.name === undefined ? undefined : normalizeName(changes.name);
  const handle =
    changes.handle === undefined ? undefined : normalizeHandle(changes.handle);
  const { appearance } = changes;
  if (appearance !== undefined && !isAppearancePreference(appearance)) {
    throw invalid(
      `Appearance must be one of: ${APPEARANCE_PREFERENCES.join(', ')}`,
    );
  }

  return inOrder(async () => {
    const existing = await loadProfile();

    // `null` is a real value here (it clears the field), so only
    // `undefined` means "keep what is stored".
    const profile: Profile = {
      name: name === undefined ? existing.name : name,
      handle: handle === undefined ? existing.handle : handle,
      appearance: appearance ?? existing.appearance,
      updatedAt: getTimestamp(),
    };

    const stored: StoredProfile = {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      profile,
    };
    await withStorage('update profile', () =>
      profiles.setItem(PROFILE_ID, stored),
    );
    return profile;
  });
}

/**
 * Remove the stored profile, so the next load resolves to
 * `DEFAULT_PROFILE`. For "reset app data" flows and tests. Idempotent.
 */
export async function clearProfile(): Promise<void> {
  await inOrder(() =>
    withStorage('clear profile', () => profiles.removeItem(PROFILE_ID)),
  );
}

/** Object-form export for callers that prefer a service handle. */
export const ProfileStorageService = {
  namespace: PROFILE_NAMESPACE,
  version: PROFILE_STORAGE_VERSION,
  schemaVersion: PROFILE_SCHEMA_VERSION,
  load: loadProfile,
  update: updateProfile,
  clear: clearProfile,
};

export type ProfileStorageServiceType = typeof ProfileStorageService;
