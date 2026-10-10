import { useCallback, useState } from 'react';

import { Keyboard, StyleSheet, View } from 'react-native';

import type { Theme } from '@/theme/theme';
import {
  HANDLE_PREFIX,
  MAX_PROFILE_HANDLE_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  type AppearancePreference,
  type Profile,
  type ProfileChanges,
} from '@/types/profile';
import { Avatar } from '@components/Avatar';
import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { ListRow } from '@components/ListRow';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { TextField } from '@components/TextField';
import { Typography } from '@components/Typography';
import { useProfileOverview } from '@hooks/useProfileOverview';
import { useThemedStyles } from '@hooks/useTheme';
import { ProfileStorageError } from '@services/profileStorage';
import { pluralize } from '@utils/format';
import { profileHandleError, profileNameError } from '@utils/profile';

const AVATAR_SIZE = 84;

/** What the Appearance row says for each stored preference. */
const APPEARANCE_SUMMARY: Record<AppearancePreference, string> = {
  system: 'Follows your device setting',
  light: 'Light',
  dark: 'Dark',
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    identity: {
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.md,
    },
    editButton: {
      marginTop: theme.spacing.sm,
      minHeight: theme.spacing.xxl,
    },
    form: {
      gap: theme.spacing.md,
    },
    formActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    formButton: {
      flex: 1,
      minHeight: theme.spacing.xxl,
    },
    statsRow: {
      flexDirection: 'row',
      marginTop: theme.spacing.md,
      alignSelf: 'stretch',
    },
    stat: {
      flex: 1,
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },
    loading: {
      alignItems: 'center',
      paddingVertical: theme.spacing.xxl,
    },
  });

/**
 * Words for a failed save. The service's own message is written for a
 * developer, so the shooter is only told which kind of failure it was.
 */
const saveErrorMessage = (err: unknown): string =>
  err instanceof ProfileStorageError && err.code === 'INVALID_INPUT'
    ? 'That name or handle cannot be saved. Check them and try again.'
    : 'Could not save your profile. Try again.';

type StatProps = {
  count: number;
  /** Singular noun the count is of, e.g. `run`. */
  noun: string;
  testID: string;
};

/** One counter in the identity card, read out as a phrase ("3 runs"). */
const Stat = ({ count, noun, testID }: StatProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View
      style={styles.stat}
      accessible
      accessibilityLabel={pluralize(count, noun)}
    >
      <Typography variant="metric" testID={testID}>
        {String(count)}
      </Typography>
      <Typography variant="overline" color="textSecondary">
        {`${noun}s`.toUpperCase()}
      </Typography>
    </View>
  );
};

type ProfileEditorProps = {
  profile: Profile;
  /**
   * Store the changes. Resolves once they are saved; a rejection keeps
   * the form open with what was typed.
   */
  onSave: (changes: ProfileChanges) => Promise<void>;
  onCancel: () => void;
};

/** Name and handle form that takes the identity block's place. */
const ProfileEditor = ({ profile, onSave, onCancel }: ProfileEditorProps) => {
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState(profile.name ?? '');
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const nameError = profileNameError(name);
  const handleError = profileHandleError(handle);
  const canSave = !saving && nameError === null && handleError === null;

  const submit = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      // On success the screen closes the form, so there is no state left
      // to reset here.
      await onSave({ name, handle });
    } catch (err) {
      setSaveError(saveErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <View style={styles.form} testID="form-profile">
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Marty McFly"
        maxLength={MAX_PROFILE_NAME_LENGTH}
        autoCapitalize="words"
        editable={!saving}
        error={nameError}
        testID="input-profile-name"
      />
      <TextField
        label="Handle"
        value={handle}
        onChangeText={setHandle}
        placeholder={`${HANDLE_PREFIX}martymcfly`}
        maxLength={MAX_PROFILE_HANDLE_LENGTH + HANDLE_PREFIX.length}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
        error={handleError}
        testID="input-profile-handle"
      />

      {saveError ? (
        <Typography
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          testID="text-profile-save-error"
        >
          {saveError}
        </Typography>
      ) : null}

      <View style={styles.formActions}>
        <Button
          label="Cancel"
          variant="secondary"
          onPress={onCancel}
          disabled={saving}
          style={styles.formButton}
          testID="btn-cancel-profile"
        />
        <Button
          label={saving ? 'Saving…' : 'Save'}
          onPress={submit}
          disabled={!canSave}
          style={styles.formButton}
          testID="btn-save-profile"
        />
      </View>
    </View>
  );
};

/**
 * Who the shooter is on this device and how much they have recorded: the
 * local profile from `ProfileStorageService`, with run and drill counts
 * from session and drill storage. There is no account behind any of it.
 */
export const ProfileScreen = () => {
  const styles = useThemedStyles(createStyles);
  const { state, reload, saveProfile } = useProfileOverview();
  const [editing, setEditing] = useState(false);

  const closeEditor = useCallback(() => {
    Keyboard.dismiss();
    setEditing(false);
  }, []);

  const save = useCallback(
    async (changes: ProfileChanges) => {
      await saveProfile(changes);
      closeEditor();
    },
    [saveProfile, closeEditor],
  );

  if (state.status === 'loading') {
    return (
      <Screen title="Profile" scrollable testID="screen-profile">
        <Card>
          <View style={styles.loading}>
            <Typography
              variant="body"
              color="textSecondary"
              testID="text-profile-loading"
            >
              Loading your profile…
            </Typography>
          </View>
        </Card>
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen title="Profile" scrollable testID="screen-profile">
        <Card>
          <EmptyState
            icon="user"
            title="Could not load your profile"
            message="Something went wrong reading it from this device."
            actionLabel="Try again"
            onActionPress={reload}
            testID="state-profile-error"
          />
        </Card>
      </Screen>
    );
  }

  const { profile, runCount, drillCount } = state.overview;

  return (
    <Screen title="Profile" scrollable testID="screen-profile">
      <Card>
        {editing ? (
          <ProfileEditor
            profile={profile}
            onSave={save}
            onCancel={closeEditor}
          />
        ) : (
          <View style={styles.identity}>
            <Avatar name={profile.name ?? ''} size={AVATAR_SIZE} />
            <Typography
              variant="subtitle"
              color={profile.name ? 'textPrimary' : 'textSecondary'}
              align="center"
              testID="text-profile-name"
            >
              {profile.name ?? 'No name set'}
            </Typography>
            {profile.handle ? (
              <Typography
                variant="body"
                color="textTertiary"
                align="center"
                testID="text-profile-handle"
              >
                {profile.handle}
              </Typography>
            ) : null}
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => setEditing(true)}
              style={styles.editButton}
              testID="btn-edit-profile"
            />
          </View>
        )}

        <View style={styles.statsRow}>
          <Stat count={runCount} noun="run" testID="text-run-count" />
          <View style={styles.statDivider} />
          <Stat count={drillCount} noun="drill" testID="text-drill-count" />
        </View>
      </Card>

      <View>
        <SectionHeader title="Preferences" />
        <Card flush>
          <ListRow
            title="Appearance"
            subtitle={APPEARANCE_SUMMARY[profile.appearance]}
            testID="row-appearance"
          />
        </Card>
      </View>
    </Screen>
  );
};
