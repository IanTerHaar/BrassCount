import { useAnnounce } from '@hooks/useAnnounce';

import { Typography } from './Typography';

/** What the notice says, and what a screen reader is told when it appears. */
export const REFRESH_FAILED_MESSAGE =
  'Could not refresh. Showing what was loaded earlier.';

type RefreshFailedNoticeProps = {
  testID?: string;
};

/**
 * Shown above a list that stayed on screen when reading it again failed, so
 * the shooter knows it may be out of date. Rendered only while that is so.
 */
export const RefreshFailedNotice = ({ testID }: RefreshFailedNoticeProps) => {
  useAnnounce(REFRESH_FAILED_MESSAGE);

  return (
    <Typography variant="caption" color="danger" testID={testID}>
      {REFRESH_FAILED_MESSAGE}
    </Typography>
  );
};
