import {
  DRILL_STEP_TYPES,
  MAX_DRILL_NAME_LENGTH,
  MAX_DRILL_STEPS,
  MAX_STEP_PAR_SECONDS,
  type Drill,
  type DrillChanges,
  type DrillInput,
  type DrillStep,
  type DrillStepType,
} from '@/types/drill';
import { countShots, isStepPar, totalPar } from '@utils/drill';
import { isNonEmptyString, isRecord, isTimestamp } from '@utils/guards';
import { generateId as defaultGenerateId } from '@utils/id';
import { createSerialQueue } from '@utils/serialQueue';
import { getTimestamp as defaultGetTimestamp } from '@utils/timestamp';

import { createStorageNamespace, StorageError } from './storage';

/**
 * DrillStorageService
 * -------------------
 * Local persistence layer for drills, and the one place a drill's derived
 * totals (`totalPar`, `shotCount`) are worked out.
 *
 * Design notes:
 *   - Each drill is stored under its own key
 *     (`@BrassCount:drills:v1:<id>`), so a write never rewrites the list.
 *   - Every stored value is an envelope, `{ schemaVersion, drill }`. When
 *     the `Drill` shape changes, bump `DRILL_SCHEMA_VERSION` and upgrade
 *     older envelopes in `parseStoredDrill` — existing data is migrated in
 *     place rather than abandoned under an old key.
 *   - Ids, timestamps and the derived totals are stamped by the service.
 *     Callers supply a name and steps and get the full `Drill` back.
 *   - Anything read back from storage is untrusted: it is checked field by
 *     field, the totals are recomputed from the steps, and an entry that
 *     does not pass is skipped like corrupt JSON instead of failing the
 *     whole read.
 *   - A drill is bounded (`MAX_DRILL_NAME_LENGTH`, `MAX_DRILL_STEPS`,
 *     `MAX_STEP_PAR_SECONDS`) on save and on read alike.
 *   - Saves, updates, deletes and clears run one at a time, in the order
 *     they were requested, so overlapping changes cannot lose an edit or
 *     bring a deleted drill back.
 *   - Every failure surfaces as `DrillStorageError`, which is also a
 *     `StorageError`, so UI code can catch either.
 */

export const DRILL_NAMESPACE = 'drills';
export const DRILL_STORAGE_VERSION = 'v1';
/** Version of the `Drill` shape written inside each stored envelope. */
export const DRILL_SCHEMA_VERSION = 1;

/**
 * Why a drill operation failed: the caller passed something unusable, the
 * drill to update is not stored, or the device storage itself failed.
 */
export type DrillStorageErrorCode =
  'INVALID_INPUT' | 'NOT_FOUND' | 'STORAGE_FAILURE';

/**
 * Error thrown by this service. Branch on `code` to tell a rejected drill
 * from a storage failure; the underlying error, if any, is on `cause`.
 */
export class DrillStorageError extends StorageError {
  readonly code: DrillStorageErrorCode;

  constructor(message: string, code: DrillStorageErrorCode, cause?: unknown) {
    super(message, cause);
    this.name = 'DrillStorageError';
    this.code = code;
  }
}

export interface DrillStorageOptions {
  /** Source of new drill and step ids. Defaults to a UUID v4. */
  generateId?: () => string;
  /** Source of the ISO-8601 timestamp stamped on the drill. */
  getTimestamp?: () => string;
}

/** What is actually written under a drill's key. */
interface StoredDrill {
  schemaVersion: number;
  drill: Drill;
}

// Typed `unknown` on purpose: the storage layer only promises valid JSON,
// so every read goes through `parseStoredDrill` before it is a `Drill`.
const drills = createStorageNamespace<unknown>({
  name: DRILL_NAMESPACE,
  version: DRILL_STORAGE_VERSION,
});

const invalid = (message: string): DrillStorageError =>
  new DrillStorageError(message, 'INVALID_INPUT');

const isStepType = (value: unknown): value is DrillStepType =>
  DRILL_STEP_TYPES.some(type => type === value);

const assertId = (id: string, action: string): void => {
  if (!isNonEmptyString(id)) {
    throw invalid(`Cannot ${action} drill without a valid id`);
  }
};

const normalizeName = (name: unknown): string => {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw invalid('A drill needs a name');
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_DRILL_NAME_LENGTH) {
    throw invalid(
      `A drill name can be at most ${MAX_DRILL_NAME_LENGTH} characters`,
    );
  }
  return trimmed;
};

