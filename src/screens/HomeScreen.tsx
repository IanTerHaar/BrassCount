import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@components/Button';
import { useTheme } from '@hooks/useTheme';
import { useCounterStore } from '@store/counterStore';

export const HomeScreen = () => {
  const { colors, spacing } = useTheme();
  const count = useCounterStore(state => state.count);
  const increment = useCounterStore(state => state.increment);
  const decrement = useCounterStore(state => state.decrement);
  const reset = useCounterStore(state => state.reset);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, padding: spacing.lg },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Home</Text>
      <Text style={[styles.count, { color: colors.text }]}>{count}</Text>

      <View style={[styles.row, { gap: spacing.sm }]}>
        <Button
          label="-"
          variant="secondary"
          onPress={decrement}
          testID="btn-dec"
        />
        <Button
          label="Reset"
          variant="secondary"
          onPress={reset}
          testID="btn-reset"
        />
        <Button label="+" onPress={increment} testID="btn-inc" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  count: {
    fontSize: 64,
    fontWeight: '300',
    marginBottom: 32,
  },
  row: {
    flexDirection: 'row',
  },
});
