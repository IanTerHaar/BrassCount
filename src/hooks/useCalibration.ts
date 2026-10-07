import { useContext } from 'react';

import {
  CalibrationContext,
  type CalibrationContextValue,
} from '@store/CalibrationContext';
import { CalibrationError } from '@store/calibrationReducer';

/**
 * Read and update the session's calibration. Must be called under
 * `CalibrationProvider`, which `App` mounts above the navigators.
 */
export const useCalibration = (): CalibrationContextValue => {
  const value = useContext(CalibrationContext);
  if (value === null) {
    throw new CalibrationError(
      'useCalibration must be used within a CalibrationProvider',
    );
  }
  return value;
};
