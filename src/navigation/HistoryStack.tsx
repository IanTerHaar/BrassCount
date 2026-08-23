import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HistoryDetailScreen, HistoryScreen } from '@/screens';
import type { HistoryStackParamList } from '@/types/navigation';

const Stack = createNativeStackNavigator<HistoryStackParamList>();

/**
 * The History tab is a stack — landing screen lists drills, tapping one
 * pushes the run detail. Nesting inside the tab (rather than the root stack)
 * keeps the bottom tab bar visible on the detail screen.
 */
export const HistoryStack = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="HistoryList" component={HistoryScreen} />
    <Stack.Screen name="HistoryDetail" component={HistoryDetailScreen} />
  </Stack.Navigator>
);
