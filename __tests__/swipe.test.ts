import {
  SWIPE_FLICK_VELOCITY,
  clampSwipe,
  settleSwipe,
} from '../src/utils/swipe';

const ACTION_WIDTH = 88;

describe('clampSwipe', () => {
  it('follows a leftward drag from a closed row', () => {
    expect(clampSwipe(-30, false, ACTION_WIDTH)).toBe(-30);
  });

  it('stops at the width of the action', () => {
    expect(clampSwipe(-300, false, ACTION_WIDTH)).toBe(-ACTION_WIDTH);
  });

  it('does not let a closed row be dragged to the right', () => {
    expect(clampSwipe(40, false, ACTION_WIDTH)).toBe(0);
  });

  it('starts an open row from its open position', () => {
    expect(clampSwipe(0, true, ACTION_WIDTH)).toBe(-ACTION_WIDTH);
    expect(clampSwipe(30, true, ACTION_WIDTH)).toBe(-ACTION_WIDTH + 30);
  });

  it('stops an open row at closed when dragged far to the right', () => {
    expect(clampSwipe(300, true, ACTION_WIDTH)).toBe(0);
  });

  it('keeps an open row open when dragged further left', () => {
    expect(clampSwipe(-50, true, ACTION_WIDTH)).toBe(-ACTION_WIDTH);
  });

  it('leaves the row where it rested for a drag that is not a number', () => {
    expect(clampSwipe(Number.NaN, false, ACTION_WIDTH)).toBe(0);
    expect(clampSwipe(Number.NaN, true, ACTION_WIDTH)).toBe(-ACTION_WIDTH);
  });
});

describe('settleSwipe', () => {
  const settle = (offset: number, velocityX = 0): boolean =>
    settleSwipe({ offset, velocityX, actionWidth: ACTION_WIDTH });

  it('opens a row released past half the action', () => {
    expect(settle(-ACTION_WIDTH / 2 - 1)).toBe(true);
  });

  it('closes a row released short of half the action', () => {
    expect(settle(-ACTION_WIDTH / 2 + 1)).toBe(false);
  });

  it('opens a row flicked left, however short the drag', () => {
    expect(settle(-10, -SWIPE_FLICK_VELOCITY)).toBe(true);
  });

  it('closes a row flicked right, however far it was open', () => {
    expect(settle(-ACTION_WIDTH + 5, SWIPE_FLICK_VELOCITY)).toBe(false);
  });

  it('goes by position for a slow release', () => {
    expect(settle(-ACTION_WIDTH, SWIPE_FLICK_VELOCITY - 1)).toBe(true);
    expect(settle(0, -SWIPE_FLICK_VELOCITY + 1)).toBe(false);
  });

  it('goes by position when the velocity is not a number', () => {
    expect(settle(-ACTION_WIDTH, Number.NaN)).toBe(true);
    expect(settle(0, Number.NaN)).toBe(false);
  });
});