/**
 * Check one step and return a clean copy holding only the known fields.
 * A step without an id gets one from `generateId`; without a generator
 * (a step read back from storage) a missing id is an error.
 */
const normalizeStep = (
  step: unknown,
  position: number,
  generateId?: () => string,
): DrillStep => {
  const label = `Step ${position + 1}`;
  if (!isRecord(step)) {
    throw invalid(`${label} is not a step`);
  }

  const { type, par } = step;
  if (!isStepType(type)) {
    throw invalid(`${label} has an unknown type`);
  }
  if (par !== undefined && !isStepPar(par)) {
    throw invalid(
      `${label} par must be more than 0 and at most ${MAX_STEP_PAR_SECONDS} seconds`,
    );
  }

  const id = step.id === undefined && generateId ? generateId() : step.id;
  if (!isNonEmptyString(id)) {
    throw invalid(`${label} has no valid id`);
  }

  return par === undefined ? { id, type } : { id, type, par };
};

const normalizeSteps = (
  steps: unknown,
  generateId?: () => string,
): DrillStep[] => {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw invalid('A drill needs at least one step');
  }
  if (steps.length > MAX_DRILL_STEPS) {
    throw invalid(`A drill can have at most ${MAX_DRILL_STEPS} steps`);
  }

  const normalized = steps.map((step, position) =>
    normalizeStep(step, position, generateId),
  );
  if (new Set(normalized.map(step => step.id)).size !== normalized.length) {
    throw invalid('Step ids must be unique within a drill');
  }
  return normalized;
};

/** Assemble a drill, deriving its totals from the steps. */
const buildDrill = (
  fields: Pick<Drill, 'id' | 'name' | 'steps' | 'createdAt' | 'updatedAt'>,
): Drill => ({
  id: fields.id,
  name: fields.name,
  steps: fields.steps,
  totalPar: totalPar(fields.steps),
  shotCount: countShots(fields.steps),
  createdAt: fields.createdAt,
  updatedAt: fields.updatedAt,
});

/**
 * Turn a value read from storage back into a `Drill`, or `null` when it
 * cannot be trusted: not an envelope, a schema version this build does not
 * know, or a drill that fails the same checks a save applies.
 */
const parseStoredDrill = (stored: unknown): Drill | null => {
  if (!isRecord(stored) || !isRecord(stored.drill)) {
    return null;
  }
  // Only one schema exists so far. When version 2 lands, upgrade older
  // envelopes here before the checks below. A version newer than this
  // build understands is left alone on disk rather than guessed at.
  if (stored.schemaVersion !== DRILL_SCHEMA_VERSION) {
    return null;
  }

  const { id, name, steps, createdAt, updatedAt } = stored.drill;
  if (
    !isNonEmptyString(id) ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    return null;
  }

  try {
    return buildDrill({
      id,
      name: normalizeName(name),
      steps: normalizeSteps(steps),
      createdAt,
      updatedAt,
    });
  } catch (err) {
    // A stored drill that fails validation is skipped, the same way the
    // storage layer skips corrupt JSON, so one bad entry cannot block
    // loading the rest.
    if (err instanceof DrillStorageError) {
      return null;
    }
    throw err;
  }
};

/** Run a storage call, rethrowing its failure as a `DrillStorageError`. */
const withStorage = async <T>(
  action: string,
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    throw new DrillStorageError(`Failed to ${action}`, 'STORAGE_FAILURE', err);
  }
};

const writeDrill = async (drill: Drill, action: string): Promise<void> => {
  const stored: StoredDrill = { schemaVersion: DRILL_SCHEMA_VERSION, drill };
  await withStorage(action, () => drills.setItem(drill.id, stored));
};

// Queue of changes to stored drills. `updateDrill` reads a drill and then
// writes it back, so an overlapping update or delete could otherwise land
// in between: one edit silently lost, or a drill that was just deleted
// written back. Running every change one after another closes that gap.
// Writes are rare, user-driven actions, so a single queue for all drills
// costs nothing.
const inOrder = createSerialQueue();

const byNewestUpdate = (a: Drill, b: Drill): number =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
  a.name.localeCompare(b.name);

