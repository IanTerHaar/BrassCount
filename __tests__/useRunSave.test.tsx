import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useRunSave, type UseRunSaveResult } from '../src/hooks/useRunSave';
import { loadSessions } from '../src/services/sessionStorage';
import type { Drill } from '../src/types/drill';
import type { RunResult } from '../src/types/run';
import { MAX_SESSION_SECONDS } from '../src/types/session';

/**
 * Saving a finished run: what `save` stores, and how the hook reports a
 * save in flight, done or refused. The prompt it drives is covered through
 * the Timer screen.
 */

const DRILL: Pick<Drill, 'id' | 'steps'> = {
  id: 'drill-1',
  steps: [
    { id: 'draw', type: 'draw', par: 1.5 },
    { id: 'shot-1', type: 'shot', par: 0.25 },
    { id: 'shot-2', type: 'shot', par: 0.25 },
  ],
};

const run = (overrides: Partial<RunResult> = {}): RunResult => ({
  completed: true,
  results: [
    { stepId: 'shot-1', par: 1.75, actual: 1.4, delta: -0.35 },
    { stepId: 'shot-2', par: 0.25, actual: 0.3, delta: 0.05 },
  ],
  totalTime: 1.7,
  zeroSource: 'beep',
  beepDelayMs: 84,
  clockSource: 'frame',
  ...overrides,
});

type ProbeProps = {
  drill: Pick<Drill, 'id' | 'steps'> | null;
  result: RunResult | null;
  onValue: (value: UseRunSaveResult) => void;
};

/** Renders nothing; hands the hook's current value to the test. */
const Probe = ({ drill, result, onValue }: ProbeProps) => {
  onValue(useRunSave(drill, result));
  return null;
};

/** Let pending storage calls and the state updates they cause land. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>(resolve => {
      setImmediate(resolve);
    });
  });
};

const mounted: ReactTestRenderer[] = [];

const renderHook = (
  drill: ProbeProps['drill'],
  result: ProbeProps['result'],
) => {
  let value: UseRunSaveResult | undefined;
  const onValue = (next: UseRunSaveResult) => {
    value = next;
  };
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(<Probe drill={drill} result={result} onValue={onValue} />);
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  const rendered = tree;
  mounted.push(rendered);
  return {
    current: (): UseRunSaveResult => {
      if (value === undefined) {
        throw new Error('the hook has not rendered');
      }
      return value;
    },
    rerender: (nextResult: RunResult | null) => {
      act(() => {
        rendered.update(
          <Probe drill={drill} result={nextResult} onValue={onValue} />,
        );
      });
    },
    unmount: () => {
      act(() => rendered.unmount());
      mounted.splice(mounted.indexOf(rendered), 1);
    },
  };
};

describe('useRunSave', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
  });

  it('has nothing to save before a run has finished', async () => {
    const hook = renderHook(DRILL, null);

    expect(hook.current().session).toBeNull();
    let stored: unknown;
    await act(async () => {
      stored = await hook.current().save();
    });

    expect(stored).toBeNull();
    expect(await loadSessions()).toEqual([]);
  });

  it('offers the run as the session it would save, without storing it', async () => {
    const hook = renderHook(DRILL, run());

    expect(hook.current()).toMatchObject({
      status: 'unsaved',
      failure: null,
      session: { drillId: 'drill-1', completed: true, totalTime: 1.7 },
    });
    expect(await loadSessions()).toEqual([]);
  });

  it('stores the run and resolves to the stored session', async () => {
    const hook = renderHook(DRILL, run());

    let stored: Awaited<ReturnType<UseRunSaveResult['save']>> = null;
    await act(async () => {
      stored = await hook.current().save();
    });

    expect(hook.current().status).toBe('saved');
    expect(await loadSessions()).toEqual([stored]);
  });

  it('reports the save as under way until the write lands', async () => {
    const hook = renderHook(DRILL, run());

    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = hook.current().save();
    });
    expect(hook.current().status).toBe('saving');

    await act(async () => {
      await saving;
    });
    expect(hook.current().status).toBe('saved');
  });

  it('does not save the same run a second time', async () => {
    const hook = renderHook(DRILL, run());
    await act(async () => {
      await hook.current().save();
    });

    let second: unknown;
    await act(async () => {
      second = await hook.current().save();
    });

    expect(second).toBeNull();
    expect(await loadSessions()).toHaveLength(1);
  });

  it('says a run storage turns down cannot be saved', async () => {
    const hook = renderHook(DRILL, run({ totalTime: MAX_SESSION_SECONDS + 1 }));

    await act(async () => {
      await hook.current().save();
    });

    expect(hook.current()).toMatchObject({
      status: 'unsaved',
      failure: 'invalid',
    });
    expect(await loadSessions()).toEqual([]);
  });

  it('does not send a run storage turned down a second time', async () => {
    const hook = renderHook(DRILL, run({ totalTime: MAX_SESSION_SECONDS + 1 }));
    await act(async () => {
      await hook.current().save();
    });
    const setItem = jest.spyOn(AsyncStorage, 'setItem');

    let again: unknown;
    await act(async () => {
      again = await hook.current().save();
    });

    expect(again).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    expect(hook.current().failure).toBe('invalid');
  });

  it('says so when the device storage fails, and can try again', async () => {
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('disk full'));
    const hook = renderHook(DRILL, run());

    await act(async () => {
      await hook.current().save();
    });
    expect(hook.current()).toMatchObject({
      status: 'unsaved',
      failure: 'failed',
    });

    await act(async () => {
      await hook.current().save();
    });
    expect(hook.current()).toMatchObject({ status: 'saved', failure: null });
  });

  it('starts a new run from unsaved, whatever happened to the last', async () => {
    const hook = renderHook(DRILL, run());
    await act(async () => {
      await hook.current().save();
    });

    hook.rerender(run({ totalTime: 1.9 }));

    expect(hook.current()).toMatchObject({
      status: 'unsaved',
      failure: null,
      session: { totalTime: 1.9 },
    });
  });

  it('does not mark a newer run saved when an older run’s write lands', async () => {
    const hook = renderHook(DRILL, run());
    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = hook.current().save();
    });

    hook.rerender(run({ totalTime: 1.9 }));
    await act(async () => {
      await saving;
    });

    expect(hook.current().status).toBe('unsaved');
    expect(await loadSessions()).toHaveLength(1);
  });

  it('lets the write finish when the screen goes away during it', async () => {
    const hook = renderHook(DRILL, run());
    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = hook.current().save();
    });

    hook.unmount();
    await settle();

    await expect(saving).resolves.not.toBeNull();
    expect(await loadSessions()).toHaveLength(1);
  });
});
