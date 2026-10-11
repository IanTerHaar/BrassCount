/**
 * BrassCount – shot timer for shooting drills
 *
 * @format
 */

import { StatusBar, StyleSheet } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTheme } from '@hooks/useTheme';
import { RootNavigator } from '@navigation/RootNavigator';
import { AppearanceProvider } from '@store/AppearanceContext';
import { CalibrationProvider } from '@store/CalibrationContext';

/** Status bar icons that stay readable on the theme in use. */
const ThemedStatusBar = () => {
  const theme = useTheme();
  return (
    <StatusBar
      barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
    />
  );
};

function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* Holds back the app until the stored theme is known. */}
        <AppearanceProvider>
          <ThemedStatusBar />
          {/* Above the navigators, so calibration outlives any screen. */}
          <CalibrationProvider>
            <RootNavigator />
          </CalibrationProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
