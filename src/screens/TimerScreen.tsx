import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';

import {
  AccessibilityInfo,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { SemanticColors, Theme } from '@/theme/theme';
import type { Drill, DrillStep } from '@/types/drill';
import type { RootStackParamList } from '@/types/navigation';
import type { RunResult, RunStep, StepResult } from '@/types/run';
import type { SessionInput } from '@/types/session';
import { Card } from '@components/Card';
import { DrillPicker } from '@components/DrillPicker';
import { Icon } from '@components/Icon';
import { ListRow } from '@components/ListRow';
import { SaveRunPrompt } from '@components/SaveRunPrompt';
import { Screen } from '@components/Screen';
import { SectionHeader } from '@components/SectionHeader';
import { Typography } from '@components/Typography';
import {
  useDrillRun,
  type DrillRunFailure,
  type DrillRunPhase,
} from '@hooks/useDrillRun';
import { useDrills } from '@hooks/useDrills';
import {
  useRunSave,
  type RunSaveFailure,
  type RunSaveStatus,
} from '@hooks/useRunSave';
import { useTheme, useThemedStyles } from '@hooks/useTheme';
import { countShots, stepLabel, stepTypeLabel, totalPar } from '@utils/drill';
import {
  formatElapsed,
  formatSeconds,
  pluralize,
  spokenSeconds,
} from '@utils/format';
import { shownDeltaSign } from '@utils/history';
import { planRun } from '@utils/runDetection';

/** How often the running clock is redrawn. */
const CLOCK_TICK_MS = 50;
const NO_VALUE = '—';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** What the picker offers until the drills have been read. */
const NO_DRILLS: Drill[] = [];
/** The steps on show while there is no drill. */
const NO_STEPS: DrillStep[] = [];

/** A length of time said to the hundredth, the figure the screen shows. */
const speak = (seconds: number): string =>
  spokenSeconds(Number(Math.abs(seconds).toFixed(2)));

/** `["shot", "rack"]` → `Shot and Rack`. */
const nameSounds = (sounds: readonly DrillStep['type'][]): string => {
  const names = sounds.map(stepTypeLabel);
  return names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
};

const failureMessage = (failure: DrillRunFailure): string => {
  switch (failure.kind) {
    case 'not-calibrated':
      return `Calibrate ${nameSounds(failure.sounds)} first`;
    case 'no-steps':
      return 'This drill has no shot, reload or rack to listen for';
    case 'permission-denied':
      return 'Microphone access is needed to time a run';
    case 'permission-blocked':
      return 'Microphone access is turned off. Allow it in Settings.';
    case 'interrupted':
      return 'The run stopped because the app was left';
    case 'microphone':
      return 'The microphone could not be used';
    case 'beep':
      return 'Could not play the start beep';
    case 'audio-unavailable':
      return 'Audio unavailable';
  }
};

const phaseMessage = (phase: DrillRunPhase, result: RunResult | null) => {
  switch (phase) {
    case 'idle':
      return 'Ready when you are';
    case 'arming':
    case 'waiting':
      return 'Stand by…';
    case 'running':
      return 'Listening…';
    case 'finished':
      return result?.completed === true ? 'Run complete' : 'Run stopped early';
  }
};

/**
 * How a finished run was timed: where its zero point came from and which
 * clock stamped its sounds. Shown so the timing can be judged on a phone,
 * where there is no log to read.
 */
const timingNote = (result: RunResult): string => {
  const zero =
    result.zeroSource === 'beep' && result.beepDelayMs !== null
      ? `Timed from the start beep as it was heard, ${Math.round(result.beepDelayMs)} ms after it was requested.`
      : 'The start beep was not heard, so the run is timed from when it was requested and its first step may read long.';
  const clock =
    result.clockSource === 'frame'
      ? "Steps timed by the microphone hardware's own clock."
      : 'This device gives no hardware microphone clock, so a step may be up to 20 ms off.';
  return `${zero} ${clock}`;
};

/**
 * A finished run as a screen reader should say it, with what can be done
 * with it: the prompt to save it appears under the timer.
 */
const speakResult = (result: RunResult): string => {
  if (result.results.length === 0) {
    return 'Run stopped early, nothing heard';
  }
  const run = result.completed
    ? `Run complete, ${speak(result.totalTime)}`
    : `Run stopped early, ${pluralize(result.results.length, 'step')} heard`;
  return `${run}. Save it or discard it`;
};

type Tone = 'success' | 'danger' | 'neutral';

const toneColor: Record<Tone, keyof SemanticColors> = {
  success: 'success',
  danger: 'danger',
  neutral: 'textSecondary',
};

type SplitRow = {
  subtitle?: string;
  value: string;
  tone: Tone;
  /** The row as a screen reader should say it. */
  spoken: string;
};

/** A step the timer cannot hear: a draw, a transition, a holster. */
const describeSilentStep = (
  title: string,
  step: DrillStep,
  countsTowardsNext: boolean,
): SplitRow => {
  if (step.par === undefined || !countsTowardsNext) {
    return {
      subtitle: 'not timed',
      value: NO_VALUE,
      tone: 'neutral',
      spoken: `${title}, not timed`,
    };
  }
  return {
    subtitle: `par ${formatSeconds(step.par)}, counted with the next step`,
    value: NO_VALUE,
    tone: 'neutral',
    spoken: `${title}, not timed. Its par of ${speak(step.par)} counts towards the next step`,
  };
};

/** A step the timer listens for, before or after it has been heard. */
const describeHeardStep = (
  title: string,
  planned: RunStep,
  result: StepResult | undefined,
): SplitRow => {
  const par =
    planned.par === undefined ? undefined : `par ${formatSeconds(planned.par)}`;
  const spokenPar =
    planned.par === undefined ? 'no par' : `par ${speak(planned.par)}`;

  if (result === undefined) {
    return {
      subtitle: par,
      value: NO_VALUE,
      tone: 'neutral',
      spoken: `${title}, ${spokenPar}, not heard yet`,
    };
  }

  const value = formatSeconds(result.actual);
  const took = `took ${speak(result.actual)}`;
  if (result.delta === null) {
    return {
      value,
      tone: 'neutral',
      spoken: `${title}, ${spokenPar}, ${took}`,
    };
  }

  const sign = shownDeltaSign(result.delta);
  const size = formatSeconds(Math.abs(result.delta));
  const againstPar =
    sign === 0 ? 'on par' : `${size} ${sign < 0 ? 'under' : 'over'}`;
  const spokenAgainstPar =
    sign === 0
      ? 'on par'
      : `${speak(result.delta)} ${sign < 0 ? 'under' : 'over'} par`;
  return {
    subtitle: `${par} · ${againstPar}`,
    value,
    tone: sign === 0 ? 'neutral' : sign < 0 ? 'success' : 'danger',
    spoken: `${title}, ${spokenPar}, ${took}, ${spokenAgainstPar}`,
  };
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    readout: {
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.lg,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
      paddingHorizontal: theme.spacing.xs,
    },
    clock: {
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    startButton: {
      width: 132,
      height: 132,
      borderRadius: 66,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.md,
    },
    stopGlyph: {
      width: 26,
      height: 26,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.colors.textOnPrimary,
    },
    resetButton: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginTop: theme.spacing.xs,
    },
    timingNote: {
      paddingHorizontal: theme.spacing.xs,
    },
  });

