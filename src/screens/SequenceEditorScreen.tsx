import { useState } from 'react';

import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '@/types/navigation';
import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { Icon } from '@components/Icon';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Select } from '@components/Select';
import { TextField } from '@components/TextField';
import { Typography } from '@components/Typography';
import {
  labelForStep,
  previewDrills,
  sequenceActionOptions,
  type DrillStep,
  type SequenceAction,
} from '@constants/previewData';
import type { Theme } from '@constants/theme';
import { useThemedStyles } from '@hooks/useTheme';
import { formatSeconds, pluralize } from '@utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EditorRoute = RouteProp<RootStackParamList, 'SequenceEditor'>;

const DEFAULT_STEP: DrillStep = { action: 'shot' };

/** Preset step-par options for the picker sheet. */
const PAR_PRESETS: {
  seconds: number | undefined;
  label: string;
  description?: string;
}[] = [
  { seconds: undefined, label: 'No par', description: 'Untimed step' },
  { seconds: 0.15, label: '0.15s', description: 'Very fast split' },
  { seconds: 0.2, label: '0.20s' },
  { seconds: 0.25, label: '0.25s', description: 'Comfortable split' },
  { seconds: 0.3, label: '0.30s' },
  { seconds: 0.5, label: '0.50s', description: 'Head shot / transition' },
  { seconds: 0.75, label: '0.75s' },
  { seconds: 1.0, label: '1.00s' },
  { seconds: 1.5, label: '1.50s', description: 'Draw from concealment' },
  { seconds: 2.0, label: '2.00s', description: 'Reload' },
  { seconds: 3.0, label: '3.00s' },
];

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    hint: {
      paddingHorizontal: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
    },
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
    parChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
    },
    parChipSet: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primary,
    },
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

    // Par-picker bottom sheet — mirrors the Select sheet so the two feel
    // like the same primitive.
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    sheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingTop: theme.spacing.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.borderStrong,
      marginBottom: theme.spacing.sm,
    },
    sheetHeader: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.sm,
      gap: 2,
    },
    customRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.md,
    },
    customField: { flex: 1 },
    presetHeader: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    parOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md - theme.spacing.xs,
      paddingHorizontal: theme.spacing.lg,
      minHeight: 56,
    },
    parOptionDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    parOptionBody: { flex: 1, gap: 2 },
    parOptionList: { maxHeight: 420 },
  });

