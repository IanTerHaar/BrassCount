import { AccessibilityInfo } from 'react-native';

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useReduceMotion } from '../src/hooks/useReduceMotion';

type Listener = (enabled: boolean) => void;

/** What the hook last returned. */
let seen: boolean | undefined;

const Probe = () => {
  seen = useReduceMotion();
  return null;
};

/** Stands in for the device setting and its change event. */
const fakeSetting = (answer: Promise<boolean>) => {
  const listeners = new Set<Listener>();
  const remove = jest.fn();

  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockReturnValue(answer);
  // Only the reduce motion event is faked: React Native listens for other
  // accessibility events of its own while a tree is mounted.
  const subscribe = (event: string, listener: Listener) => {
    if (event !== 'reduceMotionChanged') {
      return { remove: () => {} };
    }
    listeners.add(listener);
    return {
      remove: () => {
        remove();
        listeners.delete(listener);
      },
    };
  };
  // `addEventListener` is overloaded per event, which one fake cannot be
  // typed against.
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation(
      subscribe as unknown as typeof AccessibilityInfo.addEventListener,
    );

  return {
    /** How many listeners the reduce motion event has right now. */
    listening: () => listeners.size,
    remove,
    change: (enabled: boolean) =>
      listeners.forEach(listener => listener(enabled)),
  };
};

const mounted: ReactTestRenderer[] = [];

const mountProbe = async (): Promise<ReactTestRenderer> => {
  let tree: ReactTestRenderer | undefined;
  await act(async () => {
    tree = create(<Probe />);
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  mounted.push(tree);
  return tree;
};

describe('useReduceMotion', () => {
  beforeEach(() => {
    seen = undefined;
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
  });

  it('reads false until the device has answered', () => {
    fakeSetting(new Promise<boolean>(() => {}));

    act(() => {
      mounted.push(create(<Probe />));
    });

    expect(seen).toBe(false);
  });

  it('reads true when the device asks for less motion', async () => {
    fakeSetting(Promise.resolve(true));

    await mountProbe();

    expect(seen).toBe(true);
  });

  it('follows the setting when it changes', async () => {
    const setting = fakeSetting(Promise.resolve(false));
    await mountProbe();

    act(() => setting.change(true));
    expect(seen).toBe(true);

    act(() => setting.change(false));
    expect(seen).toBe(false);
  });

  it('keeps motion on when the device cannot be asked', async () => {
    fakeSetting(Promise.reject(new Error('unavailable')));

    await mountProbe();

    expect(seen).toBe(false);
  });

  it('stops listening when it unmounts', async () => {
    const setting = fakeSetting(Promise.resolve(false));
    const tree = await mountProbe();

    expect(setting.listening()).toBe(1);

    act(() => tree.unmount());
    mounted.splice(0);

    expect(setting.remove).toHaveBeenCalledTimes(1);
    expect(setting.listening()).toBe(0);
  });

  it('ignores an answer that arrives after it unmounted', async () => {
    let answer: (enabled: boolean) => void = () => {};
    fakeSetting(
      new Promise<boolean>(resolve => {
        answer = resolve;
      }),
    );
    const tree = await mountProbe();
    act(() => tree.unmount());
    mounted.splice(0);

    await act(async () => {
      answer(true);
    });

    expect(seen).toBe(false);
  });
});
