import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Drill } from '@/types/drill';
import type { RunResult } from '@/types/run';
import type { Session, SessionInput } from '@/types/session';
import {
  SessionStorageError,
  SessionStorageService,
} from '@services/sessionStorage';
import { sessionFromRun } from '@utils/session';

/**
 * Where saving the finished run is. `unsaved`: nothing has been written
 * and Save is on offer. `saving`: the write is under way. `saved`: the
 * run is in History; final, so a second press cannot store it twice.
 */
export type RunSaveStatus = 'unsaved' | 'saving' | 'saved';

/**
 * Why the last save fell short. `invalid`: storage refused the run as it
 * is, so trying again cannot help. `failed`: the device storage failed.
 */
export type RunSaveFailure = 'invalid' | 'failed';

export type UseRunSaveResult = {
  /**
   * What Save would store, or `null` when there is nothing to save: no
   * run has finished, or nothing was heard in it.
   */
  session: SessionInput | null;
  status: RunSaveStatus;
  failure: RunSaveFailure | null;
  /**
   * Store the run. Never rejects: resolves to the stored `Session`, or
   * `null` when nothing was stored — there was nothing to save, a save of
   * this run was already under way or done, or the write failed (see
   * `failure`).
   */
  save: () => Promise<Session | null>;
};

/** What has happened to one finished run. */
type SaveRecord = {
  /** The run it is about; a record for any other run does not apply. */
  result: RunResult;
  status: RunSaveStatus;
  failure: RunSaveFailure | null;
};

const NOT_SAVED = { status: 'unsaved', failure: null } as const;

/**
 * Saves a finished run of the Timer as a session, when the shooter asks
 * to. Nothing is written until `save` is called, so a run that is not
 * wanted never reaches History: it is discarded by moving on from it.
 *
 * Everything here belongs to one finished run, `result`. A new run, or
 * none, starts from `unsaved` with no failure, without an effect to reset
 * it.
 *
 * `drill` must be the drill the run was made against, as it was when the
 * run started: a split's label and the session's drill id come from it.
 */
export const useRunSave = (
  drill: Pick<Drill, 'id' | 'steps'> | null,
  result: RunResult | null,
): UseRunSaveResult => {
  const [record, setRecord] = useState<SaveRecord | null>(null);
  // The run a save is under way for, or has saved. Read by `save` before
  // any state has rendered, so two presses in one frame store it once.
  const claimedRef = useRef<RunResult | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const session = useMemo(
    () =>
      drill === null || result === null ? null : sessionFromRun(drill, result),
    [drill, result],
  );
  const current =
    record !== null && record.result === result ? record : NOT_SAVED;

  const save = useCallback(async (): Promise<Session | null> => {
    if (session === null || result === null || claimedRef.current === result) {
      return null;
    }
    claimedRef.current = result;
    setRecord({ result, status: 'saving', failure: null });

    // A record about an older run does not apply, so it is dropped.
    const settle = (next: Omit<SaveRecord, 'result'>): void => {
      if (mountedRef.current) {
        setRecord(previous =>
          previous?.result === result ? { result, ...next } : previous,
        );
      }
    };

    try {
      const stored = await SessionStorageService.save(session);
      settle({ status: 'saved', failure: null });
      return stored;
    } catch (err) {
      const invalid =
        err instanceof SessionStorageError && err.code === 'INVALID_INPUT';
      // Nothing was stored. A storage failure may pass, so the run is free
      // to be tried again; a run storage refused stays claimed, since the
      // same input would only be refused again.
      if (!invalid && claimedRef.current === result) {
        claimedRef.current = null;
      }
      settle({ status: 'unsaved', failure: invalid ? 'invalid' : 'failed' });
      return null;
    }
  }, [result, session]);

  return { session, status: current.status, failure: current.failure, save };
};
