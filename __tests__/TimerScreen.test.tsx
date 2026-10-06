import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TimerScreen } from '../src/screens/TimerScreen';
import { StartSequenceService } from '../src/services/startSequence';
import { formatElapsed } from '../src/utils/format';

jest.mock('../src/services/startSequence', () => {
  const actual = jest.requireActual('../src/services/startSequence');
  return {
    ...actual,
    StartSequenceService: {
      ...actual.StartSequenceService,
      prepare: jest.fn(async () => {}),
      release: jest.fn(async () => {}),
      start: jest.fn(),
    },
  };
});

const startMock = StartSequenceService.start as jest.Mock;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = (): ReactTestRenderer => {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <TimerScreen />
      </SafeAreaProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return tree;
};

const button = (tree: ReactTestRenderer) =>
  tree.root.findAllByProps({ testID: 'btn-start' })[0];

const elapsedText = (tree: ReactTestRenderer) =>
  tree.root.findAllByProps({ testID: 'text-elapsed' })[0].props.children;

describe('TimerScreen start sequence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    startMock.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('holds in the waiting phase until the beep resolves', async () => {
    startMock.mockImplementation(() => new Promise(() => {}));

    const tree = renderScreen();
    expect(button(tree).props.accessibilityLabel).toBe('Start timer');

    await act(async () => {
      button(tree).props.onPress();
    });

    expect(button(tree).props.accessibilityLabel).toBe('Cancel start');
    expect(elapsedText(tree)).toBe(formatElapsed(0));
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it('times from the beep onset once the sequence resolves', async () => {
    startMock.mockResolvedValue({ startedAt: Date.now(), delayMs: 2000 });

    const tree = renderScreen();

    await act(async () => {
      button(tree).props.onPress();
    });
    expect(button(tree).props.accessibilityLabel).toBe('Stop timer');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(elapsedText(tree)).toBe(formatElapsed(1));
  });

  it('aborts the pending beep when tapped during the wait', async () => {
    startMock.mockImplementation(
      (options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );

    const tree = renderScreen();

    await act(async () => {
      button(tree).props.onPress();
    });
    expect(button(tree).props.accessibilityLabel).toBe('Cancel start');

    await act(async () => {
      button(tree).props.onPress();
    });
    expect(button(tree).props.accessibilityLabel).toBe('Start timer');
    expect(startMock.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it('surfaces a backend failure and returns to idle', async () => {
    startMock.mockRejectedValue(new Error('no audio'));

    const tree = renderScreen();

    await act(async () => {
      button(tree).props.onPress();
    });

    expect(button(tree).props.accessibilityLabel).toBe('Start timer');
    expect(
      tree.root.findAllByProps({ testID: 'screen-timer' })[0].props.subtitle,
    ).toBe('Could not play the start beep');
  });
});
