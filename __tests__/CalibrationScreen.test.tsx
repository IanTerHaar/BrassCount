import { StyleSheet } from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

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

describe('CalibrationScreen', () => {
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
      'Reload, calibrated, threshold minus 24 decibels',
    );
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
