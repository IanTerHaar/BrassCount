import { useEffect, useState } from 'react';

import { AccessibilityInfo } from 'react-native';

/**
 * Whether the device asks apps to cut down on animation ("Remove
 * animations" on Android). Reads `false` until the system has answered,
 * and follows the setting while the component is mounted.
 */
export const useReduceMotion = (): boolean => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) {
          setReduceMotion(enabled);
        }
      })
      // Not being able to ask is not worth surfacing: motion stays on.
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};