type RunOutcomeProps = {
  /** A run has finished and its times are on show. */
  show: boolean;
  /** What the run would save as; `null` when nothing was heard. */
  session: SessionInput | null;
  /** How many steps the run listened for. */
  plannedCount: number;
  saveStatus: RunSaveStatus;
  saveFailure: RunSaveFailure | null;
  onSave: () => void;
  onDiscard: () => void;
};

/**
 * Under the timer once a run has finished: the prompt to save or discard
 * it, or why there is nothing to save.
 */
const RunOutcome = ({
  show,
  session,
  plannedCount,
  saveStatus,
  saveFailure,
  onSave,
  onDiscard,
}: RunOutcomeProps) => {
  const styles = useThemedStyles(createStyles);

  if (!show) {
    return null;
  }
  if (session === null) {
    return (
      <Typography
        variant="caption"
        color="textSecondary"
        style={styles.timingNote}
        testID="text-nothing-to-save"
      >
        Nothing was heard, so there is nothing to save.
      </Typography>
    );
  }
  return (
    <SaveRunPrompt
      completed={session.completed}
      totalTime={session.totalTime}
      heardCount={session.splits.length}
      plannedCount={plannedCount}
      status={saveStatus}
      failure={saveFailure}
      onSave={onSave}
      onDiscard={onDiscard}
    />
  );
};

