import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@hooks/useTheme';

export const SettingsScreen = () => {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, padding: spacing.lg },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      <Text style={{ color: colors.textMuted }}>
        Replace this with your settings UI.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16 },
});
