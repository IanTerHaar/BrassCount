import { StyleSheet, View } from 'react-native';

import { Button } from '@components/Button';
import { Screen } from '@components/Screen';
import { Typography } from '@components/Typography';
import { useTheme } from '@hooks/useTheme';
import { useCounterStore } from '@store/counterStore';

export const TimerScreen = () => {
  const theme = useTheme();
  const count = useCounterStore(state => state.count);
  const increment = useCounterStore(state => state.increment);
  const decrement = useCounterStore(state => state.decrement);
  const reset = useCounterStore(state => state.reset);

  return (
    <Screen centered>
      <Typography variant="title">Home</Typography>
      <Typography variant="display">{count}</Typography>

      <View style={[styles.row, { gap: theme.spacing.sm }]}>
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
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
});
