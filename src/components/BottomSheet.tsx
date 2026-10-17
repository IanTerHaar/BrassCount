import type { ReactNode } from 'react';

import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Theme } from '@/theme/theme';
import { useTheme, useThemedStyles } from '@hooks/useTheme';

const GRABBER_WIDTH = 36;
const GRABBER_HEIGHT = 4;

type BottomSheetProps = {
  visible: boolean;
  /** Called by the backdrop and the system back gesture. */
  onClose: () => void;
  /** What a screen reader announces for the backdrop, e.g. "Close par picker". */
  closeLabel: string;
  /** Test id of the backdrop. */
  backdropTestID?: string;
  children: ReactNode;
};

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: theme.colors.overlay,
    },
    sheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingTop: theme.spacing.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: GRABBER_WIDTH,
      height: GRABBER_HEIGHT,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.borderStrong,
      marginBottom: theme.spacing.sm,
    },
  });

/**
 * The shell shared by the option sheets: a modal with a dimmed backdrop that
 * closes it, and a rounded sheet with a grabber that holds `children`.
 */
export const BottomSheet = ({
  visible,
  onClose,
  closeLabel,
  backdropTestID,
  children,
}: BottomSheetProps) => {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        testID={backdropTestID}
      >
        {/* Claims touches inside the sheet so they don't reach the backdrop
            and dismiss it. A plain View, not a Pressable: a pressable here
            is read by a screen reader as one run-on label for the whole
            sheet. */}
        <View
          onStartShouldSetResponder={() => true}
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + theme.spacing.sm },
          ]}
        >
          <View style={styles.grabber} />
          {children}
        </View>
      </Pressable>
    </Modal>
  );
};
