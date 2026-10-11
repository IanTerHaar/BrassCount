import { useContext } from 'react';

import {
  AppearanceContext,
  type AppearanceContextValue,
} from '@store/AppearanceContext';

/**
 * Read and change the Appearance preference. Must be called under
 * `AppearanceProvider`, which `App` mounts above the navigators.
 */
export const useAppearance = (): AppearanceContextValue => {
  const value = useContext(AppearanceContext);
  if (value === null) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }
  return value;
};
