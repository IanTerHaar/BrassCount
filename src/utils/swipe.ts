/**
 * The rules of a row that swipes left to reveal an action behind its right
 * edge. The row's offset is how far it has moved: 0 closed, `-actionWidth`
 * fully open, never outside those two.
 */

/** Sideways travel, in points, before a touch counts as a swipe. */
export const SWIPE_ACTIVATE_DISTANCE = 12;

/** Up or down travel, in points, that hands the touch to the scroll view. */
export const SWIPE_FAIL_DISTANCE = 12;

/**
 * Speed, in points a second, at which a release is a flick: the row goes
 * the way it was thrown, wherever it was let go.
 */
export const SWIPE_FLICK_VELOCITY = 500;

/**
 * Where the row sits after being dragged `translationX` from where it
 * rested. A drag that is not a number leaves it at rest.
 */
export const clampSwipe = (
  translationX: number,
  startedOpen: boolean,
  actionWidth: number,
): number => {
  const rest = startedOpen ? -actionWidth : 0;
  if (!Number.isFinite(translationX)) {
    return rest;
  }
  return Math.min(0, Math.max(-actionWidth, rest + translationX));
};

export interface SwipeRelease {
  /** Where the row was let go, as `clampSwipe` returns it. */
  offset: number;
  /** Sideways speed at release, in points a second; negative is leftward. */
  velocityX: number;
  actionWidth: number;
}

/**
 * Whether a released row ends up open. A flick decides on its own;
 * otherwise the row opens once more than half the action is showing.
 */
export const settleSwipe = ({
  offset,
  velocityX,
  actionWidth,
}: SwipeRelease): boolean => {
  if (velocityX <= -SWIPE_FLICK_VELOCITY) {
    return true;
  }
  if (velocityX >= SWIPE_FLICK_VELOCITY) {
    return false;
  }
  return offset < -actionWidth / 2;
};
