import {
  DeviceEventEmitter,
  Dimensions,
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
} from 'react-native';

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';

import { useCalibration } from '../src/hooks/useCalibration';
import { CalibrationScreen } from '../src/screens/CalibrationScreen';
import {
  AUDIO_AMPLITUDE_EVENT,
  AUDIO_CAPTURE_ERROR_EVENT,
} from '../src/services/audioCapture';
import NativeAudioCapture from '../src/specs/NativeAudioCapture';
import {
  CalibrationProvider,
  type CalibrationContextValue,
} from '../src/store/CalibrationContext';
import { CALIBRATION_SOUNDS } from '../src/types/calibration';
import type { CalibrationSound } from '../src/types/calibration';
import { CALIBRATION_LISTEN_MS } from '../src/utils/calibration';

// The native module itself is mocked globally in jest.setup.js.
const mockedNativeAudioCapture = jest.mocked(NativeAudioCapture);

type TestTabParamList = {
  Calibration: undefined;
  Elsewhere: undefined;
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const Tab = createBottomTabNavigator<TestTabParamList>();

/** Stands in for the other tabs. */
const Blank = () => null;

/** Sits beside the screen so a test can drive the store it reads from. */
const StoreHandle = ({
  onValue,
}: {
  onValue: (value: CalibrationContextValue) => void;
}) => {
  onValue(useCalibration());
  return null;
};

const mounted: ReactTestRenderer[] = [];

/**
 * Mount the screen as a tab, the way the app does: it stops listening when
 * its tab loses focus, so it needs a navigator to tell it.
 */
const renderScreen = () => {
  const navigationRef = createNavigationContainerRef<TestTabParamList>();
  let store: CalibrationContextValue | undefined;
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <CalibrationProvider>
          <StoreHandle
            onValue={value => {
              store = value;
            }}
          />
          <NavigationContainer ref={navigationRef}>
            <Tab.Navigator screenOptions={{ headerShown: false }}>
              <Tab.Screen name="Calibration" component={CalibrationScreen} />
              <Tab.Screen name="Elsewhere" component={Blank} />
            </Tab.Navigator>
          </NavigationContainer>
        </CalibrationProvider>
      </SafeAreaProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  mounted.push(tree);
  return {
    tree,
    store: (): CalibrationContextValue => {
      if (store === undefined) {
        throw new Error('store handle has not rendered');
      }
      return store;
    },
    /** Switch to another tab, or back to Calibration. */
    goTo: (tab: keyof TestTabParamList): void => {
      act(() => {
        navigationRef.navigate(tab);
      });
    },
  };
};

const chipLabel = (tree: ReactTestRenderer, sound: CalibrationSound): string =>
  tree.root.findAllByProps({ testID: `chip-calibration-${sound}` })[0].props
    .label;

const thresholdText = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): string =>
  tree.root.findAllByProps({ testID: `text-threshold-${sound}` })[0].props
    .children;

const lastTestText = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): string =>
  tree.root.findAllByProps({ testID: `text-last-test-${sound}` })[0].props
    .children;

const spokenSummary = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): string =>
  tree.root.findAllByProps({ testID: `summary-calibration-${sound}` })[0].props
    .accessibilityLabel;

const meterFillWidth = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): unknown =>
  StyleSheet.flatten(
    tree.root.findAllByProps({ testID: `meter-calibration-${sound}` })[0].props
      .style,
  ).width;

/** Where the last-test tick sits along the meter, or `null` when there is none. */
const markerPosition = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): unknown => {
  const markers = tree.root.findAllByProps({
    testID: `marker-last-test-${sound}`,
  });
  return markers.length === 0
    ? null
    : StyleSheet.flatten(markers[0].props.style).left;
};

const buttonLabel = (tree: ReactTestRenderer, testID: string): string =>
  tree.root.findAllByProps({ testID })[0].props.accessibilityLabel;

/** The word shown on a button. */
const buttonText = (tree: ReactTestRenderer, testID: string): string =>
  tree.root.findAllByProps({ testID })[0].props.label;

