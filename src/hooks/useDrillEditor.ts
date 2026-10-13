import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  Drill,
  DrillInput,
  DrillStep,
  DrillStepType,
} from '@/types/drill';
import { DrillStorageError, DrillStorageService } from '@services/drillStorage';
import { isStepPar } from '@utils/drill';
import {
  drillDraftProblems,
  addStep as withStepAdded,
  changeStepType as withStepType,
  moveStep as withStepMoved,
  removeStep as withoutStep,
  setStepPar as withStepPar,
  type DrillDraftProblem,
} from '@utils/drillDraft';

/**
 * Where the editor stands: reading the drill it was opened on, ready to
 * edit, or unable to — the drill is not stored (`missing`) or reading it
 * failed (`error`). A new drill is `ready` from the start.
 */
export type DrillEditorStatus = 'loading' | 'ready' | 'missing' | 'error';

/**
 * Where saving the draft stands. `saved` is final: the editor's work is
 * done and it is about to close, so it does not go back to `idle` — a new
 * drill saved a second time would be stored twice. The draft only takes
 * changes while `idle`.
 */
export type DrillSaveState = 'idle' | 'saving' | 'saved';

/**
 * Why the last save did not store the drill: the storage service turned
 * the draft down (`invalid`), the drill being edited is no longer stored
 * (`missing`), or the write itself failed (`failed`).
 */
export type DrillSaveFailure = 'invalid' | 'missing' | 'failed';

const saveFailureOf = (err: unknown): DrillSaveFailure => {
  if (err instanceof DrillStorageError && err.code === 'INVALID_INPUT') {
    return 'invalid';
  }
  if (err instanceof DrillStorageError && err.code === 'NOT_FOUND') {
    return 'missing';
  }
  return 'failed';
};

export type UseDrillEditorResult = {
  status: DrillEditorStatus;
  name: string;
  /** The steps in the order they are performed. */
  steps: readonly DrillStep[];
  /** What stops the draft from being saved; empty when nothing does. */
  problems: readonly DrillDraftProblem[];
  /** Whether `save` would store the draft as it stands. */
  canSave: boolean;
  saveState: DrillSaveState;
  /** Why the last save failed; `null` once another one starts. */
  saveFailure: DrillSaveFailure | null;
  setName: (name: string) => void;
  /** Add an untimed step at the end: a draw first, a shot after that. */
  addStep: () => void;
  removeStep: (id: string) => void;
  /**
   * Move a step to `toPosition`, counted from 0, keeping its id, type and
   * par. A position the list does not have is ignored.
   */
  moveStep: (id: string, toPosition: number) => void;
  changeStepType: (id: string, type: DrillStepType) => void;
  /**
   * Set a step's par in seconds, or clear it with `undefined`. A par the
   * storage service would reject is ignored.
   */
  setStepPar: (id: string, par: number | undefined) => void;
  /**
   * Read the drill again after a failed load. It replaces the draft with
   * what is stored, so it is only for the `error` state.
   */
  reload: () => void;
  /**
   * Store the draft: a new drill is created, the drill the editor was
   * opened on is updated in place. Resolves to the stored drill, with the
   * totals the storage service derived from its steps.
   *
   * Never rejects. It resolves to `null` when nothing was stored — the
   * draft has `problems`, a save is already in flight or done, or the
   * write failed (see `saveFailure`) — and when the editor was closed
   * before the write landed, so the caller does not act on a screen that
   * is gone.
   */
  save: () => Promise<Drill | null>;
};

/**
 * The draft behind the drill editor: a name and an ordered step list held
 * in local state until `save` stores them through `DrillStorageService`.
 * A draft that is not saved is lost when the editor closes.
 *
 * Pass the id of a saved drill to start from its name and steps, read once
 * through `DrillStorageService`; leave it off to start a new drill empty.
 * The id is only read on mount: give the component that calls this a `key`
 * of the id, so opening another drill starts a fresh draft.
 */
