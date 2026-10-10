/**
 * Domain model for the local profile: who the Profile screen says the
 * shooter is, and how they want the app to look. There is one profile per
 * install and no account behind it. Persistence is handled by
 * `ProfileStorageService`, which also normalises the name and handle and
 * stamps `updatedAt` — callers hand it a `ProfileChanges`.
 */

/**
 * Every Appearance choice, in the order a picker lists them. `system`
 * follows the device's light / dark setting; the other two pin the theme.
 */
export const APPEARANCE_PREFERENCES = ['system', 'light', 'dark'] as const;

export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

/** Character every stored handle starts with. */
export const HANDLE_PREFIX = '@';

/**
 * What may follow the `@` of a handle. Shared by the storage service,
 * which rejects anything else, and the Profile editor, which says so
 * before a save is attempted.
 */
export const HANDLE_BODY_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Upper bounds on what a profile may hold. The storage service enforces
 * them on every save and read, so a name or handle always fits the Profile
 * header; an editor should offer no more than these allow.
 *
 * Raising a limit is safe. Lowering one makes every stored value over the
 * new limit read back as unset, so it needs a migration, not just a
 * smaller number here.
 */
/**
 * Longest a display name may be once trimmed and its inner whitespace
 * collapsed, in characters.
 */
export const MAX_PROFILE_NAME_LENGTH = 40;
/** Longest a handle may be, in characters, not counting the `@`. */
export const MAX_PROFILE_HANDLE_LENGTH = 30;

export interface Profile {
  /** Display name, e.g. `Marty McFly`. `null` until the shooter sets one. */
  name: string | null;
  /**
   * Handle, always with its leading `@`, e.g. `@martymcfly`: letters,
   * digits, `.`, `_` and `-` after the `@`. `null` until the shooter sets
   * one.
   */
  handle: string | null;
  /** Which theme the app should use. */
  appearance: AppearancePreference;
  /**
   * ISO-8601 timestamp of the last change to the profile. `null` when the
   * profile has never been saved.
   */
  updatedAt: string | null;
}

/** The profile of an install that has not saved one yet. */
export const DEFAULT_PROFILE: Readonly<Profile> = Object.freeze({
  name: null,
  handle: null,
  appearance: 'system',
  updatedAt: null,
});

/**
 * Fields that can be changed on the profile; omitted ones are kept. Pass
 * `null` — or a blank string, which is what an emptied text field holds —
 * to clear the name or the handle. The handle may be given with or
 * without its `@`.
 */
export interface ProfileChanges {
  name?: string | null;
  handle?: string | null;
  appearance?: AppearancePreference;
}
