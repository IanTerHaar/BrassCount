import { AccessibilityInfo, View } from 'react-native';

import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SwipeableRow } from '../src/components/SwipeableRow';

const ACTION = 'btn-row-action';
const GESTURE = 'swipe-row';

/** Further than the action is wide at any font size. */
const FULL_SWIPE = 400;

type RowProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: () => void;
};

const Row = ({
  open,
  onOpenChange = () => {},
  onAction = () => {},
}: RowProps) => (
  <GestureHandlerRootView>
    <SwipeableRow
      actionLabel="Delete"
      actionAccessibilityLabel="Delete Bill Drill"
      onAction={onAction}
      open={open}
      onOpenChange={onOpenChange}
      actionTestID={ACTION}
      gestureTestID={GESTURE}
    >
      <View testID="row-content" />
    </SwipeableRow>
  </GestureHandlerRootView>
);

const mounted: ReactTestRenderer[] = [];

const renderRow = async (props: RowProps): Promise<ReactTestRenderer> => {
  let tree: ReactTestRenderer | undefined;
  await act(async () => {
    tree = create(<Row {...props} />);
  });
  if (tree === undefined) {
    throw new Error('render failed');
  }
  mounted.push(tree);
  return tree;
};

const action = (tree: ReactTestRenderer) =>
  tree.root.findAllByProps({ testID: ACTION })[0];

type SwipeEnd = {
  translationX: number;
  velocityX?: number;
  /** A cancelled swipe was taken away by the system before it ended. */
  cancelled?: boolean;
};

const swipe = async ({
  translationX,
  velocityX = 0,
  cancelled = false,
}: SwipeEnd) => {
  const state = cancelled ? State.CANCELLED : State.END;
  await act(async () => {
    fireGestureHandler(getByGestureTestId(GESTURE), [
      { state: State.BEGAN },
      { state: State.ACTIVE },
      { translationX, velocityX },
      { state, translationX, velocityX },
    ]);
  });
};

describe('SwipeableRow', () => {
  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach(tree => tree.unmount());
    });
    jest.restoreAllMocks();
  });

  it('shows the row and the action behind it', async () => {
    const tree = await renderRow({ open: false });

    expect(
      tree.root.findAllByProps({ testID: 'row-content' }),
    ).not.toHaveLength(0);
    expect(action(tree).props.accessibilityLabel).toBe('Delete Bill Drill');
  });

  it('hides the action from a screen reader until the row is open', async () => {
    const tree = await renderRow({ open: false });

    expect(action(tree).props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );

    await act(async () => {
      tree.update(<Row open />);
    });

    expect(action(tree).props.importantForAccessibility).toBe('yes');
  });

  it('runs the action when it is pressed', async () => {
    const onAction = jest.fn();
    const tree = await renderRow({ open: true, onAction });

    act(() => {
      action(tree).props.onPress();
    });

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('reports open after a swipe left across the action', async () => {
    const onOpenChange = jest.fn();
    await renderRow({ open: false, onOpenChange });

    await swipe({ translationX: -FULL_SWIPE });

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('reports closed after an open row is swiped back', async () => {
    const onOpenChange = jest.fn();
    await renderRow({ open: true, onOpenChange });

    await swipe({ translationX: FULL_SWIPE });

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('reports nothing when a short swipe leaves the row as it was', async () => {
    const onOpenChange = jest.fn();
    await renderRow({ open: false, onOpenChange });

    await swipe({ translationX: -10 });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('opens on a short flick to the left', async () => {
    const onOpenChange = jest.fn();
    await renderRow({ open: false, onOpenChange });

    await swipe({ translationX: -10, velocityX: -1200 });

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('reports nothing when a swipe to the right starts on a closed row', async () => {
    const onOpenChange = jest.fn();
    await renderRow({ open: false, onOpenChange });

    await swipe({ translationX: FULL_SWIPE });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('goes back to where it started when the swipe is cancelled', async () => {
    const onOpenChange = jest.fn();
    await renderRow({ open: false, onOpenChange });

    await swipe({ translationX: -FULL_SWIPE, cancelled: true });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('follows the latest onOpenChange without a new gesture', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const tree = await renderRow({ open: false, onOpenChange: first });
    await act(async () => {
      tree.update(<Row open={false} onOpenChange={second} />);
    });

    await swipe({ translationX: -FULL_SWIPE });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(true);
  });

  it('still swipes when the device asks for less motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const onOpenChange = jest.fn();
    const tree = await renderRow({ open: false, onOpenChange });

    await swipe({ translationX: -FULL_SWIPE });
    await act(async () => {
      tree.update(<Row open onOpenChange={onOpenChange} />);
    });

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(action(tree).props.importantForAccessibility).toBe('yes');
  });
});
