/**
 * Runs async tasks one at a time, in the order they were queued. Used by
 * the storage services whose changes read a value and then write it back,
 * where an overlapping change could otherwise land in between and be lost.
 */

/** Queue `task` to run once every task queued before it has settled. */
export type SerialQueue = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Create an independent queue. A task that fails rejects only its own
 * promise; the tasks queued after it still run.
 */
export const createSerialQueue = (): SerialQueue => {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task);
    // The queue only cares that the task finished; its failure belongs to
    // the caller, who gets it from `result`.
    tail = result.catch(() => undefined);
    return result;
  };
};
