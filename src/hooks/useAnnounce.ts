import { useEffect } from 'react';

import { AccessibilityInfo } from 'react-native';

/**
 * Has a screen reader say `message` when it first becomes non-null, and
 * again whenever it changes. Nothing is said for `null`.
 *
 * For text that appears in place of other content, such as an error that
 * takes over from a loading line: a live region mounted together with its
 * content is not announced by TalkBack, so the announcement is made here.
 */
export const useAnnounce = (message: string | null): void => {
  useEffect(() => {
    if (message !== null) {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
};
