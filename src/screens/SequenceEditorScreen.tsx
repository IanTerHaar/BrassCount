import type { Theme } from '@constants/theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { Icon } from '@components/Icon';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Select } from '@components/Select';
import { TextField } from '@components/TextField';
import { Typography } from '@components/Typography';
import {
  previewSequences,
  sequenceActionLabel,
  sequenceActionOptions,
  type SequenceAction,
} from '@constants/previewData';
import { useThemedStyles } from '@hooks/useTheme';
import { pluralize } from '@utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EditorRoute = RouteProp<RootStackParamList, 'SequenceEditor'>;

const DEFAULT_ACTION: SequenceAction = 'shot';

/**
 * Numbers repeated actions the way a shooter would call them — the second
 * `shot` in a string reads "Shot 2", not "Shot".
 */
const labelForStep = (steps: SequenceAction[], position: number): string => {
  const action = steps[position];
  const total = steps.filter(step => step === action).length;

  if (total < 2) {
    return sequenceActionLabel(action);
  }

  const ordinal = steps
    .slice(0, position + 1)
    .filter(step => step === action).length;

  return `${sequenceActionLabel(action)} ${ordinal}`;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
    },
    stepDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    badge: {
      width: 26,
      height: 26,
      borderRadius: theme.radius.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    stepSelect: { flex: 1 },
    removeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      // Rotating the plus gives a cross without a second glyph.
      transform: [{ rotate: '45deg' }],
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
    },
    emptyRow: {
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.md,
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    summary: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    footer: { gap: theme.spacing.sm },
  });

export const SequenceEditorScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const route = useRoute<EditorRoute>();

  const existing = previewSequences.find(item => item.id === route.params?.id);

  const [name, setName] = useState(existing?.name ?? '');
  const [steps, setSteps] = useState<SequenceAction[]>(existing?.steps ?? []);

  const addStep = () => setSteps(prev => [...prev, DEFAULT_ACTION]);

  const removeStep = (position: number) =>
    setSteps(prev => prev.filter((_, i) => i !== position));

  const changeStep = (position: number, next: SequenceAction) =>
    setSteps(prev => prev.map((step, i) => (i === position ? next : step)));

  const shotCount = steps.filter(step => step === 'shot').length;
  const canSave = name.trim().length > 0 && steps.length > 0;

  return (
    <Screen
      title={existing ? 'Edit sequence' : 'New sequence'}
      onBack={navigation.goBack}
      subtitle={
        steps.length
          ? `${pluralize(steps.length, 'step')} · ${shotCount} shots`
          : 'Name it, then add the actions in order'
      }
      scrollable
      testID="screen-sequence-editor"
    >
      <Card>
        <TextField
          label="Sequence name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Warm-up Set"
          testID="input-sequence-name"
        />
      </Card>

      <View>
        <SectionHeader title="Steps" />

        <Card flush>
          {steps.length === 0 ? (
            <View style={styles.emptyRow}>
              <Typography variant="bodyStrong" color="textSecondary">
                No steps yet
              </Typography>
              <Typography variant="caption" color="textTertiary" align="center">
                Add your first action — most strings open with a draw.
              </Typography>
            </View>
          ) : (
            steps.map((step, i) => (
              <View
                key={`step-${i}`}
                style={[styles.stepRow, styles.stepDivider]}
              >
                <View style={styles.badge}>
                  <Typography variant="overline" color="primary">
                    {String(i + 1)}
                  </Typography>
                </View>

                <View style={styles.stepSelect}>
                  <Select
                    value={step}
                    options={sequenceActionOptions}
                    onChange={next => changeStep(i, next)}
                    sheetTitle={`Step ${i + 1}`}
                    testID={`select-step-${i}`}
                  />
                </View>

                <TouchableOpacity
                  onPress={() => removeStep(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove step ${i + 1}, ${labelForStep(
                    steps,
                    i,
                  )}`}
                  style={styles.removeButton}
                  testID={`btn-remove-step-${i}`}
                >
                  <Icon name="plus" size={16} color="textSecondary" />
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            onPress={addStep}
            accessibilityRole="button"
            accessibilityLabel="Add step"
            style={styles.addRow}
            testID="btn-add-step"
          >
            <Icon name="plus" size={18} color="primary" />
            <Typography variant="bodyStrong" color="primary">
              Add step
            </Typography>
          </TouchableOpacity>
        </Card>
      </View>

      {steps.length > 0 ? (
        <View>
          <SectionHeader title="Preview" />
          <Card>
            <View style={styles.summary}>
              {steps.map((step, i) => (
                <Typography key={`preview-${i}`} variant="label">
                  {labelForStep(steps, i)}
                  {i < steps.length - 1 ? (
                    <Typography variant="label" color="textTertiary">
                      {'  →  '}
                    </Typography>
                  ) : null}
                </Typography>
              ))}
            </View>
          </Card>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Button
          label={existing ? 'Save changes' : 'Create sequence'}
          onPress={navigation.goBack}
          disabled={!canSave}
          testID="btn-save-sequence"
        />
        {!canSave ? (
          <Typography variant="caption" color="textTertiary" align="center">
            Name the sequence and add at least one step to save.
          </Typography>
        ) : null}
      </View>
    </Screen>
  );
};
