import type { ReactNode } from 'react';

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Typography } from '@components/Typography';
import { useTheme } from '@hooks/useTheme';

type ScreenProps = {
  title?: string;
  children: ReactNode;
  /** Center children on both axes. Defaults to false (top-aligned). */
  centered?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shared screen shell: safe-area, themed background, standard padding, and
 * an optional title. Screens should render only their unique content inside.
 */
export const Screen = ({
  title,
  children,
  centered = false,
  contentStyle,
  testID,
}: ScreenProps) => {
  const theme = useTheme();

  return (
    <SafeAreaView
      testID={testID}
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
      edges={['top', 'left', 'right']}
    >
      <View
        style={[
          styles.content,
          {
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          },
          centered && styles.centered,
          contentStyle,
        ]}
      >
        {title ? <Typography variant="title">{title}</Typography> : null}
        {children}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
});
