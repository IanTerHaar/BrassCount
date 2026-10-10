import AsyncStorage from '@react-native-async-storage/async-storage';

import { updateProfile } from '../src/services/profileStorage';
import {
  MAX_PROFILE_HANDLE_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
} from '../src/types/profile';
import { profileHandleError, profileNameError } from '../src/utils/profile';

/** Whether the storage service takes the value, as the editor's Save would. */
const serviceAccepts = (
  changes: Parameters<typeof updateProfile>[0],
): Promise<boolean> =>
  updateProfile(changes).then(
    () => true,
    () => false,
  );

describe('profile field checks', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('name', () => {
    it('accepts an ordinary name', () => {
      expect(profileNameError('Marty McFly')).toBeNull();
    });

    it('accepts a blank name, which clears the stored one', () => {
      expect(profileNameError('')).toBeNull();
      expect(profileNameError('   ')).toBeNull();
    });

    it('accepts a name exactly at the limit', () => {
      expect(profileNameError('a'.repeat(MAX_PROFILE_NAME_LENGTH))).toBeNull();
    });

    it('rejects a name over the limit, naming the limit', () => {
      const error = profileNameError('a'.repeat(MAX_PROFILE_NAME_LENGTH + 1));

      expect(error).toContain(String(MAX_PROFILE_NAME_LENGTH));
    });

    it('measures the name as it will be stored, not as it was typed', () => {
      const padded = `  ${'a'.repeat(20)}    ${'b'.repeat(19)}  `;

      expect(padded.length).toBeGreaterThan(MAX_PROFILE_NAME_LENGTH);
      expect(profileNameError(padded)).toBeNull();
    });
  });

  describe('handle', () => {
    it('accepts a handle with or without its @', () => {
      expect(profileHandleError('@martymcfly')).toBeNull();
      expect(profileHandleError('martymcfly')).toBeNull();
    });

    it('accepts dots, underscores and hyphens', () => {
      expect(profileHandleError('@marty.mc_fly-85')).toBeNull();
    });

    it('accepts a blank handle or a lone @, which clear the stored one', () => {
      expect(profileHandleError('')).toBeNull();
      expect(profileHandleError('  ')).toBeNull();
      expect(profileHandleError('@')).toBeNull();
    });

    it('does not count the @ towards the limit', () => {
      const body = 'a'.repeat(MAX_PROFILE_HANDLE_LENGTH);

      expect(profileHandleError(`@${body}`)).toBeNull();
      expect(profileHandleError(body)).toBeNull();
    });

    it('rejects a handle over the limit, naming the limit', () => {
      const error = profileHandleError(
        'a'.repeat(MAX_PROFILE_HANDLE_LENGTH + 1),
      );

      expect(error).toContain(String(MAX_PROFILE_HANDLE_LENGTH));
    });

    it('rejects characters a handle cannot use', () => {
      expect(profileHandleError('@marty mcfly')).not.toBeNull();
      expect(profileHandleError('@marty!')).not.toBeNull();
      expect(profileHandleError('@@marty')).not.toBeNull();
      expect(profileHandleError('@márty')).not.toBeNull();
    });
  });

  // The editor only lets a save through when these checks pass, and the
  // service has the final say. If the two ever disagree, the shooter gets
  // either a blocked valid value or a generic "cannot be saved".
  describe('agreement with the storage service', () => {
    const names = [
      '',
      '   ',
      'Marty McFly',
      '  Marty \t McFly  ',
      'a'.repeat(MAX_PROFILE_NAME_LENGTH),
      'a'.repeat(MAX_PROFILE_NAME_LENGTH + 1),
      `${'a'.repeat(MAX_PROFILE_NAME_LENGTH)}   `,
    ];

    it.each(names)('agrees on the name %j', async name => {
      expect(profileNameError(name) === null).toBe(
        await serviceAccepts({ name }),
      );
    });

    const handles = [
      '',
      '@',
      ' @marty ',
      'marty',
      '@marty.mc_fly-85',
      '@@marty',
      '@marty mcfly',
      '@marty!',
      'márty',
      'a'.repeat(MAX_PROFILE_HANDLE_LENGTH),
      `@${'a'.repeat(MAX_PROFILE_HANDLE_LENGTH)}`,
      'a'.repeat(MAX_PROFILE_HANDLE_LENGTH + 1),
    ];

    it.each(handles)('agrees on the handle %j', async handle => {
      expect(profileHandleError(handle) === null).toBe(
        await serviceAccepts({ handle }),
      );
    });
  });
});
