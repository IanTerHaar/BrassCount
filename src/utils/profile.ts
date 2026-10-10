import {
  HANDLE_BODY_PATTERN,
  HANDLE_PREFIX,
  MAX_PROFILE_HANDLE_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
} from '@/types/profile';

/**
 * Checks for the Profile editor's text fields. Pure functions, no side
 * effects — each returns the message to show under the field, or `null`
 * when `ProfileStorageService` would accept what was typed. The service
 * still enforces the same rules on save; these exist so the shooter is
 * told which field is wrong, in words written for them.
 */

/**
 * Why a typed display name cannot be saved, or `null` when it can. A blank
 * name is fine: it clears the stored one.
 */
export const profileNameError = (name: string): string | null => {
  // Measured the way the service stores it: trimmed, inner runs of
  // whitespace collapsed to one space.
  const stored = name.trim().replace(/\s+/g, ' ');
  return stored.length > MAX_PROFILE_NAME_LENGTH
    ? `Use ${MAX_PROFILE_NAME_LENGTH} characters or fewer`
    : null;
};

/**
 * Why a typed handle cannot be saved, or `null` when it can. The leading
 * `@` is optional, and a blank handle (or a lone `@`) is fine: it clears
 * the stored one.
 */
export const profileHandleError = (handle: string): string | null => {
  const trimmed = handle.trim();
  const body = trimmed.startsWith(HANDLE_PREFIX)
    ? trimmed.slice(HANDLE_PREFIX.length)
    : trimmed;
  if (body.length === 0) {
    return null;
  }
  if (body.length > MAX_PROFILE_HANDLE_LENGTH) {
    return `Use ${MAX_PROFILE_HANDLE_LENGTH} characters or fewer after the ${HANDLE_PREFIX}`;
  }
  if (!HANDLE_BODY_PATTERN.test(body)) {
    return 'Use only letters, digits, ".", "_" and "-"';
  }
  return null;
};