/** Whether a button is announced, and behaves, as disabled. */
const isDisabled = (tree: ReactTestRenderer, testID: string): boolean =>
  tree.root.findAll(
    node =>
      node.props.testID === testID &&
      node.props.accessibilityState !== undefined,
  )[0].props.accessibilityState.disabled;

/** What a screen reader is told about a button, after its label. */
const hintOf = (tree: ReactTestRenderer, testID: string): unknown =>
  tree.root.findAll(
    node =>
      node.props.testID === testID &&
      node.props.accessibilityState !== undefined,
  )[0].props.accessibilityHint;

const has = (tree: ReactTestRenderer, testID: string): boolean =>
  tree.root.findAllByProps({ testID }).length > 0;

/** The line under a card's readouts, or `null` when it shows none. */
const feedbackText = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): string | null => {
  const lines = tree.root.findAllByProps({
    testID: `text-feedback-${sound}`,
  });
  return lines.length === 0 ? null : lines[0].props.children;
};

/** What a screen reader says for that line. */
const feedbackSpoken = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): string | undefined =>
  tree.root.findAllByProps({ testID: `text-feedback-${sound}` })[0].props
    .accessibilityLabel;

/** Tap a button and let the capture it starts reach the microphone. */
const press = async (tree: ReactTestRenderer, testID: string) => {
  await act(async () => {
    tree.root.findAllByProps({ testID })[0].props.onPress();
    await jest.advanceTimersByTimeAsync(0);
  });
};

/** Deliver a reading with this peak level, as the microphone stream would. */
const hear = (peakDb: number): void => {
  act(() => {
    DeviceEventEmitter.emit(AUDIO_AMPLITUDE_EVENT, {
      amplitude: 0.1,
      db: peakDb - 3,
      peak: 0.2,
      peakDb,
      timestamp: 0,
      peakTimestamp: 0,
    });
  });
};

/** Let the rest of the listening window pass. */
const finishListening = async (): Promise<void> => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);
  });
};

/** Run one whole capture from a button, hearing the given peak levels. */
const capture = async (
  tree: ReactTestRenderer,
  testID: string,
  ...peaks: number[]
): Promise<void> => {
  await press(tree, testID);
  peaks.forEach(hear);
  await finishListening();
};

/** A rejection shaped like the one React Native builds from `promise.reject(code, message)`. */
const nativeRejection = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code });

/** Reports a new system font scale the way the OS does, as a window change. */
const setFontScale = (fontScale: number): void => {
  act(() => {
    Dimensions.set({
      window: { ...Dimensions.get('window'), fontScale },
      screen: Dimensions.get('screen'),
    });
  });
};

const minWidthOf = (instance: ReactTestInstance | null): unknown =>
  StyleSheet.flatten(instance?.props.style).minWidth;

/**
 * The width below which each wrapping piece of a card moves onto its own
 * line: the name beside the status chip, a readout, and a button.
 */
const wrapWidths = (
  tree: ReactTestRenderer,
  sound: CalibrationSound,
): { name: unknown; readout: unknown; button: unknown } => {
  const first = (testID: string): ReactTestInstance =>
    tree.root.findAllByProps({ testID })[0];
  const header = first(`chip-calibration-${sound}`).parent;
  return {
    name: minWidthOf((header?.children[1] as ReactTestInstance) ?? null),
    readout: minWidthOf(first(`text-threshold-${sound}`).parent),
    button: minWidthOf(first(`btn-recalibrate-${sound}`).parent),
  };
};