/**
 * Create a drill and persist it.
 *
 * The service generates the drill id and an id for every step that does
 * not already have one, stamps `createdAt` / `updatedAt`, and derives
 * `totalPar` and `shotCount` from the steps. The name is trimmed.
 *
 * Returns the stored `Drill` so callers can update local state without a
 * follow-up read. Rejects with `INVALID_INPUT` when the name is blank or
 * longer than `MAX_DRILL_NAME_LENGTH`, there are no steps or more than
 * `MAX_DRILL_STEPS`, or a step has an unknown type or a par outside
 * 0 (exclusive) to `MAX_STEP_PAR_SECONDS`.
 */
export async function saveDrill(
  input: DrillInput,
  options: DrillStorageOptions = {},
): Promise<Drill> {
  const { generateId = defaultGenerateId, getTimestamp = defaultGetTimestamp } =
    options;

  if (!isRecord(input)) {
    throw invalid('saveDrill requires a drill payload');
  }

  const timestamp = getTimestamp();
  const drill = buildDrill({
    id: generateId(),
    name: normalizeName(input.name),
    steps: normalizeSteps(input.steps, generateId),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await inOrder(() => writeDrill(drill, 'save drill'));
  return drill;
}

/**
 * Load every drill stored on the device, most recently updated first.
 * Entries that are corrupt or fail validation are left out.
 */
export async function loadDrills(): Promise<Drill[]> {
  const stored = await withStorage('load drills', () => drills.getAll());
  return stored
    .map(entry => parseStoredDrill(entry))
    .filter((drill): drill is Drill => drill !== null)
    .sort(byNewestUpdate);
}

/**
 * Load a single drill by id. Resolves to `null` when the id is unknown or
 * the stored value is corrupt or fails validation.
 */
export async function loadDrillById(id: string): Promise<Drill | null> {
  assertId(id, 'load');
  const stored = await withStorage('load drill', () => drills.getItem(id));
  return parseStoredDrill(stored);
}

/**
 * Change the name and/or steps of an existing drill.
 *
 * Fields left out of `changes` keep their stored value. `id` and
 * `createdAt` never change, `updatedAt` is set to now, and the totals are
 * derived again from the resulting steps. Steps passed with their `id`
 * keep it; steps without one are given a new id.
 *
 * Changes to stored drills run one at a time, in the order they were
 * requested: two overlapping updates both apply, and an update requested
 * after a delete finds nothing to update instead of restoring the drill.
 *
 * Rejects with `NOT_FOUND` when no readable drill is stored under `id`,
 * and with `INVALID_INPUT` under the same rules as `saveDrill`.
 */
export async function updateDrill(
  id: string,
  changes: DrillChanges,
  options: DrillStorageOptions = {},
): Promise<Drill> {
  const { generateId = defaultGenerateId, getTimestamp = defaultGetTimestamp } =
    options;

  assertId(id, 'update');
  if (!isRecord(changes)) {
    throw invalid('updateDrill requires the changes to apply');
  }
  // Validate before touching storage so a bad edit fails fast.
  const name =
    changes.name === undefined ? undefined : normalizeName(changes.name);
  const steps =
    changes.steps === undefined
      ? undefined
      : normalizeSteps(changes.steps, generateId);

  return inOrder(async () => {
    const existing = await loadDrillById(id);
    if (existing === null) {
      throw new DrillStorageError(
        'Cannot update a drill that is not stored',
        'NOT_FOUND',
      );
    }

    const drill = buildDrill({
      id: existing.id,
      name: name ?? existing.name,
      steps: steps ?? existing.steps,
      createdAt: existing.createdAt,
      updatedAt: getTimestamp(),
    });

    await writeDrill(drill, 'update drill');
    return drill;
  });
}

/**
 * Delete a drill by id. Idempotent: deleting an unknown id is a no-op.
 */
export async function deleteDrillById(id: string): Promise<void> {
  assertId(id, 'delete');
  await inOrder(() => withStorage('delete drill', () => drills.removeItem(id)));
}

/**
 * Remove every drill from storage. Primarily useful for tests and "reset
 * app data" flows.
 */
export async function clearDrills(): Promise<void> {
  await inOrder(() => withStorage('clear drills', () => drills.clear()));
}

/** Object-form export for callers that prefer a service handle. */
export const DrillStorageService = {
  namespace: DRILL_NAMESPACE,
  version: DRILL_STORAGE_VERSION,
  schemaVersion: DRILL_SCHEMA_VERSION,
  save: saveDrill,
  loadAll: loadDrills,
  loadById: loadDrillById,
  update: updateDrill,
  deleteById: deleteDrillById,
  clear: clearDrills,
};

export type DrillStorageServiceType = typeof DrillStorageService;