export const SequenceEditorScreen = () => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const route = useRoute<EditorRoute>();
  const insets = useSafeAreaInsets();

  const existing = previewDrills.find(item => item.id === route.params?.id);

  const [name, setName] = useState(existing?.name ?? '');
  const [steps, setSteps] = useState<DrillStep[]>(existing?.steps ?? []);
  const [parEditingStep, setParEditingStep] = useState<number | null>(null);
  const [customParInput, setCustomParInput] = useState('');

  const addStep = () => setSteps(prev => [...prev, { ...DEFAULT_STEP }]);

  const removeStep = (position: number) =>
    setSteps(prev => prev.filter((_, i) => i !== position));

  const changeStep = (position: number, next: SequenceAction) =>
    setSteps(prev =>
      prev.map((step, i) =>
        i === position ? { ...step, action: next } : step,
      ),
    );

  const setStepPar = (position: number, parSeconds: number | undefined) =>
    setSteps(prev =>
      prev.map((step, i) => (i === position ? { ...step, parSeconds } : step)),
    );

  /** Prefill the custom input with the current par so tweaks are one keystroke. */
  const openParPicker = (position: number) => {
    const current = steps[position]?.parSeconds;
    setCustomParInput(current !== undefined ? current.toFixed(2) : '');
    setParEditingStep(position);
  };

  const closeParPicker = () => setParEditingStep(null);

  const commitPar = (parSeconds: number | undefined) => {
    if (parEditingStep !== null) {
      setStepPar(parEditingStep, parSeconds);
    }
    closeParPicker();
  };

  const parsedCustomPar = parseFloat(customParInput);
  const isCustomParValid =
    Number.isFinite(parsedCustomPar) &&
    parsedCustomPar > 0 &&
    parsedCustomPar <= 60;

  const commitCustomPar = () => {
    if (isCustomParValid) {
      commitPar(Math.round(parsedCustomPar * 100) / 100);
    }
  };

  const editingStep = parEditingStep !== null ? steps[parEditingStep] : null;

  const shotCount = steps.filter(step => step.action === 'shot').length;
  const canSave = name.trim().length > 0 && steps.length > 0;

  return (
    <Screen
      title={existing ? 'Edit drill' : 'New drill'}
      onBack={navigation.goBack}
      subtitle={
        steps.length
          ? `${pluralize(steps.length, 'step')} · ${shotCount} shots`
          : 'Name it, then add the actions in order'
      }
      scrollable
      testID="screen-drill-editor"
    >
      <Card>
        <TextField
          label="Drill name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Bill Drill"
          testID="input-drill-name"
        />
      </Card>

      <View>
        <SectionHeader title="Steps" />
        <Typography variant="caption" color="textTertiary" style={styles.hint}>
          Tap a step's par to cap how long it can take from the previous action.
          Step 1's par runs from the timer start.
        </Typography>

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
            steps.map((step, i) => {
              const hasPar = step.parSeconds !== undefined;
              return (
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
                      value={step.action}
                      options={sequenceActionOptions}
                      onChange={next => changeStep(i, next)}
                      sheetTitle={`Step ${i + 1}`}
                      testID={`select-step-${i}`}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={() => openParPicker(i)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      hasPar
                        ? `Change par for step ${i + 1}, currently ${
                            step.parSeconds
                          } seconds`
                        : `Set par for step ${i + 1}`
                    }
                    style={[styles.parChip, hasPar && styles.parChipSet]}
                    testID={`btn-par-step-${i}`}
                  >
                    <Icon
                      name="timer"
                      size={12}
                      color={hasPar ? 'primary' : 'textTertiary'}
                    />
                    <Typography
                      variant="label"
                      color={hasPar ? 'primary' : 'textTertiary'}
                    >
                      {hasPar ? formatSeconds(step.parSeconds!) : '+ par'}
                    </Typography>
                  </TouchableOpacity>

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
              );
            })
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
                  {step.parSeconds !== undefined ? (
                    <Typography variant="label" color="textTertiary">
                      {` (${formatSeconds(step.parSeconds)})`}
                    </Typography>
                  ) : null}
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
          label={existing ? 'Save changes' : 'Create drill'}
          onPress={navigation.goBack}
          disabled={!canSave}
          testID="btn-save-drill"
        />
        {!canSave ? (
          <Typography variant="caption" color="textTertiary" align="center">
            Name the drill and add at least one step to save.
          </Typography>
        ) : null}
      </View>

      <Modal
        visible={parEditingStep !== null}
        transparent
        animationType="slide"
        onRequestClose={closeParPicker}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Close par picker"
          onPress={closeParPicker}
        >
          {/* Swallow taps inside the sheet so they don't dismiss it. */}
          <Pressable
            onPress={event => event.stopPropagation()}
            style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}
          >
            <View style={styles.grabber} />

            <View style={styles.sheetHeader}>
              <Typography variant="overline" color="textSecondary">
                {parEditingStep !== null
                  ? `STEP ${parEditingStep + 1} PAR`
                  : 'PAR'}
              </Typography>
              <Typography variant="caption" color="textTertiary">
                {parEditingStep === 0
                  ? 'Max time from the timer start to this step.'
                  : 'Max time from the previous step to this one.'}
              </Typography>
            </View>

            <View style={styles.customRow}>
              <View style={styles.customField}>
                <TextField
                  label="Custom"
                  value={customParInput}
                  onChangeText={setCustomParInput}
                  placeholder="0.00"
                  decimal
                  unit="s"
                  testID="input-par-custom"
                />
              </View>
              <Button
                label="Set"
                onPress={commitCustomPar}
                disabled={!isCustomParValid}
                testID="btn-par-custom-set"
              />
            </View>

            <View style={styles.presetHeader}>
              <Typography variant="overline" color="textSecondary">
                OR PICK A PRESET
              </Typography>
            </View>

            <ScrollView style={styles.parOptionList} bounces={false}>
              {PAR_PRESETS.map((preset, i) => {
                const isSelected =
                  editingStep?.parSeconds === preset.seconds ||
                  (preset.seconds === undefined &&
                    editingStep?.parSeconds === undefined);

                return (
                  <Pressable
                    key={preset.label}
                    onPress={() => commitPar(preset.seconds)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={[styles.parOption, i > 0 && styles.parOptionDivider]}
                    testID={`opt-par-${preset.seconds ?? 'none'}`}
                  >
                    <View style={styles.parOptionBody}>
                      <Typography
                        variant="bodyStrong"
                        color={isSelected ? 'primary' : 'textPrimary'}
                      >
                        {preset.label}
                      </Typography>
                      {preset.description ? (
                        <Typography variant="caption" color="textTertiary">
                          {preset.description}
                        </Typography>
                      ) : null}
                    </View>

                    {isSelected ? (
                      <Icon name="check" size={18} color="primary" />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
};
