import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useCalibration } from '../src/hooks/useCalibration';
import {
  CalibrationProvider,
  type CalibrationContextValue,
} from '../src/store/CalibrationContext';
import { CalibrationError } from '../src/store/calibrationReducer';
import { DBFS_MIN } from '../src/types/calibration';

/** Renders nothing; hands the hook's current value to the test. */
const Probe = ({
  onValue,
}: {
  onValue: (value: CalibrationContextValue) => void;
}) => {
  onValue(useCalibration());
  return null;
};

type Harness = {
  tree: ReactTestRenderer;
  current: () => CalibrationContextValue;
  setProbeMounted: (mounted: boolean) => void;
};

const renderWithProvider = (): Harness => {
  let latest: CalibrationContextValue | undefined;
  const onValue = (value: CalibrationContextValue) => {
    latest = value;
  };
  const element = (mounted: boolean) => (
    <CalibrationProvider>
      {mounted ? <Probe onValue={onValue} /> : null}
    </CalibrationProvider>
  );

  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(element(true));
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  const rendered = tree;

  return {
    tree: rendered,
    current: () => {
      if (latest === undefined) {
        throw new Error('probe has not rendered');
      }
      return latest;
    },
    setProbeMounted: mounted => {
      act(() => {
        rendered.update(element(mounted));
      });
    },
  };
};

describe('useCalibration', () => {
  it('starts with nothing calibrated', () => {
    const { current } = renderWithProvider();

    expect(current().state.shot).toEqual({
      thresholdDbfs: null,
      status: 'uncalibrated',
      lastTestDbfs: null,
    });
  });

  it('shows consumers a threshold once it is set', () => {
    const { current } = renderWithProvider();

    act(() => {
      current().setThreshold('reload', -24);
    });

    expect(current().state.reload).toEqual({
      thresholdDbfs: -24,
      status: 'calibrated',
      lastTestDbfs: null,
    });
  });

  it('records a test reading against a calibrated sound', () => {
    const { current } = renderWithProvider();

    act(() => {
      current().setThreshold('shot', -12);
    });
    act(() => {
      current().recordTestReading('shot', -8);
    });

    expect(current().state.shot.lastTestDbfs).toBe(-8);
  });

  it('resets one sound or all of them', () => {
    const { current } = renderWithProvider();
    act(() => {
      current().setThreshold('shot', -12);
      current().setThreshold('rack', -40);
    });

    act(() => {
      current().resetSound('shot');
    });
    expect(current().state.shot.status).toBe('uncalibrated');
    expect(current().state.rack.status).toBe('calibrated');

    act(() => {
      current().resetAll();
    });
    expect(current().state.rack.status).toBe('uncalibrated');
  });

  it('keeps calibration while a consumer unmounts and remounts', () => {
    const { current, setProbeMounted } = renderWithProvider();
    act(() => {
      current().setThreshold('shot', -12);
    });

    setProbeMounted(false);
    setProbeMounted(true);

    expect(current().state.shot.thresholdDbfs).toBe(-12);
  });

  it('starts empty again under a new provider', () => {
    const first = renderWithProvider();
    act(() => {
      first.current().setThreshold('shot', -12);
    });
    act(() => {
      first.tree.unmount();
    });

    const second = renderWithProvider();

    expect(second.current().state.shot.thresholdDbfs).toBeNull();
  });

  it('rejects an invalid level and leaves the state unchanged', () => {
    const { current } = renderWithProvider();
    const before = current().state;

    expect(() => current().setThreshold('shot', 96)).toThrow(CalibrationError);
    expect(() => current().recordTestReading('shot', NaN)).toThrow(
      CalibrationError,
    );

    expect(current().state).toBe(before);
  });

  it('stores a reading at digital silence as the dBFS floor', () => {
    const { current } = renderWithProvider();

    act(() => {
      current().setThreshold('rack', -Infinity);
    });
    act(() => {
      current().recordTestReading('rack', -Infinity);
    });

    expect(current().state.rack).toEqual({
      thresholdDbfs: DBFS_MIN,
      status: 'calibrated',
      lastTestDbfs: DBFS_MIN,
    });
  });

  it('keeps the same action functions across state changes', () => {
    const { current } = renderWithProvider();
    const { setThreshold, resetAll } = current();

    act(() => {
      current().setThreshold('shot', -12);
    });

    expect(current().setThreshold).toBe(setThreshold);
    expect(current().resetAll).toBe(resetAll);
  });

  it('throws CalibrationError outside a provider', () => {
    // React logs the render error before rethrowing it.
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    try {
      expect(() => {
        act(() => {
          create(<Probe onValue={() => {}} />);
        });
      }).toThrow(CalibrationError);
    } finally {
      consoleError.mockRestore();
    }
  });
});
