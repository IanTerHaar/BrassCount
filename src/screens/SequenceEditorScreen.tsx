import { memo, useCallback, useState } from 'react';

import {
  AccessibilityInfo,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Theme } from '@/theme/theme';
import {
  MAX_DRILL_NAME_LENGTH,
  MAX_DRILL_STEPS,
  type DrillStep,
  type DrillStepType,
} from '@/types/drill';
import type { RootStackParamList } from '@/types/navigation';
import { Button } from '@components/Button';
import { Card } from '@components/Card';
import { EmptyState } from '@components/EmptyState';
import { Icon } from '@components/Icon';
import { ParPickerSheet } from '@components/ParPickerSheet';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Select, type SelectOption } from '@components/Select';
import { TextField } from '@components/TextField';
import { Typography } from '@components/Typography';
import {
  useDrillEditor,
  type DrillEditorStatus,
  type DrillSaveFailure,
  type DrillSaveState,
} from '@hooks/useDrillEditor';
import { useThemedStyles } from '@hooks/useTheme';
import { countShots, stepLabel, stepTypeLabel, totalPar } from '@utils/drill';
import {
  canAddStep,
  nextStepType,
  stepTypeChoices,
  type DrillDraftProblem,
} from '@utils/drillDraft';
import { formatSeconds, pluralize, spokenSeconds } from '@utils/format';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EditorRoute = RouteProp<RootStackParamList, 'SequenceEditor'>;

/** The hint under each step type in the open dropdown. */
const STEP_TYPE_DESCRIPTIONS: Record<DrillStepType, string> = {
  draw: 'From the holster',
  shot: 'One round downrange',
  reload: 'Magazine change',
  rack: 'Cycle the slide',
  transition: 'Move to the next target',
  holster: 'Make safe',
};

const stepTypeOptions = (
  current: DrillStepType,
): SelectOption<DrillStepType>[] =>
  stepTypeChoices(current).map(type => ({
    value: type,
    label: stepTypeLabel(type),
    description: STEP_TYPE_DESCRIPTIONS[type],
  }));

/**
 * Narrowest the step-type dropdown may get, at the default text size,
 * before the par and remove controls drop to a line of their own. It
 * grows with the system font scale, so large text wraps the row instead
 * of cutting the type name short.
 */
const STEP_SELECT_MIN_WIDTH = 112;

/**
 * Extra touch area around the two small controls of a step row, taking
 * each up to the 48dp minimum without growing the row. The remove button
 * is a 32dp circle; the par pill is wide enough but about 26dp tall.
 */
const REMOVE_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
const PAR_HIT_SLOP = { top: 11, bottom: 11 };

/** The line under the title once the drill has steps. */
const describeSteps = (steps: readonly DrillStep[]): string => {
  const counts = `${pluralize(steps.length, 'step')} · ${pluralize(
    countShots(steps),
    'shot',
  )}`;
  const par = totalPar(steps);
  return par === null ? counts : `${counts} · Par ${formatSeconds(par)}`;
};

/**
 * What the draft still needs before it can be saved, for the line under
 * the save button. The two a shooter meets building a drill — no name, no
 * steps — are worded together when both apply.
 */
const saveHint = (problems: readonly DrillDraftProblem[]): string => {
  const needsName = problems.includes('name-missing');
  const needsStep = problems.includes('no-steps');

  if (needsName && needsStep) {
    return 'Name the drill and add at least one step to save.';
  }
  if (needsName) {
    return 'Name the drill to save.';
  }
  if (needsStep) {
    return 'Add at least one step to save.';
  }
  if (problems.includes('name-too-long')) {
    return `Use ${MAX_DRILL_NAME_LENGTH} characters or fewer for the name.`;
  }
  return `A drill can have at most ${MAX_DRILL_STEPS} steps.`;
};

/**
 * Words for a failed save. The service's own message is written for a
 * developer, so the shooter is only told which kind of failure it was.
 */
const saveFailureMessage = (
  failure: DrillSaveFailure,
  editing: boolean,
): string => {
  if (failure === 'invalid') {
    return 'This drill cannot be saved as it is. Check its name and steps, then try again.';
  }
  if (failure === 'missing') {
    return 'This drill is no longer saved on this device, so it cannot be changed.';
  }
  return editing
    ? 'Could not save your changes. Try again.'
    : 'Could not save the drill. Try again.';
};

