import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import type { Theme } from '@/theme/theme';
import { useReduceMotion } from '@hooks/useReduceMotion';
import { useThemedStyles } from '@hooks/useTheme';
import {
  SWIPE_ACTIVATE_DISTANCE,
  SWIPE_FAIL_DISTANCE,
  clampSwipe,
  settleSwipe,
} from '@utils/swipe';

import { Typography } from './Typography';

/** Width of the revealed action at the default font size, in points. */
const ACTION_WIDTH = 88;

/** How long the row takes to slide to rest once it is let go. */
const SETTLE_MS = 180;

// Sideways travel starts the swipe; up or down travel first leaves the
// touch to the scroll view the row sits in.
const ACTIVE_OFFSET_X: [number, number] = [
  -SWIPE_ACTIVATE_DISTANCE,
  SWIPE_ACTIVATE_DISTANCE,
];
const FAIL_OFFSET_Y: [number, number] = [
  -SWIPE_FAIL_DISTANCE,
  SWIPE_FAIL_DISTANCE,
];

type SwipeableRowProps = {
  /** The row itself. It slides left over the action. */
  children: ReactNode;
  /** Visible label of the action behind the row, e.g. "Delete". */
  actionLabel: string;
  /** What a screen reader announces for the action, with its subject. */
  actionAccessibilityLabel: string;
  onAction: () => void;
  /** Whether the row rests open, with the action showing. */
  open: boolean;
  /** Called when a swipe leaves the row open or closed. */
  onOpenChange: (open: boolean) => void;
  /** `testID` of the action button. */
  actionTestID?: string;
  /** `testID` of the swipe gesture, for `getByGestureTestId` in tests. */
  gestureTestID?: string;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    action: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.danger,
    },
    // Opaque, so the action stays out of sight until the row moves.
    foreground: { backgroundColor: theme.colors.surface },
  });

/**
 * A list row that swipes left to reveal one destructive action behind its
 * right edge. Whether it rests open is the caller's state (`open`), so a
 * list can keep a single row open at a time; the swipe only reports where
 * it came to rest.
 *
 * A swipe is out of reach of a screen reader: give the row inside an
 * accessibility action that does the same thing. The action button here is
 * hidden from the reader until the row is open.
 */
export const SwipeableRow = ({
  children,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
  open,
  onOpenChange,
  actionTestID,
  gestureTestID,
}: SwipeableRowProps) => {
  const styles = useThemedStyles(createStyles);
  const reduceMotion = useReduceMotion();
  // The label grows with the system font size, and its button with it.
  const { fontScale } = useWindowDimensions();
  const actionWidth = Math.round(ACTION_WIDTH * Math.max(1, fontScale));

  const [offset] = useState(() => new Animated.Value(open ? -actionWidth : 0));
  // Whether the row was open when the swipe in progress began.
  const startedOpenRef = useRef(open);
  // Where the swipe in progress has dragged the row to.
  const draggedToRef = useRef(0);

  // Read through a ref so the gesture is not rebuilt as these change.
  const latest = useRef({ open, actionWidth, onOpenChange });
  useEffect(() => {
    latest.current = { open, actionWidth, onOpenChange };
  });

  // Slide to where `open` says the row rests: after a swipe, and whenever
  // the caller opens or closes it.
  useEffect(() => {
    const toValue = open ? -actionWidth : 0;
    if (reduceMotion) {
      offset.setValue(toValue);
      return undefined;
    }
    const animation = Animated.timing(offset, {
      toValue,
      duration: SETTLE_MS,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [open, actionWidth, reduceMotion, offset]);

  const beginSwipe = useCallback(() => {
    startedOpenRef.current = latest.current.open;
    draggedToRef.current = latest.current.open
      ? -latest.current.actionWidth
      : 0;
  }, []);

  const dragTo = useCallback(
    (translationX: number) => {
      draggedToRef.current = clampSwipe(
        translationX,
        startedOpenRef.current,
        latest.current.actionWidth,
      );
      offset.setValue(draggedToRef.current);
    },
    [offset],
  );

  const endSwipe = useCallback(
    (velocityX: number, canceled: boolean) => {
      const { actionWidth: width, onOpenChange: report } = latest.current;
      // A swipe taken away by the system goes back to where it started.
      const endsOpen = canceled
        ? startedOpenRef.current
        : settleSwipe({
            offset: draggedToRef.current,
            velocityX,
            actionWidth: width,
          });

      if (endsOpen !== latest.current.open) {
        // The effect above slides the row once the caller takes the change.
        report(endsOpen);
        return;
      }
      // Nothing changed for the caller, so nothing re-renders: put the row
      // back where it rests from here.
      Animated.timing(offset, {
        toValue: endsOpen ? -width : 0,
        duration: reduceMotion ? 0 : SETTLE_MS,
        useNativeDriver: true,
      }).start();
    },
    [offset, reduceMotion],
  );

  const gestureConfig = useMemo(
    () => ({
      activeOffsetX: ACTIVE_OFFSET_X,
      failOffsetY: FAIL_OFFSET_Y,
      onActivate: beginSwipe,
      onUpdate: (event: { translationX: number }) => dragTo(event.translationX),
      onDeactivate: (event: { velocityX: number; canceled: boolean }) =>
        endSwipe(event.velocityX, event.canceled),
      testID: gestureTestID,
    }),
    [beginSwipe, dragTo, endSwipe, gestureTestID],
  );
  const swipe = usePanGesture(gestureConfig);

  return (
    <View>
      <TouchableOpacity
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionAccessibilityLabel}
        // Behind the row while it is closed: a reader must not land on it.
        importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        activeOpacity={0.7}
        style={[styles.action, { width: actionWidth }]}
        testID={actionTestID}
      >
        <Typography variant="label" color="textOnDanger" numberOfLines={1}>
          {actionLabel}
        </Typography>
      </TouchableOpacity>

      <GestureDetector gesture={swipe}>
        <Animated.View
          style={[styles.foreground, { transform: [{ translateX: offset }] }]}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
