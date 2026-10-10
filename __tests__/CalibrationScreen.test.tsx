import { Dimensions, StyleSheet } from 'react-native';

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
  CalibrationProvider,
  type CalibrationContextValue,
} from '../src/store/CalibrationContext';
import { CALIBRATION_SOUNDS } from '../src/types/calibration';
import type { CalibrationSound } from '../src/types/calibration';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Sits beside the screen so a test can drive the store it reads from. */
const StoreHandle = ({
  onValue,
}: {
  onValue: (value: CalibrationContextValue) => void;
}) => {
  onValue(useCalibration());
  return null;
};

const renderScreen = () => {
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
          <CalibrationScreen />
        </CalibrationProvider>
      </SafeAreaProvider>,
    );
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  return {
    tree,
    store: (): CalibrationContextValue => {
      if (store === undefined) {
        throw new Error('store handle has not rendered');
      }
      return store;
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
      'Reload, calibrated, threshold minus 24 decibels, last test minus 19 decibels',
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
});