type RunClockProps = {
  running: boolean;
  /** The run's time once it has ended. `null` while there is none. */
  finalSeconds: number | null;
  /** The drill's total par. `null` when a step is untimed. */
  parSeconds: number | null;
  readElapsed: () => number;
};

/**
 * The big readout. It owns the tick, so the clock redraws many times a
 * second without the rest of the screen redrawing with it: the JS thread
 * is left free for the microphone readings during a run.
 */
const RunClock = ({
  running,
  finalSeconds,
  parSeconds,
  readElapsed,
}: RunClockProps) => {
  const styles = useThemedStyles(createStyles);
  const [ticked, setTicked] = useState(0);

  useEffect(() => {
    if (!running) {
      return;
    }
    const id = setInterval(() => setTicked(readElapsed()), CLOCK_TICK_MS);
    return () => {
      clearInterval(id);
      // The next run starts from zero, not from where this one got to.
      setTicked(0);
    };
  }, [running, readElapsed]);

  const elapsed = finalSeconds ?? (running ? ticked : 0);
  // Judged as the time reads to the hundredth, like the rows under it: a
  // run shown as 2.50 against a par of 2.50 is not over it.
  const overPar =
    parSeconds !== null && shownDeltaSign(elapsed - parSeconds) > 0;

  return (
    <View style={styles.clock}>
      <Typography
        variant="timer"
        color={overPar ? 'danger' : running ? 'primary' : 'textPrimary'}
        align="center"
        testID="text-elapsed"
      >
        {formatElapsed(elapsed)}
      </Typography>

      <Typography
        variant="overline"
        color="textTertiary"
        align="center"
        testID="text-elapsed-caption"
      >
        {overPar ? 'OVER PAR' : 'SECONDS'}
      </Typography>
    </View>
  );
};

/**
 * The shot timer. Times a run of a stored drill from the microphone, then
 * asks whether the run goes into History: nothing is saved until the
 * shooter says so, and a run that is not wanted is simply discarded.
 */