describe('CalibrationScreen', () => {
  const initialWindow = Dimensions.get('window');

  afterEach(() => {
    // Unmount, or the navigator's pending work outlives the test.
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    setFontScale(initialWindow.fontScale);
  });

  it('gives each wrapping piece of a card more room as the system font grows', () => {
    setFontScale(1);
    const { tree } = renderScreen();
    const atDefault = wrapWidths(tree, 'shot');

    setFontScale(2);
    const atLargest = wrapWidths(tree, 'shot');

    expect(atDefault.name).toEqual(expect.any(Number));
    expect(atDefault.readout).toEqual(expect.any(Number));
    expect(atDefault.button).toEqual(expect.any(Number));
    expect(atLargest).toEqual({
      name: (atDefault.name as number) * 2,
      readout: (atDefault.readout as number) * 2,
      button: (atDefault.button as number) * 2,
    });
  });

  it('shows the current session as active', () => {
    const { tree } = renderScreen();

    expect(
      tree.root.findAllByProps({ testID: 'banner-calibration-session' })[0]
        .props.accessibilityLabel,
    ).toBe('Current session, active. Thresholds apply until you close the app');
    expect(
      tree.root.findAllByProps({ testID: 'chip-calibration-session' })[0].props
        .label,
    ).toBe('Active');
  });

  it('lists a card for each sound', () => {
    const { tree } = renderScreen();

    CALIBRATION_SOUNDS.forEach(sound => {
      expect(
        tree.root.findAllByProps({ testID: `card-calibration-${sound}` }),
      ).not.toHaveLength(0);
    });
  });

  it('names the sound in each button so they read apart', () => {
    const { tree } = renderScreen();

    expect(buttonLabel(tree, 'btn-recalibrate-shot')).toBe('Recalibrate shot');
    expect(buttonLabel(tree, 'btn-test-shot')).toBe('Test shot');
    expect(buttonLabel(tree, 'btn-recalibrate-rack')).toBe('Recalibrate rack');
    expect(buttonLabel(tree, 'btn-test-reload')).toBe('Test reload');
  });

  it('announces each uncalibrated sound as one summary', () => {
    const { tree } = renderScreen();

    expect(spokenSummary(tree, 'shot')).toBe(
      'Shot, not calibrated, threshold not set',
    );
    expect(spokenSummary(tree, 'rack')).toBe(
      'Rack, not calibrated, threshold not set',
    );
  });

  it('announces a calibrated sound with its threshold in words', () => {
    const { tree, store } = renderScreen();

    act(() => {
      store().setThreshold('reload', -24);
    });

    expect(spokenSummary(tree, 'reload')).toBe(
      'Reload, calibrated, threshold minus 24 decibels, not tested yet',
    );
  });

  it('announces the last test reading once one is recorded', () => {
    const { tree, store } = renderScreen();
    act(() => {
      store().setThreshold('reload', -24);
    });

    act(() => {
      store().recordTestReading('reload', -18.6);
    });

    expect(spokenSummary(tree, 'reload')).toBe(
      'Reload, calibrated, threshold minus 24 decibels, last test minus 19 decibels, test passed',
    );
  });

  it('shows no last test reading until a test is recorded', () => {
    const { tree, store } = renderScreen();

    act(() => {
      store().setThreshold('shot', -12);
    });

    expect(lastTestText(tree, 'shot')).toBe('—');
    expect(markerPosition(tree, 'shot')).toBeNull();
  });

  it('shows the last test reading and marks it on the meter', () => {
    const { tree, store } = renderScreen();
    act(() => {
      store().setThreshold('shot', -30);
    });

    act(() => {
      store().recordTestReading('shot', -15);
    });

    expect(lastTestText(tree, 'shot')).toBe('-15 dB');
    expect(markerPosition(tree, 'shot')).toBe('75%');
    // The bar still shows the threshold, not the reading.
    expect(meterFillWidth(tree, 'shot')).toBe('50%');
    expect(thresholdText(tree, 'shot')).toBe('-30 dB');
  });

  it('keeps a last test reading below the meter floor at the start of the bar', () => {
    const { tree, store } = renderScreen();
    act(() => {
      store().setThreshold('rack', -40);
    });

    act(() => {
      store().recordTestReading('rack', -Infinity);
    });

    expect(markerPosition(tree, 'rack')).toBe('0%');
    expect(lastTestText(tree, 'rack')).toBe('-160 dB');
  });

  it('drops the last test reading when the sound is recalibrated', () => {
    const { tree, store } = renderScreen();
    act(() => {
      store().setThreshold('shot', -30);
    });
    act(() => {
      store().recordTestReading('shot', -15);
    });

    act(() => {
      store().setThreshold('shot', -20);
    });

    expect(lastTestText(tree, 'shot')).toBe('—');
    expect(markerPosition(tree, 'shot')).toBeNull();
  });

  it('shows a last test reading only on the sound that was tested', () => {
    const { tree, store } = renderScreen();
    act(() => {
      store().setThreshold('shot', -30);
      store().setThreshold('reload', -40);
    });

    act(() => {
      store().recordTestReading('shot', -15);
    });

    expect(lastTestText(tree, 'reload')).toBe('—');
    expect(markerPosition(tree, 'reload')).toBeNull();
  });

  it('draws an empty meter until a sound is calibrated', () => {
    const { tree } = renderScreen();

    expect(meterFillWidth(tree, 'shot')).toBe('0%');
  });

  it('fills the meter in proportion to the threshold', () => {
    const { tree, store } = renderScreen();

    act(() => {
      store().setThreshold('shot', -15);
    });

    expect(meterFillWidth(tree, 'shot')).toBe('75%');
  });

  it('draws an empty meter for a threshold below the meter floor', () => {
    const { tree, store } = renderScreen();

    act(() => {
      store().setThreshold('rack', -80);
    });

    expect(meterFillWidth(tree, 'rack')).toBe('0%');
    expect(thresholdText(tree, 'rack')).toBe('-80 dB');
  });

  it('shows every sound as not calibrated on a fresh launch', () => {
    const { tree } = renderScreen();

    CALIBRATION_SOUNDS.forEach(sound => {
      expect(chipLabel(tree, sound)).toBe('Not calibrated');
      expect(thresholdText(tree, sound)).toBe('—');
      expect(lastTestText(tree, sound)).toBe('—');
    });
  });

  it('shows a sound as calibrated with its threshold once one is set', () => {
    const { tree, store } = renderScreen();

    act(() => {
      store().setThreshold('shot', -12.4);
    });

    expect(chipLabel(tree, 'shot')).toBe('Calibrated');
    expect(thresholdText(tree, 'shot')).toBe('-12 dB');
  });

  it('leaves the other sounds not calibrated when one is set', () => {
    const { tree, store } = renderScreen();

    act(() => {
      store().setThreshold('shot', -12);
    });

    expect(chipLabel(tree, 'reload')).toBe('Not calibrated');
    expect(chipLabel(tree, 'rack')).toBe('Not calibrated');
  });

  it('goes back to not calibrated when the store is reset', () => {
    const { tree, store } = renderScreen();
    act(() => {
      store().setThreshold('rack', -40);
    });

    act(() => {
      store().resetAll();
    });

    expect(chipLabel(tree, 'rack')).toBe('Not calibrated');
    expect(thresholdText(tree, 'rack')).toBe('—');
  });

  describe('listening to the microphone', () => {
    const originalPlatformOS = Platform.OS;
    let permissionCheck: jest.SpiedFunction<typeof PermissionsAndroid.check>;
    let permissionRequest: jest.SpiedFunction<
      typeof PermissionsAndroid.request
    >;

    beforeEach(() => {
      jest.useFakeTimers();
      Object.defineProperty(Platform, 'OS', {
        value: 'android',
        configurable: true,
      });
      permissionCheck = jest
        .spyOn(PermissionsAndroid, 'check')
        .mockResolvedValue(true);
      permissionRequest = jest
        .spyOn(PermissionsAndroid, 'request')
        .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
      mockedNativeAudioCapture.start.mockResolvedValue(undefined);
      mockedNativeAudioCapture.stop.mockResolvedValue(undefined);
    });

    afterEach(() => {
      // The outer afterEach runs after this one, so unmount here while the
      // fake timers a capture is waiting on still exist.
      act(() => {
        mounted.splice(0).forEach(tree => tree.unmount());
      });
      jest.useRealTimers();
      jest.restoreAllMocks();
      jest.clearAllMocks();
      Object.defineProperty(Platform, 'OS', {
        value: originalPlatformOS,
        configurable: true,
      });
    });

    describe('Recalibrate', () => {
      it('sets the threshold a margin below the loudest sound it heard', async () => {
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-shot', -40, -12, -25);

        expect(thresholdText(tree, 'shot')).toBe('-18 dB');
        expect(chipLabel(tree, 'shot')).toBe('Calibrated');
      });

      it('says the threshold was set, in words a screen reader can say', async () => {
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-shot', -12);

        expect(feedbackText(tree, 'shot')).toBe(
          'Threshold set to -18 dB. Run a test to check it.',
        );
        expect(feedbackSpoken(tree, 'shot')).toBe(
          'Threshold set to minus 18 decibels. Run a test to check it.',
        );
      });

      it('replaces what a screen reader says when the line changes', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await capture(tree, 'btn-test-shot', -14);

        // Android keeps a label that is merely dropped, so each line has to
        // carry its own rather than fall back to the visible text.
        expect(feedbackSpoken(tree, 'shot')).toBe(
          'Test passed. The sound reached the threshold.',
        );
      });

      it('says nothing under a sound that has never been calibrated', () => {
        const { tree } = renderScreen();

        expect(feedbackText(tree, 'shot')).toBeNull();
      });

      it('calibrates only the sound whose button was pressed', async () => {
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-reload', -20);

        expect(chipLabel(tree, 'reload')).toBe('Calibrated');
        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(chipLabel(tree, 'rack')).toBe('Not calibrated');
      });

      it('says it is listening and what to do, until the window ends', async () => {
        const { tree } = renderScreen();

        await press(tree, 'btn-recalibrate-rack');

        expect(chipLabel(tree, 'rack')).toBe('Listening');
        expect(feedbackText(tree, 'rack')).toBe(
          'Listening. Rack the slide now.',
        );
        expect(spokenSummary(tree, 'rack')).toBe(
          'Rack, listening, threshold not set',
        );

        hear(-20);
        await finishListening();

        expect(chipLabel(tree, 'rack')).toBe('Calibrated');
        expect(feedbackText(tree, 'rack')).toBe(
          'Threshold set to -26 dB. Run a test to check it.',
        );
      });

      it('closes the microphone once the sample is taken', async () => {
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-shot', -12);

        expect(mockedNativeAudioCapture.start).toHaveBeenCalledTimes(1);
        expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
      });

      it('keeps the sound not calibrated when nothing loud enough was heard', async () => {
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-shot', -75);

        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(thresholdText(tree, 'shot')).toBe('—');
        expect(feedbackText(tree, 'shot')).toBe(
          'No sound heard. Try again, closer to the microphone.',
        );
      });

      it('keeps the previous threshold when nothing loud enough was heard', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await capture(tree, 'btn-recalibrate-shot');

        expect(thresholdText(tree, 'shot')).toBe('-18 dB');
        expect(chipLabel(tree, 'shot')).toBe('Calibrated');
        expect(feedbackText(tree, 'shot')).toBe(
          'No sound heard. Try again, closer to the microphone.',
        );
      });

      it('drops the last test result when the sound is calibrated again', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);
        await capture(tree, 'btn-test-shot', -10);

        await capture(tree, 'btn-recalibrate-shot', -20);

        expect(chipLabel(tree, 'shot')).toBe('Calibrated');
        expect(thresholdText(tree, 'shot')).toBe('-26 dB');
        expect(lastTestText(tree, 'shot')).toBe('—');
        expect(feedbackText(tree, 'shot')).toBe(
          'Threshold set to -26 dB. Run a test to check it.',
        );
      });
    });

    describe('Test', () => {
      it('cannot be run on a sound that is not calibrated', () => {
        const { tree } = renderScreen();

        CALIBRATION_SOUNDS.forEach(sound => {
          expect(isDisabled(tree, `btn-test-${sound}`)).toBe(true);
          expect(isDisabled(tree, `btn-recalibrate-${sound}`)).toBe(false);
        });
      });

      it('says why it is disabled on a sound that is not calibrated', () => {
        const { tree } = renderScreen();

        const test = tree.root.findAll(
          node =>
            node.props.testID === 'btn-test-shot' &&
            node.props.accessibilityHint !== undefined,
        )[0];

        expect(test.props.accessibilityHint).toBe(
          'Recalibrate this sound first',
        );
      });

      it('has no Recalibrate all button, since each sound is recalibrated on its own card', () => {
        const { tree } = renderScreen();

        expect(
          tree.root.findAll(node => node.props.label === 'Recalibrate all'),
        ).toHaveLength(0);
      });

      it('can be run once the sound is calibrated', async () => {
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-shot', -12);

        expect(isDisabled(tree, 'btn-test-shot')).toBe(false);
        expect(isDisabled(tree, 'btn-test-reload')).toBe(true);
      });

      it('passes a sound that reaches the threshold', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await capture(tree, 'btn-test-shot', -30, -14);

        expect(chipLabel(tree, 'shot')).toBe('Test passed');
        expect(feedbackText(tree, 'shot')).toBe(
          'Test passed. The sound reached the threshold.',
        );
        expect(lastTestText(tree, 'shot')).toBe('-14 dB');
        expect(spokenSummary(tree, 'shot')).toBe(
          'Shot, calibrated, threshold minus 18 decibels, last test minus 14 decibels, test passed',
        );
      });

      it('fails a sound that is quieter than the threshold', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await capture(tree, 'btn-test-shot', -31);

        expect(chipLabel(tree, 'shot')).toBe('Test failed');
        expect(feedbackText(tree, 'shot')).toBe(
          'Test failed. The sound was quieter than the threshold.',
        );
        expect(lastTestText(tree, 'shot')).toBe('-31 dB');
        expect(spokenSummary(tree, 'shot')).toBe(
          'Shot, calibrated, threshold minus 18 decibels, last test minus 31 decibels, test failed',
        );
      });

      it('fails when the microphone heard nothing at all', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await capture(tree, 'btn-test-shot');

        expect(chipLabel(tree, 'shot')).toBe('Test failed');
        expect(lastTestText(tree, 'shot')).toBe('-160 dB');
      });

      it('leaves the threshold as it was', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await capture(tree, 'btn-test-shot', -2);

        expect(thresholdText(tree, 'shot')).toBe('-18 dB');
      });

      it('replaces the previous result with the latest test', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);
        await capture(tree, 'btn-test-shot', -40);

        await capture(tree, 'btn-test-shot', -10);

        expect(chipLabel(tree, 'shot')).toBe('Test passed');
        expect(lastTestText(tree, 'shot')).toBe('-10 dB');
      });

      it('says it is listening and what to do, until the window ends', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-reload', -12);

        await press(tree, 'btn-test-reload');

        expect(chipLabel(tree, 'reload')).toBe('Listening');
        expect(feedbackText(tree, 'reload')).toBe(
          'Listening. Change the magazine now.',
        );
        expect(spokenSummary(tree, 'reload')).toBe(
          'Reload, listening, threshold minus 18 decibels, not tested yet',
        );
      });
    });

    describe('while one sound is listening', () => {
      it('holds every other button until the microphone is free', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-reload', -12);

        await press(tree, 'btn-recalibrate-shot');

        expect(isDisabled(tree, 'btn-test-shot')).toBe(true);
        expect(isDisabled(tree, 'btn-recalibrate-reload')).toBe(true);
        expect(isDisabled(tree, 'btn-test-reload')).toBe(true);
        expect(isDisabled(tree, 'btn-recalibrate-rack')).toBe(true);
        expect(hintOf(tree, 'btn-test-reload')).toBe(
          'Another sound is being measured',
        );

        hear(-12);
        await finishListening();

        expect(isDisabled(tree, 'btn-test-shot')).toBe(false);
        expect(isDisabled(tree, 'btn-recalibrate-reload')).toBe(false);
        expect(isDisabled(tree, 'btn-test-reload')).toBe(false);
        expect(isDisabled(tree, 'btn-recalibrate-rack')).toBe(false);
      });

      it('says a calibrated sound cannot be tested while it is being recalibrated', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await press(tree, 'btn-recalibrate-shot');

        expect(hintOf(tree, 'btn-test-shot')).toBe('Recalibrating this sound');
      });

      it('gives a test button that can be pressed no hint', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        expect(hintOf(tree, 'btn-test-shot')).toBeUndefined();
      });

      it('turns the pressed button into Cancel', async () => {
        const { tree } = renderScreen();

        await press(tree, 'btn-recalibrate-shot');

        expect(buttonText(tree, 'btn-recalibrate-shot')).toBe('Cancel');
        expect(buttonLabel(tree, 'btn-recalibrate-shot')).toBe(
          'Cancel recalibrating shot',
        );
        expect(isDisabled(tree, 'btn-recalibrate-shot')).toBe(false);
      });

      it('turns Test into Cancel while a test is listening', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);

        await press(tree, 'btn-test-shot');

        expect(buttonText(tree, 'btn-test-shot')).toBe('Cancel');
        expect(buttonLabel(tree, 'btn-test-shot')).toBe('Cancel testing shot');
        expect(isDisabled(tree, 'btn-recalibrate-shot')).toBe(true);
      });

      it('stops listening and changes nothing when cancelled', async () => {
        const { tree } = renderScreen();
        await press(tree, 'btn-recalibrate-shot');
        hear(-12);

        await press(tree, 'btn-recalibrate-shot');
        await finishListening();

        expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(thresholdText(tree, 'shot')).toBe('—');
        expect(feedbackText(tree, 'shot')).toBeNull();
        expect(buttonText(tree, 'btn-recalibrate-shot')).toBe('Recalibrate');
      });

      it('keeps the last test result when a new test is cancelled', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot', -12);
        await capture(tree, 'btn-test-shot', -10);
        await press(tree, 'btn-test-shot');
        hear(-50);

        await press(tree, 'btn-test-shot');
        await finishListening();

        expect(chipLabel(tree, 'shot')).toBe('Test passed');
        expect(lastTestText(tree, 'shot')).toBe('-10 dB');
      });

      it('changes nothing when cancelled while the microphone is closing', async () => {
        const { tree } = renderScreen();
        let finishClosing: () => void = () => {};
        mockedNativeAudioCapture.stop.mockImplementation(
          () =>
            new Promise<void>(resolve => {
              finishClosing = resolve;
            }),
        );
        await press(tree, 'btn-recalibrate-shot');
        hear(-12);
        await finishListening();
        expect(buttonText(tree, 'btn-recalibrate-shot')).toBe('Cancel');

        await press(tree, 'btn-recalibrate-shot');
        await act(async () => {
          finishClosing();
          await jest.advanceTimersByTimeAsync(0);
        });

        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(thresholdText(tree, 'shot')).toBe('—');
        expect(buttonText(tree, 'btn-recalibrate-shot')).toBe('Recalibrate');
      });

      it('never opens the microphone when cancelled before the permission is answered', async () => {
        permissionCheck.mockResolvedValue(false);
        let answerDialog: (result: 'granted') => void = () => {};
        permissionRequest.mockImplementation(
          () =>
            new Promise(resolve => {
              answerDialog = resolve;
            }),
        );
        const { tree } = renderScreen();
        await press(tree, 'btn-recalibrate-shot');
        expect(chipLabel(tree, 'shot')).toBe('Listening');

        await press(tree, 'btn-recalibrate-shot');
        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        await act(async () => {
          answerDialog('granted');
          await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);
        });

        expect(mockedNativeAudioCapture.start).not.toHaveBeenCalled();
        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(feedbackText(tree, 'shot')).toBeNull();
      });

      it('stops listening when the tab is left, and changes nothing', async () => {
        const { tree, goTo } = renderScreen();
        await press(tree, 'btn-recalibrate-shot');
        hear(-12);

        goTo('Elsewhere');
        await finishListening();
        goTo('Calibration');

        expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(buttonText(tree, 'btn-recalibrate-shot')).toBe('Recalibrate');
        expect(isDisabled(tree, 'btn-recalibrate-reload')).toBe(false);
      });

      it('stops listening when the screen goes away', async () => {
        const { tree } = renderScreen();
        await press(tree, 'btn-recalibrate-shot');

        await act(async () => {
          mounted.splice(0).forEach(mountedTree => mountedTree.unmount());
          await jest.advanceTimersByTimeAsync(CALIBRATION_LISTEN_MS);
        });

        expect(tree.toJSON()).toBeNull();
        expect(mockedNativeAudioCapture.stop).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the microphone cannot be used', () => {
      it('asks for microphone access the first time, then listens', async () => {
        permissionCheck.mockResolvedValue(false);
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-shot', -12);

        expect(permissionRequest).toHaveBeenCalledWith(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        expect(chipLabel(tree, 'shot')).toBe('Calibrated');
      });

      it('says access is needed when the request is declined', async () => {
        permissionCheck.mockResolvedValue(false);
        permissionRequest.mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
        const { tree } = renderScreen();

        await press(tree, 'btn-recalibrate-shot');

        expect(feedbackText(tree, 'shot')).toBe(
          'Microphone access is needed to listen for this sound.',
        );
        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(mockedNativeAudioCapture.start).not.toHaveBeenCalled();
        expect(has(tree, 'btn-open-settings-shot')).toBe(false);
      });

      it('asks again on the next attempt after a declined request', async () => {
        permissionCheck.mockResolvedValue(false);
        permissionRequest.mockResolvedValueOnce(
          PermissionsAndroid.RESULTS.DENIED,
        );
        const { tree } = renderScreen();
        await press(tree, 'btn-recalibrate-shot');

        await capture(tree, 'btn-recalibrate-shot', -12);

        expect(permissionRequest).toHaveBeenCalledTimes(2);
        expect(chipLabel(tree, 'shot')).toBe('Calibrated');
        expect(feedbackText(tree, 'shot')).toBe(
          'Threshold set to -18 dB. Run a test to check it.',
        );
      });

      it('points to the system settings when access is blocked', async () => {
        permissionCheck.mockResolvedValue(false);
        permissionRequest.mockResolvedValue(
          PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        );
        const openSettings = jest
          .spyOn(Linking, 'openSettings')
          .mockResolvedValue(undefined);
        const { tree } = renderScreen();

        await press(tree, 'btn-recalibrate-reload');

        expect(feedbackText(tree, 'reload')).toBe(
          'Microphone access is turned off. Allow it in Settings, then try again.',
        );
        expect(has(tree, 'btn-open-settings-shot')).toBe(false);

        await press(tree, 'btn-open-settings-reload');

        expect(openSettings).toHaveBeenCalledTimes(1);
      });

      it('stays usable when the system settings cannot be opened', async () => {
        permissionCheck.mockResolvedValue(false);
        permissionRequest.mockResolvedValue(
          PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        );
        jest
          .spyOn(Linking, 'openSettings')
          .mockRejectedValue(new Error('no settings activity'));
        const { tree } = renderScreen();
        await press(tree, 'btn-recalibrate-reload');

        await press(tree, 'btn-open-settings-reload');

        expect(has(tree, 'btn-open-settings-reload')).toBe(true);
        expect(isDisabled(tree, 'btn-recalibrate-reload')).toBe(false);
      });

      it('says listening stopped when the app is left mid-capture', async () => {
        const { tree } = renderScreen();
        await press(tree, 'btn-recalibrate-shot');
        hear(-12);

        act(() => {
          DeviceEventEmitter.emit(AUDIO_CAPTURE_ERROR_EVENT, {
            code: 'INTERRUPTED',
            message:
              'Audio capture stopped because the app left the foreground',
          });
        });
        await finishListening();

        expect(feedbackText(tree, 'shot')).toBe(
          'Listening stopped because the app was left. Try again.',
        );
        expect(chipLabel(tree, 'shot')).toBe('Not calibrated');
        expect(isDisabled(tree, 'btn-recalibrate-reload')).toBe(false);
      });

      it('says the microphone could not be used when it fails to open', async () => {
        mockedNativeAudioCapture.start.mockRejectedValue(
          nativeRejection('INIT_FAILED', 'AudioRecord failed to initialize'),
        );
        const { tree } = renderScreen();

        await press(tree, 'btn-recalibrate-rack');

        expect(feedbackText(tree, 'rack')).toBe(
          'The microphone could not be used. Try again.',
        );
        expect(chipLabel(tree, 'rack')).toBe('Not calibrated');
      });

      it('shows a failure only on the sound it happened to', async () => {
        const { tree } = renderScreen();

        await capture(tree, 'btn-recalibrate-shot');

        expect(feedbackText(tree, 'shot')).not.toBeNull();
        expect(feedbackText(tree, 'reload')).toBeNull();
        expect(feedbackText(tree, 'rack')).toBeNull();
      });

      it('clears the failure when another capture starts', async () => {
        const { tree } = renderScreen();
        await capture(tree, 'btn-recalibrate-shot');

        await press(tree, 'btn-recalibrate-reload');

        expect(feedbackText(tree, 'shot')).toBeNull();
      });
    });
  });
});
