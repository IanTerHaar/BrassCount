/**
 * BrassCount – shot timer for shooting drills
 *
 * @format
 */

import { StatusBar, StyleSheet, useColorScheme } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from '@navigation/RootNavigator';
import { CalibrationProvider } from '@store/CalibrationContext';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        {/* Above the navigators, so calibration outlives any screen. */}
        <CalibrationProvider>
          <RootNavigator />
        </CalibrationProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