/** The whole sequence in one sentence, for the Preview card's reader label. */
const spokenPreview = (steps: readonly DrillStep[]): string =>
  steps
    .map((step, i) => {
      const label = stepLabel(steps, i);
      return step.par === undefined
        ? label
        : `${label}, ${spokenSeconds(step.par)}`;
    })
    .join('; then ');

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    hint: {
      paddingHorizontal: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
    },
    stepRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      // Sends the par and remove controls to the right edge when large
      // text drops them to a second line.
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
    },
    stepDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    badge: {
      minWidth: 26,
      minHeight: 26,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.radius.sm + 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    stepSelect: { flexGrow: 1, flexShrink: 1 },
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
    },
    // Rotating the plus gives a cross without a second glyph. The rotation
    // sits inside the button, not on it: Android stops delivering presses
    // to a touchable that is both rotated and given a `hitSlop`.
    removeGlyph: { transform: [{ rotate: '45deg' }] },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
    },
    addRowDisabled: { opacity: 0.5 },
    limitNote: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.md,
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
    loading: {
      alignItems: 'center',
      paddingVertical: theme.spacing.xxl,
    },
  });

type StepRowProps = {
  step: DrillStep;
  /** Where the step sits in the drill, counted from 0. */
  position: number;
  /** What the step is called in the sequence, e.g. "Shot 2". */
  label: string;
  /** Narrowest the dropdown may get before the row wraps. */
  selectMinWidth: number;
  onChangeType: (id: string, type: DrillStepType) => void;
  /** Open the par picker for the step with this id. */
  onEditPar: (id: string) => void;
  onRemove: (id: string) => void;
};

/**
 * One step of the drill: its number, type dropdown, par and remove
 * control. Memoised so typing the drill's name, or changing one step, does
 * not draw every other row again.
 */