export const TimerScreen = () => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const navigation = useNavigation<Nav>();

  const { state: drillsState, reload: reloadDrills } = useDrills();
  const drills =
    drillsState.status === 'ready' ? drillsState.drills : NO_DRILLS;
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  // Until one is picked, the drill changed most recently.
  const selectedDrill =
    drills.find(item => item.id === selectedDrillId) ?? drills[0] ?? null;

  const { phase, results, result, failure, readElapsed, start, stop, reset } =
    useDrillRun();
  // The drill as it was when the run started. The run's rows, and the
  // session it saves as, come from it, so an edit made in the editor while
  // the run is on show cannot change either. It is left in place after a
  // reset: once idle the screen shows the selected drill instead.
  const [runDrill, setRunDrill] = useState<Drill | null>(null);
  const drill =
    phase !== 'idle' && runDrill !== null ? runDrill : selectedDrill;
  const steps = drill?.steps ?? NO_STEPS;
  // The steps the run listens for, with the pars they are judged against.
  const plan = useMemo(() => planRun(steps), [steps]);

  const {
    session,
    status: saveStatus,
    failure: saveFailure,
    save,
  } = useRunSave(runDrill, result);
  const saving = saveStatus === 'saving';

  const running = phase === 'running';
  // The microphone is opening or the delay is running: Start can be undone.
  const pending = phase === 'arming' || phase === 'waiting';
  const failureText = failure === null ? null : failureMessage(failure);

  // A finished run whose drill was deleted on another tab, and that was not
  // saved, has nothing left to be saved against, so it goes. A run already
  // saved keeps its confirmation, and nothing else can be on show: leaving
  // the tab ends a run in progress.
  const unsavedRunDrillGone =
    phase === 'finished' &&
    saveStatus === 'unsaved' &&
    runDrill !== null &&
    drillsState.status === 'ready' &&
    !drills.some(item => item.id === runDrill.id);
  useEffect(() => {
    if (unsavedRunDrillGone) {
      reset();
      setRunDrill(null);
      AccessibilityInfo.announceForAccessibility(
        'Run discarded: its drill was deleted',
      );
    }
  }, [reset, unsavedRunDrillGone]);

  // What a screen reader has already been told, so each failure and each
  // finished run is said once.
  const isFocused = useIsFocused();
  const said = useRef<{ failure: string | null; result: RunResult | null }>({
    failure: null,
    result: null,
  });
  useEffect(() => {
    // A run that ends because the tab was left is not announced over the
    // screen the shooter went to; it is said when they come back.
    if (!isFocused) {
      return;
    }
    const news: string[] = [];
    if (failureText !== null && failureText !== said.current.failure) {
      news.push(failureText);
    }
    if (result !== null && result !== said.current.result) {
      news.push(speakResult(result));
    }
    said.current = { failure: failureText, result };
    if (news.length > 0) {
      // One announcement, so the second half cannot cut the first off.
      AccessibilityInfo.announceForAccessibility(news.join('. '));
    }
  }, [failureText, isFocused, result]);

  const onPressStart = useCallback(() => {
    if (running || pending) {
      stop();
      return;
    }
    if (selectedDrill === null || saving) {
      return;
    }
    // A finished run that was not saved is dropped by starting the next:
    // nothing of it was stored. The run takes the drill as it is now.
    setRunDrill(selectedDrill);
    setSelectedDrillId(selectedDrill.id);
    start(selectedDrill.steps);
  }, [pending, running, saving, selectedDrill, start, stop]);

  const selectDrill = useCallback(
    (id: string) => {
      if (id !== selectedDrill?.id) {
        // The times on show belong to the drill being left.
        reset();
        setSelectedDrillId(id);
      }
    },
    [reset, selectedDrill],
  );

  const createDrill = useCallback(
    () => navigation.navigate('SequenceEditor', {}),
    [navigation],
  );

  // The prompt's buttons go once it is answered, and a screen reader's
  // focus with them: it is put on the Start button, where the next run
  // begins, rather than back at the top of the screen.
  const startButtonRef = useRef<ComponentRef<typeof TouchableOpacity>>(null);
  const focusStartButton = useCallback(() => {
    const button = startButtonRef.current;
    if (button !== null) {
      AccessibilityInfo.sendAccessibilityEvent(button, 'focus');
    }
  }, []);

  const saveRun = useCallback(async () => {
    // `save` settles a failure into the prompt and never rejects.
    const stored = await save();
    if (stored !== null) {
      AccessibilityInfo.announceForAccessibility(
        stored.completed
          ? 'Run saved to History'
          : 'Run saved to History as incomplete',
      );
      focusStartButton();
    }
  }, [focusStartButton, save]);

  const discardRun = useCallback(() => {
    reset();
    // The prompt, and the reader's focus with it, is gone: say what happened.
    AccessibilityInfo.announceForAccessibility('Run discarded');
    focusStartButton();
  }, [focusStartButton, reset]);

  const shotCount = countShots(steps);
  const drillPar = totalPar(plan);
  const onButtonColor = pending ? 'textOnWarning' : 'textOnPrimary';
  const noDrill = drillsState.status === 'ready' && drill === null;

  return (
    <Screen
      title="Shot Timer"
      subtitle={
        failureText ??
        (noDrill ? 'Create a drill to start' : phaseMessage(phase, result))
      }
      scrollable
      testID="screen-timer"
    >
      <View>
        <SectionHeader title="Drill" />
        <DrillPicker
          state={drillsState}
          drill={drill}
          locked={running || pending || saving}
          onSelect={selectDrill}
          onCreate={createDrill}
          onRetry={reloadDrills}
        />
      </View>

      {drill === null ? null : (
        <>
          <Card raised style={styles.readout} testID="card-readout">
            <View style={styles.metaRow}>
              <Typography variant="overline" color="textSecondary">
                {pluralize(shotCount, 'shot').toUpperCase()}
              </Typography>
              {drillPar !== null ? (
                <Typography variant="overline" color="textSecondary">
                  {`PAR ${drillPar.toFixed(2)}S`}
                </Typography>
              ) : null}
            </View>

            <RunClock
              running={running}
              finalSeconds={result === null ? null : result.totalTime}
              parSeconds={drillPar}
              readElapsed={readElapsed}
            />

            <TouchableOpacity
              ref={startButtonRef}
              onPress={onPressStart}
              // Not while a run is being saved: it would replace the run.
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={
                pending
                  ? 'Cancel start'
                  : running
                    ? 'Stop timer'
                    : 'Start timer'
              }
              accessibilityState={{ disabled: saving }}
              activeOpacity={0.85}
              style={[
                styles.startButton,
                theme.elevation.raised,
                {
                  backgroundColor: pending
                    ? theme.colors.warning
                    : running
                      ? theme.colors.danger
                      : theme.colors.primary,
                },
              ]}
              testID="btn-start"
            >
              {pending ? (
                <Icon name="timer" size={34} color={onButtonColor} />
              ) : running ? (
                <View style={styles.stopGlyph} />
              ) : (
                <Icon name="play" size={34} color="textOnPrimary" />
              )}
              <Typography variant="overline" color={onButtonColor}>
                {pending ? 'WAIT' : running ? 'STOP' : 'START'}
              </Typography>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={reset}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
              style={styles.resetButton}
              testID="btn-reset"
            >
              <Typography variant="label" color="textSecondary">
                Reset
              </Typography>
            </TouchableOpacity>
          </Card>

          <RunOutcome
            show={phase === 'finished' && result !== null}
            session={session}
            plannedCount={plan.length}
            saveStatus={saveStatus}
            saveFailure={saveFailure}
            onSave={saveRun}
            onDiscard={discardRun}
          />

          <View>
            <SectionHeader title="Splits" />
            <Card flush>
              {steps.map((step, i) => {
                const title = stepLabel(steps, i);
                const planned = plan.find(item => item.stepId === step.id);
                const row =
                  planned === undefined
                    ? describeSilentStep(
                        title,
                        step,
                        steps
                          .slice(i + 1)
                          .some(later =>
                            plan.some(item => item.stepId === later.id),
                          ),
                      )
                    : describeHeardStep(
                        title,
                        planned,
                        results.find(item => item.stepId === step.id),
                      );
                return (
                  <ListRow
                    key={step.id}
                    index={i + 1}
                    title={title}
                    subtitle={row.subtitle}
                    value={row.value}
                    valueColor={toneColor[row.tone]}
                    accessibilityLabel={row.spoken}
                    divided={i < steps.length - 1}
                    testID={`row-split-${i}`}
                  />
                );
              })}
            </Card>
          </View>

          {/* A run in which nothing was heard has no timing to describe. */}
          {result !== null && result.results.length > 0 ? (
            <Typography
              variant="caption"
              color="textTertiary"
              style={styles.timingNote}
              testID="text-run-timing"
            >
              {timingNote(result)}
            </Typography>
          ) : null}
        </>
      )}
    </Screen>
  );
};