export const useDrillEditor = (drillId?: string): UseDrillEditorResult => {
  const [status, setStatus] = useState<DrillEditorStatus>(
    drillId === undefined ? 'ready' : 'loading',
  );
  const [name, setDraftName] = useState('');
  const [steps, setSteps] = useState<readonly DrillStep[]>([]);
  // Bumped by `reload` to run the read again.
  const [attempt, setAttempt] = useState(0);
  const [saveState, setSaveState] = useState<DrillSaveState>('idle');
  const [saveFailure, setSaveFailure] = useState<DrillSaveFailure | null>(null);
  // Mirrors `saveState` for `save` itself: two taps can land before the
  // state from the first has been drawn.
  const saveStateRef = useRef<DrillSaveState>('idle');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (drillId === undefined) {
      return undefined;
    }

    let active = true;

    const load = async () => {
      try {
        const drill = await DrillStorageService.loadById(drillId);
        if (!active) {
          return;
        }
        if (drill === null) {
          setStatus('missing');
          return;
        }
        setDraftName(drill.name);
        setSteps(drill.steps);
        setStatus('ready');
      } catch (err) {
        if (!active) {
          return;
        }
        // An id the service will not even look up is a drill that is not
        // there; trying again cannot help, so it is not offered.
        const unusableId =
          err instanceof DrillStorageError && err.code === 'INVALID_INPUT';
        setStatus(unusableId ? 'missing' : 'error');
      }
    };

    // `load` settles every failure into state, so it never rejects.
    load().catch(() => {});

    return () => {
      active = false;
    };
  }, [drillId, attempt]);

  const reload = useCallback(() => {
    setStatus('loading');
    setAttempt(previous => previous + 1);
  }, []);

  // Every change to the draft goes through this. Once save is pressed the
  // draft is what is being stored: a change let through then would be on
  // screen when the editor closes and missing from the drill. A save that
  // fails goes back to `idle`, and the draft takes changes again.
  const whileEditable = useCallback((change: () => void) => {
    if (saveStateRef.current === 'idle') {
      change();
    }
  }, []);

  const setName = useCallback(
    (next: string) => whileEditable(() => setDraftName(next)),
    [whileEditable],
  );

  const addStep = useCallback(
    () => whileEditable(() => setSteps(previous => withStepAdded(previous))),
    [whileEditable],
  );

  const removeStep = useCallback(
    (id: string) =>
      whileEditable(() => setSteps(previous => withoutStep(previous, id))),
    [whileEditable],
  );

  const moveStep = useCallback(
    (id: string, toPosition: number) =>
      whileEditable(() =>
        setSteps(previous => withStepMoved(previous, id, toPosition)),
      ),
    [whileEditable],
  );

  const changeStepType = useCallback(
    (id: string, type: DrillStepType) =>
      whileEditable(() =>
        setSteps(previous => withStepType(previous, id, type)),
      ),
    [whileEditable],
  );

  const setStepPar = useCallback(
    (id: string, par: number | undefined) => {
      // `withStepPar` throws on a par the storage service would reject, and
      // a throw inside the updater would surface while React renders. The
      // picker only offers usable pars, so one that is not is left unset.
      if (par !== undefined && !isStepPar(par)) {
        return;
      }
      whileEditable(() => setSteps(previous => withStepPar(previous, id, par)));
    },
    [whileEditable],
  );

  const problems = useMemo(
    () => drillDraftProblems(name, steps),
    [name, steps],
  );
  const canSave =
    status === 'ready' && problems.length === 0 && saveState === 'idle';

  const save = useCallback(async (): Promise<Drill | null> => {
    if (
      status !== 'ready' ||
      problems.length > 0 ||
      saveStateRef.current !== 'idle'
    ) {
      return null;
    }

    const markSave = (next: DrillSaveState) => {
      saveStateRef.current = next;
      if (mountedRef.current) {
        setSaveState(next);
      }
    };

    markSave('saving');
    setSaveFailure(null);
    const draft: DrillInput = { name, steps };

    try {
      const drill =
        drillId === undefined
          ? await DrillStorageService.save(draft)
          : await DrillStorageService.update(drillId, draft);
      markSave('saved');
      return mountedRef.current ? drill : null;
    } catch (err) {
      markSave('idle');
      if (mountedRef.current) {
        setSaveFailure(saveFailureOf(err));
      }
      return null;
    }
  }, [drillId, name, problems, status, steps]);

  return {
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
    moveStep,
    changeStepType,
    setStepPar,
    reload,
    save,
  };
};