const StepRow = memo(
  ({
    step,
    position,
    label,
    selectMinWidth,
    onChangeType,
    onEditPar,
    onRemove,
  }: StepRowProps) => {
    const styles = useThemedStyles(createStyles);
    const number = position + 1;
    const hasPar = step.par !== undefined;

    return (
      <View
        style={[styles.stepRow, styles.stepDivider]}
        testID={`row-step-${position}`}
      >
        <View style={styles.badge}>
          <Typography variant="overline" color="primary">
            {String(number)}
          </Typography>
        </View>

        <View style={[styles.stepSelect, { minWidth: selectMinWidth }]}>
          <Select
            value={step.type}
            options={stepTypeOptions(step.type)}
            onChange={next => onChangeType(step.id, next)}
            sheetTitle={`Step ${number}`}
            testID={`select-step-${position}`}
          />
        </View>

        <TouchableOpacity
          onPress={() => onEditPar(step.id)}
          accessibilityRole="button"
          accessibilityLabel={
            step.par === undefined
              ? `Set par for step ${number}`
              : `Change par for step ${number}, currently ${spokenSeconds(
                  step.par,
                )}`
          }
          hitSlop={PAR_HIT_SLOP}
          style={[styles.parChip, hasPar && styles.parChipSet]}
          testID={`btn-par-step-${position}`}
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
            {step.par === undefined ? '+ par' : formatSeconds(step.par)}
          </Typography>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            onRemove(step.id);
            // The row, and the reader's focus with it, is gone: say so.
            AccessibilityInfo.announceForAccessibility(
              `Removed step ${number}, ${label}`,
            );
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove step ${number}, ${label}`}
          hitSlop={REMOVE_HIT_SLOP}
          style={styles.removeButton}
          testID={`btn-remove-step-${position}`}
        >
          <View style={styles.removeGlyph}>
            <Icon name="plus" size={16} color="textSecondary" />
          </View>
        </TouchableOpacity>
      </View>
    );
  },
);

StepRow.displayName = 'StepRow';

type StepPreviewProps = {
  steps: readonly DrillStep[];
};

/**
 * The sequence on one wrapping line: each step, its par, and an arrow.
 * Memoised so typing the drill's name does not draw the sequence again.
 */
const StepPreview = memo(({ steps }: StepPreviewProps) => {
  const styles = useThemedStyles(createStyles);

  return (
    <View>
      <SectionHeader title="Preview" />
      <Card>
        {/* Read as one sentence: the arrows and brackets mean nothing
            spoken a step at a time. */}
        <View
          accessible
          accessibilityLabel={spokenPreview(steps)}
          style={styles.summary}
          testID="text-preview"
        >
          {steps.map((step, i) => (
            <Typography key={step.id} variant="label">
              {stepLabel(steps, i)}
              {step.par === undefined ? null : (
                <Typography variant="label" color="textTertiary">
                  {` (${formatSeconds(step.par)})`}
                </Typography>
              )}
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
  );
});

StepPreview.displayName = 'StepPreview';

type EditorUnavailableProps = {
  status: Exclude<DrillEditorStatus, 'ready'>;
  onRetry: () => void;
  onBack: () => void;
};

/** What stands in for the editor while a saved drill cannot be shown. */
const EditorUnavailable = ({
  status,
  onRetry,
  onBack,
}: EditorUnavailableProps) => {
  const styles = useThemedStyles(createStyles);

  if (status === 'loading') {
    return (
      <Card>
        <View style={styles.loading}>
          <Typography
            variant="body"
            color="textSecondary"
            testID="text-editor-loading"
          >
            Loading drill…
          </Typography>
        </View>
      </Card>
    );
  }

  return (
    <Card>
      {/* Announced: it takes the place of the loading line on its own. */}
      <View accessibilityLiveRegion="polite">
        {status === 'missing' ? (
          <EmptyState
            icon="list"
            title="Drill not found"
            message="It is no longer saved on this device."
            actionLabel="Back to drills"
            onActionPress={onBack}
            testID="state-editor-missing"
          />
        ) : (
          <EmptyState
            icon="list"
            title="Could not load this drill"
            message="Something went wrong reading it from this device."
            actionLabel="Try again"
            onActionPress={onRetry}
            testID="state-editor-error"
          />
        )}
      </View>
    </Card>
  );
};

type SaveFooterProps = {
  /** Whether a saved drill is being changed, not a new one created. */
  editing: boolean;
  problems: readonly DrillDraftProblem[];
  canSave: boolean;
  saveState: DrillSaveState;
  saveFailure: DrillSaveFailure | null;
  onSave: () => void;
};

/**
 * The save button, with why the last save failed above it and what the
 * draft still needs below it.
 */
const SaveFooter = ({
  editing,
  problems,
  canSave,
  saveState,
  saveFailure,
  onSave,
}: SaveFooterProps) => {
  const styles = useThemedStyles(createStyles);
  const idleLabel = editing ? 'Save changes' : 'Create drill';

  return (
    <View style={styles.footer}>
      {saveFailure === null ? null : (
        <Typography
          variant="caption"
          color="danger"
          align="center"
          accessibilityLiveRegion="polite"
          testID="text-drill-save-error"
        >
          {saveFailureMessage(saveFailure, editing)}
        </Typography>
      )}
      <Button
        label={saveState === 'idle' ? idleLabel : 'Saving…'}
        onPress={onSave}
        disabled={!canSave}
        testID="btn-save-drill"
      />
      {problems.length > 0 ? (
        <Typography
          variant="caption"
          color="textTertiary"
          align="center"
          testID="text-save-hint"
        >
          {saveHint(problems)}
        </Typography>
      ) : null}
    </View>
  );
};

type DrillEditorProps = {
  /** Id of the saved drill to edit; leave off to build a new one. */
  drillId?: string;
};

const DrillEditor = ({ drillId }: DrillEditorProps) => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<Nav>();
  const { fontScale } = useWindowDimensions();
  const {
    status,
    name,
    steps,
    problems,
    canSave,
    saveState,
    saveFailure,
    setName,
    addStep,
    removeStep,
    changeStepType,
    setStepPar,
    reload,
    save,
  } = useDrillEditor(drillId);
  // The step whose par is being picked. An id, not a position, so it
  // still points at the same step whatever happens to the list.
  const [parStepId, setParStepId] = useState<string | null>(null);

  const closeParPicker = useCallback(() => setParStepId(null), []);

  const addAndAnnounceStep = () => {
    // Nothing else tells a screen reader the list grew: the button keeps
    // its label and the new row appears above it.
    AccessibilityInfo.announceForAccessibility(
      `Added step ${steps.length + 1}, ${stepTypeLabel(nextStepType(steps))}`,
    );
    addStep();
  };

  const editing = drillId !== undefined;
  const title = editing ? 'Edit drill' : 'New drill';

  const saveAndLeave = async () => {
    // `save` settles a failure into `saveFailure` and resolves to
    // `null`, as it does when the editor was closed before the write
    // landed — going back then would pop the screen underneath.
    const drill = await save();
    if (drill === null) {
      return;
    }
    // The editor, and the reader's focus with it, is about to go: say
    // what happened to the drill.
    AccessibilityInfo.announceForAccessibility(
      `${editing ? 'Saved' : 'Created'} ${drill.name}`,
    );
    navigation.goBack();
  };

  if (status !== 'ready') {
    return (
      <Screen
        title={title}
        onBack={navigation.goBack}
        scrollable
        testID="screen-drill-editor"
      >
        <EditorUnavailable
          status={status}
          onRetry={reload}
          onBack={navigation.goBack}
        />
      </Screen>
    );
  }

  const parPosition = steps.findIndex(step => step.id === parStepId);
  const hasRoom = canAddStep(steps);

  return (
    <Screen
      title={title}
      onBack={navigation.goBack}
      subtitle={
        steps.length > 0
          ? describeSteps(steps)
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
          maxLength={MAX_DRILL_NAME_LENGTH}
          editable={saveState === 'idle'}
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
            <View style={styles.emptyRow} testID="state-steps-empty">
              <Typography variant="bodyStrong" color="textSecondary">
                No steps yet
              </Typography>
              <Typography variant="caption" color="textTertiary" align="center">
                Add your first action — most strings open with a draw.
              </Typography>
            </View>
          ) : (
            // Mapped, not virtualised: a drill holds at most
            // `MAX_DRILL_STEPS` rows, and they sit inside the card.
            steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                position={i}
                label={stepLabel(steps, i)}
                selectMinWidth={STEP_SELECT_MIN_WIDTH * fontScale}
                onChangeType={changeStepType}
                onEditPar={setParStepId}
                onRemove={removeStep}
              />
            ))
          )}

          <TouchableOpacity
            onPress={addAndAnnounceStep}
            disabled={!hasRoom}
            accessibilityRole="button"
            accessibilityLabel="Add step"
            accessibilityState={{ disabled: !hasRoom }}
            style={[styles.addRow, !hasRoom && styles.addRowDisabled]}
            testID="btn-add-step"
          >
            <Icon name="plus" size={18} color="primary" />
            <Typography variant="bodyStrong" color="primary">
              Add step
            </Typography>
          </TouchableOpacity>

          {hasRoom ? null : (
            <Typography
              variant="caption"
              color="textTertiary"
              align="center"
              accessibilityLiveRegion="polite"
              style={styles.limitNote}
              testID="text-step-limit"
            >
              {`A drill can have at most ${MAX_DRILL_STEPS} steps.`}
            </Typography>
          )}
        </Card>
      </View>

      {steps.length > 0 ? <StepPreview steps={steps} /> : null}

      <SaveFooter
        editing={editing}
        problems={problems}
        canSave={canSave}
        saveState={saveState}
        saveFailure={saveFailure}
        onSave={saveAndLeave}
      />

      <ParPickerSheet
        visible={parPosition >= 0}
        stepNumber={parPosition + 1}
        par={steps[parPosition]?.par}
        onSelect={par => {
          if (parStepId !== null) {
            setStepPar(parStepId, par);
          }
          closeParPicker();
        }}
        onClose={closeParPicker}
      />
    </Screen>
  );
};

/**
 * Create / edit a drill: its name and its ordered steps, each with a type
 * and an optional par, plus a live preview of the sequence. Opened with
 * the id of a saved drill it starts from that drill; without one it
 * starts empty. The save button stores the draft through
 * `DrillStorageService` — a new drill is created, an opened one updated —
 * and goes back; leaving any other way drops the draft.
 */
export const SequenceEditorScreen = () => {
  const route = useRoute<EditorRoute>();
  const drillId = route.params?.id;

  // Keyed by the drill, so being pointed at another one starts a fresh
  // editor instead of showing the new drill under the old draft.
  return <DrillEditor key={drillId ?? 'new'} drillId={drillId} />;
};
