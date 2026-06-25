import { StyleSheet, Text, View } from 'react-native';

import { useRoute, type RouteProp } from '@react-navigation/native';

import type { RootStackParamList } from '@/types/navigation';
import { useTheme } from '@hooks/useTheme';

export const DetailsScreen = () => {
  const { colors, spacing } = useTheme();
  const route = useRoute<RouteProp<RootStackParamList, 'Details'>>();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, padding: spacing.lg },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Details</Text>
      <Text style={{ color: colors.text }}>id: {route.params.id}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 16 },
});
