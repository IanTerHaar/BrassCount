import { createSerialQueue } from '../src/utils/serialQueue';

/** A promise settled from outside, so a test decides when a task ends. */
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} => {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Let every microtask queued so far run. */
const flush = (): Promise<void> =>
  new Promise(resolve => {
    setImmediate(resolve);
  });

describe('createSerialQueue', () => {
  it('resolves with the value the task resolves to', async () => {
    const inOrder = createSerialQueue();

    await expect(inOrder(async () => 'done')).resolves.toBe('done');
  });

  it('does not start a task until the one before it has settled', async () => {
    const inOrder = createSerialQueue();
    const first = deferred<void>();
    const started: string[] = [];

    const firstResult = inOrder(() => {
      started.push('first');
      return first.promise;
    });
    const secondResult = inOrder(async () => {
      started.push('second');
    });
    await flush();

    expect(started).toEqual(['first']);

    first.resolve();
    await Promise.all([firstResult, secondResult]);

    expect(started).toEqual(['first', 'second']);
  });

  it('runs tasks in the order they were queued', async () => {
    const inOrder = createSerialQueue();
    const slow = deferred<void>();
    const finished: number[] = [];

    const results = [
      inOrder(async () => {
        await slow.promise;
        finished.push(1);
      }),
      inOrder(async () => {
        finished.push(2);
      }),
      inOrder(async () => {
        finished.push(3);
      }),
    ];
    slow.resolve();
    await Promise.all(results);

    expect(finished).toEqual([1, 2, 3]);
  });

  it('rejects with the failure of the task that failed', async () => {
    const inOrder = createSerialQueue();
    const failure = new Error('disk full');

    await expect(
      inOrder(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it('keeps running tasks after one of them fails', async () => {
    const inOrder = createSerialQueue();

    const failed = inOrder(async () => {
      throw new Error('disk full');
    });
    const next = inOrder(async () => 'kept');

    await expect(failed).rejects.toBeInstanceOf(Error);
    await expect(next).resolves.toBe('kept');
  });

  it('keeps separate queues independent of each other', async () => {
    const blocked = createSerialQueue();
    const free = createSerialQueue();
    const never = deferred<void>();

    const stuck = blocked(() => never.promise);

    await expect(free(async () => 'ran')).resolves.toBe('ran');

    never.resolve();
    await stuck;
  });
});
