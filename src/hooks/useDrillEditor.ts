import { useCallback, useEffect, useState } from 'react';

import type { DrillStep, DrillStepType } from '@/types/drill';
import { DrillStorageError, DrillStorageService } from '@services/drillStorage';
import { isStepPar } from '@utils/drill';
import {
  addStep as withStepAdded,
  changeStepType as withStepType,
  removeStep as withoutStep,
  setStepPar as withStepPar,
} from '@utils/drillDraft';

/**
 * Where the editor stands: reading the drill it was opened on, ready to
 * edit, or unable to — the drill is not stored (`missing`) or reading it
 * failed (`error`). A new drill is `ready` from the start.
 */
export type DrillEditorStatus = 'loading' | 'ready' | 'missing' | 'error';

export type UseDrillEditorResult = {
  status: DrillEditorStatus;
  name: string;
  /** The steps in the order they are performed. */
  steps: readonly DrillStep[];
  setName: (name: string) => void;
  /** Add an untimed step at the end: a draw first, a shot after that. */
  addStep: () => void;
  removeStep: (id: string) => void;
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
};

/**
 * The draft behind the drill editor: a name and an ordered step list held
 * in local state. Nothing here writes to storage — the draft is lost when
 * the editor closes.
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
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<readonly DrillStep[]>([]);
  // Bumped by `reload` to run the read again.
  const [attempt, setAttempt] = useState(0);

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
        setName(drill.name);
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

  const addStep = useCallback(
    () => setSteps(previous => withStepAdded(previous)),
    [],
  );

  const removeStep = useCallback(
    (id: string) => setSteps(previous => withoutStep(previous, id)),
    [],
  );

  const changeStepType = useCallback(
    (id: string, type: DrillStepType) =>
      setSteps(previous => withStepType(previous, id, type)),
    [],
  );

  const setStepPar = useCallback((id: string, par: number | undefined) => {
    // `withStepPar` throws on a par the storage service would reject, and
    // a throw inside the updater would surface while React renders. The
    // picker only offers usable pars, so one that is not is left unset.
    if (par !== undefined && !isStepPar(par)) {
      return;
    }
    setSteps(previous => withStepPar(previous, id, par));
  }, []);

  return {
    status,
    name,
    steps,
    setName,
    addStep,
    removeStep,
    changeStepType,
    setStepPar,
    reload,
  };
};
